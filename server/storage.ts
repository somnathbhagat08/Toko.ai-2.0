import { type User, type InsertUser } from "@shared/schema";
import bcrypt from "bcrypt";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { log } from "./vite";

// Storage interface for CRUD operations
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  authenticateUser(email: string, password: string): Promise<User | null>;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user || undefined;
    } catch (error) {
      log(`Error fetching user by email: ${error instanceof Error ? error.message : String(error)}`, 'storage');
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(insertUser.password, 10);
      
      const [user] = await db
        .insert(users)
        .values({
          ...insertUser,
          password: hashedPassword,
        })
        .returning();
      
      return user;
    } catch (error) {
      log(`Error creating user: ${error instanceof Error ? error.message : String(error)}`, 'storage');
      throw error;
    }
  }

  async authenticateUser(email: string, password: string): Promise<User | null> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) return null;

      // For Google users, password is not used for authentication
      if (user.provider === 'google') {
        return null;
      }

      // Compare password for local users
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) return null;

      return user;
    } catch (error) {
      log(`Error authenticating user: ${error}`, 'storage');
      return null;
    }
  }
}

// Memory Storage Implementation (fallback)
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private currentId: number;

  constructor() {
    this.users = new Map();
    this.currentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    
    const user: User = { 
      id: id,
      email: insertUser.email,
      password: hashedPassword,
      name: insertUser.name,
      avatar: insertUser.avatar || null,
      provider: insertUser.provider || 'local',
      country: insertUser.country || 'Any on Earth',
      tags: insertUser.tags || [],
      isOnline: false,
      lastSeen: new Date(),
      createdAt: new Date()
    };
    
    this.users.set(id, user);
    return user;
  }

  async authenticateUser(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;

    // For Google users, password is not used for authentication
    if (user.provider === 'google') {
      return null;
    }

    // Compare password for local users
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return null;

    return user;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.getUserByEmail(email);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.getUserByEmail(email);
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

  async authenticateUser(email: string, password: string): Promise<User | null> {
    try {
      if (this.useDatabase) {
        return await this.databaseStorage.authenticateUser(email, password);
      }
    } catch (error) {
      log(`Database error, falling back to memory storage: ${error}`, 'storage');
      this.setFallback();
    }
    return await this.memStorage.authenticateUser(email, password);
  }
}

export const storage = new StorageManager();