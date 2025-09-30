# Authentication, Authorization & RBAC Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2025-09-30

---

## Overview

This document defines authentication flows, user lifecycle management, role-based access control (RBAC), permission enforcement mechanisms, and session management for SlideCraft-ai. All flows align with OAuth 2.0, OpenID Connect standards, and the security controls defined in `security-compliance.md`.

---

## Authentication Flows

### User Registration

#### Email/Password Registration (Self-Hosted Auth)

**Endpoint:** `POST /api/v1/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123",
  "name": "John Doe",
  "agreeToTerms": true
}
```

**Validation:**
- Email: RFC 5322 format, not already registered
- Password: 12+ chars, 3 of: uppercase/lowercase/digit/special
- Breach check: Query Have I Been Pwned API (reject if compromised)
- Terms: Must be `true` (GDPR consent requirement)

**Process:**
1. Validate input (400 Bad Request if invalid)
2. Hash password with Argon2id (time=3, memory=64MB, parallelism=4)
3. Create user record:
   ```sql
   INSERT INTO users (id, email, password_hash, name, tier, created_at)
   VALUES ('user_01H8XYZ...', 'user@example.com', '$argon2id$v=19$m=65536...', 'John Doe', 'free', NOW());
   ```
4. Send verification email with magic link:
   ```
   https://app.slidecraft.ai/verify-email?token=eyJhbGci...
   ```
   (JWT with `{ email, exp: 24h }`, signed with verification secret)
5. Return 201 Created:
   ```json
   {
     "userId": "user_01H8XYZ...",
     "message": "Verification email sent to user@example.com"
   }
   ```

**Email Verification:**
- **Endpoint:** `POST /api/v1/auth/verify-email`
- **Token validation:** Verify JWT signature, check expiry, confirm email not already verified
- **Action:** Update `users.email_verified = true`, auto-login (return access/refresh tokens)

#### OAuth 2.0 / OpenID Connect (Social Login)

**Supported Providers:**
- Google Workspace (via Google OAuth 2.0)
- Microsoft Azure AD (via Microsoft Identity Platform)
- GitHub (via GitHub OAuth Apps)

**Flow:** Authorization Code with PKCE

**Step 1: Initiate Authorization**
```http
GET /api/v1/auth/oauth/google
```

**Response:** Redirect to Google
```http
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/v2/auth?
  client_id=123456.apps.googleusercontent.com&
  redirect_uri=https://app.slidecraft.ai/auth/callback&
  response_type=code&
  scope=openid%20email%20profile&
  state=abc123...&
  code_challenge=xyz789...&
  code_challenge_method=S256
```

**State Parameter:**
- Cryptographically random (32 bytes, base64)
- Stored in Redis: `oauth_state:{state}` → `{ provider: "google", redirectUrl: "/dashboard" }` (10min TTL)

**Step 2: Handle Callback**
```http
GET /auth/callback?code=4/0AY0e...&state=abc123...
```

**Process:**
1. Validate state (fetch from Redis, ensure match)
2. Exchange authorization code for tokens:
   ```http
   POST https://oauth2.googleapis.com/token
   Content-Type: application/x-www-form-urlencoded
   
   code=4/0AY0e...&
   client_id=123456.apps.googleusercontent.com&
   client_secret=GOCSPX-...&
   redirect_uri=https://app.slidecraft.ai/auth/callback&
   grant_type=authorization_code&
   code_verifier=original_verifier
   ```
