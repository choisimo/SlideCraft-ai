# Realtime Service Implementation

## Overview
The Realtime Service provides WebSocket and Server-Sent Events (SSE) infrastructure for real-time collaboration, job status updates, and presence awareness in the SlideCraft AI platform.

## Service Responsibilities
- WebSocket connection management and authentication
- Job status broadcasting to subscribed clients
- Document collaboration events (future CRDT integration)
- User presence tracking and awareness
- Connection lifecycle management
- Rate limiting and abuse prevention
- Fallback to SSE for restricted networks
- Event routing and channel management

## Tech Stack
- **Runtime**: Node.js 20+ with TypeScript
- **WebSocket**: Socket.io with Redis adapter for clustering
- **SSE**: Custom SSE implementation with Express
- **Message Broker**: Redis for pub/sub and presence storage
- **Authentication**: JWT validation middleware
- **Observability**: OpenTelemetry, structured logging
- **Scaling**: Redis adapter for multi-instance deployment

## Architecture Overview

### Connection Types
1. **WebSocket**: Primary real-time transport via Socket.io
2. **Server-Sent Events**: Fallback for restrictive networks
3. **Long Polling**: Final fallback (if needed)

### Channel Structure
```
jobs.{jobId}           - Job status updates
docs.{documentId}      - Document collaboration events (future)
presence.{documentId}  - User presence and awareness
user.{userId}          - Personal notifications
```

## WebSocket Implementation

### Socket.io Server Setup
```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

class RealtimeServer {
  private io: Server;
  private redisClient: RedisClientType;
  private redisPub: RedisClientType;
  private redisSub: RedisClientType;

  constructor() {
    this.setupRedisClients();
    this.setupSocketIO();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupRedisClients() {
    this.redisClient = createClient({ url: process.env.REDIS_URL });
    this.redisPub = createClient({ url: process.env.REDIS_URL });
    this.redisSub = this.redisPub.duplicate();
  }

  private setupSocketIO() {
    this.io = new Server({
      cors: {
        origin: process.env.FRONTEND_ORIGIN,
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Redis adapter for horizontal scaling
    this.io.adapter(createAdapter(this.redisPub, this.redisSub));
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const user = await this.validateJWTToken(token);
        
        socket.data.user = user;
        socket.data.userId = user.id;
        
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use(this.rateLimitMiddleware);
  }
```

### Connection Management
```typescript
class ConnectionManager {
  private connections = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private socketUsers = new Map<string, string>();     // socketId -> userId

  handleConnection(socket: Socket) {
    const userId = socket.data.userId;
    const socketId = socket.id;

    // Track connection
    this.addConnection(userId, socketId);
    
    logger.info('client_connected', {
      userId,
      socketId,
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address
    });

    // Set up event handlers
    this.setupSocketHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(userId, socketId, reason);
    });
  }

  private addConnection(userId: string, socketId: string) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(socketId);
    this.socketUsers.set(socketId, userId);
  }

  private removeConnection(userId: string, socketId: string) {
    const userSockets = this.connections.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connections.delete(userId);
      }
    }
    this.socketUsers.delete(socketId);
  }

  getUserSocketIds(userId: string): string[] {
    return Array.from(this.connections.get(userId) || []);
  }
}
```

## Channel Management

### Job Status Channel
```typescript
interface JobUpdateEvent {
  type: 'job.update';
  jobId: string;
  status: JobStatus;
  progress?: number;
  message?: string;
  timestamp: string;
  error?: {
    code: string;
    message: string;
  };
}

class JobChannel {
  constructor(private io: Server, private redis: RedisClientType) {
    this.setupRedisSubscription();
  }

  private setupRedisSubscription() {
    // Subscribe to job update events from workers
    this.redis.subscribe('job-updates', (message) => {
      const event: JobUpdateEvent = JSON.parse(message);
      this.broadcastJobUpdate(event);
    });
  }

  subscribeToJob(socket: Socket, jobId: string) {
    // Validate user has access to job
    if (!this.canAccessJob(socket.data.userId, jobId)) {
      socket.emit('error', { code: 'PERMISSION_DENIED', message: 'Cannot access job' });
      return;
    }

    const channelName = `jobs.${jobId}`;
    socket.join(channelName);

    logger.info('job_subscription', {
      userId: socket.data.userId,
      jobId,
      socketId: socket.id
    });

    // Send current job status
    this.sendCurrentJobStatus(socket, jobId);
  }

  private broadcastJobUpdate(event: JobUpdateEvent) {
    const channelName = `jobs.${event.jobId}`;
    
    this.io.to(channelName).emit('job:update', event);

    METRICS.jobUpdatesBroadcast.inc({ status: event.status });
  }

  private async sendCurrentJobStatus(socket: Socket, jobId: string) {
    try {
      const job = await this.getJobFromDatabase(jobId);
      if (job) {
        socket.emit('job:update', {
          type: 'job.update',
          jobId,
          status: job.status,
          progress: job.progress,
          message: job.message,
          timestamp: job.updated_at.toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to send current job status', { jobId, error });
    }
  }
}
```

