import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private eventHandlers: Map<string, Function[]> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io({
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
          console.log('Connected to server:', this.socket?.id);
          this.isConnected = true;
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log('Disconnected from server:', reason);
          this.isConnected = false;
        });

        this.socket.on('reconnect', (attemptNumber) => {
          console.log('Reconnected after', attemptNumber, 'attempts');
          this.isConnected = true;
        });

        this.socket.on('reconnect_error', (error) => {
          console.error('Reconnection failed:', error);
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
          reject(new Error(`Failed to connect to server: ${error.message}`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.removeAllEventHandlers();
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  private registerHandler(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  removeEventHandler(event: string, handler?: Function) {
    if (!this.socket) return;

    if (handler) {
      this.socket.off(event, handler as any);
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    } else {
      this.socket.off(event);
      this.eventHandlers.delete(event);
    }
  }

  removeAllEventHandlers() {
    if (!this.socket) return;

    Array.from(this.eventHandlers.keys()).forEach(event => {
      this.socket!.off(event);
    });
    this.eventHandlers.clear();
  }

  // Queue management
  joinQueue(userData: any) {
    if (this.socket) {
      this.socket.emit('join-queue', userData);
    }
  }

  // Chat events
  sendMessage(roomId: string, message: string) {
    if (this.socket) {
      this.socket.emit('send-message', { roomId, message });
    }
  }

  startTyping(roomId: string) {
    if (this.socket) {
      this.socket.emit('typing-start', roomId);
    }
  }

  stopTyping(roomId: string) {
    if (this.socket) {
      this.socket.emit('typing-stop', roomId);
    }
  }

  leaveChat(roomId: string) {
    if (this.socket) {
      this.socket.emit('leave-chat', roomId);
    }
  }

  skipChat(roomId: string) {
    if (this.socket) {
      this.socket.emit('skip-chat', roomId);
    }
  }

  // WebRTC signaling
  sendOffer(roomId: string, offer: RTCSessionDescriptionInit) {
    if (this.socket) {
      this.socket.emit('webrtc-offer', { roomId, offer });
    }
  }

  sendAnswer(roomId: string, answer: RTCSessionDescriptionInit) {
    if (this.socket) {
      this.socket.emit('webrtc-answer', { roomId, answer });
    }
  }

  sendIceCandidate(roomId: string, candidate: RTCIceCandidate) {
    if (this.socket) {
      this.socket.emit('webrtc-ice-candidate', { roomId, candidate });
    }
  }

  // Event listeners
  onMatchFound(callback: (data: any) => void) {
    if (this.socket) {
      this.removeEventHandler('match-found');
      this.socket.on('match-found', callback);
      this.registerHandler('match-found', callback);
    }
  }

  onWaitingForMatch(callback: () => void) {
    if (this.socket) {
      this.removeEventHandler('waiting-for-match');
      this.socket.on('waiting-for-match', callback);
      this.registerHandler('waiting-for-match', callback);
    }
  }

  onReceiveMessage(callback: (data: any) => void) {
    if (this.socket) {
      this.removeEventHandler('receive-message');
      this.socket.on('receive-message', callback);
      this.registerHandler('receive-message', callback);
    }
  }

  onUserTyping(callback: (isTyping: boolean) => void) {
    if (this.socket) {
      this.removeEventHandler('user-typing');
      this.socket.on('user-typing', callback);
      this.registerHandler('user-typing', callback);
    }
  }

  onStrangerDisconnected(callback: () => void) {
    if (this.socket) {
      this.removeEventHandler('stranger-disconnected');
      this.socket.on('stranger-disconnected', callback);
      this.registerHandler('stranger-disconnected', callback);
    }
  }

  onFindingNewMatch(callback: () => void) {
    if (this.socket) {
      this.removeEventHandler('finding-new-match');
      this.socket.on('finding-new-match', callback);
      this.registerHandler('finding-new-match', callback);
    }
  }

  // WebRTC event listeners
  onWebRTCOffer(callback: (data: any) => void) {
    if (this.socket) {
      this.removeEventHandler('webrtc-offer');
      this.socket.on('webrtc-offer', callback);
      this.registerHandler('webrtc-offer', callback);
    }
  }

  onWebRTCAnswer(callback: (data: any) => void) {
    if (this.socket) {
      this.removeEventHandler('webrtc-answer');
      this.socket.on('webrtc-answer', callback);
      this.registerHandler('webrtc-answer', callback);
    }
  }

  onWebRTCIceCandidate(callback: (data: any) => void) {
    if (this.socket) {
      this.removeEventHandler('webrtc-ice-candidate');
      this.socket.on('webrtc-ice-candidate', callback);
      this.registerHandler('webrtc-ice-candidate', callback);
    }
  }

  // Utility methods
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

export const socketService = new SocketService();