3. Validate ID token (verify Google's RS256 signature via JWKS)
4. Extract claims:
   ```json
   {
     "sub": "1234567890",           // Google user ID
     "email": "user@example.com",
     "email_verified": true,
     "name": "John Doe",
     "picture": "https://lh3.googleusercontent.com/..."
   }
   ```
5. Find or create user:
   ```sql
   -- Check if user exists
   SELECT * FROM users WHERE email = 'user@example.com';
   
   -- If not, create with OAuth metadata
   INSERT INTO users (id, email, name, avatar_url, oauth_provider, oauth_sub, email_verified, tier)
   VALUES ('user_01H8XYZ...', 'user@example.com', 'John Doe', 'https://lh3...', 'google', '1234567890', true, 'free');
   ```
6. Issue internal JWT tokens (access + refresh)
7. Redirect to app with tokens:
   ```http
   HTTP/1.1 302 Found
   Location: https://app.slidecraft.ai/dashboard
   Set-Cookie: refresh_token=eyJhbGci...; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
   ```

### User Login

#### Email/Password Login

**Endpoint:** `POST /api/v1/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123"
}
```

**Process:**
1. Fetch user by email (case-insensitive):
   ```sql
   SELECT * FROM users WHERE LOWER(email) = LOWER('user@example.com');
   ```
2. Verify password:
   ```typescript
   const valid = await argon2.verify(user.password_hash, password);
   if (!valid) {
     await logFailedLogin(email, req.ip, "invalid_password");
     throw new Error("Invalid credentials");
   }
   ```
3. Check email verification:
   ```typescript
   if (!user.email_verified) {
     throw new Error("Email not verified. Check your inbox.");
   }
   ```
4. Generate JWT tokens:
   ```typescript
   const accessToken = jwt.sign(
     { sub: user.id, email: user.email, roles: ["user"], tier: user.tier },
     RS256_PRIVATE_KEY,
     { expiresIn: "15m", audience: "slidecraft-api", issuer: "https://auth.slidecraft.ai" }
   );
   
   const refreshToken = jwt.sign(
     { sub: user.id, type: "refresh" },
     RS256_PRIVATE_KEY,
     { expiresIn: "7d" }
   );
   ```
5. Store refresh token:
   ```typescript
   await redis.setex(`refresh_token:${user.id}:${tokenId}`, 7 * 24 * 60 * 60, refreshToken);
   ```
6. Return tokens:
   ```json
   {
     "accessToken": "eyJhbGci...",
     "expiresIn": 900,
     "tokenType": "Bearer"
   }
   ```
   (Refresh token set in HTTP-only cookie)

7. Audit log:
   ```json
   {
     "eventType": "auth.login_success",
     "userId": "user_01H8XYZ...",
     "ip": "203.0.113.45",
     "userAgent": "Mozilla/5.0...",
     "timestamp": "2025-09-30T14:32:10Z"
   }
   ```

#### Token Refresh

**Endpoint:** `POST /api/v1/auth/refresh`

**Request:**
```http
POST /api/v1/auth/refresh
Cookie: refresh_token=eyJhbGci...
```

**Process:**
1. Extract refresh token from cookie
2. Validate JWT (signature, expiry)
3. Check if token exists in Redis:
   ```typescript
   const exists = await redis.get(`refresh_token:${userId}:${tokenId}`);
   if (!exists) {
     throw new Error("Invalid or revoked refresh token");
   }
   ```
4. Issue new access token (same claims as original)
5. Optionally rotate refresh token (if >3 days old):
   ```typescript
   if (isOlderThan(refreshToken, 3, "days")) {
     const newRefreshToken = generateRefreshToken(userId);
     await redis.del(`refresh_token:${userId}:${oldTokenId}`);
     await redis.setex(`refresh_token:${userId}:${newTokenId}`, 7 * 24 * 60 * 60, newRefreshToken);
     return { accessToken, refreshToken: newRefreshToken };
   }
   ```

### API Key Authentication

#### API Key Creation

**Endpoint:** `POST /api/v1/auth/api-keys`

**Request:**
```json
{
  "name": "CI/CD Pipeline",
  "scopes": ["convert:create", "export:download"],
  "expiresIn": 90  // days (optional, default 90)
}
```

**Process:**
1. Validate user is authenticated (require JWT)
2. Generate API key:
   ```typescript
   const keyId = generateId("key");
   const secret = crypto.randomBytes(32).toString("base64url");
   const apiKey = `sk_live_${secret}`;
   ```
3. Hash key with Argon2id:
   ```typescript
   const keyHash = await argon2.hash(apiKey, {
     type: argon2.argon2id,
     memoryCost: 65536,  // 64MB
     timeCost: 3,
     parallelism: 4
   });
   ```
4. Store in database:
   ```sql
   INSERT INTO api_keys (id, user_id, name, key_hash, scopes, expires_at, created_at)
   VALUES ('key_01H9JKL...', 'user_01H8XYZ...', 'CI/CD Pipeline', '$argon2id$v=19...', 
           '["convert:create","export:download"]', NOW() + INTERVAL '90 days', NOW());
   ```
5. Return key (shown once):
   ```json
   {
     "keyId": "key_01H9JKL...",
     "apiKey": "sk_live_abc123...",
     "name": "CI/CD Pipeline",
     "scopes": ["convert:create", "export:download"],
     "expiresAt": "2025-12-29T14:32:10Z",
     "message": "Save this key securely. It will not be shown again."
   }
   ```

#### API Key Usage

**Request:**
```http
POST /api/v1/convert
X-API-Key: sk_live_abc123...
Content-Type: application/json

{ "objectKey": "uploads/file.pptx", "sourceType": "pptx" }
```

**Authentication:**
```typescript
async function authenticateApiKey(req) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) throw new Error("Missing API key");
  
  // Validate format
  if (!apiKey.startsWith("sk_live_") && !apiKey.startsWith("sk_test_")) {
    throw new Error("Invalid API key format");
  }
  
  // Fetch all active keys (cached for 5min)
  const keys = await db.query.apiKeys.findMany({
    where: { expires_at: gt(new Date()) }
  });
  
  // Verify hash
  for (const key of keys) {
    const valid = await argon2.verify(key.key_hash, apiKey);
    if (valid) {
      // Check scopes
      const requiredScope = `${req.method}:${req.path}`;  // e.g., "convert:create"
      if (!key.scopes.includes(requiredScope)) {
        throw new Error(`API key lacks required scope: ${requiredScope}`);
      }
      
      // Attach user context
      req.user = await db.query.users.findFirst({ where: { id: key.user_id } });
      req.authMethod = "api_key";
      return;
    }
  }
  
  throw new Error("Invalid API key");
}
```

### Multi-Factor Authentication (MFA)

#### MFA Enrollment

**Endpoint:** `POST /api/v1/auth/mfa/enroll`

**Request:**
```json
{
  "method": "totp"  // Time-based One-Time Password (authenticator apps)
}
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "backupCodes": [
    "abc123def", "ghi456jkl", "mno789pqr", "stu012vwx", "yz345abc"
  ]
}
```

**Process:**
1. Generate TOTP secret (base32, 20 bytes)
2. Create QR code (otpauth://totp/SlideCraft:user@example.com?secret=...)
3. Generate 5 backup codes (8 chars each, store hashed)
4. Store in database:
   ```sql
   INSERT INTO user_mfa (user_id, method, secret_encrypted, backup_codes_hash, enabled)
   VALUES ('user_01H8XYZ...', 'totp', encrypt('JBSWY3DPEHPK3PXP'), '$argon2id$...', false);
   ```
5. User scans QR code with Google Authenticator / Authy
6. Verify with code to enable (see next section)

#### MFA Verification (Enrollment Confirmation)

**Endpoint:** `POST /api/v1/auth/mfa/verify`

**Request:**
```json
{
  "code": "123456"  // 6-digit TOTP code
}
```

**Process:**
1. Fetch MFA settings:
   ```sql
   SELECT * FROM user_mfa WHERE user_id = 'user_01H8XYZ...' AND enabled = false;
   ```
2. Decrypt secret and verify TOTP:
   ```typescript
   import { authenticator } from "otplib";
   const valid = authenticator.verify({ token: code, secret: decrypted_secret });
   ```
3. If valid, enable MFA:
   ```sql
   UPDATE user_mfa SET enabled = true WHERE user_id = 'user_01H8XYZ...';
   ```
4. Return success:
   ```json
   {
     "success": true,
     "message": "MFA enabled successfully"
   }
   ```

#### MFA Challenge (During Login)

**Flow:**
1. User submits email/password
2. If MFA enabled, return challenge:
   ```json
   {
     "mfaRequired": true,
     "challengeToken": "eyJhbGci..."  // Temporary JWT (valid 5min)
   }
   ```
3. Client prompts for MFA code
4. Submit code with challenge token:
   ```http
   POST /api/v1/auth/mfa/challenge
   
   {
     "challengeToken": "eyJhbGci...",
     "code": "123456"
   }
   ```
5. Verify code (same logic as enrollment verification)
6. If valid, return access/refresh tokens (complete login)

---

## Authorization & RBAC

### Role Definitions

#### System Roles

**user (Default)**
- Can create documents (via conversion)
- Can edit own documents
- Can invite collaborators to own documents
- Can export documents (own or shared)
- Can use AI chat on documents with edit access

**admin (Super User)**
- All `user` permissions
- Can view all documents (for support/moderation)
- Can delete any document (with audit trail)
- Can manage users (suspend, delete, change tier)
- Can view system metrics (Grafana dashboards)

**service (System Account)**
- API-only role (for workers, internal services)
- Can update job status
- Can write to object storage
- Cannot access user data directly

#### Document-Level Roles (Collaboration)

**owner**
- Full control over document
- Can edit content
- Can manage collaborators (add/remove, change roles)
- Can delete document
- Can transfer ownership

**editor**
- Can edit document content
- Can use AI chat
- Can export document
- Can add comments
- Cannot manage collaborators
- Cannot delete document

**viewer**
- Read-only access to document
- Can export as PDF (read-only format)
- Can add comments (if enabled)
- Cannot edit content
- Cannot use AI chat (to prevent cost abuse)

### Permission Matrix

#### API Endpoint Permissions

| Endpoint                     | user | admin | service | owner | editor | viewer |
|------------------------------|------|-------|---------|-------|--------|--------|
| `POST /auth/register`        | ✅    | ✅     | ❌       | N/A   | N/A    | N/A    |
| `POST /auth/login`           | ✅    | ✅     | ❌       | N/A   | N/A    | N/A    |
| `POST /uploads/init`         | ✅    | ✅     | ❌       | N/A   | N/A    | N/A    |
| `POST /convert`              | ✅    | ✅     | ❌       | N/A   | N/A    | N/A    |
| `GET /jobs/{id}`             | ✅¹   | ✅     | ✅       | N/A   | N/A    | N/A    |
| `POST /documents`            | ✅    | ✅     | ✅       | N/A   | N/A    | N/A    |
| `GET /documents/{id}`        | ❌    | ✅     | ❌       | ✅     | ✅      | ✅      |
| `PATCH /documents/{id}`      | ❌    | ✅     | ❌       | ✅     | ✅      | ❌      |
| `DELETE /documents/{id}`     | ❌    | ✅     | ❌       | ✅     | ❌      | ❌      |
| `POST /export`               | ❌    | ✅     | ❌       | ✅     | ✅      | ✅²     |
| `GET /exports/{id}/download` | ❌    | ✅     | ❌       | ✅     | ✅      | ✅      |
| `POST /ai/chat`              | ❌    | ✅     | ❌       | ✅     | ✅      | ❌      |
| `POST /documents/{id}/share` | ❌    | ✅     | ❌       | ✅     | ❌      | ❌      |
| `DELETE /users/{id}`         | ❌    | ✅     | ❌       | N/A   | N/A    | N/A    |

**Footnotes:**
- ¹ Only if job belongs to user
- ² Viewers can only export as PDF (enforced in export worker)

#### Resource-Level Permissions

**Documents:**
```typescript
async function canAccessDocument(userId: string, documentId: string, action: "read" | "write" | "delete") {
  // Check ownership
  const doc = await db.query.documents.findFirst({ where: { id: documentId } });
  if (doc.ownerId === userId) return true;
  
  // Check collaboration
  const collab = await db.query.documentCollaborators.findFirst({
    where: { documentId, userId }
  });
  
  if (!collab) return false;
  
  // Role-based permission check
  if (action === "read") return ["owner", "editor", "viewer"].includes(collab.role);
  if (action === "write") return ["owner", "editor"].includes(collab.role);
  if (action === "delete") return collab.role === "owner";
  
  return false;
}
```

**Jobs:**
```typescript
async function canAccessJob(userId: string, jobId: string) {
  const job = await db.query.jobs.findFirst({ where: { id: jobId } });
  
  // Job owner can access
  if (job.userId === userId) return true;
  
  // If job creates document, check document access
  if (job.result?.documentId) {
    return canAccessDocument(userId, job.result.documentId, "read");
  }
  
  return false;
}
```

### Enforcement Mechanisms

#### Gateway Middleware

**JWT Validation Middleware:**
```typescript
async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, RS256_PUBLIC_KEY, {
      audience: "slidecraft-api",
      issuer: "https://auth.slidecraft.ai"
    });
    
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      roles: decoded.roles || ["user"],
      tier: decoded.tier
    };
    
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", code: "token_expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

**Role Check Middleware:**
```typescript
function requireRole(role: string) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: `Requires role: ${role}` 
      });
    }
    
    next();
  };
}

