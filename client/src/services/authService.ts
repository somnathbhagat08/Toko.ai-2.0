interface SendOTPData {
  phoneNumber: string;
}

interface VerifyOTPData {
  phoneNumber: string;
  otpCode: string;
}

interface CompleteRegistrationData {
  phoneNumber: string;
  name: string;
  gender: string;
  avatar?: string;
  provider?: string;
  age?: number;
  bio?: string;
  tags?: string[];
  country?: string;
}

interface PhoneLoginData {
  phoneNumber: string;
}

interface User {
  id: number;
  phoneNumber: string;
  name: string;
  avatar?: string;
  provider?: string;
  country?: string;
  tags?: string[];
  gender?: string;
  age?: number;
  bio?: string;
  isOnline?: boolean;
  lastSeen?: Date;
}

interface AuthResponse {
  success: boolean;
  user?: User;
  message: string;
  attemptId?: string;
}

interface TokenResponse {
  user: User;
  token: string;
  refreshToken: string;
}

// Legacy interfaces for Google OAuth compatibility
interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  avatar?: string;
  provider?: string;
}

class AuthService {
  /**
   * Send OTP to phone number
   */
  async sendOTP(data: SendOTPData): Promise<AuthResponse> {
    const response = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send OTP');
    }

    return await response.json();
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(data: VerifyOTPData): Promise<AuthResponse> {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'OTP verification failed');
    }

    return await response.json();
  }

  /**
   * Complete user registration after phone verification
   */
  async completeRegistration(data: CompleteRegistrationData): Promise<TokenResponse> {
    const response = await fetch('/api/auth/complete-registration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    return await response.json();
  }

  /**
   * Login existing user with phone number
   */
  async phoneLogin(data: PhoneLoginData): Promise<TokenResponse> {
    const response = await fetch('/api/auth/phone-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return await response.json();
  }

  // Legacy methods for Google OAuth compatibility - they will handle phone registration internally
  async login(data: LoginData): Promise<User> {
    // For Google OAuth users, we'll use their Google ID as phone and email as identifier
    // This maintains backward compatibility while transitioning to phone-based auth
    throw new Error('Direct email login is no longer supported. Please use phone authentication.');
  }

  async register(data: RegisterData): Promise<User> {
    // For Google OAuth users, we'll handle this through the phone flow
    if (data.provider === 'google') {
      // Use email as temporary phone for Google users until they provide real phone
      const phoneNumber = data.email.replace('@', '_at_').replace('.', '_dot_');
      
      const registrationData = {
        phoneNumber,
        name: data.name,
        gender: 'other', // Default for Google users
        avatar: data.avatar,
        provider: 'google'
      };
      
      const result = await this.completeRegistration(registrationData);
      return result.user;
    }
    
    throw new Error('Direct email registration is no longer supported. Please use phone authentication.');
  }
}

export const authService = new AuthService();
export type { User, AuthResponse, TokenResponse, SendOTPData, VerifyOTPData, CompleteRegistrationData, PhoneLoginData };