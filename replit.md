# Toko - Anonymous Video Chat Platform

## Overview

Toko is a real-time anonymous video chat platform that connects strangers from around the world for text and video conversations. The application features a modern neobrutalism design aesthetic and provides safe, moderated connections between users based on shared interests, geographical preferences, and other matching criteria.

The platform combines modern web technologies with real-time communication capabilities, offering features like virtual backgrounds, beauty filters, matchmaking algorithms, and comprehensive moderation systems.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18 + TypeScript**: Component-based UI with strict type safety
- **Vite**: Fast development server with hot module replacement and optimized production builds
- **Tailwind CSS + shadcn/ui**: Utility-first styling with pre-built accessible components following neobrutalism design principles
- **TanStack Query**: Server state management and caching for API calls
- **Socket.IO Client**: Real-time bidirectional communication with the server

### Backend Architecture
- **Node.js + Express**: Traditional REST API server handling authentication and core business logic
- **Fastify Alternative**: Secondary server implementation for improved performance (dual setup)
- **Socket.IO Server**: WebSocket management for real-time features including chat, matchmaking, and presence
- **WebRTC**: Peer-to-peer video/audio communication with STUN/TURN server support
- **Drizzle ORM**: Type-safe database operations with PostgreSQL

### Data Storage Solutions
- **Primary Database**: PostgreSQL via Neon serverless with connection pooling
- **Session Storage**: In-memory sessions with Fastify session middleware
- **Redis Cache**: Optional caching layer for improved performance (graceful fallback without Redis)
- **File Storage**: Static assets served directly by the web server

### Authentication and Authorization
- **Multi-provider Auth**: Local email/password authentication with Google OAuth integration
- **Session-based Auth**: HTTP sessions with secure cookie management
- **JWT Tokens**: Alternative token-based authentication for API access
- **Bcrypt**: Password hashing with salt rounds for security

### Real-time Communication Architecture
- **Socket.IO**: WebSocket connections with polling fallback for reliability
- **WebRTC**: Direct peer-to-peer video/audio streaming with ICE candidate exchange
- **Room Management**: Dynamic chat room creation and lifecycle management
- **Presence System**: Real-time user online/offline status tracking

### Matchmaking System
- **Interest-based Matching**: Algorithm matching users based on shared tags/interests
- **Geographic Preferences**: Country-based user filtering and matching
- **Queue Management**: Waiting queue with automated matching and cleanup
- **Compatibility Scoring**: Multi-factor scoring system for optimal user pairing

### Content Moderation
- **Profanity Filtering**: Real-time text content filtering and replacement
- **Spam Detection**: Pattern-based spam and suspicious content detection
- **User Reporting**: Violation tracking and automated action systems
- **Rate Limiting**: API endpoint protection against abuse

### Monitoring and Analytics
- **Performance Metrics**: Real-time system health and performance tracking
- **Error Tracking**: Comprehensive error logging and alerting
- **User Analytics**: Connection statistics and usage patterns
- **Resource Monitoring**: Memory, CPU, and connection monitoring

## External Dependencies

### Core Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting with automatic scaling
- **Vercel**: Deployment platform with automatic builds and global CDN
- **Socket.IO**: Real-time bidirectional event-based communication

### Authentication Services
- **Google Identity Services**: OAuth 2.0 integration for Google sign-in
- **Google APIs**: Account information and profile access

### Media and Communication
- **WebRTC**: Browser-native peer-to-peer communication
- **STUN Servers**: Google's public STUN servers for NAT traversal
- **MediaPipe**: Google's framework for selfie segmentation and virtual backgrounds
- **LiveKit**: Professional video conferencing infrastructure (optional/configured)

### UI and Design
- **Radix UI**: Accessible, unstyled UI primitives for complex components
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Modern SVG icon library

### Development and Build Tools
- **TypeScript**: Static type checking and enhanced developer experience
- **Vite**: Next-generation frontend tooling with fast HMR
- **ESBuild**: Fast JavaScript bundler for server-side code
- **Drizzle Kit**: Database migration and schema management tools

### Optional Services
- **Redis**: In-memory data structure store for caching (with graceful fallback)
- **LiveKit Cloud**: Scalable video infrastructure for high-load scenarios
- **Monitoring Services**: External APM and logging services (configurable)

The application is designed with graceful degradation in mind, ensuring core functionality works even when optional services are unavailable.

## Replit Environment Setup

### Current Configuration

The application has been configured to run in the Replit environment with the following setup:

#### Workflow Configuration
- **Name**: Start application
- **Command**: `npm run dev`
- **Port**: 5000 (frontend server with Vite HMR)
- **Host**: 0.0.0.0 (configured for Replit proxy)
- **Output Type**: webview

#### Development Server
- Express server runs on port 5000 with 0.0.0.0 binding
- Vite dev server integrated with `allowedHosts: true` for Replit's iframe proxy
- Hot Module Replacement (HMR) enabled via Vite middleware
- Server automatically reloads on file changes

#### Storage Configuration
- **Development Mode**: Uses in-memory storage (MemStorage) for rapid development
- **Database Support**: PostgreSQL connection via DATABASE_URL environment variable
- **Fallback Mechanism**: Graceful fallback to in-memory storage if DATABASE_URL is not configured
- To use persistent PostgreSQL storage, set the DATABASE_URL environment variable

#### Optional Services Status
- **Redis**: Not configured (running without Redis caching)
- **LiveKit**: Running in development mode with default credentials
- **OpenAI**: OPENAI_API_KEY not set (AI profiling disabled)
- **JWT**: Using default secrets (should be changed in production)

#### Code Quality
- All TypeScript errors resolved
- LSP diagnostics passing
- Type-safe schema definitions in `shared/schema.ts`

### Recent Changes

**October 2, 2025** - Replit Environment Setup
- Created .gitignore with Node.js patterns
- Configured workflow for port 5000 with webview output
- Fixed TypeScript errors related to deprecated schema fields (removed `gender` and `country` references)
- Updated MemStorage to use current schema fields (currentVibe, vibePreferences, conversationMood)
- Verified frontend loads correctly with phone authentication interface

### Running the Application

The application starts automatically via the configured workflow. To manually restart:
```bash
npm run dev
```

For production builds:
```bash
npm run build
npm run start
```