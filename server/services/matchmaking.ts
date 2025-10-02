import { redisManager } from '../redis.js';
import { monitoring } from '../monitoring.js';
import { log } from '../vite.js';
import { aiEmbeddingService } from './aiEmbedding.js';

interface UserProfile {
  id: string;
  socketId: string;
  interests: string[];
  gender?: string;
  genderPreference?: string;
  countryPreference?: string;
  chatMode: 'text' | 'video';
  location?: {
    country: string;
    timezone: string;
  };
  preferences: {
    ageRange?: [number, number];
    language?: string;
    verified?: boolean;
  };
  profileEmbedding?: number[];
  joinedAt: number;
}

interface MatchResult {
  user1: UserProfile;
  user2: UserProfile;
  roomId: string;
  compatibility: number;
  matchedOn: string[];
}

class MatchmakingService {
  private waitingQueue = new Map<string, UserProfile>();
  private activeMatches = new Map<string, MatchResult>();
  private matchingInProgress = new Set<string>();

  constructor() {
    // Cleanup stale entries every minute
    setInterval(() => this.cleanupStaleEntries(), 60000);
    
    // Process waiting queue every 5 seconds
    setInterval(() => this.processWaitingQueue(), 5000);
  }

  async addToQueue(profile: UserProfile): Promise<MatchResult | null> {
    // Prevent duplicate entries
    if (this.waitingQueue.has(profile.socketId) || this.matchingInProgress.has(profile.socketId)) {
      return null;
    }

    log(`Adding user ${profile.id} to matchmaking queue`, 'matchmaking');
    
    // Track in Redis for cross-server visibility
    await redisManager.setSession(`queue:${profile.socketId}`, profile, 300); // 5 minutes TTL
    
    // Try immediate match first
    const immediateMatch = await this.findMatch(profile);
    if (immediateMatch) {
      monitoring.trackMatchMaking(true, Date.now() - profile.joinedAt);
      return immediateMatch;
    }

    // Add to waiting queue
    this.waitingQueue.set(profile.socketId, profile);
    monitoring.trackMatchMaking(false);
    
    log(`User ${profile.id} added to waiting queue (${this.waitingQueue.size} waiting)`, 'matchmaking');
    return null;
  }

  async removeFromQueue(socketId: string): Promise<void> {
    this.waitingQueue.delete(socketId);
    this.matchingInProgress.delete(socketId);
    await redisManager.deleteSession(`queue:${socketId}`);
    
    log(`Removed user ${socketId} from queue`, 'matchmaking');
  }

  private async findMatch(targetUser: UserProfile): Promise<MatchResult | null> {
    let bestMatch: UserProfile | null = null;
    let bestCompatibility = 0;
    let matchedCriteria: string[] = [];

    for (const [socketId, candidate] of this.waitingQueue.entries()) {
      // Skip if already being matched
      if (this.matchingInProgress.has(socketId)) continue;
      
      // Skip same user
      if (candidate.socketId === targetUser.socketId) continue;

      const { compatibility, criteria } = this.calculateCompatibility(targetUser, candidate);
      
      // Require minimum compatibility threshold
      if (compatibility > 0.3 && compatibility > bestCompatibility) {
        bestMatch = candidate;
        bestCompatibility = compatibility;
        matchedCriteria = criteria;
      }
    }

    if (bestMatch) {
      return await this.createMatch(targetUser, bestMatch, bestCompatibility, matchedCriteria);
    }

    return null;
  }

