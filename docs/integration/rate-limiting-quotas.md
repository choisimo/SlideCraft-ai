# Rate Limiting & Quotas Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2025-09-30

---

## Overview

This document defines rate limiting strategies, quota enforcement, abuse detection, and tier-based throttling for SlideCraft-ai. All limits are designed to ensure fair usage, prevent abuse, and maintain service quality while enabling legitimate high-volume use cases.

**Key Objectives:**
- Prevent DoS/DDoS attacks via distributed rate limiting
- Enforce tier-based fair usage policies (Free, Pro, Enterprise)
- Detect and mitigate abuse patterns (spikes, scraping, credential stuffing)
- Provide graceful degradation with clear user feedback

---

## Rate Limiting Architecture

### Implementation Stack

**Technology:**
- **Rate Limiter:** Cloudflare Workers Rate Limiting API (distributed edge counters)
- **Storage:** Cloudflare KV (global rate limit state, cross-region sync <1s)
- **Quota Tracking:** Cloudflare D1 (user quotas, reset periods)
- **Abuse Detection:** Cloudflare Analytics + custom heuristics

**Algorithm:** Token Bucket (refill rate + burst capacity)

**Example:**
```javascript
// Rate limit: 100 req/min with burst of 20
const rateLimiter = {
  capacity: 120,        // Max tokens (100 base + 20 burst)
  refillRate: 100,      // Tokens per minute
  refillInterval: 60    // Seconds
}
```

### Rate Limit Dimensions

**Enforcement Levels:**

1. **Global (Platform-Wide):** Protect infrastructure from total overload
2. **Per-User:** Fair usage per authenticated account
3. **Per-IP:** Prevent unauthenticated abuse (login, signup)
4. **Per-Endpoint:** Protect expensive operations (AI, exports)
5. **Per-Resource:** Prevent hot-spotting (e.g., same document accessed 1000x/sec)

---

## Tier-Based Rate Limits

### HTTP Request Rate Limits

| Tier | Requests/Min | Burst | Requests/Hour | Requests/Day |
|------|-------------|-------|---------------|--------------|
| **Free** | 10 | 20 | 300 | 5,000 |
| **Pro** | 100 | 150 | 5,000 | 100,000 |
| **Enterprise** | 1,000 | 1,500 | 50,000 | 1,000,000 |
| **API Key** | Custom | Custom | Custom | Custom |

**Notes:**
- Burst allows temporary spikes (e.g., user uploads 10 files quickly)
- Limits are per authenticated user (not per IP for authenticated requests)
- API keys can have custom limits set per integration

### Endpoint-Specific Limits (Authenticated Users)

#### Upload Endpoints

| Endpoint | Free | Pro | Enterprise | Limit Type |
|----------|------|-----|------------|------------|
| `POST /uploads/init` | 5/min | 20/min | 100/min | Uploads initiated |
| `POST /uploads/complete` | 5/min | 20/min | 100/min | Uploads finalized |
| **Total Upload Size** | 50MB/day | 2GB/day | 50GB/day | Daily quota |
| **Max File Size** | 10MB | 100MB | 500MB | Per file |

#### Conversion Endpoints

| Endpoint | Free | Pro | Enterprise | Limit Type |
|----------|------|-----|------------|------------|
| `POST /convert` | 3/hour | 30/hour | 300/hour | Jobs queued |
| **Concurrent Jobs** | 1 | 5 | 20 | Active conversions |
| **Queue Priority** | Low | Medium | High | Worker assignment |

#### AI Endpoints

| Endpoint | Free | Pro | Enterprise | Limit Type |
|----------|------|-----|------------|------------|
| `POST /ai/chat` | 10/hour | 100/hour | 500/hour | Chat messages |
| `POST /ai/suggestions` | 20/hour | 200/hour | 1000/hour | Slide suggestions |
| **AI Tokens/Day** | 10,000 | 100,000 | 500,000 | GPT tokens consumed |
| **Streaming Requests** | 2 concurrent | 5 concurrent | 20 concurrent | SSE connections |

#### Export Endpoints

| Endpoint | Free | Pro | Enterprise | Limit Type |
|----------|------|-----|------------|------------|
| `POST /export` | 5/hour | 50/hour | 200/hour | Exports queued |
| **Export File Size** | 50MB | 500MB | 2GB | Max output size |
| **Concurrent Exports** | 1 | 3 | 10 | Active jobs |

