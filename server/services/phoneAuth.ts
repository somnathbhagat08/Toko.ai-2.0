// Phone Authentication Service - Blueprint from javascript_openai integration
import { log } from '../vite.js';
import { storage } from '../storage.js';
import { redisManager } from '../redis.js';
import { monitoring } from '../monitoring.js';

interface PhoneVerificationResult {
  success: boolean;
  message: string;
  attemptId?: string;
}

interface VerifyOtpResult {
  success: boolean;
  user?: {
    id: number;
    phoneNumber: string;
    name: string;
    avatar?: string;
  };
  message: string;
}

class PhoneAuthService {
  private otpExpiry: number = 10 * 60; // 10 minutes
  private maxAttempts: number = 3;

  /**
   * Send OTP to phone number
   */
  async sendOTP(phoneNumber: string): Promise<PhoneVerificationResult> {
    try {
      // Check rate limiting
      const canSend = await redisManager.checkRateLimit(
        `otp_send:${phoneNumber}`, 
        3, // 3 attempts
        300 // per 5 minutes
      );

      if (!canSend) {
        monitoring.incrementCounter('phone_auth.rate_limited');
        return {
          success: false,
          message: 'Too many OTP requests. Please wait before requesting again.'
        };
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP in database
      const expiresAt = new Date(Date.now() + this.otpExpiry * 1000);
      
      await storage.createPhoneVerification({
        phoneNumber,
        otpCode,
        expiresAt
      });

      // In production, you would integrate with SMS service like Twilio
      // For development, we'll log the OTP
      log(`OTP for ${phoneNumber}: ${otpCode} (expires in 10 minutes)`, 'phone-auth');
      
      monitoring.incrementCounter('phone_auth.otp_sent');

      return {
        success: true,
        message: 'OTP sent successfully',
        attemptId: `${phoneNumber}_${Date.now()}`
      };

    } catch (error) {
      monitoring.trackError('phone_auth_send', `Failed to send OTP: ${error}`);
      log(`Failed to send OTP to ${phoneNumber}: ${error}`, 'phone-auth');
      
      return {
        success: false,
        message: 'Failed to send OTP. Please try again.'
      };
    }
  }

  /**
   * Verify OTP and authenticate user
   */
  async verifyOTP(phoneNumber: string, otpCode: string): Promise<VerifyOtpResult> {
    try {
      // Get the latest verification record for this phone number
      const verification = await storage.getLatestPhoneVerification(phoneNumber);
      
      if (!verification) {
        monitoring.incrementCounter('phone_auth.verification_not_found');
        return {
          success: false,
          message: 'No verification request found for this phone number.'
        };
      }

      // Check if verification is already used
      if (verification.isVerified) {
        monitoring.incrementCounter('phone_auth.otp_already_used');
        return {
          success: false,
          message: 'This OTP has already been used. Please request a new one.'
        };
      }

      // Check if OTP has expired
      if (new Date() > verification.expiresAt) {
        monitoring.incrementCounter('phone_auth.otp_expired');
        return {
          success: false,
          message: 'OTP has expired. Please request a new one.'
        };
      }

      // Check if too many attempts
      if ((verification.attempts || 0) >= this.maxAttempts) {
        monitoring.incrementCounter('phone_auth.max_attempts_exceeded');
        return {
          success: false,
          message: 'Too many invalid attempts. Please request a new OTP.'
        };
      }

      // Verify OTP code
      // Accept dummy OTP "123456" for easy testing
      const isDummyOtp = otpCode === '123456';
      const isValidOtp = isDummyOtp || verification.otpCode === otpCode;
      
      if (!isValidOtp) {
        // Increment attempts
        await storage.incrementVerificationAttempts(verification.id);
        monitoring.incrementCounter('phone_auth.invalid_otp');
        
        return {
          success: false,
          message: 'Invalid OTP code. Please try again.'
        };
      }
      
      // Log when dummy OTP is used
      if (isDummyOtp) {
        log(`DEVELOPMENT: Dummy OTP '123456' used for ${phoneNumber} (expected: ${verification.otpCode})`, 'phone-auth');
      }

      // OTP is valid - mark as verified
      await storage.markVerificationAsUsed(verification.id);

      // Check if user exists
      let user = await storage.getUserByPhoneNumber(phoneNumber);
      
      if (!user) {
        // Return success but indicate user needs to complete registration
        return {
          success: true,
          message: 'Phone number verified. Please complete your registration.'
        };
      }

      // Update user's phone verification status
      await storage.markPhoneAsVerified(user.id);

      monitoring.incrementCounter('phone_auth.verification_success');
      log(`Phone verification successful for ${phoneNumber}`, 'phone-auth');

      return {
        success: true,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          avatar: user.avatar || undefined
        },
        message: 'Phone number verified successfully'
      };

    } catch (error) {
      monitoring.trackError('phone_auth_verify', `Failed to verify OTP: ${error}`);
      log(`Failed to verify OTP for ${phoneNumber}: ${error}`, 'phone-auth');
      
      return {
        success: false,
        message: 'Verification failed. Please try again.'
      };
    }
  }

  /**
   * Check if phone number is already verified and has a user account
   */
  async isPhoneNumberRegistered(phoneNumber: string): Promise<boolean> {
    try {
      const user = await storage.getUserByPhoneNumber(phoneNumber);
      return user !== undefined && (user.isPhoneVerified || false);
    } catch (error) {
      log(`Error checking phone number registration: ${error}`, 'phone-auth');
      return false;
    }
  }

  /**
   * Get authentication statistics
   */
  getPhoneAuthStats() {
    return {
      service: 'phone-auth',
      otpExpiry: this.otpExpiry,
      maxAttempts: this.maxAttempts,
      timestamp: Date.now()
    };
  }
}

export const phoneAuthService = new PhoneAuthService();
export type { PhoneVerificationResult, VerifyOtpResult };