// Usage
app.delete("/users/:id", authenticateJWT, requireRole("admin"), deleteUserHandler);
```

**Resource Access Middleware:**
```typescript
function requireDocumentAccess(action: "read" | "write" | "delete") {
  return async (req, res, next) => {
    const documentId = req.params.id || req.body.documentId;
    
    const canAccess = await canAccessDocument(req.user.id, documentId, action);
    if (!canAccess) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: `Insufficient permissions for action: ${action}` 
      });
    }
    
    next();
  };
}

// Usage
app.patch("/documents/:id", authenticateJWT, requireDocumentAccess("write"), updateDocumentHandler);
```

---

## Session Management

### Session Storage

#### JWT Sessions (Stateless)
- **Access Token:** Stored in client memory (not localStorage to prevent XSS)
- **Refresh Token:** HTTP-only cookie (SameSite=Lax, Secure, 7-day expiry)
- **Session ID:** Embedded in JWT claims (`jti` - JWT ID)

#### Redis Session Store (Supplemental)
- **Purpose:** Track active sessions for admin monitoring + revocation
- **Key:** `session:{userId}:{sessionId}` → `{ accessToken, refreshToken, createdAt, lastActivity, ip, userAgent }`
- **TTL:** Match refresh token expiry (7 days)

### Session Lifecycle

#### Session Creation
```typescript
async function createSession(userId: string, ip: string, userAgent: string) {
  const sessionId = generateId("sess");
  
  const accessToken = jwt.sign({ sub: userId, jti: sessionId, ... }, privateKey, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ sub: userId, type: "refresh", jti: sessionId }, privateKey, { expiresIn: "7d" });
  
  await redis.setex(
    `session:${userId}:${sessionId}`,
    7 * 24 * 60 * 60,
    JSON.stringify({ accessToken, refreshToken, createdAt: Date.now(), ip, userAgent })
  );
  
  return { accessToken, refreshToken, sessionId };
}
```

#### Session Revocation (Logout)

**Endpoint:** `POST /api/v1/auth/logout`

**Single Session Logout:**
```typescript
async function logout(req) {
  const { jti: sessionId } = jwt.decode(req.accessToken);
  
  // Delete session from Redis
  await redis.del(`session:${req.user.id}:${sessionId}`);
  
  // Invalidate refresh token
  await redis.del(`refresh_token:${req.user.id}:${sessionId}`);
  
  // Audit log
  await logEvent({
    eventType: "auth.logout",
    userId: req.user.id,
    sessionId,
    timestamp: new Date()
  });
}
```

**Global Logout (All Sessions):**
```typescript
async function logoutAll(req) {
  const sessionKeys = await redis.keys(`session:${req.user.id}:*`);
  const refreshKeys = await redis.keys(`refresh_token:${req.user.id}:*`);
  
  await redis.del(...sessionKeys, ...refreshKeys);
  
  await logEvent({
    eventType: "auth.logout_all",
    userId: req.user.id,
    sessionCount: sessionKeys.length,
    timestamp: new Date()
  });
}
```

#### Session Monitoring

**Endpoint:** `GET /api/v1/auth/sessions`

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "sess_01H9MNO...",
      "createdAt": "2025-09-30T10:00:00Z",
      "lastActivity": "2025-09-30T14:30:00Z",
      "ip": "203.0.113.45",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0.0.0",
      "current": true
    },
    {
      "sessionId": "sess_01H9PQR...",
      "createdAt": "2025-09-29T08:00:00Z",
      "lastActivity": "2025-09-29T18:00:00Z",
      "ip": "198.51.100.10",
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) Safari/604.1",
      "current": false
    }
  ]
}
```

