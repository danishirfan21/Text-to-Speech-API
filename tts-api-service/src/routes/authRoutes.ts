






import express from 'express';
import bcrypt from 'bcrypt';
import jwt, { Secret } from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { authMiddleware } from '../middleware/authMiddleware';
import { User } from '../types/User';

import { userStore } from '../store/userStore';
import { TokenService } from '../utils/TokenService';

// In production, this would be a proper database
// For demo purposes, using in-memory storage


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
    return;
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

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash || '');
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


export default router;
// JWT Token utilities
