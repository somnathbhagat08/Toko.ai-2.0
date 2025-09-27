import React, { useState, useEffect } from 'react';
import { MessageCircle, Video, Users, Zap, User, Star, Circle, Square, Triangle, UserCheck, Heart, Lock, Unlock, TrendingUp } from 'lucide-react';
import TokoLogo from './TokoLogo';
// InteractiveGlobe removed - India-only platform

import { io, Socket } from 'socket.io-client';

interface HomePageProps {
  onStartChat: (vibes: string[], mode: 'text' | 'video', currentVibe?: string, conversationMood?: string) => void;
  user: any;
  onLogout: () => void;
}

const SUGGESTED_VIBES = [
  'Technology', 'Art & Design', 'Music', 'Gaming', 'Business', 'Travel',
  'Photography', 'Fitness', 'Literature', 'Science', 'Philosophy', 'Fashion',
  'Cooking', 'Sports', 'Movies', 'Entrepreneurship', 'Podcasts', 'Dancing'
];

// Country options removed - India-only platform

const CURRENT_VIBE_OPTIONS = [
  { 
    id: 'Chill', 
    label: 'CHILL', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
      </svg>
    )
  },
  { 
    id: 'Energetic', 
    label: 'ENERGETIC', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 2v11h3v9l7-12h-4l3-8z"/>
      </svg>
    )
  },
  { 
    id: 'Creative', 
    label: 'CREATIVE', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )
  },
  { 
    id: 'Adventurous', 
    label: 'ADVENTUROUS', 
    icon: <TrendingUp className="w-5 h-5" />
  },
  { 
    id: 'Mysterious', 
    label: 'MYSTERIOUS', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    )
  },
  { 
    id: 'Playful', 
    label: 'PLAYFUL', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 11H11v5.5H9.5zm5-4.5H16V11h-1.5zM12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )
  }
];

const CONVERSATION_MOOD_OPTIONS = [
  { 
    id: 'Casual', 
    label: 'CASUAL', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    )
  },
  { 
    id: 'Deep', 
    label: 'DEEP', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    )
  },
  { 
    id: 'Funny', 
    label: 'FUNNY', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        <circle cx="9" cy="9" r="1.5"/>
        <circle cx="15" cy="9" r="1.5"/>
        <path d="M8 13s1 3 4 3 4-3 4-3"/>
      </svg>
    )
  },
  { 
    id: 'Intellectual', 
    label: 'INTELLECTUAL', 
    icon: <Star className="w-5 h-5" />
  },
  { 
    id: 'Romantic', 
    label: 'ROMANTIC', 
    icon: <Heart className="w-5 h-5" />
  },
  { 
    id: 'Philosophical', 
    label: 'PHILOSOPHICAL', 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
      </svg>
    )
  }
];

const HELLO_TEXTS = [
  'Hello', 'Hola', 'Bonjour', 'Hallo', 'Ciao', 'Olá', 'Привет', 'こんにちは', '안녕하세요', '你好', 'مرحبا', 'नमस्ते', 'Γεια σας', 'Shalom', 'Sawubona', 'Jambo',
  'Hej', 'Terve', 'Salam', 'Zdravo', 'Ahoj', 'Dzień dobry', 'Bună', 'Здравей', 'Pozdrav', 'Merhaba', 'سلام', 'Chào', 'สวัสดี', 'ជំរាបសួរ', 'Mingalaba',
  'Halo', 'Kumusta', 'Talofa', 'Kia ora', 'Aloha', 'Habari', 'Sannu', 'Salaam', 'Hujambo', 'Dumela', 'Molweni', 'Avuxeni', 'Ndimadoda', 'Sawubona'
];

interface PlatformStats {
  onlineUsers: number;
  waitingForMatch: number;
  activeChats: number;
  usersInChat: number;
  totalConnections: number;
  averageWaitTime: number;
  serverUptime: number;
  chatModes: Record<string, number>;
  popularVibes: Array<{ vibe: string; count: number }>;
  timestamp: number;
}