**Revoke Specific Session:**
```http
DELETE /api/v1/auth/sessions/{sessionId}
```

---

## Collaboration & Sharing

### Document Sharing

#### Share Document (Invite Collaborators)

**Endpoint:** `POST /api/v1/documents/{id}/share`

**Request:**
```json
{
  "email": "collaborator@example.com",
  "role": "editor",  // editor | viewer
  "message": "Let's work on this together!"
}
```

**Process:**
1. Verify requester is owner:
   ```typescript
   const doc = await db.query.documents.findFirst({ where: { id: documentId } });
   if (doc.ownerId !== req.user.id) {
     throw new Error("Only document owner can share");
   }
   ```
2. Find or invite user:
   ```typescript
   let invitee = await db.query.users.findFirst({ where: { email } });
   
   if (!invitee) {
     // Send invitation email with signup link
     await sendInvitationEmail(email, doc.title, message);
     
     // Create pending invitation
     await db.insert(documentInvitations).values({
       id: generateId("inv"),
       documentId,
       email,
       role,
       invitedBy: req.user.id,
       status: "pending",
       expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 7 days
     });
     
     return { status: "invited", message: "Invitation sent to collaborator@example.com" };
   }
   ```
3. Add collaborator:
   ```sql
   INSERT INTO document_collaborators (document_id, user_id, role, invited_at)
   VALUES ('doc_01H9ABC...', 'user_01H8STU...', 'editor', NOW())
   ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role;
   ```