### Presence Channel
```typescript
interface PresenceInfo {
  userId: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number };
  selection?: {
    slideId: string;
    elementId?: string;
    range?: { start: number; end: number };
  };
  lastSeen: string;
}

class PresenceChannel {
  private presenceStore = new Map<string, Map<string, PresenceInfo>>(); // documentId -> userId -> PresenceInfo

  subscribeToDocument(socket: Socket, documentId: string) {
    if (!this.canAccessDocument(socket.data.userId, documentId)) {
      socket.emit('error', { code: 'PERMISSION_DENIED' });
      return;
    }

    const channelName = `presence.${documentId}`;
    socket.join(channelName);

    // Initialize user presence
    this.updateUserPresence(documentId, socket.data.userId, {
      userId: socket.data.userId,
      name: socket.data.user.name,
      avatar: socket.data.user.avatar,
      color: this.assignUserColor(socket.data.userId),
      lastSeen: new Date().toISOString()
    });

    // Send current presence to new user
    this.sendCurrentPresence(socket, documentId);

    // Broadcast user joined
    socket.to(channelName).emit('presence:user-joined', {
      userId: socket.data.userId,
      name: socket.data.user.name,
      color: this.assignUserColor(socket.data.userId)
    });

    // Handle presence updates
    socket.on('presence:update', (data) => {
      this.handlePresenceUpdate(socket, documentId, data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleUserLeft(documentId, socket.data.userId);
      socket.to(channelName).emit('presence:user-left', {
        userId: socket.data.userId
      });
    });
  }

  private handlePresenceUpdate(socket: Socket, documentId: string, data: Partial<PresenceInfo>) {
    const userId = socket.data.userId;
    const channelName = `presence.${documentId}`;

    // Update presence
    this.updateUserPresence(documentId, userId, {
      ...data,
      userId,
      lastSeen: new Date().toISOString()
    });

    // Broadcast to other users
    socket.to(channelName).emit('presence:update', {
      userId,
      ...data
    });

    // Rate limit cursor updates
    if (data.cursor) {
      METRICS.cursorUpdates.inc({ documentId });
    }
  }

  private assignUserColor(userId: string): string {
    // Deterministic color assignment
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
    const hash = userId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}
```

## Server-Sent Events (SSE) Fallback

### SSE Implementation
```typescript
class SSEHandler {
  private connections = new Map<string, Response>(); // userId -> Response object

  handleConnection(req: Request, res: Response) {
    const userId = req.user.id;
    const connectionId = `${userId}-${Date.now()}`;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    this.sendEvent(res, 'connected', { connectionId, timestamp: new Date().toISOString() });

    // Store connection
    this.connections.set(connectionId, res);

    // Handle client disconnect
    req.on('close', () => {
      this.connections.delete(connectionId);
      logger.info('sse_disconnected', { userId, connectionId });
    });

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
      if (res.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      this.sendEvent(res, 'heartbeat', { timestamp: new Date().toISOString() });
    }, 30000);

    logger.info('sse_connected', { userId, connectionId });
  }

  private sendEvent(res: Response, event: string, data: any) {
    if (res.destroyed) return;

    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      logger.error('sse_write_error', { error: error.message });
    }
  }

  broadcastToUser(userId: string, event: string, data: any) {
    const userConnections = Array.from(this.connections.entries())
      .filter(([connectionId]) => connectionId.startsWith(userId));

    userConnections.forEach(([_, res]) => {
      this.sendEvent(res, event, data);
    });
  }
}
```

### Job Updates via SSE
```typescript
class SSEJobUpdater {
  constructor(private sseHandler: SSEHandler) {
    this.setupRedisSubscription();
  }

  private setupRedisSubscription() {
    this.redis.subscribe('job-updates', (message) => {
      const event: JobUpdateEvent = JSON.parse(message);
      
      // Find users subscribed to this job
      const subscribedUsers = this.getJobSubscribers(event.jobId);
      
      subscribedUsers.forEach(userId => {
        this.sseHandler.broadcastToUser(userId, 'job:update', event);
      });
    });
  }
}
```

