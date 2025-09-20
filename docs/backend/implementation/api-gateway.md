# API Gateway Service Implementation

## Overview
The API Gateway serves as the central entry point for all client requests, handling authentication, routing, and API orchestration for the SlideCraft AI platform.

## Service Responsibilities
- Authentication and authorization middleware
- REST API endpoint provision
- Upload presigning and session management
- Job creation and status queries
- AI service proxy with streaming support
- Export job triggering
- Document CRUD operations gateway
- Rate limiting and request validation
- Error handling and response normalization

## Tech Stack
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Fastify (preferred) or Express
- **Database**: PostgreSQL with connection pooling
- **Cache/Queue**: Redis for sessions, rate limiting, and job queues
- **Authentication**: JWT with Bearer token
- **Observability**: OpenTelemetry, Prometheus metrics, structured JSON logs
- **Validation**: Zod for request/response schemas

## API Endpoints

### Upload Management
```
POST   /api/v1/uploads/init
PATCH  /api/v1/uploads/:uploadId/part
POST   /api/v1/uploads/:uploadId/complete
```

### Job Management
```
POST   /api/v1/convert
GET    /api/v1/jobs/:id
```

### Document Management
```
POST   /api/v1/documents
GET    /api/v1/documents/:id
```

### Export Operations
```
POST   /api/v1/export
GET    /api/v1/exports/:jobId/download
```

### AI Assistant
```
POST   /api/v1/ai/chat  (with optional SSE streaming)
```

## Data Models

### Core Database Schema
```sql
-- Users and authentication
users(id, email, name, avatar, plan, quota_used, created_at, updated_at)

-- Document ownership and permissions  
documents(id, owner_id, title, created_at, updated_at)
document_roles(document_id, user_id, role) -- viewer/commenter/editor/owner

-- Job tracking system
jobs(id, user_id, type, status, progress, error, payload, created_at, updated_at)
-- types: convert|export|thumbnail|ai
-- status: pending|running|succeeded|failed|canceled

-- Document content storage
decks(document_id PK, jsonb schema) -- Normalized deck representation

-- Collaboration features
comments(id, document_id, slide_id, element_id, bbox, author_id, body, resolved, created_at)

-- AI usage tracking
ai_logs(id, user_id, provider, model, prompt_tokens, completion_tokens, latency_ms, cost, created_at)
```

### Database Indexes
```sql
CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX idx_decks_document ON decks(document_id);
CREATE INDEX idx_comments_document_slide ON comments(document_id, slide_id);
CREATE INDEX idx_ai_logs_provider_model_created ON ai_logs(provider, model, created_at);
```

## State Management

### Upload Lifecycle
```
init → parts upload → complete → storage confirmation
```

### Job State Transitions
```
pending → running → succeeded/failed/canceled
```

### Document Lifecycle
```
conversion job success → document creation → collaborative editing → export
```

## Storage Integration

### Pluggable Storage Providers
- **Local FS**: `file://${LOCAL_STORAGE_ROOT}/original/{userId}/{uuid}`
- **S3 Compatible**: `s3://${S3_BUCKET}/original/{userId}/{uuid}`
- **Google Drive**: `drive://${GDRIVE_FOLDER_ID}/original/{userId}/{uuid}`

### Storage Operations
- Presigned URL generation for uploads
- Multipart upload coordination
- Checksum verification
- Asset retrieval and caching

## Security Implementation

### Authentication & Authorization
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  exp: number;
}