export default function HomePage({ onStartChat, user, onLogout }: HomePageProps) {
  const [vibes, setVibes] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState('');
  const [currentVibe, setCurrentVibe] = useState<string>('Chill');
  const [conversationMood, setConversationMood] = useState<string>('Casual');
  const [showRealName, setShowRealName] = useState(false);
  // Remove country popup as we're India-only now
  const [showVibePopup, setShowVibePopup] = useState(false);
  // Country search removed - India only
  const [vibeSearch, setVibeSearch] = useState('');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    onlineUsers: 1,
    waitingForMatch: 0,
    activeChats: 0,
    usersInChat: 0,
    totalConnections: 1,
    averageWaitTime: 0,
    serverUptime: 0,
    chatModes: {},
    popularVibes: [],
    timestamp: Date.now()
  });

  // Initialize socket connection for real-time features
  useEffect(() => {
    const socketConnection = io();
    setSocket(socketConnection);

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  // Fetch real-time platform statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/platform/stats');
        if (response.ok) {
          const stats = await response.json();
          console.log('Platform stats received:', stats);
          setPlatformStats(stats);
        } else {
          console.error('Failed to fetch stats:', response.status);
        }
      } catch (error) {
        console.error('Failed to fetch platform stats:', error);
      }
    };

    // Fetch initially
    fetchStats();

    // Update every 5 seconds
    const interval = setInterval(fetchStats, 5000);

    return () => clearInterval(interval);
  }, []);

  // Function to mask username for privacy
  const getMaskedUsername = (username: string) => {
    if (!username || username.length <= 3) return '***';
    const maskLength = Math.max(1, username.length - 4);
    return username.substring(0, 2) + '*'.repeat(maskLength) + username.substring(username.length - 2);
  };

  const toggleVibe = (vibe: string) => {
    setVibes(prev => 
      prev.includes(vibe) 
        ? prev.filter(i => i !== vibe)
        : [...prev, vibe]
    );
  };

  const addCustomVibe = () => {
    if (customVibe.trim() && !vibes.includes(customVibe.trim())) {
      setVibes(prev => [...prev, customVibe.trim()]);
      setCustomVibe('');
    }
  };

  // Filter functions for search - country search removed (India-only)

  const filteredVibes = SUGGESTED_VIBES.filter(vibe =>
    vibe.toLowerCase().includes(vibeSearch.toLowerCase())
  );



  const handleStartChat = (mode: 'text' | 'video') => {
    onStartChat(vibes, mode, currentVibe, conversationMood);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 relative overflow-x-hidden">
      {/* Moving Hello Text Background - Grid-based */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Row 1 */}
        <div className="absolute top-[8%] left-0 w-full">
          <div className="animate-marquee whitespace-nowrap opacity-20 text-2xl font-normal text-gray-800 font-mono">
            {HELLO_TEXTS.slice(0, 8).map((text, i) => (
              <span key={i} className="mx-8">{text}</span>
            ))}
          </div>
        </div>

        {/* Row 3 */}
        <div className="absolute top-[24%] left-0 w-full">
          <div className="animate-marquee-reverse whitespace-nowrap opacity-20 text-2xl font-normal text-gray-800 font-mono">
            {HELLO_TEXTS.slice(8, 16).map((text, i) => (
              <span key={i} className="mx-8">{text}</span>
            ))}
          </div>
        </div>

        {/* Row 5 */}
        <div className="absolute top-[40%] left-0 w-full">
          <div className="animate-marquee whitespace-nowrap opacity-20 text-2xl font-normal text-gray-800 font-mono">
            {HELLO_TEXTS.slice(16, 24).map((text, i) => (
              <span key={i} className="mx-8">{text}</span>
            ))}
          </div>
        </div>

        {/* Row 7 */}
        <div className="absolute top-[56%] left-0 w-full">
          <div className="animate-marquee-reverse whitespace-nowrap opacity-20 text-2xl font-normal text-gray-800 font-mono">
            {HELLO_TEXTS.slice(24, 32).map((text, i) => (
              <span key={i} className="mx-8">{text}</span>
            ))}
          </div>
        </div>

        {/* Row 9 */}
        <div className="absolute top-[72%] left-0 w-full">
          <div className="animate-marquee whitespace-nowrap opacity-20 text-2xl font-normal text-gray-800 font-mono">
            {HELLO_TEXTS.slice(32, 40).map((text, i) => (
              <span key={i} className="mx-8">{text}</span>
            ))}
          </div>
        </div>

        {/* Row 11 */}
        <div className="absolute top-[88%] left-0 w-full">
          <div className="animate-marquee-reverse whitespace-nowrap opacity-20 text-2xl font-normal text-gray-800 font-mono">
            {HELLO_TEXTS.slice(40).map((text, i) => (
              <span key={i} className="mx-8">{text}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Dotted Grid Background */}
      <div 
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: `
            radial-gradient(circle, #000 1.5px, transparent 1.5px),
            linear-gradient(to right, #000 0.8px, transparent 0.8px),
            linear-gradient(to bottom, #000 0.8px, transparent 0.8px)
          `,
          backgroundSize: '50px 50px, 50px 50px, 50px 50px'
        }}
      />

      {/* Enhanced Geometric Shapes Background - 1.5x More Components with 20% Transparency */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Stars - 1.5x quantity */}
        {[...Array(23)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute opacity-20 animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 360}deg)`,
              fontSize: `${Math.random() * 50 + 40}px`,
              animationDelay: `${i * 0.2}s`
            }}
          >
            <Star className="fill-current text-green-500" />
          </div>
        ))}

        {/* Circles - 1.5x quantity */}
        {[...Array(18)].map((_, i) => (
          <div
            key={`circle-${i}`}
            className="absolute opacity-20 animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              fontSize: `${Math.random() * 60 + 35}px`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: '3s'
            }}
          >
            <Circle className="fill-current text-cyan-400" />
          </div>
        ))}

        {/* Squares - 1.5x quantity */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`square-${i}`}
            className="absolute opacity-20 animate-spin"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 45}deg)`,
              fontSize: `${Math.random() * 45 + 30}px`,
              animationDelay: `${i * 0.4}s`,
              animationDuration: '4s'
            }}
          >
            <Square className="fill-current text-purple-500" />
          </div>
        ))}

        {/* Triangles - 1.5x quantity */}
        {[...Array(12)].map((_, i) => (
          <div
            key={`triangle-${i}`}
            className="absolute opacity-20 animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 360}deg)`,
              fontSize: `${Math.random() * 40 + 25}px`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: '2s'
            }}
          >
            <Triangle className="fill-current text-orange-500" />
          </div>
        ))}

        {/* People Icons - 1.5x quantity */}
        {[...Array(30)].map((_, i) => (
          <div
            key={`user-${i}`}
            className="absolute opacity-20 text-black"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 360}deg)`,
              fontSize: `${Math.random() * 50 + 30}px`
            }}
          >
            <User />
          </div>
        ))}
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-[7.6px] sm:px-5 py-2 min-h-screen flex flex-col">
        {/* New Header Layout - Responsive */}
        <div className="flex flex-col sm:grid sm:grid-cols-3 items-center gap-4 sm:gap-0 mb-4 sm:mb-6 pt-4 sm:items-start">
          {/* Left: Logo */}
          <div className="flex items-center gap-3 justify-start">
            <div className="bg-white border-3 border-black p-2 shadow-[4px_4px_0px_0px_#000]">
              <TokoLogo className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-black tracking-tight">TOKO</h1>
          </div>

          {/* Center: Live Platform Stats - Mobile responsive */}
          <div className="flex justify-center w-full sm:w-auto sm:justify-self-center">
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-white border-2 border-black px-3 py-2 shadow-[3px_3px_0px_0px_#000] w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-black" />
                <span className="font-black text-xs text-black">LIVE STATS</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 sm:ml-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs font-bold">{platformStats?.onlineUsers || 0}</span>
                  <span className="text-xs text-gray-600 hidden sm:inline">Online</span>
                  <span className="text-xs text-gray-600 sm:hidden">On</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-xs font-bold">{platformStats?.waitingForMatch || 0}</span>
                  <span className="text-xs text-gray-600 hidden sm:inline">Waiting</span>
                  <span className="text-xs text-gray-600 sm:hidden">Wait</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-xs font-bold">{platformStats.activeChats}</span>
                  <span className="text-xs text-gray-600 hidden sm:inline">Chatting</span>
                  <span className="text-xs text-gray-600 sm:hidden">Chat</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: User info and logout - Mobile responsive */}
          <div className="flex items-center gap-2 sm:gap-3 justify-center sm:justify-end w-full sm:w-auto">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <p className="font-black text-sm sm:text-base text-black whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px] sm:max-w-[120px]">
                {showRealName ? (user.name || user.username) : getMaskedUsername(user.name || user.username)}
              </p>
              <button
                onClick={() => setShowRealName(!showRealName)}
                className="text-black hover:text-cyan-600 transition-colors flex-shrink-0"
                title={showRealName ? "Hide name for privacy" : "Show real name"}
              >
                {showRealName ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={onLogout}
              className="bg-black text-white border-3 border-black px-3 sm:px-4 py-2 font-black transition-all shadow-[4px_4px_0px_0px_#666] hover:shadow-[5px_5px_0px_0px_#FF00FF] hover:bg-cyan-400 hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-[3px_3px_0px_0px_#8A2BE2] active:bg-purple-500 flex-shrink-0 text-xs sm:text-sm"
            >
              LOGOUT
            </button>
          </div>
        </div>

        {/* Header - Mobile responsive */}
        <div className="text-center mb-4 px-2">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg sm:text-xl font-black text-gray-900 mb-2">
              CONNECT • DISCOVER • EXPLORE
            </h2>
            <p className="text-sm sm:text-base font-bold text-gray-700 leading-relaxed">
              "Every stranger is a friend you haven't met yet"
            </p>
          </div>
        </div>

        {/* Main Selection Grid - Responsive for mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 flex-1 auto-rows-fr">

          {/* Current Vibe - Extended height */}
          <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_#000] h-full flex flex-col">
            <h3 className="text-lg font-black mb-3 flex items-center gap-2 text-black">
              <Zap className="w-5 h-5" />
              CURRENT VIBE
            </h3>

            <div className="grid grid-cols-2 gap-3 flex-grow">
              {CURRENT_VIBE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setCurrentVibe(option.id)}
                  className={`p-3 border-2 border-black font-bold transition-all shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#00FFFF] hover:translate-x-[-1px] hover:translate-y-[-1px] text-sm flex flex-col items-center gap-2 ${
                    currentVibe === option.id
                      ? 'bg-black text-white hover:bg-cyan-500'
                      : 'bg-gray-100 text-black hover:bg-orange-300'
                  }`}
                  data-testid={`button-vibe-${option.id}`}
                >
                  <div>{option.icon}</div>
                  {option.label}
                </button>
              ))}
            </div>

            {/* Tip section */}
            <div className="mt-4 p-2 bg-gray-50 border-2 border-black">
              <p className="text-xs font-bold text-gray-700 text-center">
                <span className="text-cyan-600">💡</span> Your vibe attracts similar energy<br/>
                AI analyzes your expressions for better matches
              </p>
            </div>
          </div>

          {/* Conversation Mood */}
          <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_#000] h-full flex flex-col">
            <h3 className="text-lg font-black mb-3 flex items-center gap-2 text-black">
              <MessageCircle className="w-5 h-5" />
              CONVERSATION MOOD
            </h3>

            <div className="grid grid-cols-2 gap-3 flex-grow">
              {CONVERSATION_MOOD_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setConversationMood(option.id)}
                  className={`p-3 border-2 border-black font-bold transition-all shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#FF00FF] hover:translate-x-[-1px] hover:translate-y-[-1px] text-sm flex flex-col items-center gap-2 ${
                    conversationMood === option.id
                      ? 'bg-black text-white hover:bg-purple-500'
                      : 'bg-gray-100 text-black hover:bg-pink-300'
                  }`}
                  data-testid={`button-mood-${option.id}`}
                >
                  <div>{option.icon}</div>
                  {option.label}
                </button>
              ))}
            </div>

            {/* Info section */}
            <div className="mt-auto p-3 bg-gray-50 border-2 border-black">
              <p className="text-xs font-bold text-gray-700 text-center">
                <span className="text-purple-600">🗣️</span> India-only connections<br/>
                Set your conversation style for better matches
              </p>
            </div>
          </div>

          {/* Interests - Popup */}
          <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_#000] h-full flex flex-col">
            <h3 className="text-lg font-black mb-3 flex items-center gap-2 text-black">
              <Users className="w-5 h-5" />
              VIBES
            </h3>

            {/* Add custom vibe */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="Add custom vibe..."
                value={customVibe}
                onChange={(e) => setCustomVibe(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black font-bold bg-gray-50 focus:outline-none focus:bg-white focus:border-purple-400 text-sm mb-2"
                onKeyPress={(e) => { if (e.key === 'Enter') addCustomVibe(); }}
              />
              <button
                onClick={addCustomVibe}
                className="w-full px-6 py-2 border-2 border-black font-black bg-purple-400 text-black hover:bg-purple-300 shadow-[2px_2px_0px_0px_#000] text-sm"
              >
                ADD
              </button>
            </div>

            {/* Select button */}
            <div className="mb-3">
              <button
                onClick={() => setShowVibePopup(true)}
                className="w-full px-3 py-3 border-3 border-black font-black bg-gradient-to-r from-purple-400 to-pink-500 text-black focus:outline-none hover:from-cyan-400 hover:to-orange-400 text-sm shadow-[3px_3px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#FF00FF] hover:translate-x-[-1px] hover:translate-y-[-1px] cursor-pointer transition-all"
              >
                SELECT VIBES
              </button>
            </div>

            {/* Selected vibes display */}
            <div className="mb-3">
              <div className="text-sm font-bold mb-2">
                Selected ({vibes.length}):
              </div>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {vibes.map(vibe => (
                  <span
                    key={vibe}
                    className="bg-black text-white px-2 py-1 text-xs font-bold rounded flex items-center gap-1 cursor-pointer hover:bg-red-600"
                    onClick={() => setVibes(vibes.filter(i => i !== vibe))}
                    title="Click to remove"
                  >
                    {vibe}
                    <span className="text-red-300">×</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Info section */}
            <div className="mt-auto p-3 bg-gray-50 border-2 border-black">
              <p className="text-xs font-bold text-gray-700 text-center">
                <span className="text-purple-600">💡</span> Add vibes to find like-minded people<br/>
                Click selected vibes to remove them
              </p>
            </div>
          </div>

          {/* Chat Mode Section - Extended height */}
          <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_#000] h-full flex flex-col">
            <h3 className="text-lg font-black mb-3 text-center text-black">
              START CHATTING
            </h3>

            <div className="bg-gradient-to-r from-green-400 to-blue-500 border-2 border-black p-2 mb-4 shadow-[3px_3px_0px_0px_#000]">
              <p className="font-bold text-black text-sm text-center">
                Ready to connect?
              </p>
            </div>

            {/* Chat Buttons Container - Proper 2-column layout */}
            <div className="flex-grow flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 flex-1">
                {/* Text Chat Button */}
                <button
                  onClick={() => handleStartChat('text')}
                  className="w-full bg-black text-white hover:bg-cyan-500 border-3 border-black px-4 py-4 text-sm font-black transition-all shadow-[4px_4px_0px_0px_#000] hover:shadow-[6px_6px_0px_0px_#00FFFF] hover:translate-x-[-1px] hover:translate-y-[-1px] active:bg-purple-500 flex items-center justify-center gap-3 touch-manipulation min-h-[80px]" data-testid="button-chat-text"
                >
                  <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8" />
                  <span className="text-base sm:text-lg">TEXT CHAT</span>
                </button>

                {/* Video Chat Button */}
                <button
                  onClick={() => handleStartChat('video')}
                  className="w-full bg-black text-white hover:bg-orange-500 border-3 border-black px-4 py-4 text-sm font-black transition-all shadow-[4px_4px_0px_0px_#000] hover:shadow-[6px_6px_0px_0px_#FF8000] hover:translate-x-[-1px] hover:translate-y-[-1px] active:bg-purple-500 flex items-center justify-center gap-3 touch-manipulation min-h-[80px]" data-testid="button-chat-video"
                >
                  <Video className="w-6 h-6 sm:w-8 sm:h-8" />
                  <span className="text-base sm:text-lg">VIDEO CHAT</span>
                </button>
              </div>

              {/* Info section */}
              <div className="mt-auto p-3 bg-gray-50 border-2 border-black">
                <p className="text-xs font-bold text-gray-700 text-center">
                  <span className="text-orange-600">🚀</span> Choose your preferred chat mode<br/>
                  Both modes support instant matching
                </p>
              </div>
            </div>
          </div>


        </div>

        {/* Made by Humans using AI Footer - Mobile responsive */}
        <div className="text-center mt-auto py-2 px-2">
          <p className="text-xs sm:text-sm font-black text-gray-700">
            Made by Humans using AI 🤖
          </p>
        </div>
      </div>

      {/* Country selection removed - India-only platform */}

      {/* Vibe Selection Popup - Mobile responsive */}
      {showVibePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white border-4 border-black p-4 sm:p-6 shadow-[8px_8px_0px_0px_#000] max-w-md w-full max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-black text-black">SELECT VIBES</h3>
              <button
                onClick={() => setShowVibePopup(false)}
                className="bg-red-500 text-white border-2 border-black px-3 py-1 font-black hover:bg-red-400 shadow-[2px_2px_0px_0px_#000]"
              >
                ✕
              </button>
            </div>

            {/* Trending tag */}
            <div className="mb-4">
              <div className="bg-gradient-to-r from-purple-400 to-pink-500 border-2 border-black p-2 shadow-[2px_2px_0px_0px_#000]">
                <p className="font-black text-black text-sm text-center">
                  🔥 TRENDING VIBES
                </p>
              </div>
            </div>

            {/* Vibes grid - scrollable, mobile responsive */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SUGGESTED_VIBES.map(vibe => (
                  <button
                    key={vibe}
                    onClick={() => {
                      if (!vibes.includes(vibe)) {
                        setVibes([...vibes, vibe]);
                      }
                    }}
                    disabled={vibes.includes(vibe)}
                    className={`p-3 border-3 border-black font-black transition-all shadow-[3px_3px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#00FF88] hover:translate-x-[-1px] hover:translate-y-[-1px] text-xs ${
                      vibes.includes(vibe)
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-600'
                        : 'bg-black text-white hover:bg-gray-800'
                    }`}
                  >
                    {vibe}
                    {vibes.includes(vibe) && (
                      <span className="block text-gray-400 mt-1 font-black">✓ Added</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected count */}
            <div className="mt-4 p-2 bg-gray-50 border-2 border-black">
              <p className="text-sm font-bold text-center">
                {vibes.length} vibes selected
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}