#### Collaboration Endpoints

| Endpoint | Free | Pro | Enterprise | Limit Type |
|----------|------|-----|------------|------------|
| `POST /documents/{id}/share` | 3/hour | 30/hour | Unlimited | Share invitations |
| `POST /documents/{id}/comments` | 30/hour | 300/hour | Unlimited | Comments posted |
| **Collaborators/Doc** | 3 | 10 | 100 | Max invited users |
| **Realtime Connections** | 5 | 20 | 100 | Concurrent WebSockets |

### Unauthenticated Endpoints (Per-IP Limits)

| Endpoint | Rate Limit | Burst | Notes |
|----------|-----------|-------|-------|
| `POST /auth/register` | 5/hour | 10 | Prevent fake accounts |
| `POST /auth/login` | 10/min | 20 | Brute-force protection |
| `POST /auth/reset-password` | 3/hour | 5 | Prevent enumeration |
| `POST /auth/verify-email` | 10/hour | 15 | Resend limits |
| `GET /health` | 60/min | 100 | Monitoring tools |
| `GET /documents/{id}/public` | 100/min | 200 | Public share links (future) |

---

## Quota Enforcement

### Quota Types

**1. API Request Quotas (per tier/month)**
- Free: 10,000 API calls
- Pro: 500,000 API calls
- Enterprise: Unlimited (soft limit: 10M, then contact sales)

**2. Storage Quotas**
- Free: 1GB total storage
- Pro: 100GB total storage
- Enterprise: 1TB total storage
- Overage: $0.10/GB/month (Pro/Enterprise)

**3. AI Token Quotas (monthly)**
- Free: 100,000 tokens (~100 chat sessions)
- Pro: 1,000,000 tokens (~1,000 chat sessions)
- Enterprise: 5,000,000 tokens (~5,000 chat sessions)
- Overage: $0.002/1k tokens (GPT-4 rate)

**4. Conversion Quotas (monthly)**
- Free: 10 conversions (PPTX/PDF → JSON)
- Pro: 500 conversions
- Enterprise: Unlimited (soft limit: 10,000/month)

**5. Export Quotas (monthly)**
- Free: 10 exports (JSON → PPTX)
- Pro: 500 exports
- Enterprise: Unlimited (soft limit: 10,000/month)

**6. Collaborator Quotas**
- Free: 3 collaborators per document, 5 documents total
- Pro: 10 collaborators per document, 100 documents total
- Enterprise: 100 collaborators per document, unlimited documents

### Quota Tracking

**Database Schema:**
```sql
CREATE TABLE user_quotas (
  user_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,  -- free, pro, enterprise
  
  -- Monthly quotas (reset on billing cycle date)
  api_requests_used INTEGER DEFAULT 0,
  api_requests_limit INTEGER NOT NULL,
  
  ai_tokens_used INTEGER DEFAULT 0,
  ai_tokens_limit INTEGER NOT NULL,
  
  conversions_used INTEGER DEFAULT 0,
  conversions_limit INTEGER NOT NULL,
  
  exports_used INTEGER DEFAULT 0,
  exports_limit INTEGER NOT NULL,
  
  -- Storage (cumulative)
  storage_bytes_used INTEGER DEFAULT 0,
  storage_bytes_limit INTEGER NOT NULL,
  
  -- Reset tracking
  quota_reset_at TIMESTAMP NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Overage flags
  soft_limit_exceeded BOOLEAN DEFAULT FALSE,
  hard_limit_exceeded BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_quota_reset ON user_quotas(quota_reset_at);
CREATE INDEX idx_quota_exceeded ON user_quotas(hard_limit_exceeded) WHERE hard_limit_exceeded = TRUE;
```

**Quota Update Flow:**
```javascript
// Increment quota usage (atomic)
async function incrementQuota(userId, quotaType, amount) {
  const result = await db.run(`
    UPDATE user_quotas
    SET ${quotaType}_used = ${quotaType}_used + ?
    WHERE user_id = ?
    RETURNING ${quotaType}_used, ${quotaType}_limit
  `, [amount, userId])
  
  const { used, limit } = result
  
  // Check soft limit (80% of quota)
  if (used >= limit * 0.8 && used < limit) {
    await notifyUser(userId, 'quota_warning', { type: quotaType, percent: 80 })
  }
  
  // Check hard limit
  if (used >= limit) {
    await db.run(`
      UPDATE user_quotas SET hard_limit_exceeded = TRUE WHERE user_id = ?
    `, [userId])
    
    throw new QuotaExceededError(quotaType, limit)
  }
}
```

