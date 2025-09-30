# Security & Compliance Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2025-09-30

---

## Overview

This document defines security controls, authentication mechanisms, encryption standards, audit logging requirements, and compliance frameworks for SlideCraft-ai. All implementations must align with industry best practices (OWASP, NIST) and support SOC2 Type II readiness.

---

## Authentication & Identity

### Authentication Schemes

#### JWT Bearer Tokens (Primary - P0)
- **Algorithm:** RS256 (RSA signature with SHA-256)
- **Issuer:** Internal auth service (`https://auth.slidecraft.ai`)
- **Token Lifetime:**
  - Access token: 15 minutes
  - Refresh token: 7 days (HTTP-only cookie)
- **Claims:**
  ```json
  {
    "sub": "user_01H8XYZ...",          // User ID
    "email": "user@example.com",
    "roles": ["editor", "owner"],
    "tier": "pro",                      // Subscription tier
    "iat": 1727654400,
    "exp": 1727655300,
    "aud": "slidecraft-api"
  }
  ```
- **Public Key Distribution:** JWKS endpoint at `https://auth.slidecraft.ai/.well-known/jwks.json`
- **Validation Requirements:**
  - Signature verification (RS256)
  - Expiration check (`exp` claim)
  - Audience validation (`aud === "slidecraft-api"`)
  - Issuer verification (`iss === "https://auth.slidecraft.ai"`)

#### OAuth 2.0 / OpenID Connect (P1 - External Providers)
- **Supported Providers:**
  - Google Workspace (priority for enterprise)
  - Microsoft Azure AD
  - GitHub (developer community)
- **Flow:** Authorization Code with PKCE
- **Scopes:** `openid`, `email`, `profile`
- **State Management:** Cryptographically random state parameter (32 bytes, stored in Redis with 10min TTL)
- **Token Exchange:** External ID token → internal JWT (mapped to `userId`)

#### API Keys (P2 - Programmatic Access)
- **Format:** `sk_live_<32-byte-base64>` (production) or `sk_test_<32-byte-base64>` (sandbox)
- **Storage:** Hashed with Argon2id (time=3, memory=64MB, parallelism=4)
- **Permissions:** Scoped to specific operations (`convert:create`, `export:download`)
- **Rotation:** Manual via dashboard, automatic after 90 days (configurable)
- **Rate Limits:** 100 req/min per key (stricter than user sessions)

### OpenAPI Security Definitions

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: "RS256-signed JWT from auth service"
    
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.slidecraft.ai/oauth/authorize
          tokenUrl: https://auth.slidecraft.ai/oauth/token
          scopes:
            read: Read access to documents
            write: Create/update documents
            admin: Administrative access
    
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key
      description: "API key for programmatic access (format: sk_live_*)"

security:
  - bearerAuth: []
