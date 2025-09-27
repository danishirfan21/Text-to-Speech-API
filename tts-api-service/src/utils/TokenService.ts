import jwt, { Secret } from 'jsonwebtoken';
import { config } from '../config/config';
import { AppError } from '../utils/AppError';
import { User } from '../types/User';

export class TokenService {
  static generateAccessToken(user: User): string {
    const secret = config.jwt.secret;
    if (!secret || typeof secret !== 'string') throw new Error('JWT secret is missing or not a string');
    const payload = {
      id: user.id,
      email: user.email,
      tier: user.tier,
    };
    const options = {
      expiresIn: config.jwt.expiresIn,
      issuer: 'tts-api',
      audience: 'tts-api-client',
    } as any;
    return jwt.sign(payload, secret as Secret, options);
  }

  static generateRefreshToken(user: User): string {
    const secret = config.jwt.refreshSecret;
    if (!secret || typeof secret !== 'string') throw new Error('JWT refreshSecret is missing or not a string');
    const payload = {
      id: user.id,
      type: 'refresh',
    };
    const options = {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'tts-api',
      audience: 'tts-api-client',
    } as any;
    return jwt.sign(payload, secret as Secret, options);
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
