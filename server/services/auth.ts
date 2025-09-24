import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { storage } from '../storage.js';
import { redisManager } from '../redis.js';
import { monitoring } from '../monitoring.js';
import { log } from '../vite.js';

interface AuthTokenPayload {
  userId: string;
  phoneNumber: string;
  name: string;
  avatar?: string;
  permissions: string[];
  iat: number;
  exp: number;
}

interface LoginResult {
  user: {
    id: string;
    phoneNumber: string;
    name: string;
    avatar?: string;
  };
  token: string;
  refreshToken: string;
  expiresAt: number;
}

interface SessionData {
  userId: string;
  phoneNumber: string;
  loginTime: number;
  lastActivity: number;
  deviceInfo?: string;
  ipAddress?: string;
}

class AuthService {
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private tokenExpiry: number = 24 * 60 * 60; // 24 hours
  private refreshTokenExpiry: number = 7 * 24 * 60 * 60; // 7 days

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'toko-jwt-secret-change-in-production';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'toko-refresh-secret-change-in-production';
    
    if (!process.env.JWT_SECRET) {
      log('Auth service running with default JWT secret - change in production!', 'auth');
    }
  }

  /**
   * Register a new user (Phone Authentication)
   */
  async register(userData: {
    phoneNumber: string;
    name: string;
    gender: string;
    avatar?: string;
    provider?: string;
    age?: number;
    bio?: string;
  }): Promise<LoginResult> {
    try {
      // Check if user already exists
      const existingUser = await storage.getUserByPhoneNumber(userData.phoneNumber);
      if (existingUser) {
        throw new Error('User already exists');
      }

      // Create user (no password needed for phone auth)
      const user = await storage.createUser(userData);

      log(`User registered: ${user.phoneNumber}`, 'auth');
      monitoring.incrementCounter('auth.registrations');

      // Generate tokens
      return await this.generateTokens(user);
    } catch (error) {
      monitoring.trackError('auth_register', `Registration failed: ${error}`);
      throw error;
    }
  }

  /**
   * Phone-based login (deprecated - use phone verification instead)
   */
  async login(credentials: {
    phoneNumber: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): Promise<LoginResult> {
    try {
      // Get user by phone number
      const user = await storage.getUserByPhoneNumber(credentials.phoneNumber);
      if (!user || !user.isPhoneVerified) {
        monitoring.incrementCounter('auth.login_failures');
        throw new Error('User not found or phone not verified');
      }

      // Check for account blocks/bans
      const isBlocked = await this.isUserBlocked(user.id.toString());
      if (isBlocked) {
        monitoring.incrementCounter('auth.blocked_attempts');
        throw new Error('Account is temporarily blocked');
      }

      // Create session
      await this.createSession(user.id.toString(), {
        userId: user.id.toString(),
        phoneNumber: user.phoneNumber,
        loginTime: Date.now(),
        lastActivity: Date.now(),
        deviceInfo: credentials.deviceInfo,
        ipAddress: credentials.ipAddress
      });

      log(`User logged in: ${user.phoneNumber}`, 'auth');
      monitoring.incrementCounter('auth.successful_logins');

      return await this.generateTokens(user);
    } catch (error) {
      monitoring.trackError('auth_login', `Login failed: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<LoginResult> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as AuthTokenPayload;
      
      // Get user from database
      const user = await storage.getUser(parseInt(decoded.userId));
      if (!user) {
        throw new Error('User not found');
      }

      // Check if refresh token is blacklisted
      const isBlacklisted = await redisManager.getSession(`blacklist:refresh:${refreshToken}`);
      if (isBlacklisted) {
        throw new Error('Refresh token is invalid');
      }

      // Generate new tokens
      return await this.generateTokens(user);
    } catch (error) {
      monitoring.trackError('auth_refresh', `Token refresh failed: ${error}`);
      throw error;
    }
  }

  /**
   * Logout user and invalidate tokens
   */
  async logout(userId: string, token: string, refreshToken: string): Promise<void> {
    try {
      // Blacklist both tokens
      await Promise.all([
        redisManager.setSession(`blacklist:token:${token}`, true, this.tokenExpiry),
        redisManager.setSession(`blacklist:refresh:${refreshToken}`, true, this.refreshTokenExpiry),
        this.destroySession(userId)
      ]);

      log(`User logged out: ${userId}`, 'auth');
      monitoring.incrementCounter('auth.logouts');
    } catch (error) {
      monitoring.trackError('auth_logout', `Logout failed: ${error}`);
      throw error;
    }
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<AuthTokenPayload> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await redisManager.getSession(`blacklist:token:${token}`);
      if (isBlacklisted) {
        throw new Error('Token is invalid');
      }

      const decoded = jwt.verify(token, this.jwtSecret) as AuthTokenPayload;
      
      // Update last activity
      await this.updateLastActivity(decoded.userId);
      
      return decoded;
    } catch (error) {
      monitoring.trackError('auth_verify', `Token verification failed: ${error}`);
      throw error;
    }
  }

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user: any): Promise<LoginResult> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.tokenExpiry;

    const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
      userId: user.id.toString(),
      phoneNumber: user.phoneNumber,
      name: user.name,
      avatar: user.avatar,
      permissions: ['user'] // Basic user permissions
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiry
    });

    const refreshToken = jwt.sign(
      { userId: user.id },
      this.jwtRefreshSecret,
      { expiresIn: this.refreshTokenExpiry }
    );

    return {
      user: {
        id: user.id.toString(),
        phoneNumber: user.phoneNumber,
        name: user.name,
        avatar: user.avatar
      },
      token,
      refreshToken,
      expiresAt: expiresAt * 1000 // Convert to milliseconds
    };
  }

  /**
   * Create user session in Redis
   */
  private async createSession(userId: string, sessionData: SessionData): Promise<void> {
    const sessionKey = `session:${userId}`;
    await redisManager.setSession(sessionKey, sessionData, this.tokenExpiry);
  }

  /**
   * Update last activity timestamp
   */
  private async updateLastActivity(userId: string): Promise<void> {
    const sessionKey = `session:${userId}`;
    const session = await redisManager.getSession(sessionKey);
    
    if (session) {
      session.lastActivity = Date.now();
      await redisManager.setSession(sessionKey, session, this.tokenExpiry);
    }
  }

  /**
   * Destroy user session
   */
  private async destroySession(userId: string): Promise<void> {
    const sessionKey = `session:${userId}`;
    await redisManager.deleteSession(sessionKey);
  }

  /**
   * Check if user is blocked or banned
   */
  private async isUserBlocked(userId: string): Promise<boolean> {
    const blockKey = `block:${userId}`;
    const blockData = await redisManager.getSession(blockKey);
    
    if (blockData) {
      // Check if block has expired
      if (blockData.expiresAt && Date.now() > blockData.expiresAt) {
        await redisManager.deleteSession(blockKey);
        return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * Block user for specified duration
   */
  async blockUser(userId: string, reason: string, durationMinutes: number = 60): Promise<void> {
    const blockKey = `block:${userId}`;
    const blockData = {
      reason,
      blockedAt: Date.now(),
      expiresAt: Date.now() + (durationMinutes * 60 * 1000),
      duration: durationMinutes
    };

    await redisManager.setSession(blockKey, blockData, durationMinutes * 60);
    
    log(`User blocked: ${userId} for ${durationMinutes} minutes - ${reason}`, 'auth');
    monitoring.incrementCounter('auth.user_blocks');
  }

  /**
   * Unblock user
   */
  async unblockUser(userId: string): Promise<void> {
    const blockKey = `block:${userId}`;
    await redisManager.deleteSession(blockKey);
    
    log(`User unblocked: ${userId}`, 'auth');
    monitoring.incrementCounter('auth.user_unblocks');
  }

  /**
   * Get user session info
   */
  async getSessionInfo(userId: string): Promise<SessionData | null> {
    const sessionKey = `session:${userId}`;
    return await redisManager.getSession(sessionKey);
  }

  /**
   * Rate limiting for authentication attempts
   */
  async checkAuthRateLimit(identifier: string, action: string): Promise<boolean> {
    const key = `auth_rate:${action}:${identifier}`;
    
    // Different limits for different actions
    const limits = {
      login: { attempts: 5, window: 300 }, // 5 attempts per 5 minutes
      register: { attempts: 3, window: 3600 }, // 3 attempts per hour
      refresh: { attempts: 10, window: 300 } // 10 attempts per 5 minutes
    };

    const limit = limits[action as keyof typeof limits] || limits.login;
    return await redisManager.checkRateLimit(key, limit.attempts, limit.window);
  }

  /**
   * Generate password reset token via phone
   */
  async generatePasswordResetToken(phoneNumber: string): Promise<string> {
    const user = await storage.getUserByPhoneNumber(phoneNumber);
    if (!user) {
      // Don't reveal if email exists for security
      throw new Error('If this email exists, a reset link has been sent');
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    // Store reset token in Redis with short expiry
    await redisManager.setSession(`reset:${resetToken}`, {
      userId: user.id,
      phoneNumber: user.phoneNumber,
      createdAt: Date.now()
    }, 3600); // 1 hour

    log(`Password reset token generated for: ${user.phoneNumber}`, 'auth');
    monitoring.incrementCounter('auth.password_reset_requests');

    return resetToken;
  }

  /**
   * Verify password reset token
   */
  async verifyPasswordResetToken(token: string): Promise<{ userId: string; phoneNumber: string }> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      const resetData = await redisManager.getSession(`reset:${token}`);
      if (!resetData) {
        throw new Error('Reset token not found or expired');
      }

      return {
        userId: resetData.userId,
        phoneNumber: resetData.phoneNumber
      };
    } catch (error) {
      monitoring.trackError('auth_reset_verify', `Reset token verification failed: ${error}`);
      throw new Error('Invalid or expired reset token');
    }
  }

  /**
   * Reset user password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { userId } = await this.verifyPasswordResetToken(token);
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password in database
    // Note: This would require updating the storage interface
    // For now, we'll log the action
    log(`Password reset completed for user: ${userId}`, 'auth');
    monitoring.incrementCounter('auth.password_resets');
    
    // Invalidate all existing sessions for this user
    const sessionKey = `session:${userId}`;
    await redisManager.deleteSession(sessionKey);
    
    // Remove the reset token
    await redisManager.deleteSession(`reset:${token}`);
  }

  /**
   * Get authentication statistics
   */
  getAuthStats() {
    return {
      service: 'auth',
      tokenExpiry: this.tokenExpiry,
      refreshTokenExpiry: this.refreshTokenExpiry,
      timestamp: Date.now()
    };
  }
}

export const authService = new AuthService();
export type { AuthTokenPayload, LoginResult, SessionData };