import { type User, type InsertUser, type PhoneVerification, type InsertPhoneVerification, type UserProfile, type InsertUserProfile } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { users, phoneVerifications, userProfiles } from "@shared/schema";
import { log } from "./vite";

// Storage interface for CRUD operations
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  markPhoneAsVerified(userId: number): Promise<void>;
  
  // Phone verification methods
  createPhoneVerification(verification: InsertPhoneVerification): Promise<PhoneVerification>;
  getLatestPhoneVerification(phoneNumber: string): Promise<PhoneVerification | undefined>;
  incrementVerificationAttempts(verificationId: number): Promise<void>;
  markVerificationAsUsed(verificationId: number): Promise<void>;
  
  // User profile methods
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<void>;
  
  // Embedding methods
  updateUserEmbedding(userId: number, embedding: number[]): Promise<void>;
  getUsersWithEmbeddings(): Promise<User[]>;
}

// PostgreSQL Storage Implementation
export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || undefined;
    } catch (error) {
      log(`Error fetching user by ID: ${error}`, 'storage');
      return undefined;
    }
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
      return user || undefined;
    } catch (error) {
      log(`Error fetching user by phone: ${error instanceof Error ? error.message : String(error)}`, 'storage');
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
      
      return user;
    } catch (error) {
      log(`Error creating user: ${error instanceof Error ? error.message : String(error)}`, 'storage');
      throw error;
    }
  }

  async markPhoneAsVerified(userId: number): Promise<void> {
    try {
      await db.update(users)
        .set({ isPhoneVerified: true })
        .where(eq(users.id, userId));
    } catch (error) {
      log(`Error marking phone as verified: ${error}`, 'storage');
      throw error;
    }
  }

  // Phone verification methods
  async createPhoneVerification(verification: InsertPhoneVerification): Promise<PhoneVerification> {
    try {
      const [created] = await db
        .insert(phoneVerifications)
        .values(verification)
        .returning();
      
      return created;
    } catch (error) {
      log(`Error creating phone verification: ${error}`, 'storage');
      throw error;
    }
  }

  async getLatestPhoneVerification(phoneNumber: string): Promise<PhoneVerification | undefined> {
    try {
      const [verification] = await db
        .select()
        .from(phoneVerifications)
        .where(eq(phoneVerifications.phoneNumber, phoneNumber))
        .orderBy(desc(phoneVerifications.createdAt))
        .limit(1);
      
      return verification || undefined;
    } catch (error) {
      log(`Error getting phone verification: ${error}`, 'storage');
      return undefined;
    }
  }

  async incrementVerificationAttempts(verificationId: number): Promise<void> {
    try {
      // Get current attempts count first
      const [current] = await db.select({ attempts: phoneVerifications.attempts }).from(phoneVerifications).where(eq(phoneVerifications.id, verificationId));
      const newAttempts = (current?.attempts || 0) + 1;
      
      await db
        .update(phoneVerifications)
        .set({ attempts: newAttempts })
        .where(eq(phoneVerifications.id, verificationId));
    } catch (error) {
      log(`Error incrementing verification attempts: ${error}`, 'storage');
      throw error;
    }
  }

  async markVerificationAsUsed(verificationId: number): Promise<void> {
    try {
      await db
        .update(phoneVerifications)
        .set({ isVerified: true })
        .where(eq(phoneVerifications.id, verificationId));
    } catch (error) {
      log(`Error marking verification as used: ${error}`, 'storage');
      throw error;
    }
  }

  // User profile methods
  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    try {
      const [created] = await db
        .insert(userProfiles)
        .values(profile)
        .returning();
      
      return created;
    } catch (error) {
      log(`Error creating user profile: ${error}`, 'storage');
      throw error;
    }
  }

  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    try {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId));
      
      return profile || undefined;
    } catch (error) {
      log(`Error getting user profile: ${error}`, 'storage');
      return undefined;
    }
  }

  async updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<void> {
    try {
      await db
        .update(userProfiles)
        .set(updates)
        .where(eq(userProfiles.userId, userId));
    } catch (error) {
      log(`Error updating user profile: ${error}`, 'storage');
      throw error;
    }
  }

  async updateUserEmbedding(userId: number, embedding: number[]): Promise<void> {
    try {
      await db
        .update(users)
        .set({ 
          profileEmbedding: embedding,
          embeddingGeneratedAt: new Date()
        })
        .where(eq(users.id, userId));
      
      log(`Updated embedding for user ${userId}`, 'storage');
    } catch (error) {
      log(`Error updating user embedding: ${error}`, 'storage');
      throw error;
    }
  }

  async getUsersWithEmbeddings(): Promise<User[]> {
    try {
      const allUsers = await db.select().from(users);
      return allUsers.filter(user => user.profileEmbedding !== null && user.profileEmbedding !== undefined);
    } catch (error) {
      log(`Error fetching users with embeddings: ${error}`, 'storage');
      return [];
    }
  }
}