4. Notify collaborator (email + in-app notification):
   ```typescript
   await sendCollaborationEmail(invitee.email, doc.title, req.user.name);
   await createNotification({
     userId: invitee.id,
     type: "collaboration_invite",
     title: `${req.user.name} shared "${doc.title}" with you`,
     link: `/documents/${doc.id}`
   });
   ```

#### Accept Invitation (New User Signup)

**Flow:**
1. New user clicks invitation link: `https://app.slidecraft.ai/invitations/{invId}`
2. Prompted to sign up (email pre-filled)
3. After signup, invitation auto-accepted:
   ```typescript
   const invitation = await db.query.documentInvitations.findFirst({ where: { id: invId } });
   
   await db.insert(documentCollaborators).values({
     documentId: invitation.documentId,
     userId: newUser.id,
     role: invitation.role,
     invitedAt: new Date()
   });
   
   await db.update(documentInvitations)
     .set({ status: "accepted" })
     .where({ id: invId });
   ```

#### Change Collaborator Role

**Endpoint:** `PATCH /api/v1/documents/{id}/collaborators/{userId}`

**Request:**
```json
{
  "role": "viewer"  // Downgrade from editor to viewer
}
```

**Validation:**
- Only owner can change roles
- Cannot change owner's role
- Cannot change own role (self-demotion prevention)

