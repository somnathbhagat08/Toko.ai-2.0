import { log } from '../vite.js';
import type { User } from '@shared/schema';

interface EmbeddingResponse {
  embedding: number[];
  error?: string;
}

class AIEmbeddingService {
  private apiKey: string | undefined;
  private apiUrl = 'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2';
  private isAvailable = true;
  private lastError: Date | null = null;
  private errorBackoffMs = 60000;

  constructor() {
    this.apiKey = process.env.HF_TOKEN;
    
    if (!this.apiKey) {
      log('HF_TOKEN not found - AI embedding service disabled', 'ai-embedding');
      this.isAvailable = false;
    } else {
      log('AI embedding service initialized with HuggingFace API', 'ai-embedding');
    }
  }

  async generateEmbedding(user: User): Promise<number[] | null> {
    if (!this.isAvailable) {
      return null;
    }

    if (this.lastError && Date.now() - this.lastError.getTime() < this.errorBackoffMs) {
      return null;
    }

    try {
      const profileText = this.buildProfileText(user);
      
      if (!profileText.trim()) {
        log(`User ${user.id} has no profile data for embedding`, 'ai-embedding');
        return null;
      }

      const embedding = await this.callHuggingFaceAPI(profileText);
      
      if (embedding) {
        log(`Generated embedding for user ${user.id} (${embedding.length} dimensions)`, 'ai-embedding');
        this.lastError = null;
      }
      
      return embedding;
    } catch (error) {
      log(`Error generating embedding for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`, 'ai-embedding');
      this.lastError = new Date();
      return null;
    }
  }

  private buildProfileText(user: User): string {
    const parts: string[] = [];

    if (user.bio) {
      parts.push(user.bio);
    }

    if (user.tags && user.tags.length > 0) {
      parts.push(`Interests: ${user.tags.join(', ')}`);
    }

    if (user.currentVibe) {
      parts.push(`Current vibe: ${user.currentVibe}`);
    }

    if (user.vibePreferences && user.vibePreferences.length > 0) {
      parts.push(`Preferred vibes: ${user.vibePreferences.join(', ')}`);
    }

    if (user.conversationMood) {
      parts.push(`Conversation style: ${user.conversationMood}`);
    }

    return parts.join('. ');
  }

  private async callHuggingFaceAPI(text: string): Promise<number[] | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: {
            wait_for_model: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`HuggingFace API error (${response.status}): ${errorText}`, 'ai-embedding');
        
        if (response.status === 503) {
          log('Model is loading, will retry on next request', 'ai-embedding');
        }
        
        return null;
      }

      const embedding = await response.json();
      
      if (Array.isArray(embedding) && embedding.length === 384) {
        return embedding;
      } else {
        log(`Unexpected embedding format: ${JSON.stringify(embedding).substring(0, 100)}`, 'ai-embedding');
        return null;
      }
    } catch (error) {
      log(`HuggingFace API request failed: ${error instanceof Error ? error.message : String(error)}`, 'ai-embedding');
      return null;
    }
  }

  calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    const similarity = dotProduct / (magnitude1 * magnitude2);
    
    return Math.max(0, Math.min(1, similarity));
  }

  calculateEmbeddingSimilarity(user1: User, user2: User): number | null {
    if (!user1.profileEmbedding || !user2.profileEmbedding) {
      return null;
    }

    return this.calculateCosineSimilarity(user1.profileEmbedding, user2.profileEmbedding);
  }

  isServiceAvailable(): boolean {
    if (!this.isAvailable) {
      return false;
    }

    if (this.lastError && Date.now() - this.lastError.getTime() < this.errorBackoffMs) {
      return false;
    }

    return true;
  }

  getStatus(): { available: boolean; apiConfigured: boolean; lastError: Date | null } {
    return {
      available: this.isServiceAvailable(),
      apiConfigured: !!this.apiKey,
      lastError: this.lastError
    };
  }
}

export const aiEmbeddingService = new AIEmbeddingService();