## Authentication & Authorization

### JWT Validation
```typescript
class RealtimeAuth {
  async validateConnection(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      
      // Check token expiry
      if (decoded.exp < Date.now() / 1000) {
        throw new Error('Token expired');
      }

      // Load user details
      const user = await this.getUserById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async canAccessJob(userId: string, jobId: string): Promise<boolean> {
    const job = await this.getJobById(jobId);
    return job && job.userId === userId;
  }

  async canAccessDocument(userId: string, documentId: string): Promise<boolean> {
    const permissions = await this.getDocumentPermissions(documentId, userId);
    return permissions && ['owner', 'editor', 'commenter', 'viewer'].includes(permissions.role);
  }
}
```

## Rate Limiting & Security

### Rate Limiting
```typescript
class RealtimeRateLimit {
  private limiters = new Map<string, TokenBucket>();

  rateLimitMiddleware = (socket: Socket, next: Function) => {
    const userId = socket.data?.userId;
    if (!userId) return next();

    const limiter = this.getLimiter(userId);
    
    if (limiter.tryConsume()) {
      next();
    } else {
      next(new Error('Rate limit exceeded'));
    }
  };

  private getLimiter(userId: string): TokenBucket {
    if (!this.limiters.has(userId)) {
      this.limiters.set(userId, new TokenBucket({
        capacity: 100,      // 100 tokens
        refillRate: 10,     // 10 tokens per second
        refillPeriod: 1000  // 1 second
      }));
    }
    return this.limiters.get(userId)!;
  }
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private options: { capacity: number; refillRate: number; refillPeriod: number }) {
    this.tokens = options.capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  private refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.options.refillPeriod) * this.options.refillRate;
    
    this.tokens = Math.min(this.options.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
```

## Monitoring & Observability

### Metrics Collection
```typescript
import { Counter, Gauge, Histogram } from 'prom-client';

const METRICS = {
  connectionsTotal: new Counter({
    name: 'realtime_connections_total',
    help: 'Total number of connections',
    labelNames: ['transport', 'status']
  }),

  activeConnections: new Gauge({
    name: 'realtime_active_connections',
    help: 'Number of active connections',
    labelNames: ['transport']
  }),

  messagesSent: new Counter({
    name: 'realtime_messages_sent_total',
    help: 'Total messages sent',
    labelNames: ['channel', 'event']
  }),

  messageLatency: new Histogram({
    name: 'realtime_message_latency_seconds',
    help: 'Message delivery latency',
    labelNames: ['channel']
  }),

  presenceUpdates: new Counter({
    name: 'realtime_presence_updates_total',
    help: 'Presence update events',
    labelNames: ['document_id']
  })
};
```

### Health Monitoring
```typescript
class RealtimeHealth {
  async checkHealth(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];

    // Redis connectivity
    try {
      await this.redis.ping();
      checks.push({ name: 'redis', status: 'healthy' });
    } catch (error) {
      checks.push({ name: 'redis', status: 'unhealthy', error: error.message });
    }

    // WebSocket server
    checks.push({
      name: 'websocket',
      status: this.io ? 'healthy' : 'unhealthy',
      details: {
        connectedClients: this.connectionManager.getTotalConnections(),
        memoryUsage: process.memoryUsage()
      }
    });

    const allHealthy = checks.every(check => check.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    };
  }
}
```

## Error Handling

### Error Categories
```typescript
enum RealtimeErrorCode {
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  CONNECTION_LOST = 'CONNECTION_LOST',
  INVALID_MESSAGE = 'INVALID_MESSAGE'
}

interface RealtimeError {
  code: RealtimeErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}
```