// Memory Storage Implementation (fallback)
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private verifications: Map<number, PhoneVerification>;
  private profiles: Map<number, UserProfile>;
  private currentUserId: number;
  private currentVerificationId: number;
  private currentProfileId: number;

  constructor() {
    this.users = new Map();
    this.verifications = new Map();
    this.profiles = new Map();
    this.currentUserId = 1;
    this.currentVerificationId = 1;
    this.currentProfileId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.phoneNumber === phoneNumber);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    
    const user: User = { 
      id: id,
      phoneNumber: insertUser.phoneNumber,
      name: insertUser.name,
      avatar: insertUser.avatar || null,
      provider: insertUser.provider || 'phone',
      currentVibe: insertUser.currentVibe || 'Chill',
      vibePreferences: insertUser.vibePreferences || [],
      conversationMood: insertUser.conversationMood || 'Casual',
      tags: insertUser.tags || [],
      age: insertUser.age || null,
      bio: insertUser.bio || null,
      profileEmbedding: null,
      embeddingGeneratedAt: null,
      personalityVector: null,
      interestVector: null,
      communicationStyle: null,
      isOnline: false,
      isPhoneVerified: false,
      lastSeen: new Date(),
      createdAt: new Date()
    };
    
    this.users.set(id, user);
    return user;
  }

  async markPhoneAsVerified(userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.isPhoneVerified = true;
      this.users.set(userId, user);
    }
  }

  async createPhoneVerification(verification: InsertPhoneVerification): Promise<PhoneVerification> {
    const id = this.currentVerificationId++;
    const created: PhoneVerification = {
      id,
      ...verification,
      isVerified: false,
      attempts: 0,
      createdAt: new Date()
    };
    this.verifications.set(id, created);
    return created;
  }

  async getLatestPhoneVerification(phoneNumber: string): Promise<PhoneVerification | undefined> {
    const verifications = Array.from(this.verifications.values())
      .filter(v => v.phoneNumber === phoneNumber)
      .sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
    return verifications[0];
  }

  async incrementVerificationAttempts(verificationId: number): Promise<void> {
    const verification = this.verifications.get(verificationId);
    if (verification) {
      verification.attempts = (verification.attempts || 0) + 1;
      this.verifications.set(verificationId, verification);
    }
  }

  async markVerificationAsUsed(verificationId: number): Promise<void> {
    const verification = this.verifications.get(verificationId);
    if (verification) {
      verification.isVerified = true;
      this.verifications.set(verificationId, verification);
    }
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const id = this.currentProfileId++;
    const created: UserProfile = {
      id,
      userId: profile.userId,
      conversationStyle: profile.conversationStyle || null,
      topicPreferences: profile.topicPreferences || null,
      personalityTraits: profile.personalityTraits || null,
      vibeCompatibility: profile.vibeCompatibility || null,
      moodAnalysis: profile.moodAnalysis || null,
      emotionalState: profile.emotionalState || null,
      compatibilityScore: null,
      lastAnalyzed: new Date(),
      createdAt: new Date()
    };
    this.profiles.set(id, created);
    return created;
  }

  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    return Array.from(this.profiles.values()).find(p => p.userId === userId);
  }

  async updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<void> {
    const profile = Array.from(this.profiles.entries()).find(([_, p]) => p.userId === userId);
    if (profile) {
      const [id, existing] = profile;
      this.profiles.set(id, { ...existing, ...updates });
    }
  }

  async updateUserEmbedding(userId: number, embedding: number[]): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.profileEmbedding = embedding;
      user.embeddingGeneratedAt = new Date();
      this.users.set(userId, user);
    }
  }

  async getUsersWithEmbeddings(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.profileEmbedding !== null);
  }
}

// Create storage instance with fallback mechanism
class StorageManager {
  private databaseStorage: DatabaseStorage;
  private memStorage: MemStorage;
  private useDatabase: boolean = true;

  constructor() {
    this.databaseStorage = new DatabaseStorage();
    this.memStorage = new MemStorage();
  }

  setFallback() {
    this.useDatabase = false;
    log('Switching to memory storage fallback', 'storage');
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.getUser(id);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.getUser(id);
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.getUserByPhoneNumber(phoneNumber);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.getUserByPhoneNumber(phoneNumber);
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.createUser(user);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.createUser(user);
  }

  async markPhoneAsVerified(userId: number): Promise<void> {
    try {
      if (this.useDatabase) {
        await this.databaseStorage.markPhoneAsVerified(userId);
        return;
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    await this.memStorage.markPhoneAsVerified(userId);
  }

  // Phone verification methods with fallback
  async createPhoneVerification(verification: InsertPhoneVerification): Promise<PhoneVerification> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.createPhoneVerification(verification);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.createPhoneVerification(verification);
  }

  async getLatestPhoneVerification(phoneNumber: string): Promise<PhoneVerification | undefined> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.getLatestPhoneVerification(phoneNumber);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.getLatestPhoneVerification(phoneNumber);
  }

  async incrementVerificationAttempts(verificationId: number): Promise<void> {
    try {
      if (this.useDatabase) {
        await this.databaseStorage.incrementVerificationAttempts(verificationId);
        return;
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    await this.memStorage.incrementVerificationAttempts(verificationId);
  }

  async markVerificationAsUsed(verificationId: number): Promise<void> {
    try {
      if (this.useDatabase) {
        await this.databaseStorage.markVerificationAsUsed(verificationId);
        return;
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    await this.memStorage.markVerificationAsUsed(verificationId);
  }

  // User profile methods with fallback
  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.createUserProfile(profile);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.createUserProfile(profile);
  }

  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.getUserProfile(userId);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.getUserProfile(userId);
  }

  async updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<void> {
    try {
      if (this.useDatabase) {
        await this.databaseStorage.updateUserProfile(userId, updates);
        return;
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    await this.memStorage.updateUserProfile(userId, updates);
  }

  async updateUserEmbedding(userId: number, embedding: number[]): Promise<void> {
    try {
      if (this.useDatabase) {
        await this.databaseStorage.updateUserEmbedding(userId, embedding);
        return;
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    await this.memStorage.updateUserEmbedding(userId, embedding);
  }

  async getUsersWithEmbeddings(): Promise<User[]> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.getUsersWithEmbeddings();
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.getUsersWithEmbeddings();
  }
}

export const storage = new StorageManager();