**Quota Reset (Monthly):**
```javascript
// Cron job: Reset quotas on billing cycle date
async function resetMonthlyQuotas() {
  await db.run(`
    UPDATE user_quotas
    SET 
      api_requests_used = 0,
      ai_tokens_used = 0,
      conversions_used = 0,
      exports_used = 0,
      soft_limit_exceeded = FALSE,
      hard_limit_exceeded = FALSE,
      quota_reset_at = DATE(quota_reset_at, '+1 month')
    WHERE quota_reset_at <= CURRENT_TIMESTAMP
  `)
}
```

---

## Abuse Detection & Mitigation

### Abuse Patterns

**1. Spike Detection (Sudden Traffic Surge)**
- **Trigger:** >10x normal request rate within 5min
- **Action:** Temporary rate limit reduction (100 req/min → 10 req/min for 1hr)
- **Alert:** Slack notification to `#security-alerts`

**2. Credential Stuffing (Login Abuse)**
- **Trigger:** >100 failed logins from same IP within 1hr
- **Action:** Block IP for 24hrs, require CAPTCHA for all logins from that IP
- **Detection:**
  ```sql
  SELECT ip_address, COUNT(*) as failed_attempts
  FROM auth_logs
  WHERE event = 'login_failed' AND timestamp > NOW() - INTERVAL '1 hour'
  GROUP BY ip_address
  HAVING COUNT(*) > 100
  ```

**3. Account Takeover Attempt**
- **Trigger:** Password reset requested for >10 different accounts from same IP
- **Action:** Block IP, notify affected users, require MFA for all accounts
- **Detection:**
  ```sql
  SELECT ip_address, COUNT(DISTINCT user_id) as target_count
  FROM auth_logs
  WHERE event = 'password_reset_requested' AND timestamp > NOW() - INTERVAL '1 hour'
  GROUP BY ip_address
  HAVING COUNT(DISTINCT user_id) > 10
  ```

**4. Scraping / Data Harvesting**
- **Trigger:** Sequential document IDs accessed (user_01, user_02, user_03...) >100/hour
- **Action:** Block user, require manual verification, revoke API keys
- **Detection:**
  ```javascript
  // Check for sequential pattern in access logs
  if (isSequentialPattern(recentDocumentIds) && recentDocumentIds.length > 100) {
    await blockUser(userId, 'suspected_scraping')
  }
  ```

**5. AI Abuse (Excessive Token Usage)**
- **Trigger:** >50,000 tokens in single request (max context window abuse)
- **Action:** Reject request, log incident, reduce AI quota by 50% for 24hrs
- **Response:**
  ```json
  {
    "error": "token_limit_exceeded",
    "message": "Request exceeds maximum token limit (50,000)",
    "quota_remaining": 0,
    "retry_after": 86400
  }
  ```

**6. Resource Exhaustion (Zip Bomb, Large File Upload)**
- **Trigger:** File decompresses to >10x declared size
- **Action:** Reject upload, quarantine file, block user for 1hr
- **Implementation:**
  ```javascript
  // Check decompression ratio during streaming upload
  if (decompressedSize > declaredSize * 10) {
    throw new SecurityError('suspicious_file_ratio')
  }
  ```

### CAPTCHA Integration

**CAPTCHA Triggers:**
- >3 failed login attempts from same IP within 5min
- >5 password reset requests from same IP within 1hr
- Suspected bot traffic (User-Agent analysis)

**Implementation:**
```javascript
// Cloudflare Turnstile (invisible CAPTCHA)
async function validateRequest(req) {
  const challengeRequired = await checkCaptchaThreshold(req.ip)
  
  if (challengeRequired) {
    const token = req.headers.get('cf-turnstile-response')
    if (!token) {
      return Response.json({ error: 'captcha_required' }, { status: 428 })
    }
    
    const valid = await verifyTurnstile(token)
    if (!valid) {
      return Response.json({ error: 'captcha_invalid' }, { status: 403 })
    }
  }
}
```

### IP Blocking

