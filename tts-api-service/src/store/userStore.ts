import { User } from '../types/User';
import { AppError } from '../utils/AppError';
import bcrypt from 'bcrypt';

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

  async createUser(email: string, password: string, tier: 'free' | 'premium' = 'free'): Promise<User> {
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

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const id = this.emailToId.get(email);
    return id ? this.users.get(id) || null : null;
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.apiKey === apiKey) return user;
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new AppError('User not found', 404);
    this.users.set(id, { ...user, ...updates });
  }
}

export const userStore = new UserStore();
