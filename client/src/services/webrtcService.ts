import { socketService } from './socketService';

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private roomId: string | null = null;
  private isInitiator = false;
  private iceRestartInProgress = false;
  private socketHandlersRegistered = false;

  // ICE servers configuration
  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ]
  };

  async initialize(roomId: string, isInitiator: boolean = false): Promise<void> {
    this.roomId = roomId;
    this.isInitiator = isInitiator;

    // Create peer connection
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    // Set up event handlers
    this.setupPeerConnectionHandlers();

    // Set up socket event handlers
    this.setupSocketHandlers();
  }

  private setupPeerConnectionHandlers() {
    if (!this.peerConnection) return;

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        socketService.sendIceCandidate(this.roomId, event.candidate);
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote stream');
      this.remoteStream = event.streams[0];
      this.onRemoteStreamReceived?.(this.remoteStream);
    };

    // Handle connection state changes with ICE restart
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'disconnected';
      console.log('Connection state:', state);
      this.onConnectionStateChange?.(state);

      // Trigger ICE restart on failed connection
      if (state === 'failed' && !this.iceRestartInProgress) {
        console.log('Connection failed, attempting ICE restart...');
        this.restartIce();
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('ICE connection state:', state);

      if (state === 'failed' && !this.iceRestartInProgress) {
        console.log('ICE connection failed, attempting ICE restart...');
        this.restartIce();
      }
    };

    // Handle negotiation needed for renegotiation
    this.peerConnection.onnegotiationneeded = async () => {
      if (!this.isInitiator || this.iceRestartInProgress) return;

      try {
        console.log('Negotiation needed, creating new offer...');
        const offer = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offer);
        
        if (this.roomId) {
          socketService.sendOffer(this.roomId, offer);
        }
      } catch (error) {
        console.error('Error during renegotiation:', error);
        this.onError?.(`Renegotiation error: ${(error as Error).message}`);
      }
    };
  }

  private setupSocketHandlers() {
    if (this.socketHandlersRegistered) {
      console.log('Socket handlers already registered, skipping...');
      return;
    }

    // Handle incoming offers
    socketService.onWebRTCOffer(async (data) => {
      if (!this.peerConnection || !this.roomId) return;

      try {
        await this.peerConnection.setRemoteDescription(data.offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        socketService.sendAnswer(this.roomId, answer);
      } catch (error: any) {
        console.error('Error handling offer:', error);
        this.onError?.(`Video call error (offer): ${error.message}`);
      }
    });

    // Handle incoming answers
    socketService.onWebRTCAnswer(async (data) => {
      if (!this.peerConnection) return;

      try {
        await this.peerConnection.setRemoteDescription(data.answer);
        this.iceRestartInProgress = false;
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    });

    // Handle incoming ICE candidates
    socketService.onWebRTCIceCandidate(async (data) => {
      if (!this.peerConnection) return;

      try {
        await this.peerConnection.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    this.socketHandlersRegistered = true;
  }

  async restartIce(): Promise<void> {
    if (!this.peerConnection || !this.roomId || this.iceRestartInProgress) {
      return;
    }

    this.iceRestartInProgress = true;
    console.log('Starting ICE restart...');

    try {
      if (this.isInitiator) {
        const offer = await this.peerConnection.createOffer({ iceRestart: true });
        await this.peerConnection.setLocalDescription(offer);
        socketService.sendOffer(this.roomId, offer);
        console.log('ICE restart offer sent');
      }
    } catch (error) {
      console.error('Error during ICE restart:', error);
      this.iceRestartInProgress = false;
      this.onError?.(`ICE restart failed: ${(error as Error).message}`);
    }
  }

  async startCall(localStream: MediaStream): Promise<void> {
    if (!this.peerConnection || !this.roomId) {
      throw new Error('WebRTC not initialized');
    }

    this.localStream = localStream;

    // Add local stream to peer connection
    localStream.getTracks().forEach(track => {
      this.peerConnection?.addTrack(track, localStream);
    });

    if (this.isInitiator) {
      // Create and send offer
      try {
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await this.peerConnection.setLocalDescription(offer);
        socketService.sendOffer(this.roomId, offer);
      } catch (error) {
        console.error('Error creating offer:', error);
        throw error;
      }
    }
  }

  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = new Error('getUserMedia not supported on this browser');
        this.onError?.(error.message);
        throw error;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('getUserMedia successful:', stream);
      return stream;
    } catch (error: any) {
      console.error('Error accessing media devices:', error);
      
      // Provide user-friendly error messages
      let errorMsg = 'Failed to access camera/microphone: ';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg = 'Camera/microphone permission denied. Please allow access in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera or microphone found. Please connect a device and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMsg = 'Camera/microphone is in use by another application. Please close other apps.';
      } else if (error.name === 'OverconstrainedError') {
        errorMsg = 'Camera constraints not supported by your device.';
      } else {
        errorMsg += error.message || 'Unknown error occurred.';
      }
      
      this.onError?.(errorMsg);
      throw error;
    }
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('enumerateDevices not supported');
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error enumerating devices:', error);
      return [];
    }
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  }

  toggleAudio(): boolean {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  }

  cleanup() {
    console.log('Cleaning up WebRTC service...');

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.roomId = null;
    this.isInitiator = false;
    this.iceRestartInProgress = false;
    this.socketHandlersRegistered = false;
  }

  cleanupForNewMatch() {
    console.log('Cleaning up WebRTC for new match (keeping socket handlers)...');

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.roomId = null;
    this.isInitiator = false;
    this.iceRestartInProgress = false;
  }

  // Callback handlers (to be set by components)
  onRemoteStreamReceived?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: string) => void;

  // Getters
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getConnectionState(): string {
    return this.peerConnection?.connectionState || 'disconnected';
  }
}

export const webrtcService = new WebRTCService();