**Block List Management:**
```sql
CREATE TABLE ip_blocks (
  ip_address TEXT PRIMARY KEY,
  reason TEXT NOT NULL,  -- credential_stuffing, scraping, abuse
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  blocked_until TIMESTAMP,  -- NULL = permanent
  blocked_by TEXT,  -- admin user or 'system'
  
  -- Metadata
  incident_id TEXT,  -- Link to incident report
  attempts_count INTEGER,
  last_attempt TIMESTAMP
);

CREATE INDEX idx_ip_blocks_active ON ip_blocks(blocked_until) 
  WHERE blocked_until IS NULL OR blocked_until > CURRENT_TIMESTAMP;
```

**Auto-Unblock (Temporary Blocks):**
```javascript
// Cron job: Remove expired IP blocks
async function cleanupExpiredBlocks() {
  await db.run(`
    DELETE FROM ip_blocks
    WHERE blocked_until IS NOT NULL AND blocked_until <= CURRENT_TIMESTAMP
  `)
}
```

---

## Rate Limit Response Format

### HTTP Headers

**Every response includes rate limit headers:**
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100          # Max requests per window
X-RateLimit-Remaining: 73       # Requests remaining
X-RateLimit-Reset: 1727655300   # Unix timestamp when limit resets
X-RateLimit-Window: 60          # Window duration in seconds
X-RateLimit-Retry-After: 45     # (If rate limited) Seconds until retry
```

**Quota Headers (for quota-limited endpoints):**
```http
X-Quota-Type: ai_tokens              # Which quota was consumed
X-Quota-Used: 45000                  # Tokens used this period
X-Quota-Limit: 100000                # Total quota for period
X-Quota-Remaining: 55000             # Quota remaining
X-Quota-Reset: 2025-10-01T00:00:00Z  # When quota resets (monthly)
```

### Error Responses

**429 Too Many Requests (Rate Limit Exceeded):**
```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit of 100 requests per minute exceeded",
    "details": {
      "limit": 100,
      "window": "1 minute",
      "reset_at": "2025-09-30T10:15:00Z",
      "retry_after": 45
    }
  }
}
```

**402 Payment Required (Quota Exceeded):**
```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "Monthly AI token quota exceeded (100,000 tokens)",
    "details": {
      "quota_type": "ai_tokens",
      "used": 100000,
      "limit": 100000,
      "reset_at": "2025-10-01T00:00:00Z",
      "upgrade_url": "https://slidecraft.ai/pricing"
    }
  }
}
```

**403 Forbidden (IP Blocked):**
```json
{
  "error": {
    "code": "ip_blocked",
    "message": "Your IP address has been blocked due to suspected abuse",
    "details": {
      "reason": "credential_stuffing",
      "blocked_until": "2025-10-01T10:00:00Z",
      "contact": "support@slidecraft.ai"
    }
  }
}
```

---

## Graceful Degradation

### Soft Limits (Warnings)

**Trigger:** User reaches 80% of quota

**User Notification:**
```json
{
  "data": { /* normal response */ },
  "warnings": [
    {
      "type": "quota_warning",
      "message": "You've used 80% of your monthly AI tokens (80,000 / 100,000)",
      "action": "Consider upgrading to Pro for 10x more tokens",
      "quota_reset": "2025-10-01T00:00:00Z"
    }
  ]
}
```

**In-App Banner (Frontend):**
```jsx
// Display warning banner when quota >80%
{quota.ai_tokens_used / quota.ai_tokens_limit > 0.8 && (
  <Alert variant="warning">
    You've used {Math.round(quota.ai_tokens_used / quota.ai_tokens_limit * 100)}% 
    of your AI tokens this month. 
    <a href="/pricing">Upgrade for more</a>
  </Alert>
)}
```

### Hard Limits (Service Denial)

**Trigger:** User reaches 100% of quota

**Graceful Failure:**
1. **Return 402 Payment Required** (not 403 Forbidden)
2. **Include upgrade CTA** in error message
3. **Preserve user data** (don't block read-only access)
4. **Email notification** with quota summary

**Example - AI Chat Disabled:**
```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "Your monthly AI token quota has been reached",
    "details": {
      "quota_used": 100000,
      "quota_limit": 100000,
      "reset_date": "2025-10-01",
      "options": [
        {
          "action": "upgrade",
          "label": "Upgrade to Pro (1M tokens/month)",
          "url": "https://slidecraft.ai/pricing?plan=pro"
        },
        {
          "action": "wait",
          "label": "Wait until quota resets",
          "reset_in": "15 hours"
        }
      ]
    }
  }
}
```

### Degraded Service (High Load)

**Trigger:** Platform-wide load >80% capacity

**Degradation Strategy:**
1. **Disable non-critical features:**
   - AI suggestions (defer to next request)
   - Real-time presence (use polling fallback)
   - Export preview thumbnails (skip generation)

2. **Reduce service quality:**
   - AI models: GPT-4 → GPT-3.5 (faster, cheaper)
   - Image quality: High-res → optimized (smaller files)
   - Polling intervals: 5s → 30s (realtime fallback)

3. **Prioritize critical paths:**
   - Authenticated users > anonymous
   - Paid tiers > free tier
   - Core features (upload, convert) > extras (AI, export)

**Implementation:**
```javascript
// Feature flag-based degradation
if (systemLoad > 0.8) {
  await featureFlags.disable('ai_suggestions')
  await featureFlags.disable('realtime_presence')
  await featureFlags.set('ai_model', 'gpt-3.5-turbo')  // Downgrade model
}
```

---

## Monitoring & Analytics

### Rate Limit Metrics

**Real-Time Dashboard (Grafana):**
- **Rate limit hit rate:** % of requests that hit rate limits (target: <1%)
- **Quota exhaustion rate:** % of users hitting quota limits per tier
- **Top rate-limited endpoints:** Which APIs are most constrained
- **Abuse incidents:** Spike/scraping/credential stuffing events per day
- **IP block list size:** Active blocked IPs (alert if >1000)

**Queries:**
```sql
-- Rate limit hit rate (last 1 hour)
SELECT 
  endpoint,
  COUNT(*) FILTER (WHERE status = 429) * 100.0 / COUNT(*) as hit_rate_percent