// Middleware stack
app.register(authMiddleware);
app.register(rateLimitMiddleware);
app.register(validationMiddleware);
```

### Rate Limiting
- **Global**: 60 requests/minute per user
- **Burst**: 10 concurrent requests
- **AI Endpoints**: 10 requests/minute with cost-based limits

### Security Headers
- CORS configuration
- Content Security Policy
- Request size limits
- Input sanitization

## Observability

### Structured Logging
```json
{
  "timestamp": "2025-01-01T00:00:00Z",
  "level": "info",
  "service": "api-gateway",
  "request_id": "req_123",
  "user_id": "user_456", 
  "route": "POST /api/v1/convert",
  "status_code": 202,
  "latency_ms": 150,
  "job_id": "job_789"
}
```

### Metrics Collection
```typescript
// Key metrics to track
const metrics = {
  // Request metrics
  'http_requests_total': counter,
  'http_request_duration_seconds': histogram,
  
  // Job metrics  
  'job_created_total': counter,
  'job_duration_seconds': histogram,
  
  // Storage metrics
  'upload_size_bytes': histogram,
  'upload_duration_seconds': histogram,
  
  // AI metrics
  'ai_requests_total': counter,
  'ai_latency_seconds': histogram,
  'ai_tokens_consumed': counter
};
```

### Tracing
- Request tracing with correlation IDs
- Span creation for external service calls
- Context propagation to workers and storage

## Error Handling

### Error Response Format
```json
{
  "code": "UPLOAD_INCOMPLETE",
  "message": "Upload session expired or incomplete",
  "details": {
    "uploadId": "upload_123",
    "missingParts": [1, 3, 5]
  }
}
```

### Error Categories
- `AUTH_REQUIRED`: Authentication missing or invalid
- `PERMISSION_DENIED`: Insufficient permissions
- `UPLOAD_INCOMPLETE`: Upload session issues
- `CONVERT_UNSUPPORTED`: File type not supported
- `JOB_NOT_FOUND`: Job ID not found
- `EXPORT_FAILED`: Export generation failed
- `AI_RATE_LIMIT`: AI service rate limit exceeded

## Testing Strategy

### Unit Tests
- Route handler logic
- Middleware functionality
- Validation schemas
- Error handling paths

### Integration Tests
- Database operations
- Storage provider interactions
- External service mocking
- Authentication flows

### Contract Tests
- OpenAPI specification compliance
- Request/response validation
- Error response formats

### Load Testing
- Target: P95 response time < 200ms for GET /jobs/:id
- Concurrent upload handling
- Rate limiting effectiveness
- Database connection pooling under load

## Implementation Phases

### Phase A: Stub Implementation (Week 1-2)
**Goal**: Unblock frontend development with mock responses
- [ ] Basic Fastify server setup with TypeScript
- [ ] In-memory job store for development
- [ ] Mock endpoints returning realistic data
- [ ] Basic JWT validation middleware
- [ ] Local file storage only
- [ ] SSE streaming for job updates

### Phase B: Production Foundation (Week 3-4)
**Goal**: Production-ready data persistence and storage
- [ ] PostgreSQL integration with migrations
- [ ] Redis integration for caching and queues  
- [ ] S3-compatible storage adapter
- [ ] Real job queue integration
- [ ] Proper error handling and validation
- [ ] Rate limiting implementation

### Phase C: Scale and Monitor (Week 5-6)
**Goal**: Observability and production readiness
- [ ] OpenTelemetry integration
- [ ] Prometheus metrics export
- [ ] Health check endpoints
- [ ] Graceful shutdown handling
- [ ] Load testing and optimization
- [ ] Security audit and hardening

## Configuration

### Environment Variables
```bash
# Core service config
NODE_ENV=production
APP_PORT=8787
LOG_LEVEL=info

# Database
DB_URL=postgresql://user:pass@localhost:5432/slidecraft
REDIS_URL=redis://localhost:6379

# Storage
STORAGE_PROVIDER=s3|local|gdrive
LOCAL_STORAGE_ROOT=/var/slidecraft
S3_BUCKET=slidecraft-uploads
S3_REGION=us-east-1

# Security  
JWT_SECRET=your-secret-key
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60

# AI Providers
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

## Deployment

### Docker Configuration
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 8787
CMD ["npm", "start"]
```

### Health Checks
```typescript
// Health check endpoints
GET /health/live   // Liveness probe
GET /health/ready  // Readiness probe  
GET /health/metrics // Prometheus metrics
```

## Monitoring Alerts

### Critical Alerts
- Response time P95 > 1000ms
- Error rate > 5% over 5 minutes  
- Database connection pool exhaustion
- Redis connection failures
- Job queue depth > 1000

### Warning Alerts
- Response time P95 > 500ms
- Upload failure rate > 2%
- AI service latency > 3s
- Memory usage > 80%

## Future Enhancements

### Planned Features
- OAuth provider integration (Google, Microsoft)
- Advanced permission management
- Audit logging for compliance
- API versioning strategy
- GraphQL endpoint consideration
- WebSocket realtime event streaming
- Advanced caching strategies