export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'stranger';
  timestamp: Date;
}

export interface Stranger {
  id: string;
  interests: string[];
  isTyping: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'stranger_disconnected';

export type ChatMode = 'text' | 'video';

export interface VideoCall {
  isActive: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export interface User {
  id: string;
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
  isPhoneVerified?: boolean;
  lastSeen?: Date;
}