```

### Password Requirements (If Self-Hosted Auth)
- **Minimum Length:** 12 characters
- **Complexity:** At least 3 of: uppercase, lowercase, digit, special char
- **Storage:** Argon2id hashing (same params as API keys)
- **Breach Detection:** Check against Have I Been Pwned API on registration/change
- **MFA Support:** TOTP (6-digit codes, 30s window) via authenticator apps

---

## Encryption

### Data at Rest

#### PostgreSQL Database
- **Method:** Transparent Data Encryption (TDE) via provider (e.g., AWS RDS encryption)
- **Algorithm:** AES-256-GCM
- **Key Management:** AWS KMS or Cloudflare Secrets (auto-rotated annually)
- **Encrypted Columns (Application-Level):**
  - `users.email` → AES-256-GCM with per-user derived key
  - API key hashes → Already one-way (Argon2id)
  - OAuth tokens → Encrypted with master key (rotated quarterly)

#### Object Storage (R2)
- **Encryption:** Server-side encryption enabled (AES-256)
- **Access Control:** Presigned URLs only (no public buckets)
- **Retention:**
  - Uploaded files: Encrypted, deleted after 90 days if unconverted
  - Export results: Encrypted, deleted after 7 days post-download
  - Document backups: Encrypted, retained 30 days

#### Redis Cache
- **At-Rest Encryption:** Enabled via provider (e.g., Upstash encryption)
- **Sensitive Data:** Never cache plaintext tokens (only hashed references)
- **Session Data:** Encrypted session payloads (AES-256-GCM) for multi-region replication

### Data in Transit

#### TLS Configuration
- **Minimum Version:** TLS 1.3 (TLS 1.2 deprecated after 6 months)
- **Cipher Suites (Preferred Order):**
  1. `TLS_AES_256_GCM_SHA384`
  2. `TLS_CHACHA20_POLY1305_SHA256`
  3. `TLS_AES_128_GCM_SHA256`
- **Certificate:** Wildcard cert for `*.slidecraft.ai` (Let's Encrypt or DigiCert)
- **HSTS:** Enforced with `max-age=31536000; includeSubDomains; preload`
- **Certificate Pinning:** Not enforced (mobile apps use system trust store)

#### Internal Service Communication
- **Gateway ↔ Workers:** mTLS with client certificates (workers authenticate to gateway)
- **Gateway ↔ Database:** TLS with server cert validation
- **Gateway ↔ Redis:** TLS enabled (even for localhost in prod)
- **Worker ↔ External APIs:** TLS 1.3 required (AI providers, CDN origins)

---

## Authorization & Access Control

### Resource Ownership Model
- **Documents:** `documents.ownerId` → user who created/converted
- **Jobs:** `jobs.userId` → user who initiated conversion/export
- **Uploads:** `uploads.userId` → user who uploaded file

### Permission Matrix (Enforced at API Gateway)

| Endpoint                  | Owner | Collaborator (Editor) | Collaborator (Viewer) | Public (Unauthenticated) |
|---------------------------|-------|------------------------|------------------------|---------------------------|
| `POST /convert`           | ✅     | ❌                      | ❌                      | ❌                         |
| `GET /jobs/{id}`          | ✅     | ✅ (if shared)          | ✅ (if shared)          | ❌                         |
| `POST /documents`         | ✅     | ❌                      | ❌                      | ❌                         |
| `GET /documents/{id}`     | ✅     | ✅                      | ✅                      | ✅ (if `public=true`)      |
| `PATCH /documents/{id}`   | ✅     | ✅                      | ❌                      | ❌                         |
| `DELETE /documents/{id}`  | ✅     | ❌                      | ❌                      | ❌                         |
| `POST /export`            | ✅     | ✅                      | ✅ (view-only exports)  | ❌                         |
| `POST /ai/chat`           | ✅     | ✅                      | ❌                      | ❌                         |

### Collaboration Permissions (Future)
- **Roles:** `owner`, `editor`, `viewer`
- **Storage:** `document_collaborators` table (documentId, userId, role)
- **Enforcement:** JOIN query on every document access (cached in Redis for 5min)
- **Invitation Flow:** Owner sends email → recipient accepts → record created

---

## Audit Logging

### Event Categories

#### Authentication Events (Priority: High)
- **Login Success:** `{ userId, ip, userAgent, timestamp, method: "jwt|oauth|apiKey" }`
- **Login Failure:** `{ email, ip, reason: "invalid_password|expired_token", timestamp }`
- **Password Change:** `{ userId, ip, timestamp }`
- **MFA Enabled/Disabled:** `{ userId, timestamp }`
- **API Key Created/Rotated/Deleted:** `{ userId, keyId, action, timestamp }`

#### Data Access Events (Priority: Medium)
- **Document Read:** `{ userId, documentId, timestamp, access: "owner|collaborator|public" }`
- **Document Updated:** `{ userId, documentId, changesetSize, timestamp }`
- **Export Downloaded:** `{ userId, jobId, format, fileSize, timestamp }`

#### Administrative Events (Priority: Critical)
- **User Role Change:** `{ adminId, targetUserId, oldRole, newRole, timestamp }`
- **Data Deletion:** `{ userId, resourceType, resourceId, timestamp }`
- **Compliance Export:** `{ adminId, userId, dataType: "gdpr_export", timestamp }`

### Storage & Retention

#### Log Destination
- **Primary:** CloudFlare Logs / Sumo Logic / Datadog (structured JSON)
- **Backup:** S3/R2 bucket (partitioned by `date=YYYY-MM-DD/hour=HH/`)
- **Format:** JSON Lines (`.jsonl.gz` compressed)

#### Retention Policy
- **Authentication Logs:** 1 year (compliance requirement)
- **Data Access Logs:** 90 days (performance/cost balance)
- **Administrative Logs:** 7 years (legal holds, audit trails)
- **AI Chat Logs:** 30 days (PII concerns, can be extended if anonymized)

#### Example Log Entry
```json
{
  "timestamp": "2025-09-30T14:32:10.123Z",
  "eventType": "document.updated",
  "userId": "user_01H8XYZ...",
  "documentId": "doc_01H9ABC...",
  "ip": "203.0.113.45",
  "userAgent": "Mozilla/5.0...",
  "changes": { "slides": 3, "elements": 12 },
  "requestId": "req_01H9DEF...",
  "sessionId": "sess_01H9GHI..."
}
```

### Compliance Queries
- **GDPR Article 15 (Right to Access):** Export all logs for `userId` within 30 days
- **SOC2 CC6.3 (Audit Trail):** Query all `admin.*` events for quarterly review
- **Incident Response:** Filter by `ip` or `sessionId` to trace suspicious activity

---

## Security Controls

### Input Validation

#### API Gateway Layer
- **Schema Validation:** OpenAPI 3.0 schemas enforced via middleware (reject 400 Bad Request)
- **Size Limits:**
  - JSON body: 10MB max (prevent memory exhaustion)
  - File upload: 500MB max (enforced at presigned URL generation)
  - AI chat messages: 50 messages per request (prevent context overflow)
- **Content-Type:** Strict validation (`application/json` only for JSON endpoints)

#### XSS Prevention
- **User-Generated Content:** Sanitize HTML in document titles (escape `<`, `>`, `&`, `"`, `'`)
- **CSP Header:** `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline';`
- **React Rendering:** Use `dangerouslySetInnerHTML` only for sanitized markdown (DOMPurify)