  private calculateCompatibility(user1: UserProfile, user2: UserProfile): {
    compatibility: number;
    criteria: string[];
  } {
    let score = 0;
    const criteria: string[] = [];
    const maxScore = 10; // Total possible points

    // 1. Chat mode compatibility (required)
    if (user1.chatMode !== user2.chatMode) {
      return { compatibility: 0, criteria: [] };
    }
    score += 3;
    criteria.push('chat_mode');

    // 2. Gender preferences
    if (this.checkGenderCompatibility(user1, user2)) {
      score += 2;
      criteria.push('gender_preference');
    } else if (user1.genderPreference || user2.genderPreference) {
      // If either has a preference and it's not met, reduce compatibility
      score -= 1;
    }

    // 3. Country preferences
    if (this.checkCountryCompatibility(user1, user2)) {
      score += 2;
      criteria.push('country_preference');
    } else if ((user1.countryPreference && user1.countryPreference !== 'Any on Earth') || 
               (user2.countryPreference && user2.countryPreference !== 'Any on Earth')) {
      // If either has a specific country preference and it's not met, reduce compatibility
      score -= 1;
    }

    // 4. Common interests
    const commonInterests = user1.interests.filter(interest => 
      user2.interests.includes(interest)
    );
    if (commonInterests.length > 0) {
      score += Math.min(2, commonInterests.length * 0.5);
      criteria.push('interests');
    }

    // 4. Location/timezone compatibility
    if (user1.location && user2.location) {
      if (user1.location.country === user2.location.country) {
        score += 1;
        criteria.push('location');
      } else if (user1.location.timezone === user2.location.timezone) {
        score += 0.5;
        criteria.push('timezone');
      }
    }

    // 5. Language preference
    if (user1.preferences.language && user2.preferences.language) {
      if (user1.preferences.language === user2.preferences.language) {
        score += 1;
        criteria.push('language');
      }
    }

    // 6. Verification status
    if (user1.preferences.verified && user2.preferences.verified) {
      score += 0.5;
      criteria.push('verified');
    }

    // 7. AI embedding similarity (if available)
    if (user1.profileEmbedding && user2.profileEmbedding && aiEmbeddingService.isServiceAvailable()) {
      const aiSimilarity = aiEmbeddingService.calculateCosineSimilarity(
        user1.profileEmbedding,
        user2.profileEmbedding
      );
      
      // Weight AI similarity with 3 points (significant factor)
      const aiScore = aiSimilarity * 3;
      score += aiScore;
      
      if (aiSimilarity > 0.7) {
        criteria.push('ai_high_match');
      } else if (aiSimilarity > 0.5) {
        criteria.push('ai_moderate_match');
      }
      
      log(`AI similarity between ${user1.id} and ${user2.id}: ${(aiSimilarity * 100).toFixed(1)}%`, 'matchmaking');
    }

    // 8. Wait time bonus (helps people who have been waiting longer)
    const avgWaitTime = (Date.now() - user1.joinedAt + Date.now() - user2.joinedAt) / 2;
    const waitBonus = Math.min(1, avgWaitTime / (60000 * 2)); // Max bonus after 2 minutes
    score += waitBonus;

    // Adjust max score to account for AI similarity
    const adjustedMaxScore = user1.profileEmbedding && user2.profileEmbedding ? 13 : 10;

    return {
      compatibility: Math.min(1, score / adjustedMaxScore),
      criteria
    };
  }

  private checkGenderCompatibility(user1: UserProfile, user2: UserProfile): boolean {
    // If neither has preferences, they're compatible
    if (!user1.genderPreference && !user2.genderPreference) {
      return true;
    }

    // Check if preferences match available genders
    const user1Compatible = !user1.genderPreference || 
      (!!user2.gender && user1.genderPreference === user2.gender);
    
    const user2Compatible = !user2.genderPreference || 
      (!!user1.gender && user2.genderPreference === user1.gender);

    return user1Compatible && user2Compatible;
  }

  private checkCountryCompatibility(user1: UserProfile, user2: UserProfile): boolean {
    // If both prefer "Any on Earth" or neither has preferences, they're compatible
    if ((!user1.countryPreference || user1.countryPreference === 'Any on Earth') && 
        (!user2.countryPreference || user2.countryPreference === 'Any on Earth')) {
      return true;
    }

    // If one prefers "Any on Earth" and the other has a specific preference, they're compatible
    if ((user1.countryPreference === 'Any on Earth' && user2.countryPreference) ||
        (user2.countryPreference === 'Any on Earth' && user1.countryPreference)) {
      return true;
    }

    // If both have specific country preferences, they must match
    return user1.countryPreference === user2.countryPreference;
  }

