import { pgTable, text, serial, integer, boolean, timestamp, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  provider: text("provider").default("phone"), // 'phone', 'google'
  currentVibe: varchar("current_vibe", { length: 50 }).default("Chill"), // Current vibe/energy level
  vibePreferences: text("vibe_preferences").array().default([]), // Preferred vibes to match with
  conversationMood: varchar("conversation_mood", { length: 50 }).default("Casual"), // Preferred conversation style
  tags: text("tags").array().default([]), // User tags/interests for matching
  age: integer("age"),
  bio: text("bio"), // User bio for AI analysis
  personalityVector: real("personality_vector").array(), // AI-generated personality vector for matching
  interestVector: real("interest_vector").array(), // AI-generated interest vector
  communicationStyle: varchar("communication_style", { length: 50 }), // AI-assessed communication style
  isOnline: boolean("is_online").default(false), // Real-time online status
  isPhoneVerified: boolean("is_phone_verified").default(false), // Phone verification status
  lastSeen: timestamp("last_seen").defaultNow(), // Last activity timestamp
  createdAt: timestamp("created_at").defaultNow(),
});

// Phone verification table for OTP management
export const phoneVerifications = pgTable("phone_verifications", {
  id: serial("id").primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  otpCode: varchar("otp_code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  isVerified: boolean("is_verified").default(false),
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// User profile analysis for AI matching
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  conversationStyle: text("conversation_style"), // AI-analyzed conversation preferences
  topicPreferences: text("topic_preferences").array(), // Preferred conversation topics
  personalityTraits: text("personality_traits").array(), // AI-extracted personality traits
  vibeCompatibility: real("vibe_compatibility"), // Vibe-based compatibility score
  moodAnalysis: text("mood_analysis"), // AI-detected mood from face analysis
  emotionalState: varchar("emotional_state", { length: 50 }), // Current emotional state
  compatibilityScore: real("compatibility_score"), // Overall compatibility rating
  lastAnalyzed: timestamp("last_analyzed").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  phoneNumber: true,
  name: true,
  avatar: true,
  provider: true,
  currentVibe: true,
  vibePreferences: true,
  conversationMood: true,
  tags: true,
  age: true,
  bio: true,
}).extend({
  avatar: z.string().nullable().optional()
});

export const insertPhoneVerificationSchema = createInsertSchema(phoneVerifications).pick({
  phoneNumber: true,
  otpCode: true,
  expiresAt: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  userId: true,
  conversationStyle: true,
  topicPreferences: true,
  personalityTraits: true,
  vibeCompatibility: true,
  moodAnalysis: true,
  emotionalState: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type PhoneVerification = typeof phoneVerifications.$inferSelect;
export type InsertPhoneVerification = z.infer<typeof insertPhoneVerificationSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
