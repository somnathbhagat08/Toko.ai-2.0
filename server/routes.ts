import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import { redisManager } from "./redis";
import { monitoring } from "./monitoring";
import { matchmakingService } from "./services/matchmaking";
import { liveKitService } from "./services/livekit";
import { authService } from "./services/auth";
import { moderationService } from "./services/moderation";
import { presenceService } from "./services/presence";

// Store for matching users
const waitingUsers = new Map();
const activeChats = new Map();

// Rate limiting middleware
async function rateLimitMiddleware(req: any, res: any, next: any) {
  const clientIp = req.ip || req.connection.remoteAddress;
  const key = `${clientIp}:${req.path}`;
  
  // Check rate limit (100 requests per minute for API endpoints)
  const isAllowed = await redisManager.checkRateLimit(key, 100, 60);
  
  if (!isAllowed) {
    monitoring.trackError('rate_limit', `Rate limit exceeded for ${clientIp}`);
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60 
    });
  }
  
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply rate limiting to all API routes
  app.use('/api', rateLimitMiddleware);

  // Enhanced health check endpoint for load balancers and monitoring
  app.get("/api/health", (req, res) => {
    const healthStatus = monitoring.getHealthStatus();
    res.status(healthStatus.status === 'unhealthy' ? 503 : 200).json({
      ...healthStatus,
      service: 'toko-backend',
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Metrics endpoint for Prometheus/monitoring
  app.get("/api/metrics", (req, res) => {
    const metrics = monitoring.exportPrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  });

  // Live stats endpoint for admin dashboard
  app.get("/api/stats", (req, res) => {
    const stats = monitoring.getLiveStats();
    res.json(stats);
  });

  // Matchmaking stats endpoint
  app.get("/api/matchmaking/stats", (req, res) => {
    const stats = matchmakingService.getQueueStats();
    res.json(stats);
  });

  // Presence endpoints for real-time user tracking
  app.get("/api/presence/online", (req, res) => {
    const onlineUsers = presenceService.getOnlineUsers();
    res.json({
      users: onlineUsers.map(user => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        tags: user.tags,
        country: user.country,
        joinedAt: user.joinedAt
      })),
      total: onlineUsers.length
    });
  });

  app.get("/api/presence/stats", (req, res) => {
    const stats = presenceService.getStats();
    res.json(stats);
  });

  // Get online users by tags
  app.get("/api/presence/by-tags", (req, res) => {
    const { tags } = req.query;
    const tagArray = typeof tags === 'string' ? tags.split(',') : [];
    const users = presenceService.getOnlineUsersByTags(tagArray);
    res.json({
      users: users.map(user => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        tags: user.tags,
        country: user.country
      })),
      total: users.length
    });
  });

  // Live platform statistics for homepage
  app.get("/api/platform/stats", async (req, res) => {
    try {
      const matchmakingStats = matchmakingService.getQueueStats();
      const healthStatus = monitoring.getHealthStatus();
      const presenceStats = presenceService.getStats();
      
      // Get active connections from Socket.IO
      const connectedSockets = io.sockets.sockets.size;
      
      // Use presence service for accurate online user count
      const onlineUsers = presenceStats.totalOnline;
      
      // Get active rooms count
      const activeRooms = matchmakingStats.activeMatches;
      
      // Calculate users in chat (2 users per active room)
      const usersInChat = activeRooms * 2;
      
      // Platform statistics with presence data
      const platformStats = {
        onlineUsers: Math.max(1, onlineUsers),
        waitingForMatch: matchmakingStats.totalWaiting,
        activeChats: activeRooms,
        usersInChat: usersInChat,
        totalConnections: connectedSockets,
        averageWaitTime: Math.round(matchmakingStats.averageWaitTime / 1000), // Convert to seconds
        serverUptime: Math.round(healthStatus.uptime / 1000), // Convert to seconds
        chatModes: matchmakingStats.byMode,
        popularInterests: Object.entries(matchmakingStats.byInterests)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([interest, count]) => ({ interest, count })),
        timestamp: Date.now()
      };

      console.log('Platform stats generated:', platformStats);
      res.json(platformStats);
    } catch (error) {
      console.error('Platform stats error:', error);
      res.status(500).json({ error: "Failed to get platform statistics" });
    }
  });

  // LiveKit endpoints
  app.post("/api/livekit/token", async (req, res) => {
    try {
      const { roomId, userId, name } = req.body;
      
      if (!roomId || !userId) {
        return res.status(400).json({ error: "roomId and userId are required" });
      }

      const token = await liveKitService.createRoomToken(roomId, {
        identity: userId,
        name: name || `User_${userId}`,
        permissions: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          hidden: false
        }
      });

      const connectionInfo = liveKitService.getRoomConnectionInfo(token);
      res.json(connectionInfo);
    } catch (error) {
      console.error('LiveKit token error:', error);
      res.status(500).json({ error: "Failed to create room token" });
    }
  });

  // LiveKit webhook handler
  app.post("/api/livekit/webhook", async (req, res) => {
    try {
      const signature = req.headers['livekit-signature'] as string;
      const body = JSON.stringify(req.body);
      
      if (!liveKitService.validateWebhook(body, signature)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      await liveKitService.handleWebhookEvent(req.body.event, req.body);
      res.json({ success: true });
    } catch (error) {
      console.error('LiveKit webhook error:', error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Enhanced authentication endpoints
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token is required" });
      }

      const result = await authService.refreshToken(refreshToken);
      res.json(result);
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({ error: "Invalid refresh token" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const { userId, token, refreshToken } = req.body;
      
      await authService.logout(userId, token, refreshToken);
      res.json({ success: true });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Content moderation endpoints
  app.post("/api/moderation/check", async (req, res) => {
    try {
      const { content, userId } = req.body;
      
      if (!content || !userId) {
        return res.status(400).json({ error: "content and userId are required" });
      }

      const result = await moderationService.moderateText(content, userId);
      res.json(result);
    } catch (error) {
      console.error('Moderation error:', error);
      res.status(500).json({ error: "Moderation check failed" });
    }
  });

  app.post("/api/moderation/report", async (req, res) => {
    try {
      const { reportedUserId, reporterUserId, reason } = req.body;
      
      if (!reportedUserId || !reporterUserId || !reason) {
        return res.status(400).json({ error: "All fields are required" });
      }

      await moderationService.reportUser(reportedUserId, reporterUserId, reason);
      res.json({ success: true });
    } catch (error) {
      console.error('User report error:', error);
      res.status(500).json({ error: "Failed to report user" });
    }
  });

  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      const user = await storage.createUser(userData);
      res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.authenticateUser(email, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    monitoring.trackUserConnection(socket.id);
    
    // Track connection in Redis for cross-server visibility
    redisManager.setUserOnline(socket.id, socket.id);

    // Initialize presence tracking for this socket
    presenceService.subscribeToPresence(socket, io, (event) => {
      socket.emit('presence:update', event);
    });

    socket.on("join-queue", async (userData) => {
      console.log("User joining queue:", userData);
      
      try {
        // Add user to presence system
        await presenceService.setUserOnline(userData.user.id, socket.id, {
          name: userData.user.name,
          avatar: userData.user.avatar,
          tags: userData.interests || [],
          country: userData.country || "Any on Earth"
        }, io);

        // Create user profile for advanced matchmaking
        const userProfile = {
          id: userData.user.id,
          socketId: socket.id,
          interests: userData.interests || [],
          chatMode: userData.chatMode || 'text',
          genderPreference: userData.genderPreference,
          gender: userData.gender,
          location: userData.location,
          preferences: userData.preferences || {},
          joinedAt: Date.now()
        };

        // Add to advanced matchmaking queue
        const match = await matchmakingService.addToQueue(userProfile);
        
        if (match) {
          // Join both users to the room
          socket.join(match.roomId);
          io.sockets.sockets.get(match.user2.socketId)?.join(match.roomId);
          
          // Create LiveKit tokens for video chat
          let liveKitTokens = null;
          if (match.user1.chatMode === 'video') {
            try {
              liveKitTokens = await liveKitService.createMatchTokens(
                match.roomId, 
                match.user1.id, 
                match.user2.id
              );
            } catch (error) {
              console.error('LiveKit token creation failed:', error);
            }
          }
          
          // Notify both users with enhanced match data
          const matchData = {
            roomId: match.roomId,
            stranger: {
              id: match.user2.id,
              interests: match.user2.interests,
              compatibility: (match.compatibility * 100).toFixed(1),
              matchedOn: match.matchedOn
            },
            liveKit: liveKitTokens ? {
              token: liveKitTokens.user1Token,
              roomUrl: liveKitTokens.roomUrl
            } : null
          };
          
          const strangerMatchData = {
            roomId: match.roomId,
            stranger: {
              id: match.user1.id,
              interests: match.user1.interests,
              compatibility: (match.compatibility * 100).toFixed(1),
              matchedOn: match.matchedOn
            },
            liveKit: liveKitTokens ? {
              token: liveKitTokens.user2Token,
              roomUrl: liveKitTokens.roomUrl
            } : null
          };
          
          socket.emit("match-found", matchData);
          io.to(match.user2.socketId).emit("match-found", strangerMatchData);
          
          console.log(`Advanced match created: ${match.user1.id} <-> ${match.user2.id} (${(match.compatibility * 100).toFixed(1)}% compatibility)`);
        } else {
          // No immediate match found, user added to queue
          socket.emit("waiting-for-match", {
            queuePosition: matchmakingService.getQueueStats().totalWaiting
          });
        }
      } catch (error) {
        console.error('Matchmaking error:', error);
        socket.emit("error", { message: "Matchmaking failed, please try again" });
      }
    });

    socket.on("send-message", async (data) => {
      try {
        const { roomId, message, userId } = data;
        
        if (!message || !userId || !roomId) {
          socket.emit("error", { message: "Missing required message data" });
          return;
        }

        // Update user activity when they send a message
        await presenceService.updateUserActivity(socket.id, io);

        // Moderate message content
        const moderationResult = await moderationService.moderateText(message, userId);
        
        if (!moderationResult.allowed) {
          socket.emit("message-blocked", {
            reason: moderationResult.flags.join(', '),
            severity: moderationResult.severity
          });
          console.log(`Message blocked for user ${userId}: ${moderationResult.flags.join(', ')}`);
          return;
        }

        // Send the (possibly filtered) message
        const messageData = {
          message: moderationResult.filtered,
          timestamp: Date.now(),
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
        };

        socket.to(roomId).emit("receive-message", messageData);
        
        // Confirm message sent to sender
        socket.emit("message-sent", {
          messageId: messageData.messageId,
          filtered: moderationResult.filtered !== message
        });
        
        // Track message for analytics
        monitoring.trackMessage(roomId, 'text');
        redisManager.incrementRoomStats(roomId, 'messages');
      } catch (error) {
        console.error('Message handling error:', error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("typing-start", (data) => {
      socket.to(data.roomId).emit("user-typing", { isTyping: true });
    });

    socket.on("typing-stop", (data) => {
      socket.to(data.roomId).emit("user-typing", { isTyping: false });
    });

    socket.on("leave-chat", (data) => {
      socket.to(data.roomId).emit("stranger-disconnected");
      socket.leave(data.roomId);
      activeChats.delete(data.roomId);
    });

    socket.on("skip-chat", (data) => {
      socket.to(data.roomId).emit("finding-new-match");
      socket.leave(data.roomId);
      activeChats.delete(data.roomId);
    });

    // WebRTC signaling
    socket.on("webrtc-offer", (data) => {
      socket.to(data.roomId).emit("webrtc-offer", data);
    });

    socket.on("webrtc-answer", (data) => {
      socket.to(data.roomId).emit("webrtc-answer", data);
    });

    socket.on("webrtc-ice-candidate", (data) => {
      socket.to(data.roomId).emit("webrtc-ice-candidate", data);
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id);
      
      // Handle presence tracking for disconnection
      await presenceService.handleSocketDisconnect(socket.id, io);
      
      waitingUsers.delete(socket.id);
      
      // Remove from matchmaking queue
      await matchmakingService.removeFromQueue(socket.id);
      
      // Notify any active chat partners
      const chatEntries = Array.from(activeChats.entries());
      for (const [roomId, chat] of chatEntries) {
        if (chat.user1.socketId === socket.id || chat.user2.socketId === socket.id) {
          socket.to(roomId).emit("stranger-disconnected");
          activeChats.delete(roomId);
          break;
        }
      }
      
      // Update Redis
      await redisManager.setUserOffline(socket.id);
      monitoring.trackUserDisconnection(socket.id);
    });
  });

  return httpServer;
}

function findMatch(userData: any, waitingUsers: Map<string, any>) {
  const waitingEntries = Array.from(waitingUsers.entries());
  for (const [socketId, waitingUser] of waitingEntries) {
    // Check interests compatibility
    const commonInterests = userData.interests.filter((interest: string) =>
      waitingUser.interests.includes(interest)
    );
    
    // Check gender preference compatibility
    const genderMatch = 
      (userData.genderPreference === 'any' || waitingUser.user.gender === userData.genderPreference) &&
      (waitingUser.genderPreference === 'any' || userData.user.gender === waitingUser.genderPreference);
    
    // Match if they have common interests or no specific preferences, and gender preferences match
    if ((commonInterests.length > 0 || (userData.interests.length === 0 && waitingUser.interests.length === 0)) && genderMatch) {
      return { ...waitingUser, socketId };
    }
  }
  return null;
}