#### SQL Injection Prevention
- **Query Builder:** Drizzle ORM with parameterized queries (never string concatenation)
- **Raw Queries:** Use `sql` tagged template (e.g., `sql`SELECT * FROM users WHERE id = ${userId}``)
- **Database User:** Least privilege (no `DROP TABLE`, `CREATE USER` permissions)

### CSRF Protection
- **SameSite Cookies:** `SameSite=Lax` for refresh tokens (blocks cross-site requests)
- **Double Submit Pattern:** CSRF token in both cookie and request header (`X-CSRF-Token`)
- **Token Generation:** Cryptographically random (32 bytes), stored in Redis (10min TTL)

### Dependency Security
- **Scanning:** `npm audit` in CI/CD (fail build on high/critical vulns)
- **Automated Updates:** Dependabot PRs for security patches (auto-merge if tests pass)
- **License Compliance:** Reject copyleft licenses (GPL, AGPL) in production deps

### Secrets Management
- **Storage:** Cloudflare Workers Secrets (encrypted, injected at runtime)
- **Rotation:** Quarterly for API keys, annually for encryption keys
- **Access Control:** Secrets readable only by authorized services (not exposed in logs)
- **Detection:** Gitleaks pre-commit hook to prevent accidental commits

---

## Privacy & Data Protection

### GDPR Compliance

#### Data Subject Rights
- **Right to Access (Art. 15):** Export user data (JSON dump) within 30 days via `/api/v1/users/me/export`
- **Right to Erasure (Art. 17):** Delete user + documents + jobs within 30 days via `/api/v1/users/me` DELETE
  - Soft delete (mark `deleted_at`) for 30-day recovery window
  - Hard delete after 30 days (cascade to all owned resources)
- **Right to Portability (Art. 20):** Export documents as PPTX/PDF (already supported via export API)
- **Right to Rectification (Art. 16):** PATCH `/api/v1/users/me` for profile updates

#### Consent Management
- **Cookie Banner:** Required for analytics/marketing cookies (not strictly necessary ones)
- **Data Processing Agreement (DPA):** Signed with AI providers (OpenAI, Anthropic)
- **Cross-Border Transfers:** EU data stays in EU regions (Cloudflare EU network)

### PII Handling

