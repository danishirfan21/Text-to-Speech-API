export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  tier: 'free' | 'premium';
  apiKey: string;
  createdAt: Date;
  lastLogin?: Date;
  usageStats?: {
    totalRequests: number;
    totalCharacters: number;
    monthlyRequests: number;
    resetDate: Date;
  };
}