  private async createMatch(
    user1: UserProfile, 
    user2: UserProfile, 
    compatibility: number,
    criteria: string[]
  ): Promise<MatchResult> {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    // Mark both users as being matched
    this.matchingInProgress.add(user1.socketId);
    this.matchingInProgress.add(user2.socketId);
    
    // Remove from waiting queue
    this.waitingQueue.delete(user1.socketId);
    this.waitingQueue.delete(user2.socketId);
    
    // Clean up Redis queue entries
    await redisManager.deleteSession(`queue:${user1.socketId}`);
    await redisManager.deleteSession(`queue:${user2.socketId}`);

    const match: MatchResult = {
      user1,
      user2,
      roomId,
      compatibility,
      matchedOn: criteria
    };

    // Store active match
    this.activeMatches.set(roomId, match);
    
    // Store match in Redis for analytics
    await redisManager.setSession(`match:${roomId}`, {
      ...match,
      createdAt: Date.now()
    }, 86400); // 24 hours

    // Track analytics
    monitoring.trackMatchMaking(true, Date.now() - Math.min(user1.joinedAt, user2.joinedAt));
    await redisManager.incrementRoomStats(roomId, 'matches');

    log(`Match created: ${user1.id} <-> ${user2.id} (${roomId}, ${(compatibility * 100).toFixed(1)}% compatibility)`, 'matchmaking');
    
    return match;
  }

  async endMatch(roomId: string): Promise<void> {
    const match = this.activeMatches.get(roomId);
    if (match) {
      this.matchingInProgress.delete(match.user1.socketId);
      this.matchingInProgress.delete(match.user2.socketId);
      this.activeMatches.delete(roomId);
      
      log(`Match ended: ${roomId}`, 'matchmaking');
    }
  }

  private async processWaitingQueue(): Promise<void> {
    if (this.waitingQueue.size < 2) return;

    const waitingUsers = Array.from(this.waitingQueue.values());
    const processed = new Set<string>();

    for (const user of waitingUsers) {
      if (processed.has(user.socketId) || this.matchingInProgress.has(user.socketId)) {
        continue;
      }

      const match = await this.findMatch(user);
      if (match) {
        processed.add(match.user1.socketId);
        processed.add(match.user2.socketId);
        
        // Emit match found events (this would be handled by the socket service)
        // We'll implement this in the socket service integration
      }
    }
  }

  private cleanupStaleEntries(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [socketId, user] of this.waitingQueue.entries()) {
      if (now - user.joinedAt > staleThreshold) {
        this.removeFromQueue(socketId);
        log(`Removed stale user from queue: ${socketId}`, 'matchmaking');
      }
    }
  }

  // Analytics and monitoring methods
  getQueueStats() {
    const queueByMode = new Map<string, number>();
    const queueByInterests = new Map<string, number>();
    
    for (const user of this.waitingQueue.values()) {
      // Count by chat mode
      const modeCount = queueByMode.get(user.chatMode) || 0;
      queueByMode.set(user.chatMode, modeCount + 1);
      
      // Count by interests
      for (const interest of user.interests) {
        const interestCount = queueByInterests.get(interest) || 0;
        queueByInterests.set(interest, interestCount + 1);
      }
    }

    return {
      totalWaiting: this.waitingQueue.size,
      activeMatches: this.activeMatches.size,
      byMode: Object.fromEntries(queueByMode),
      byInterests: Object.fromEntries(queueByInterests),
      averageWaitTime: this.calculateAverageWaitTime()
    };
  }

  private calculateAverageWaitTime(): number {
    if (this.waitingQueue.size === 0) return 0;
    
    const now = Date.now();
    const totalWaitTime = Array.from(this.waitingQueue.values())
      .reduce((sum, user) => sum + (now - user.joinedAt), 0);
    
    return totalWaitTime / this.waitingQueue.size;
  }

  getMatch(roomId: string): MatchResult | undefined {
    return this.activeMatches.get(roomId);
  }

  getAllActiveMatches(): MatchResult[] {
    return Array.from(this.activeMatches.values());
  }
}

export const matchmakingService = new MatchmakingService();
export type { UserProfile, MatchResult };