FROM request_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY endpoint
HAVING hit_rate_percent > 5  -- Alert if >5% hitting limits
ORDER BY hit_rate_percent DESC;

-- Users hitting quota limits
SELECT 
  tier,
  COUNT(*) FILTER (WHERE hard_limit_exceeded) as quota_exceeded_count,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE hard_limit_exceeded) * 100.0 / COUNT(*) as percent
FROM user_quotas
GROUP BY tier;
```

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Rate limit hit rate | >5% | >10% | Increase tier limits or optimize endpoint |
| Quota exhaustion (Free) | >20% | >40% | Promote Pro tier, adjust Free limits |
| Quota exhaustion (Pro) | >10% | >20% | Contact users, offer Enterprise |
| Abuse incidents | >10/day | >50/day | Review detection logic, manual review |
| IP blocks added | >100/day | >500/day | Possible DDoS, enable Cloudflare DDoS mode |
| API latency (rate-limited) | >100ms | >500ms | Optimize rate limiter (move to KV or Durable Objects) |

### User Analytics

**Track quota usage patterns:**
```sql
-- Identify power users (good candidates for Enterprise)
SELECT 
  user_id,
  tier,
  api_requests_used,
  ai_tokens_used,
  conversions_used
FROM user_quotas
WHERE tier = 'pro'
  AND (
    api_requests_used > api_requests_limit * 0.9 OR
    ai_tokens_used > ai_tokens_limit * 0.9
  )
ORDER BY api_requests_used DESC
LIMIT 100;

