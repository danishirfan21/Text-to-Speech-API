import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { authMiddleware } from '../middleware/authMiddleware';

// In production, this would be a proper database
// For demo purposes, using in-memory storage
interface User {
  id: string;
  email: string;
  passwordHash: string;
  tier: 'free' | 'premium';
  apiKey: string;
  createdAt: Date;
  lastLogin?: Date;
  usageStats: {
    totalRequests: number;
    totalCharacters: number;
    monthlyRequests: number;
    resetDate: Date;
  };
}

class UserStore {
  private users: Map<string, User> = new Map();
  private emailToId: Map<string, string> = new Map();

  constructor() {
    // Create demo users for testing
    this.createDemoUsers();
  }

  private async createDemoUsers() {
    const demoUsers = [
      {
        email: 'demo@speechify.com',
        password: 'demo123',
        tier: 'premium' as const,
      },
      {
        email: 'free@user.com',
        password: 'free123',
        tier: 'free' as const,
      },
    ];

    for (const userData of demoUsers) {
      const passwordHash = await bcrypt.hash(userData.password, 12);
      const user: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        email: userData.email,
        passwordHash,
        tier: userData.tier,
        apiKey: `sk_${Math.random().toString(36).slice(2, 15)}${Date.now()}`,
        createdAt: new Date(),
        usageStats: {
          totalRequests: 0,
          totalCharacters: 0,
          monthlyRequests: 0,
          resetDate: new Date(),
        },
      };

      this.users.set(user.id, user);
      this.emailToId.set(user.email, user.id);
    }
  }

  async createUser(
    email: string,
    password: string,
    tier: 'free' | 'premium' = 'free'
  ): Promise<User> {
    if (this.emailToId.has(email)) {
      throw new AppError('User already exists', 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      email,
      passwordHash,
      tier,
      apiKey: `sk_${Math.random().toString(36).slice(2, 15)}${Date.now()}`,
      createdAt: new Date(),
      usageStats: {
        totalRequests: 0,
        totalCharacters: 0,
        monthlyRequests: 0,
        resetDate: new Date(),
      },
    };

    this.users.set(user.id, user);
    this.emailToId.set(email, user.id);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const userId = this.emailToId.get(email);
    return userId ? this.users.get(userId) || null : null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.apiKey === apiKey) {
        return user;
      }
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async incrementUsage(
    userId: string,
    requests: number = 1,
    characters: number = 0
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;

    user.usageStats.totalRequests += requests;
    user.usageStats.totalCharacters += characters;
    user.usageStats.monthlyRequests += requests;

    // Reset monthly stats if needed
    const now = new Date();
    const resetDate = user.usageStats.resetDate;
    if (
      now.getMonth() !== resetDate.getMonth() ||
      now.getFullYear() !== resetDate.getFullYear()
    ) {
      user.usageStats.monthlyRequests = requests;
      user.usageStats.resetDate = now;
    }

    this.users.set(userId, user);
  }
}

const userStore = new UserStore();

// JWT Token utilities
export class TokenService {
  static generateAccessToken(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        tier: user.tier,
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        issuer: 'tts-api',
        audience: 'tts-api-client',
      }
    );
  }

  static generateRefreshToken(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        type: 'refresh',
      },
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshExpiresIn,
        issuer: 'tts-api',
        audience: 'tts-api-client',
      }
    );
  }

  static verifyAccessToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt.secret, {
        issuer: 'tts-api',
        audience: 'tts-api-client',
      });
    } catch (error) {
      throw new AppError('Invalid or expired token', 401);
    }
  }

  static verifyRefreshToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt.refreshSecret, {
        issuer: 'tts-api',
        audience: 'tts-api-client',
      });
    } catch (error) {
      throw new AppError('Invalid or expired refresh token', 401);
    }
  }
}

// Authentication Routes
const router = express.Router();

// Input validation
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const handleValidationErrors = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

// POST /api/auth/register - User registration
router.post(
  '/register',
  validateRegistration,
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { email, password, tier = 'free' } = req.body;

    try {
      const user = await userStore.createUser(email, password, tier);
      const accessToken = TokenService.generateAccessToken(user);
      const refreshToken = TokenService.generateRefreshToken(user);

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        tier: user.tier,
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          tier: user.tier,
          apiKey: user.apiKey,
          createdAt: user.createdAt,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: config.jwt.expiresIn,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Registration failed', 500);
    }
  })
);

// POST /api/auth/login - User login
router.post(
  '/login',
  validateLogin,
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { email, password } = req.body;

    const user = await userStore.findByEmail(email);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    await userStore.updateUser(user.id, { lastLogin: new Date() });

    const accessToken = TokenService.generateAccessToken(user);
    const refreshToken = TokenService.generateRefreshToken(user);

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        lastLogin: new Date(),
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.expiresIn,
      },
    });
  })
);

// POST /api/auth/refresh - Refresh access token
router.post(
  '/refresh',
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { refreshToken } = req.body;

    const decoded = TokenService.verifyRefreshToken(refreshToken);
    const user = await userStore.findById(decoded.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const accessToken = TokenService.generateAccessToken(user);
    const newRefreshToken = TokenService.generateRefreshToken(user);

    res.json({
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: config.jwt.expiresIn,
      },
    });
  })
);

// GET /api/auth/me - Get current user info
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const user = req.user as User;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        apiKey: user.apiKey,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        usageStats: user.usageStats,
      },
    });
  })
);

// POST /api/auth/regenerate-api-key - Regenerate API key
router.post(
  '/regenerate-api-key',
  authMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const user = req.user as User;
    const newApiKey = `sk_${Math.random()
      .toString(36)
      .slice(2, 15)}${Date.now()}`;

    await userStore.updateUser(user.id, { apiKey: newApiKey });

    logger.info('API key regenerated', { userId: user.id });

    res.json({
      message: 'API key regenerated successfully',
      apiKey: newApiKey,
    });
  })
);

export { userStore };
export default router;