#### Remove Collaborator

**Endpoint:** `DELETE /api/v1/documents/{id}/collaborators/{userId}`

**Process:**
```sql
DELETE FROM document_collaborators 
WHERE document_id = 'doc_01H9ABC...' AND user_id = 'user_01H8STU...';
```

**Notification:**
```typescript
await createNotification({
  userId: removedUserId,
  type: "collaboration_removed",
  title: `You no longer have access to "${doc.title}"`,
  link: null
});
```

### Public Sharing (Future)

**Use Case:** Share presentation publicly (view-only link)

**Endpoint:** `POST /api/v1/documents/{id}/public-link`

**Request:**
```json
{
  "enabled": true,
  "password": "optional-password",
  "expiresAt": "2025-12-31T23:59:59Z"  // Optional expiry
}
```

**Response:**
```json
{
  "publicUrl": "https://app.slidecraft.ai/p/abc123def456",
  "password": "optional-password",
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Access Control:**
```typescript
app.get("/p/:shareId", async (req, res) => {
  const share = await db.query.publicShares.findFirst({ 
    where: { id: req.params.shareId } 
  });
  
  if (!share || (share.expiresAt && share.expiresAt < new Date())) {
    return res.status(404).json({ error: "Link expired or not found" });
  }
  
  if (share.password) {
    const submittedPassword = req.query.password || req.body.password;
    if (submittedPassword !== share.password) {
      return res.status(401).json({ error: "Password required" });
    }
  }
  
  const doc = await db.query.documents.findFirst({ where: { id: share.documentId } });
  res.json({ document: doc, accessMode: "public_readonly" });
});
```

---

## User Lifecycle Management

### Account Suspension (Admin Action)

**Endpoint:** `POST /api/v1/admin/users/{id}/suspend`

**Request:**
```json
{
  "reason": "Terms of Service violation",
  "duration": 30  // days (null = indefinite)
}
```

**Process:**
1. Update user status:
   ```sql
   UPDATE users SET 
     status = 'suspended',
     suspended_until = NOW() + INTERVAL '30 days',
     suspension_reason = 'Terms of Service violation'
   WHERE id = 'user_01H8XYZ...';
   ```
2. Revoke all sessions:
   ```typescript
   await logoutAll({ user: { id: userId } });
   ```
3. Block API access (middleware check):
   ```typescript
   if (req.user.status === "suspended") {
     return res.status(403).json({ 
       error: "Account suspended", 
       reason: req.user.suspensionReason,
       until: req.user.suspendedUntil 
     });
   }
   ```

### Account Deletion (GDPR Right to Erasure)

**Endpoint:** `DELETE /api/v1/users/me`

**Request:**
```json
{
  "confirm": true,
  "password": "SecureP@ssw0rd123"  // Re-authentication
}
```

**Process (Soft Delete):**
1. Verify password
2. Mark for deletion:
   ```sql
   UPDATE users SET 
     deleted_at = NOW(),
     deletion_scheduled_for = NOW() + INTERVAL '30 days'
   WHERE id = 'user_01H8XYZ...';
   ```
3. Anonymize data:
   ```sql
   UPDATE users SET 
     email = 'deleted_user_01H8XYZ@deleted.local',
     name = 'Deleted User',
     password_hash = NULL,
     oauth_provider = NULL
   WHERE id = 'user_01H8XYZ...';
   ```
4. Transfer documents:
   ```typescript
   // Option 1: Delete all owned documents (if no collaborators)
   await db.delete(documents).where({ ownerId: userId });
   
   // Option 2: Transfer to first collaborator (if any)
   for (const doc of userDocs) {
     const firstCollab = await db.query.documentCollaborators.findFirst({
       where: { documentId: doc.id, role: "editor" }
     });
     if (firstCollab) {
       await db.update(documents)
         .set({ ownerId: firstCollab.userId })
         .where({ id: doc.id });
     } else {
       await db.delete(documents).where({ id: doc.id });
     }
   }
   ```
5. Schedule hard delete (background job after 30 days):
   ```typescript
   // Cron job: daily at 2am
   const usersToDelete = await db.query.users.findMany({
     where: { deletionScheduledFor: lte(new Date()) }
   });
   
   for (const user of usersToDelete) {
     await db.delete(users).where({ id: user.id });  // Cascade deletes sessions, API keys
     logger.info(`Hard deleted user ${user.id}`);
   }
   ```

---

## Security Considerations

### Brute-Force Protection

**Rate Limiting (Login Endpoint):**
- **Per IP:** Max 10 failed attempts per 15min → 429 Too Many Requests
- **Per Email:** Max 5 failed attempts per 15min → Temporary account lock (send unlock email)

**Implementation:**
```typescript
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({ 
      error: "Too many login attempts. Try again in 15 minutes." 
    });
  }
});