-- Identify churning users (hit limits and didn't upgrade)
SELECT 
  u.user_id,
  u.email,
  uq.hard_limit_exceeded,
  uq.quota_reset_at,
  u.last_login
FROM users u
JOIN user_quotas uq ON u.user_id = uq.user_id
WHERE uq.hard_limit_exceeded = TRUE
  AND u.last_login < NOW() - INTERVAL '7 days'  -- Stopped using after hitting limit
  AND uq.tier = 'free';
```

---

## API Key Rate Limits

### API Key Configuration

**API keys support custom rate limits (Enterprise feature):**

```sql
CREATE TABLE api_keys (
  key_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- Argon2id hash
  
  -- Custom rate limits
  rate_limit_per_min INTEGER DEFAULT 100,
  rate_limit_per_hour INTEGER DEFAULT 5000,
  rate_limit_per_day INTEGER DEFAULT 100000,
  
  -- Scoped permissions
  scopes TEXT[] NOT NULL,  -- e.g., ['convert:create', 'export:download']
  
  -- Metadata
  name TEXT,  -- User-defined key name (e.g., "CI/CD Pipeline")
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP,
  expires_at TIMESTAMP,  -- NULL = never expires
  
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

**Rate Limit Enforcement:**
```javascript
// API key rate limiting (separate bucket from user)
async function checkApiKeyRateLimit(keyId) {
  const key = await getApiKey(keyId)
  
  const limits = [
    { window: '1m', limit: key.rate_limit_per_min },
    { window: '1h', limit: key.rate_limit_per_hour },
    { window: '1d', limit: key.rate_limit_per_day }
  ]
  
  for (const { window, limit } of limits) {
    const count = await rateLimiter.increment(`apikey:${keyId}:${window}`)
    if (count > limit) {
      throw new RateLimitError(`API key limit exceeded: ${limit}/${window}`)
    }
  }
}
```

**API Key Rotation (Auto-Expiry):**
```javascript
// Cron job: Expire old API keys
async function expireApiKeys() {
  await db.run(`
    UPDATE api_keys
    SET expires_at = CURRENT_TIMESTAMP
    WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
  `)
  
  // Notify users 7 days before expiry
  const expiringSoon = await db.all(`
    SELECT user_id, name, expires_at
    FROM api_keys
    WHERE expires_at > CURRENT_TIMESTAMP 
      AND expires_at <= CURRENT_TIMESTAMP + INTERVAL '7 days'
  `)
  
  for (const key of expiringSoon) {
    await notifyUser(key.user_id, 'api_key_expiring', { name: key.name, expires_at: key.expires_at })
  }
}
```

---

## Testing & Validation

### Load Testing

**Rate Limit Validation:**
```bash
# Test Free tier limit (10 req/min)
artillery run --target https://api.slidecraft.ai \
  --config rate-limit-test.yml

# rate-limit-test.yml
config:
  target: https://api.slidecraft.ai
  phases:
    - duration: 60
      arrivalRate: 15  # Exceed 10 req/min limit
  processor: "./validate-429.js"

scenarios:
  - name: "Test rate limit"
    flow:
      - post:
          url: "/api/v1/convert"
          headers:
            Authorization: "Bearer {{freeUserToken}}"
          json:
            objectKey: "test.pptx"
            sourceType: "pptx"
      - expect:
          - statusCode: [202, 429]  # Accept both success and rate limit
```

**Quota Enforcement Testing:**
```javascript
// Test AI token quota exhaustion
describe('AI Token Quota', () => {
  it('should block requests after exceeding quota', async () => {
    const user = await createTestUser({ tier: 'free', ai_tokens_limit: 10000 })
    
    // Consume entire quota
    await consumeTokens(user.id, 10000)
    
    // Next request should fail
    const res = await fetch('/api/v1/ai/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ message: 'Hello' })
    })
    
    expect(res.status).toBe(402)  // Payment Required
    expect(res.json()).toMatchObject({
      error: { code: 'quota_exceeded', details: { quota_type: 'ai_tokens' } }
    })
  })
})
```

### Abuse Detection Testing

**Spike Detection:**
```javascript
// Simulate traffic spike
describe('Spike Detection', () => {
  it('should detect and throttle sudden traffic surge', async () => {
    const user = await createTestUser({ tier: 'pro' })
    
    // Normal rate: 100 req/min
    // Spike: 1000 req/min (10x normal)
    const requests = Array(1000).fill(null).map(() => 
      fetch('/api/v1/documents', {
        headers: { Authorization: `Bearer ${user.token}` }
      })
    )
    
    const responses = await Promise.all(requests)
    const rateLimited = responses.filter(r => r.status === 429)
    
    // Should throttle after detecting spike
    expect(rateLimited.length).toBeGreaterThan(900)  // Most requests blocked
  })
})
```

**Credential Stuffing Detection:**
```javascript
// Simulate credential stuffing attack
describe('Credential Stuffing Protection', () => {
  it('should block IP after 100 failed logins', async () => {
    const ip = '192.0.2.1'
    
    // Attempt 101 failed logins
    for (let i = 0; i < 101; i++) {
      await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: `user${i}@example.com`, password: 'wrong' })
      })
    }
    
    // IP should be blocked
    const blocked = await db.get('SELECT * FROM ip_blocks WHERE ip_address = ?', ip)
    expect(blocked).toBeDefined()
    expect(blocked.reason).toBe('credential_stuffing')
  })
})
```

---

## OpenAPI Specification

### Rate Limit Schema

**Add to `docs/backend/openapi.yaml`:**

```yaml
components:
  headers:
    X-RateLimit-Limit:
      description: Maximum requests per time window
      schema:
        type: integer
        example: 100
    
    X-RateLimit-Remaining:
      description: Requests remaining in current window
      schema:
        type: integer
        example: 73
    
    X-RateLimit-Reset:
      description: Unix timestamp when rate limit resets
      schema:
        type: integer
        example: 1727655300
    
    X-Quota-Type:
      description: Type of quota consumed (ai_tokens, conversions, etc.)
      schema:
        type: string
        enum: [api_requests, ai_tokens, conversions, exports, storage]
    
    X-Quota-Used:
      description: Quota consumed in current period
      schema:
        type: integer
        example: 45000
    
    X-Quota-Limit:
      description: Total quota for current period
      schema:
        type: integer
        example: 100000
    
    X-Quota-Remaining:
      description: Quota remaining in current period
      schema:
        type: integer
        example: 55000

  responses:
    RateLimitExceeded:
      description: Rate limit exceeded
      headers:
        X-RateLimit-Limit: { $ref: '#/components/headers/X-RateLimit-Limit' }
        X-RateLimit-Remaining: { $ref: '#/components/headers/X-RateLimit-Remaining' }
        X-RateLimit-Reset: { $ref: '#/components/headers/X-RateLimit-Reset' }
        Retry-After:
          description: Seconds until rate limit resets
          schema:
            type: integer
            example: 45
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: object
                properties:
                  code:
                    type: string
                    example: rate_limit_exceeded
                  message:
                    type: string
                    example: Rate limit of 100 requests per minute exceeded
                  details:
                    type: object
                    properties:
                      limit: { type: integer }
                      window: { type: string }
                      reset_at: { type: string, format: date-time }
                      retry_after: { type: integer }
    
    QuotaExceeded:
      description: Monthly quota exceeded
      headers:
        X-Quota-Type: { $ref: '#/components/headers/X-Quota-Type' }
        X-Quota-Used: { $ref: '#/components/headers/X-Quota-Used' }
        X-Quota-Limit: { $ref: '#/components/headers/X-Quota-Limit' }
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: object
                properties:
                  code:
                    type: string
                    example: quota_exceeded
                  message:
                    type: string
                    example: Monthly AI token quota exceeded
                  details:
                    type: object
                    properties:
                      quota_type: { type: string }
                      used: { type: integer }
                      limit: { type: integer }
                      reset_at: { type: string, format: date-time }
                      upgrade_url: { type: string, format: uri }

# Apply to all endpoints
paths:
  /convert:
    post:
      responses:
        '202': { /* ... */ }
        '429': { $ref: '#/components/responses/RateLimitExceeded' }
        '402': { $ref: '#/components/responses/QuotaExceeded' }
  
  /ai/chat:
    post:
      responses:
        '200': { /* ... */ }
        '429': { $ref: '#/components/responses/RateLimitExceeded' }
        '402': { $ref: '#/components/responses/QuotaExceeded' }
```

---

## Operational Runbook

### Adjusting Rate Limits (Emergency)

**Scenario:** Sudden traffic spike causing platform overload

**Immediate Actions:**
```bash
# 1. Reduce global rate limits (all tiers)
wrangler kv:key put --binding=CONFIG "global_rate_limit" "10"  # 10 req/min emergency limit

# 2. Enable Cloudflare DDoS protection (automated bot blocking)
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/{zone_id}/settings/security_level" \
  -H "Authorization: Bearer {api_token}" \
  -d '{"value":"under_attack"}'

# 3. Disable non-critical features
npm run feature:disable -- --flag=ai_suggestions
npm run feature:disable -- --flag=realtime_presence

# 4. Notify users (status page)
npm run status:update -- --status=degraded --message="Experiencing high load, some features temporarily disabled"
```

**Recovery:**
```bash
# After load subsides, gradually restore limits
wrangler kv:key put --binding=CONFIG "global_rate_limit" "50"   # 50 req/min (50% of normal)
# Wait 15min, monitor metrics
wrangler kv:key put --binding=CONFIG "global_rate_limit" "100"  # Full restore

# Re-enable features
npm run feature:enable -- --flag=ai_suggestions --rollout=50  # Gradual rollout
```

### Unblocking False Positives

**Scenario:** Legitimate user blocked by abuse detection

**Investigation:**
```sql
-- Check block reason and evidence
SELECT * FROM ip_blocks WHERE ip_address = '203.0.113.45';

SELECT COUNT(*), event FROM auth_logs 
WHERE ip_address = '203.0.113.45' 
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY event;
```

**Manual Unblock:**
```bash
# Remove IP block
npm run admin:unblock-ip -- --ip=203.0.113.45 --reason="false_positive_corporate_vpn"

# Whitelist IP (prevent future blocks)
npm run admin:whitelist-ip -- --ip=203.0.113.45 --expires=30d --reason="Enterprise customer VPN"
```

---

## Future Enhancements

### Dynamic Rate Limits (ML-Based)

**Concept:** Adjust limits based on usage patterns

- **Good actors:** Gradually increase limits (e.g., consistent Pro user → 150 req/min)
- **Suspicious actors:** Gradually decrease limits (e.g., spike detected → 50 req/min)
- **Model:** Anomaly detection on per-user request histograms

**Implementation (Phase 2):**
```javascript
// Machine learning-based dynamic limits
const userScore = await mlModel.predict({
  avg_requests_per_hour: 120,
  variance: 15,
  spike_count_30d: 0,
  failed_auth_rate: 0.001,
  tier: 'pro'
})

// Score 0-100: 0=suspicious, 100=trusted
const dynamicLimit = baseLimitForTier(user.tier) * (userScore / 50)
```

### Usage-Based Pricing

**Concept:** Pay-as-you-go for overages

- Free tier: Hard limits (no overage)
- Pro tier: Soft limits + $0.01 per 100 API calls over quota
- Enterprise: Custom contracts

**Billing Integration:**
```javascript
// Charge for quota overage (Stripe metered billing)
async function recordUsageOverage(userId, quotaType, amount) {
  await stripe.subscriptionItems.createUsageRecord(user.stripe_subscription_item_id, {
    quantity: amount,  // Units over quota
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment'
  })
}
```

---

## Compliance & Audit

### SOC2 Controls

| Control | Implementation | Evidence |
|---------|---------------|----------|
| **CC6.1 (Logical Access)** | Rate limiting prevents brute-force attacks | IP block logs, failed auth metrics |
| **CC7.2 (System Monitoring)** | Real-time abuse detection, alerting | Grafana dashboards, PagerDuty incidents |
| **A1.2 (Availability SLA)** | DDoS protection, graceful degradation | Uptime metrics (>99.9%) |

### GDPR Compliance

**User Rights:**
- **Right to Access:** Provide quota usage history (`GET /users/me/quota-history`)
- **Right to Erasure:** Delete quota records with user account (cascade delete)

**Data Retention:**
- Rate limit logs: 90 days (security analysis)
- Abuse incident logs: 1 year (legal hold)
- IP blocks: 30 days after expiry (audit trail)

---

## Appendix

### Rate Limiting Libraries

**Recommended:**
- **Cloudflare Workers:** Native rate limiting API (distributed edge counters)
- **Alternative (self-hosted):** `ioredis` + `rate-limiter-flexible` (Redis-backed)

**Example (Cloudflare):**
```javascript
export default {
  async fetch(request, env) {
    const { success } = await env.RATE_LIMITER.limit({ key: userId })
    if (!success) {
      return new Response('Rate limit exceeded', { status: 429 })
    }
    // ... handle request
  }
}
```

### Common Bypass Attempts

**Attack Vectors & Mitigations:**

1. **Distributed Attack (Botnet):**
   - Detection: >1000 unique IPs with same User-Agent
   - Mitigation: Cloudflare Bot Management, CAPTCHA challenges

2. **IP Rotation (Proxy Pool):**
   - Detection: Same auth token from >100 IPs in 1hr
   - Mitigation: Device fingerprinting, require re-auth

3. **API Key Sharing:**
   - Detection: Same API key from geographically distant IPs simultaneously
   - Mitigation: Revoke key, notify owner, require key rotation

4. **Time Zone Manipulation:**
   - Attempt: Reset quota by changing time zone
   - Mitigation: Quota reset based on UTC, stored server-side

---

**Document Owner:** Platform Team  
**Review Cycle:** Quarterly (after tier pricing changes)  
**Last Reviewed:** 2025-09-30  
**Next Review:** 2025-12-30
