import React, { useState, useEffect } from 'react';
import { MessageCircle, Phone, Lock, User, Eye, EyeOff, Star, Circle, Square, Triangle, ArrowLeft } from 'lucide-react';
import { authService } from '../services/authService';
import TokoLogo from './TokoLogo';

// Google OAuth types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: () => void;
          renderButton: (element: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

interface LoginPageProps {
  onLogin: (user: any) => void;
}

type AuthStep = 'phone' | 'otp' | 'registration' | 'existing-user';

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [authStep, setAuthStep] = useState<AuthStep>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Phone and OTP data
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  // Registration data
  const [registrationData, setRegistrationData] = useState({
    name: '',
    gender: 'other',
    age: '',
    bio: '',
    country: 'Any on Earth'
  });

  useEffect(() => {
    // Initialize Google OAuth when the component mounts
    const initGoogle = () => {
      if (window.google) {
        initializeGoogleAuth();
      } else {
        // Retry after a short delay if Google isn't loaded yet
        setTimeout(initGoogle, 100);
      }
    };
    
    initGoogle();
  }, []);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    
    try {
      // Basic phone number validation
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        throw new Error('Please enter a valid phone number');
      }

      const result = await authService.sendOTP({ phoneNumber: cleanPhone });
      
      if (result.success) {
        setSuccessMessage('OTP sent to your phone number. Please check your messages.');
        setPhoneNumber(cleanPhone);
        setAuthStep('otp');
      } else {
        throw new Error(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      if (otpCode.length !== 6) {
        throw new Error('Please enter the complete 6-digit OTP code');
      }

      const result = await authService.verifyOTP({ 
        phoneNumber, 
        otpCode 
      });
      
      if (result.success) {
        if (result.user) {
          // Existing user - login with phone
          const loginResult = await authService.phoneLogin({ phoneNumber });
          onLogin(loginResult.user);
        } else {
          // New user - go to registration
          setSuccessMessage('Phone verified! Please complete your profile.');
          setAuthStep('registration');
        }
      } else {
        throw new Error(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      if (!registrationData.name.trim()) {
        throw new Error('Please enter your name');
      }

      const result = await authService.completeRegistration({
        phoneNumber,
        name: registrationData.name.trim(),
        gender: registrationData.gender,
        age: registrationData.age ? parseInt(registrationData.age) : undefined,
        bio: registrationData.bio.trim() || undefined,
        country: registrationData.country,
        provider: 'phone'
      });
      
      onLogin(result.user);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setAuthStep('phone');
    setOtpCode('');
    setError('');
    setSuccessMessage('');
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const result = await authService.sendOTP({ phoneNumber });
      if (result.success) {
        setSuccessMessage('New OTP sent to your phone number.');
      } else {
        throw new Error(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeGoogleAuth = () => {
    if (window.google && window.google.accounts) {
      try {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '831096847886-qsejqd3kdcnc5tpev5gl0drlvhk74g20.apps.googleusercontent.com';
        
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true
        });
      } catch (error) {
        console.error('Google Auth initialization error:', error);
        setError('Google Sign-In requires valid client ID. Please use phone authentication.');
      }
    }
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setError('');
    
    const hasValidClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID && 
                            import.meta.env.VITE_GOOGLE_CLIENT_ID !== '831096847886-qsejqd3kdcnc5tpev5gl0drlvhk74g20.apps.googleusercontent.com';
    
    if (!hasValidClientId) {
      setError('Google Sign-In requires configuration. Please use phone authentication.');
      setIsLoading(false);
      return;
    }
    
    if (window.google && window.google.accounts) {
      try {
        window.google.accounts.id.prompt();
      } catch (error) {
        setError('Google Sign-In temporarily unavailable. Please use phone authentication.');
        setIsLoading(false);
      }
    } else {
      setError('Google Sign-In is loading. Please try again in a moment.');
      setIsLoading(false);
    }
  };

  const handleGoogleCallback = async (response: any) => {
    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      
      try {
        const newUser = await authService.register({
          email: payload.email,
          password: payload.sub,
          name: payload.name || payload.email,
          avatar: payload.picture,
          provider: 'google'
        });
        
        setIsLoading(false);
        onLogin(newUser);
      } catch (registerError) {
        console.error('Error creating Google user:', registerError);
        setError('Failed to create account with Google');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error processing Google login:', error);
      setError('Failed to process Google sign-in');
      setIsLoading(false);
    }
  };

  const renderPhoneStep = () => (
    <form onSubmit={handlePhoneSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          PHONE NUMBER
        </label>
        <div className="relative">
          <Phone className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-500" />
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full pl-8 pr-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs"
            placeholder="Enter your phone number"
            required
            disabled={isLoading}
            data-testid="input-phone-number"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-black text-white border-3 border-black py-2 text-sm font-black transition-all shadow-[3px_3px_0px_0px_#666] hover:shadow-[4px_4px_0px_0px_#00FF88] hover:bg-green-400 hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-[2px_2px_0px_0px_#8A2BE2] active:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:bg-black disabled:hover:shadow-[3px_3px_0px_0px_#666] flex items-center justify-center gap-2"
        data-testid="button-send-otp"
      >
        {isLoading ? (
          <>
            <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
            SENDING OTP...
          </>
        ) : (
          'SEND OTP'
        )}
      </button>
    </form>
  );

  const renderOtpStep = () => (
    <form onSubmit={handleOtpSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          VERIFICATION CODE
        </label>
        <div className="relative">
          <Lock className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full pl-8 pr-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs text-center tracking-widest"
            placeholder="Enter 6-digit OTP"
            maxLength={6}
            required
            disabled={isLoading}
            data-testid="input-otp-code"
          />
        </div>
        <p className="text-xs text-gray-600 mt-1">
          OTP sent to {phoneNumber}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleBackToPhone}
          disabled={isLoading}
          className="flex-1 bg-gray-100 text-black border-3 border-black py-2 text-sm font-black transition-all shadow-[2px_2px_0px_0px_#666] hover:shadow-[3px_3px_0px_0px_#666] hover:translate-x-[-1px] hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          data-testid="button-back-to-phone"
        >
          <ArrowLeft className="w-3 h-3" />
          BACK
        </button>
        <button
          type="submit"
          disabled={isLoading || otpCode.length !== 6}
          className="flex-1 bg-black text-white border-3 border-black py-2 text-sm font-black transition-all shadow-[3px_3px_0px_0px_#666] hover:shadow-[4px_4px_0px_0px_#00FF88] hover:bg-green-400 hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-[2px_2px_0px_0px_#8A2BE2] active:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:bg-black disabled:hover:shadow-[3px_3px_0px_0px_#666] flex items-center justify-center gap-2"
          data-testid="button-verify-otp"
        >
          {isLoading ? (
            <>
              <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
              VERIFYING...
            </>
          ) : (
            'VERIFY'
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={handleResendOtp}
        disabled={isLoading}
        className="w-full bg-gray-100 text-black border-3 border-gray-400 py-1 text-xs font-black transition-all shadow-[2px_2px_0px_0px_#666] hover:shadow-[3px_3px_0px_0px_#666] hover:translate-x-[-1px] hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="button-resend-otp"
      >
        RESEND OTP
      </button>
    </form>
  );

  const renderRegistrationStep = () => (
    <form onSubmit={handleRegistrationSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          FULL NAME *
        </label>
        <div className="relative">
          <User className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            value={registrationData.name}
            onChange={(e) => setRegistrationData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full pl-8 pr-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs"
            placeholder="Enter your full name"
            required
            disabled={isLoading}
            data-testid="input-full-name"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          GENDER *
        </label>
        <select
          value={registrationData.gender}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, gender: e.target.value }))}
          className="w-full px-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs"
          required
          disabled={isLoading}
          data-testid="select-gender"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          AGE (OPTIONAL)
        </label>
        <input
          type="number"
          value={registrationData.age}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, age: e.target.value }))}
          className="w-full px-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs"
          placeholder="Your age"
          min="13"
          max="100"
          disabled={isLoading}
          data-testid="input-age"
        />
      </div>

      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          COUNTRY
        </label>
        <input
          type="text"
          value={registrationData.country}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, country: e.target.value }))}
          className="w-full px-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs"
          placeholder="Your country"
          disabled={isLoading}
          data-testid="input-country"
        />
      </div>

      <div>
        <label className="block text-xs font-black text-gray-900 mb-1">
          BIO (OPTIONAL)
        </label>
        <textarea
          value={registrationData.bio}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, bio: e.target.value }))}
          className="w-full px-2 py-2 border-3 border-black font-bold bg-gray-50 shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_#00FF88] focus:border-green-400 transition-all text-xs"
          placeholder="Tell us about yourself..."
          rows={2}
          disabled={isLoading}
          data-testid="textarea-bio"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-black text-white border-3 border-black py-2 text-sm font-black transition-all shadow-[3px_3px_0px_0px_#666] hover:shadow-[4px_4px_0px_0px_#00FF88] hover:bg-green-400 hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-[2px_2px_0px_0px_#8A2BE2] active:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:bg-black disabled:hover:shadow-[3px_3px_0px_0px_#666] flex items-center justify-center gap-2"
        data-testid="button-complete-registration"
      >
        {isLoading ? (
          <>
            <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
            CREATING ACCOUNT...
          </>
        ) : (
          'CREATE ACCOUNT'
        )}
      </button>
    </form>
  );

  const getHeaderText = () => {
    switch (authStep) {
      case 'phone':
        return { title: 'WELCOME TO TOKO', subtitle: 'Enter your phone number to get started' };
      case 'otp':
        return { title: 'VERIFY YOUR PHONE', subtitle: 'Enter the code we sent to your phone' };
      case 'registration':
        return { title: 'COMPLETE YOUR PROFILE', subtitle: 'Tell us a bit about yourself' };
      default:
        return { title: 'WELCOME BACK', subtitle: 'Sign in to continue' };
    }
  };

  const headerText = getHeaderText();

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 relative overflow-hidden">
      {/* Background elements - same as before */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated Hello Text Lines */}
        <div className="absolute top-[15%] left-0 w-full opacity-10">
          <div className="whitespace-nowrap text-2xl font-normal text-gray-800 animate-scroll-right">
            Hello • Hola • Bonjour • Hallo • Ciao • Olá • Привет • こんにちは • 안녕하세요 • 你好 • مرحبا • नमस्ते • Γεια σας • Shalom • Sawubona • Jambo •
          </div>
        </div>
        <div className="absolute top-[30%] left-0 w-full opacity-10">
          <div className="whitespace-nowrap text-2xl font-normal text-gray-800 animate-scroll-left">
            Hej • Terve • Salam • Zdravo • Ahoj • Dzień dobry • Bună • Здравей • Pozdrav • Merhaba • سلام • Chào • สวัสดี • ជំរាបសួរ • Mingalaba •
          </div>
        </div>
        <div className="absolute top-[45%] left-0 w-full opacity-10">
          <div className="whitespace-nowrap text-2xl font-normal text-gray-800 animate-scroll-right">
            Halo • Kumusta • Talofa • Kia ora • Aloha • Habari • Sannu • Salaam • Hujambo • Dumela • Sawubona • Molweni • Avuxeni • Ndimadoda •
          </div>
        </div>
        <div className="absolute top-[60%] left-0 w-full opacity-10">
          <div className="whitespace-nowrap text-2xl font-normal text-gray-800 animate-scroll-left">
            Guten Tag • Bom dia • Buenos días • Buongiorno • Dobré ráno • Доброе утро • おはよう • 좋은 아침 • 早上好 • صباح الخير • सुप्रभात • Καλημέρα •
          </div>
        </div>
        <div className="absolute top-[75%] left-0 w-full opacity-10">
          <div className="whitespace-nowrap text-2xl font-normal text-gray-800 animate-scroll-right">
            Namaste • Selamat pagi • Chúc buổi sáng • السلام عليكم • शुभ प्रभात • Καλή μέρα • בוקר טוב • Subb sukh • Umuntu • Sawubona • Molweni •
          </div>
        </div>
        <div className="absolute top-[90%] left-0 w-full opacity-10">
          <div className="whitespace-nowrap text-2xl font-normal text-gray-800 animate-scroll-left">
            Goedemorgen • Dobro jutro • Bom dia • Buenos días • Buongiorno • Dobré ráno • Доброе утро • おはよう • 좋은 아침 • 早上好 • صباح الخير •
          </div>
        </div>
      </div>

      {/* Static Dotted Grid Background */}
      <div 
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            radial-gradient(circle, #000 1.5px, transparent 1.5px),
            linear-gradient(to right, #000 0.8px, transparent 0.8px),
            linear-gradient(to bottom, #000 0.8px, transparent 0.8px)
          `,
          backgroundSize: '25px 25px, 50px 50px, 50px 50px'
        }}
      />

      {/* Geometric Shapes Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Stars */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute opacity-[0.12] animate-pulse"
            style={{
              left: `${(i % 5) * 20 + 10}%`,
              top: `${Math.floor(i / 5) * 25 + 10}%`,
              transform: `rotate(${i * 24}deg)`,
              fontSize: '20px',
              animationDelay: `${i * 0.2}s`
            }}
          >
            <Star className="fill-current text-green-500" />
          </div>
        ))}
        
        {/* Circles */}
        {[...Array(12)].map((_, i) => (
          <div
            key={`circle-${i}`}
            className="absolute opacity-[0.12] animate-bounce"
            style={{
              left: `${(i % 4) * 25 + 12.5}%`,
              top: `${Math.floor(i / 4) * 30 + 15}%`,
              fontSize: '24px',
              animationDelay: `${i * 0.3}s`,
              animationDuration: '3s'
            }}
          >
            <Circle className="fill-current text-blue-500" />
          </div>
        ))}

        {/* Squares */}
        {[...Array(10)].map((_, i) => (
          <div
            key={`square-${i}`}
            className="absolute opacity-[0.12] animate-spin"
            style={{
              left: `${(i % 5) * 20 + 15}%`,
              top: `${Math.floor(i / 5) * 40 + 20}%`,
              transform: `rotate(${i * 36}deg)`,
              fontSize: '18px',
              animationDelay: `${i * 0.4}s`,
              animationDuration: '4s'
            }}
          >
            <Square className="fill-current text-purple-500" />
          </div>
        ))}

        {/* Triangles */}
        {[...Array(8)].map((_, i) => (
          <div
            key={`triangle-${i}`}
            className="absolute opacity-[0.12] animate-ping"
            style={{
              left: `${(i % 4) * 25 + 20}%`,
              top: `${Math.floor(i / 4) * 35 + 25}%`,
              transform: `rotate(${i * 45}deg)`,
              fontSize: '16px',
              animationDelay: `${i * 0.5}s`,
              animationDuration: '2s'
            }}
          >
            <Triangle className="fill-current text-orange-500" />
          </div>
        ))}

        {/* Static People Icons */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`user-${i}`}
            className="absolute opacity-[0.08] text-black"
            style={{
              left: `${10 + (i * 6)}%`,
              top: `${12 + (i * 5)}%`,
              transform: `rotate(${i * 24}deg)`,
              fontSize: '22px'
            }}
          >
            <User />
          </div>
        ))}
      </div>

      <div className="relative z-10 h-full flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex-shrink-0">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-3 bg-white border-4 border-black p-3 shadow-[6px_6px_0px_0px_#000] mb-4">
              <TokoLogo className="w-8 h-8" />
              <h1 className="text-3xl font-black text-black tracking-tight">TOKO</h1>
            </div>
            <h2 className="text-lg font-black text-gray-900 mb-1">
              {headerText.title}
            </h2>
            <p className="text-sm font-bold text-gray-700">
              {headerText.subtitle}
            </p>
          </div>

          {/* Main Form */}
          <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_#000] mb-3">
            {successMessage && (
              <div className="text-green-600 text-xs font-bold bg-green-50 border-2 border-green-200 p-2 rounded mb-3" data-testid="success-message">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 p-2 rounded mb-3" data-testid="error-message">
                {error}
              </div>
            )}

            {authStep === 'phone' && renderPhoneStep()}
            {authStep === 'otp' && renderOtpStep()}
            {authStep === 'registration' && renderRegistrationStep()}

            {/* Google OAuth - only show on phone step */}
            {authStep === 'phone' && (
              <div className="mt-3">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-black"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white font-black text-gray-900">OR</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full mt-2 bg-white text-black border-3 border-black py-2 text-sm font-black transition-all shadow-[3px_3px_0px_0px_#666] hover:shadow-[6px_6px_0px_0px_#4285F4] hover:translate-x-[-3px] hover:translate-y-[-3px] hover:bg-blue-50 hover:border-blue-500 active:shadow-[2px_2px_0px_0px_#8A2BE2] active:bg-purple-500 active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                  data-testid="button-google-login"
                >
                  {/* Animated geometric shapes for hover effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute -top-1 -left-1 opacity-60 animate-bounce">
                      <Star className="w-3 h-3 text-blue-500 fill-current" />
                    </div>
                    <div className="absolute -top-1 -right-1 opacity-60 animate-pulse">
                      <Circle className="w-2 h-2 text-green-500 fill-current" />
                    </div>
                    <div className="absolute -bottom-1 -left-1 opacity-60 animate-spin">
                      <Square className="w-2 h-2 text-red-500 fill-current" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 opacity-60 animate-ping">
                      <Triangle className="w-3 h-3 text-yellow-500 fill-current" />
                    </div>
                  </div>
                  
                  {isLoading ? (
                    <>
                      <div className="animate-spin w-3 h-3 border-2 border-black border-t-transparent rounded-full relative z-10"></div>
                      <span className="relative z-10">CONNECTING...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 relative z-10" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span className="relative z-10">CONTINUE WITH GOOGLE</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-12">
            <p className="text-sm font-black text-gray-700">
              Made by Humans using AI 🤖
            </p>
          </div>
        </div>
      </div>

      {/* Google OAuth Script */}
      <script src="https://accounts.google.com/gsi/client" async defer></script>
    </div>
  );
}