app.post("/auth/login", loginRateLimiter, loginHandler);
```

### Account Takeover Prevention

**Password Reset Flow:**
1. Request reset: `POST /auth/password-reset`
   - Send email with magic link (valid 1 hour)
   - No indication if email exists (prevent user enumeration)
2. Click link: `GET /auth/password-reset/{token}`
   - Validate token (JWT with `{ email, exp: 1h }`)
   - Show password reset form
3. Set new password: `POST /auth/password-reset/{token}`
   - Validate token again (prevent replay)
   - Update password (hash with Argon2id)
   - Invalidate all sessions (force re-login)

**Email Change Flow:**
1. Request change: `POST /auth/email/change`
   - Require current password (re-authentication)
   - Send verification email to **new** address
2. Verify new email: `POST /auth/email/verify`
   - Update email in database
   - Send notification to **old** email (alert if unauthorized)

---

## Testing Strategy

### Authentication Tests

```typescript
describe("User Registration", () => {
  it("creates user with valid input", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com", password: "SecureP@ss123", name: "Test User", agreeToTerms: true });
    
    expect(res.status).toBe(201);
    expect(res.body.userId).toMatch(/^user_[a-zA-Z0-9]{10,}$/);
  });
  
  it("rejects weak password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com", password: "weak", agreeToTerms: true });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Password must be at least 12 characters");
  });
});