#### Data Classification
- **PII (Personal Identifiable Information):**
  - `users.email`, `users.name` → Encrypted at rest, masked in logs
  - `audit_logs.ip` → Anonymized after 90 days (replace with `/24` subnet)
  - `document.title` → User-controlled, not classified as PII
- **Non-PII:**
  - Document content (slides, images) → Business data, not PII unless user adds it
  - Job metadata (status, progress) → System data

#### AI Data Processing
- **Zero Data Retention (ZDR) Providers:** OpenAI (API excludes training), Anthropic (opt-out enforced)
- **Chat Logs:** Strip `userId` from AI request logs (use `sessionId` hash instead)
- **Slide Content Redaction:** Optionally redact emails/phone numbers before sending to AI (regex-based)

### Data Residency
- **EU Customers:** Data stored in EU regions (Cloudflare EU, AWS eu-west-1)
- **US Customers:** Data stored in US regions (Cloudflare US, AWS us-east-1)
- **Regional Routing:** Geo-based DNS to route to nearest compliant region

---

## Compliance Frameworks

### SOC2 Type II Readiness

#### Trust Services Criteria Mapping

**CC6.1 - Logical Access Controls**
- ✅ JWT authentication with RS256 signatures
- ✅ Role-based permissions enforced at gateway
- ✅ API key scoping to specific operations
- ✅ MFA support for privileged users (admins)

**CC6.2 - Secure Transmission**
- ✅ TLS 1.3 for all external communication
- ✅ mTLS for internal service-to-service
- ✅ HSTS enforced with preload

**CC6.3 - Audit Logging**
- ✅ Comprehensive event logs (auth, data access, admin)
- ✅ 1-year retention for security events
- ✅ Immutable log storage (append-only S3)

**CC6.6 - Encryption at Rest**
- ✅ AES-256-GCM for database (TDE)
- ✅ AES-256 for object storage (R2)
- ✅ Argon2id for password/API key hashing

**CC6.7 - Removal of Access**
- ✅ Automated token expiration (15min access, 7day refresh)
- ✅ API key rotation enforcement (90 days)
- ✅ User offboarding deletes sessions + invalidates keys

#### Control Testing (Annual Audit)
- **Evidence Collection:** Cloudflare/Sumo Logic logs for audit events
- **Penetration Testing:** Annual by third-party firm (OWASP Top 10 coverage)
- **Vulnerability Scanning:** Weekly Nessus scans on infrastructure
- **Access Review:** Quarterly review of admin privileges

### Industry-Specific Compliance

#### HIPAA (If Healthcare Use Case)
- **Business Associate Agreement (BAA):** Required with cloud providers
- **PHI Encryption:** AES-256 for ePHI (electronic protected health info)
- **Audit Controls:** Enhanced logging per §164.312(b)
- **Minimum Necessary:** Limit AI context to relevant slides only

#### FedRAMP (If Government Use)
- **Impact Level:** Moderate (FIPS 140-2 validated encryption)
- **Boundary Diagram:** Document all data flows (API → Workers → DB)
- **Incident Response:** 1-hour notification for security events

#### ISO 27001 (Information Security)
- **Risk Assessment:** Annual ISMS review (identify threats, mitigations)
- **Asset Inventory:** Maintain registry of all systems (gateway, workers, DB)
- **Continuous Monitoring:** Real-time alerts for access anomalies

---

## Security Monitoring & Incident Response

### Real-Time Alerts

#### Critical Alerts (PagerDuty / Opsgenie)
- **Threshold:** >100 failed login attempts from single IP in 5min → IP ban + notify SOC
- **Trigger:** Unauthorized access attempt to admin endpoints → Immediate alert
- **Condition:** Data deletion by non-owner → Block + require approval

#### Warning Alerts (Slack / Email)
- **Threshold:** >10 password reset requests in 1hr → Potential account takeover
- **Trigger:** TLS cert expires in <30 days → Renew reminder
- **Condition:** Dependency scan finds new CVE (CVSS >7.0) → Patch notification

### Incident Response Playbook

#### Phase 1: Detection (0-15min)
1. Alert fires → On-call engineer notified
2. Check monitoring dashboard (Grafana) for scope
3. Isolate affected service (e.g., disable AI gateway if AI key leaked)