### Error Recovery
```typescript
class ErrorRecovery {
  handleConnectionError(socket: Socket, error: Error) {
    logger.error('connection_error', {
      userId: socket.data?.userId,
      socketId: socket.id,
      error: error.message,
      stack: error.stack
    });

    // Send error to client
    socket.emit('error', {
      code: this.getErrorCode(error),
      message: error.message,
      timestamp: new Date().toISOString()
    });

    // Attempt graceful recovery
    if (this.isRecoverableError(error)) {
      this.attemptReconnection(socket);
    } else {
      socket.disconnect(true);
    }
  }

  private isRecoverableError(error: Error): boolean {
    return !error.message.includes('Authentication') && 
           !error.message.includes('Permission');
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('RealtimeServer', () => {
  let server: RealtimeServer;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    server = new RealtimeServer(mockRedis);
  });

  it('should authenticate valid JWT tokens', async () => {
    const token = createValidJWT({ userId: 'user123' });
    const user = await server.validateToken(token);
    
    expect(user.id).toBe('user123');
  });

  it('should reject invalid tokens', async () => {
    const token = 'invalid-token';
    
    await expect(server.validateToken(token)).rejects.toThrow('Invalid token');
  });

  it('should handle job subscription', () => {
    const mockSocket = createMockSocket({ userId: 'user123' });
    
    server.handleJobSubscription(mockSocket, 'job456');
    
    expect(mockSocket.join).toHaveBeenCalledWith('jobs.job456');
  });
});
```

### Integration Tests
```typescript
describe('Realtime Integration', () => {
  let app: Application;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    app = await createTestApp();
    clientSocket = await createTestClient();
  });

  it('should receive job updates in real-time', (done) => {
    const jobId = 'test-job-123';

    // Subscribe to job updates
    clientSocket.emit('subscribe:job', { jobId });

    // Listen for updates
    clientSocket.on('job:update', (data) => {
      expect(data.jobId).toBe(jobId);
      expect(data.status).toBe('running');
      done();
    });

    // Simulate job update from worker
    setTimeout(() => {
      publishJobUpdate(jobId, { status: 'running', progress: 50 });
    }, 100);
  });

  it('should handle presence updates', (done) => {
    const documentId = 'doc123';

    clientSocket.emit('subscribe:presence', { documentId });

    clientSocket.on('presence:update', (data) => {
      expect(data.userId).toBe('user456');
      expect(data.cursor).toBeDefined();
      done();
    });

    // Simulate another user's cursor movement
    setTimeout(() => {
      simulatePresenceUpdate(documentId, 'user456', {
        cursor: { x: 100, y: 200 }
      });
    }, 100);
  });
});
```

### Load Testing
```typescript
describe('Realtime Load Testing', () => {
  it('should handle 1000 concurrent connections', async () => {
    const connections = [];

    // Create 1000 concurrent connections
    for (let i = 0; i < 1000; i++) {
      const client = await createTestClient(`user${i}`);
      connections.push(client);
    }

    // All connections should be active
    expect(await getActiveConnectionCount()).toBe(1000);

    // Broadcast message to all
    const startTime = Date.now();
    await broadcastMessage('test:message', { data: 'hello' });
    
    // All clients should receive message within acceptable time
    const received = await Promise.all(
      connections.map(client => 
        new Promise(resolve => {
          client.on('test:message', () => resolve(Date.now()));
        })
      )
    );

    const maxLatency = Math.max(...received.map(time => time - startTime));
    expect(maxLatency).toBeLessThan(1000); // 1 second max latency

    // Cleanup
    await Promise.all(connections.map(client => client.disconnect()));
  });
});
```

## Deployment Configuration

### Environment Variables
```bash
# Service configuration
REALTIME_PORT=3001
REDIS_URL=redis://localhost:6379

# Socket.io configuration  
FRONTEND_ORIGIN=http://localhost:3000
SOCKET_IO_TRANSPORTS=websocket,polling
SOCKET_IO_PING_TIMEOUT=60000
SOCKET_IO_PING_INTERVAL=25000

# Rate limiting
RATE_LIMIT_CONNECTIONS_PER_IP=100
RATE_LIMIT_MESSAGES_PER_SECOND=10

# Security
JWT_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:3000

# Observability
LOG_LEVEL=info
METRICS_PORT=9090
```

### Docker Configuration
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3001 9090

USER node

CMD ["npm", "start"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: realtime-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: realtime
  template:
    metadata:
      labels:
        app: realtime
    spec:
      containers:
      - name: realtime
        image: slidecraft/realtime:latest
        ports:
        - containerPort: 3001
        - containerPort: 9090
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
```

## Future Enhancements

### Planned Features
- **CRDT Integration**: Full operational transformation for collaborative editing
- **Voice/Video**: WebRTC integration for real-time communication
- **Advanced Presence**: Mouse tracking, typing indicators, selection synchronization
- **Message History**: Persistent message storage and replay
- **Advanced Analytics**: Connection patterns, user engagement metrics
- **Mobile Optimization**: Better mobile client support and push notifications
- **Offline Support**: Offline queue and sync when reconnected
- **Custom Events**: Plugin system for custom real-time events