describe("JWT Authentication", () => {
  it("returns 401 for missing token", async () => {
    const res = await request(app).get("/documents/doc_123");
    expect(res.status).toBe(401);
  });
  
  it("returns 401 for expired token", async () => {
    const expiredToken = jwt.sign({ sub: "user_123" }, privateKey, { expiresIn: "-1h" });
    
    const res = await request(app)
      .get("/documents/doc_123")
      .set("Authorization", `Bearer ${expiredToken}`);
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("token_expired");
  });
});
```

### Authorization Tests

```typescript
describe("Document Access Control", () => {
  it("allows owner to delete document", async () => {
    const owner = await createTestUser();
    const doc = await createTestDocument(owner.id);
    
    const res = await request(app)
      .delete(`/documents/${doc.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    
    expect(res.status).toBe(204);
  });
  
  it("forbids editor from deleting document", async () => {
    const owner = await createTestUser();
    const editor = await createTestUser();
    const doc = await createTestDocument(owner.id);
    
    await addCollaborator(doc.id, editor.id, "editor");
    
    const res = await request(app)
      .delete(`/documents/${doc.id}`)
      .set("Authorization", `Bearer ${editor.token}`);
    
    expect(res.status).toBe(403);
  });
});
```

---

## Open Questions & Decisions

1. **Session Timeout:** Should access tokens expire after 15min (high security) or 1hr (better UX)? (Balance security vs convenience)
2. **MFA Enforcement:** Require MFA for all users or only admins/enterprise tier? (SOC2 compliance vs adoption friction)
3. **API Key Scopes:** Granular scopes (`convert:create`, `export:download`) or broad roles (`read`, `write`)? (Flexibility vs simplicity)
4. **Collaboration Limits:** Max collaborators per document (10 for free, 50 for pro, unlimited for enterprise)? (Cost control vs usability)
5. **Password Reset Rate Limit:** Allow 3 reset emails per day per email or stricter? (Prevent abuse vs legitimate forgotten passwords)

---

## References

- **OAuth 2.0 RFC 6749:** https://datatracker.ietf.org/doc/html/rfc6749
- **OpenID Connect Core:** https://openid.net/specs/openid-connect-core-1_0.html
- **JWT Best Practices:** https://datatracker.ietf.org/doc/html/rfc8725
- **OWASP Authentication Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- **Argon2 Spec:** https://github.com/P-H-C/phc-winner-argon2
- **TOTP RFC 6238:** https://datatracker.ietf.org/doc/html/rfc6238