#### Phase 2: Containment (15min-1hr)
1. Revoke compromised credentials (API keys, OAuth tokens)
2. Block malicious IPs at Cloudflare WAF
3. Snapshot databases for forensics (before any cleanup)

#### Phase 3: Eradication (1-4hr)
1. Identify root cause (log analysis, code review)
2. Deploy hotfix (e.g., patch vulnerable dependency)
3. Rotate secrets if exposed (DB passwords, encryption keys)

#### Phase 4: Recovery (4-24hr)
1. Restore from clean backups if data corrupted
2. Re-enable services gradually (canary rollout)
3. Notify affected users if PII breach (GDPR 72hr requirement)

#### Phase 5: Post-Mortem (1-7 days)
1. Document timeline, impact, resolution
2. Identify preventive measures (e.g., add rate limit)
3. Update runbooks + train team on new procedures

### Vulnerability Disclosure

#### Responsible Disclosure Policy
- **Email:** `security@slidecraft.ai` (PGP key published)
- **Bug Bounty:** HackerOne program (rewards: $100-$5000 based on severity)
- **Response SLA:**
  - Critical (RCE, data breach): 24 hours
  - High (auth bypass): 48 hours
  - Medium (XSS): 7 days
  - Low (info disclosure): 14 days

#### Exclusions
- ❌ Social engineering attacks
- ❌ DoS/DDoS (use rate limits instead)
- ❌ Vulnerabilities in third-party services (report to provider)

---

## Security Checklist (Pre-Launch)

### Infrastructure
- [ ] TLS 1.3 enabled on all endpoints
- [ ] HSTS preload configured
- [ ] WAF rules active (Cloudflare)
- [ ] Rate limiting enforced (see `rate-limiting-quotas.md`)
- [ ] Database encryption at rest (TDE)
- [ ] Object storage encryption (R2)
- [ ] Secrets stored in vault (Cloudflare Secrets)
- [ ] mTLS configured for internal services

### Application
- [ ] JWT validation (signature, expiry, audience)
- [ ] OAuth PKCE flow implemented
- [ ] API key hashing (Argon2id)
- [ ] CSRF tokens for state-changing requests
- [ ] XSS prevention (CSP headers, sanitization)
- [ ] SQL injection prevention (parameterized queries)
- [ ] Input validation (OpenAPI schema enforcement)
- [ ] Audit logging for all sensitive operations

### Compliance
- [ ] GDPR data export implemented (`/users/me/export`)
- [ ] GDPR data deletion implemented (`/users/me` DELETE)
- [ ] Consent management (cookie banner)
- [ ] DPA signed with AI providers
- [ ] SOC2 controls documented (access, encryption, logging)
- [ ] Incident response runbook reviewed
- [ ] Vulnerability disclosure policy published

### Monitoring
- [ ] Failed login alerts configured
- [ ] Unauthorized access alerts configured
- [ ] TLS cert expiry alerts (30 days)
- [ ] Dependency scan in CI/CD
- [ ] Log retention policies enforced
- [ ] Quarterly access reviews scheduled

---

## Open Questions & Decisions

1. **MFA Enforcement:** Require MFA for all users or only admins/enterprise? (SOC2 prefers all)
2. **Regional Isolation:** Hard boundaries between EU/US data or allow cross-region backup? (GDPR impacts)
3. **AI Chat Retention:** Should chat logs be fully anonymized (strip `userId`) or kept for debugging? (Privacy vs observability tradeoff)
4. **API Key Rotation:** Auto-rotate every 90 days or allow manual extension for CI/CD keys? (Security vs ops burden)
5. **Penetration Testing Frequency:** Annual (SOC2 minimum) or quarterly (better security posture)?

---

## References

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **NIST Cybersecurity Framework:** https://www.nist.gov/cyberframework
- **SOC2 Trust Services Criteria:** https://www.aicpa.org/soc
- **GDPR Official Text:** https://gdpr-info.eu/
- **Cloudflare Security Best Practices:** https://developers.cloudflare.com/fundamentals/security/
- **OpenAPI Security Schemes:** https://spec.openapis.org/oas/v3.0.3#security-scheme-object
