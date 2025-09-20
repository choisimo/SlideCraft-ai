# Authentication & Authorization Implementation

## Overview
The Authentication & Authorization service handles user identity management, session control, role-based access control (RBAC), and security policies for the SlideCraft AI platform.

## Service Responsibilities
- User authentication via JWT tokens
- Session management and refresh tokens
- Role-based access control (RBAC) for documents and resources
- OAuth provider integration (Google, Microsoft)
- Account management and profile updates
- Security audit logging and monitoring
- Rate limiting and abuse prevention
- Password policies and account security

## Tech Stack
- **Runtime**: Node.js 20+ with TypeScript
- **Tokens**: JSON Web Tokens (JWT) with RS256 signing
- **Database**: PostgreSQL for user data and sessions
- **Cache**: Redis for token blacklisting and rate limiting
- **OAuth**: Passport.js for social authentication
- **Validation**: Zod for input validation
- **Security**: bcrypt for password hashing, helmet for headers

## Data Model

### Database Schema
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    password_hash VARCHAR(255), -- Nullable for OAuth-only users
    
    -- Account status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Subscription and limits
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    quota_used BIGINT DEFAULT 0,
    quota_limit BIGINT DEFAULT 1073741824, -- 1GB default
    
    -- Security
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    require_password_change BOOLEAN DEFAULT FALSE
);

-- OAuth providers
CREATE TABLE user_oauth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'google', 'microsoft', etc.
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(320),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(provider, provider_user_id),
    UNIQUE(user_id, provider)
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Device/session tracking
    device_info JSONB,
    ip_address INET,
    user_agent TEXT
);

-- JWT token blacklist
CREATE TABLE token_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti VARCHAR(255) NOT NULL UNIQUE, -- JWT ID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reason VARCHAR(100), -- 'logout', 'security', 'expired'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions (for tracking active sessions)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Security audit log
CREATE TABLE security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'password_change', etc.
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_audit_log_user ON security_audit_log(user_id);
CREATE INDEX idx_audit_log_event_time ON security_audit_log(event_type, created_at);
```

### TypeScript Interfaces
```typescript
interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: 'free' | 'pro' | 'enterprise';
  quotaUsed: number;
  quotaLimit: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

interface JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  plan: string;
  roles: string[];
  iat: number;
  exp: number;
  jti: string; // JWT ID for blacklisting
}

interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  deviceInfo?: any;
  ipAddress?: string;
  userAgent?: string;
}
```

## Authentication Service

### JWT Token Management
```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

class TokenService {
  private publicKey: string;
  private privateKey: string;
  
  constructor() {
    this.publicKey = process.env.JWT_PUBLIC_KEY!;
    this.privateKey = process.env.JWT_PRIVATE_KEY!;
  }

  generateAccessToken(user: User): string {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      roles: this.getUserRoles(user),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
      jti: crypto.randomUUID()
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      issuer: 'slidecraft.ai',
      audience: 'slidecraft.ai'
    });
  }

  generateRefreshToken(user: User, deviceInfo?: any): Promise<RefreshToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const refreshToken: RefreshToken = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      deviceInfo
    };

    return refreshToken;
  }

  async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      const payload = jwt.verify(token, this.publicKey, {
        algorithm: 'RS256',
        issuer: 'slidecraft.ai',
        audience: 'slidecraft.ai'
      }) as JWTPayload;

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        return null;
      }

      return payload;
    } catch (error) {
      logger.warn('token_verification_failed', {
        error: error.message,
        token: token.substring(0, 20) + '...'
      });
      return null;
    }
  }

  async blacklistToken(jti: string, userId: string, reason: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours buffer
    
    await this.db.createTokenBlacklist({
      tokenJti: jti,
      userId,
      expiresAt,
      reason
    });

    // Also cache in Redis for faster lookup
    await this.redis.setex(`blacklist:${jti}`, 24 * 60 * 60, '1');
  }

  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    // Check Redis cache first
    const cached = await this.redis.get(`blacklist:${jti}`);
    if (cached) return true;

    // Check database
    const blacklisted = await this.db.isTokenBlacklisted(jti);
    if (blacklisted) {
      // Cache the result
      await this.redis.setex(`blacklist:${jti}`, 60 * 60, '1');
      return true;
    }

    return false;
  }

  private getUserRoles(user: User): string[] {
    const roles = ['user'];
    
    if (user.plan === 'pro') {
      roles.push('pro');
    } else if (user.plan === 'enterprise') {
      roles.push('pro', 'enterprise');
    }
    
    // Add admin role based on email or other criteria
    if (this.isAdminUser(user.email)) {
      roles.push('admin');
    }
    
    return roles;
  }
}
```

### Authentication Controller
```typescript
class AuthController {
  constructor(
    private userService: UserService,
    private tokenService: TokenService,
    private auditService: SecurityAuditService
  ) {}

  // POST /auth/login
  async login(req: Request, res: Response) {
    const { email, password, deviceInfo } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    try {
      // Rate limiting check
      const rateLimitKey = `login:${ipAddress}`;
      const attempts = await this.redis.incr(rateLimitKey);
      if (attempts === 1) {
        await this.redis.expire(rateLimitKey, 900); // 15 minutes
      }
      if (attempts > 10) {
        return res.status(429).json({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts'
        });
      }

      // Find user
      const user = await this.userService.findByEmail(email);
      if (!user || user.status !== 'active') {
        await this.auditService.logSecurityEvent({
          eventType: 'login_failed',
          email,
          ipAddress,
          userAgent,
          reason: 'user_not_found'
        });
        
        return res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        });
      }

      // Check account lock
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return res.status(423).json({
          code: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked',
          unlocksAt: user.lockedUntil
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash || '');
      if (!isValidPassword) {
        await this.handleFailedLogin(user, ipAddress, userAgent);
        return res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        });
      }

      // Reset failed attempts on successful login
      await this.userService.resetFailedLoginAttempts(user.id);

      // Generate tokens
      const accessToken = this.tokenService.generateAccessToken(user);
      const refreshToken = await this.tokenService.generateRefreshToken(user, deviceInfo);
      
      // Save refresh token
      await this.userService.saveRefreshToken(refreshToken);

      // Update last login
      await this.userService.updateLastLogin(user.id);

      // Log successful login
      await this.auditService.logSecurityEvent({
        userId: user.id,
        eventType: 'login_success',
        ipAddress,
        userAgent,
        details: { deviceInfo }
      });

      // Clear rate limiting
      await this.redis.del(rateLimitKey);

      res.json({
        accessToken,
        refreshToken: refreshToken.id,
        expiresIn: 900, // 15 minutes
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          avatarUrl: user.avatarUrl
        }
      });

    } catch (error) {
      logger.error('login_error', {
        email,
        error: error.message,
        ipAddress
      });
      
      res.status(500).json({
        code: 'LOGIN_ERROR',
        message: 'Login failed'
      });
    }
  }

  // POST /auth/refresh
  async refreshToken(req: Request, res: Response) {
    const { refreshToken: refreshTokenId } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    try {
      // Find and validate refresh token
      const refreshToken = await this.userService.findRefreshToken(refreshTokenId);
      if (!refreshToken || refreshToken.expiresAt < new Date()) {
        return res.status(401).json({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired'
        });
      }

      // Get user
      const user = await this.userService.findById(refreshToken.userId);
      if (!user || user.status !== 'active') {
        return res.status(401).json({
          code: 'USER_NOT_FOUND',
          message: 'User not found or inactive'
        });
      }

      // Update refresh token last used
      await this.userService.updateRefreshTokenUsage(refreshTokenId, ipAddress, userAgent);

      // Generate new access token
      const accessToken = this.tokenService.generateAccessToken(user);

      res.json({
        accessToken,
        expiresIn: 900 // 15 minutes
      });

    } catch (error) {
      logger.error('refresh_token_error', {
        refreshTokenId,
        error: error.message,
        ipAddress
      });
      
      res.status(500).json({
        code: 'REFRESH_ERROR',
        message: 'Token refresh failed'
      });
    }
  }

  // POST /auth/logout
  async logout(req: Request, res: Response) {
    const { refreshToken: refreshTokenId } = req.body;
    const accessToken = req.get('Authorization')?.replace('Bearer ', '');
    const userId = req.user.id;

    try {
      // Blacklist access token
      if (accessToken) {
        const payload = jwt.decode(accessToken) as JWTPayload;
        if (payload?.jti) {
          await this.tokenService.blacklistToken(payload.jti, userId, 'logout');
        }
      }

      // Delete refresh token
      if (refreshTokenId) {
        await this.userService.deleteRefreshToken(refreshTokenId);
      }

      // Log logout
      await this.auditService.logSecurityEvent({
        userId,
        eventType: 'logout',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({ message: 'Logged out successfully' });

    } catch (error) {
      logger.error('logout_error', {
        userId,
        error: error.message
      });
      
      res.status(500).json({
        code: 'LOGOUT_ERROR',
        message: 'Logout failed'
      });
    }
  }

  private async handleFailedLogin(user: User, ipAddress: string, userAgent: string) {
    const newFailedAttempts = user.failedLoginAttempts + 1;
    
    // Lock account after 5 failed attempts
    let lockedUntil: Date | undefined;
    if (newFailedAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    await this.userService.updateFailedLoginAttempts(user.id, newFailedAttempts, lockedUntil);

    await this.auditService.logSecurityEvent({
      userId: user.id,
      eventType: 'login_failed',
      ipAddress,
      userAgent,
      details: {
        failedAttempts: newFailedAttempts,
        accountLocked: !!lockedUntil
      }
    });
  }
}
```

## OAuth Integration

### Google OAuth Provider
```typescript
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

class OAuthService {
  constructor(private userService: UserService) {
    this.setupGoogleStrategy();
    this.setupMicrosoftStrategy();
  }

  private setupGoogleStrategy() {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: '/auth/google/callback'
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await this.handleOAuthLogin('google', {
          providerUserId: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
          refreshToken
        });
        
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));
  }

  private async handleOAuthLogin(provider: string, profileData: any): Promise<User> {
    // Check if OAuth connection exists
    let oauthProvider = await this.userService.findOAuthProvider(provider, profileData.providerUserId);
    
    if (oauthProvider) {
      // Update tokens
      await this.userService.updateOAuthTokens(oauthProvider.id, {
        accessToken: profileData.accessToken,
        refreshToken: profileData.refreshToken,
        expiresAt: profileData.expiresAt
      });
      
      return this.userService.findById(oauthProvider.userId);
    }

    // Check if user exists by email
    let user = await this.userService.findByEmail(profileData.email);
    
    if (!user) {
      // Create new user
      user = await this.userService.createUser({
        email: profileData.email,
        name: profileData.name,
        avatarUrl: profileData.avatarUrl,
        emailVerified: true, // OAuth emails are pre-verified
        status: 'active'
      });
    }

    // Link OAuth provider
    await this.userService.createOAuthProvider({
      userId: user.id,
      provider,
      providerUserId: profileData.providerUserId,
      providerEmail: profileData.email,
      accessToken: profileData.accessToken,
      refreshToken: profileData.refreshToken,
      expiresAt: profileData.expiresAt
    });

    return user;
  }
}
```

## Authorization Middleware

### JWT Authentication Middleware
```typescript
class AuthMiddleware {
  constructor(private tokenService: TokenService) {}

  authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.get('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required'
      });
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    
    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      
      if (!payload) {
        return res.status(401).json({
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        });
      }

      // Attach user info to request
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        plan: payload.plan,
        roles: payload.roles
      };

      next();
    } catch (error) {
      logger.warn('auth_middleware_error', {
        error: error.message,
        token: token.substring(0, 20) + '...'
      });
      
      res.status(401).json({
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      });
    }
  };

  requireRoles = (requiredRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          code: 'AUTH_REQUIRED',
          message: 'Authentication required'
        });
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        return res.status(403).json({
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions'
        });
      }

      next();
    };
  };

  requirePlan = (requiredPlans: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          code: 'AUTH_REQUIRED',
          message: 'Authentication required'
        });
      }

      if (!requiredPlans.includes(req.user.plan)) {
        return res.status(403).json({
          code: 'PLAN_UPGRADE_REQUIRED',
          message: 'Plan upgrade required',
          requiredPlans
        });
      }

      next();
    };
  };
}
```

## Rate Limiting

### Rate Limiter Implementation
```typescript
class RateLimiter {
  constructor(private redis: RedisClient) {}

  async checkLimit(identifier: string, windowMs: number = 60000, maxRequests: number = 60): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const windowKey = `${key}:${window}`;

    // Sliding window counter
    const pipeline = this.redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.expire(windowKey, Math.ceil(windowMs / 1000));
    
    const results = await pipeline.exec();
    const count = results?.[0]?.[1] as number || 0;

    const isAllowed = count <= maxRequests;
    const resetTime = new Date((window + 1) * windowMs);

    return {
      allowed: isAllowed,
      count,
      remaining: Math.max(0, maxRequests - count),
      resetTime,
      retryAfter: isAllowed ? 0 : Math.ceil((resetTime.getTime() - now) / 1000)
    };
  }

  rateLimitMiddleware = (windowMs: number = 60000, maxRequests: number = 60) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const identifier = req.user?.id || req.ip;
      
      const result = await this.checkLimit(identifier, windowMs, maxRequests);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toISOString(),
      });

      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter.toString());
        return res.status(429).json({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          retryAfter: result.retryAfter
        });
      }

      next();
    };
  };
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('AuthController', () => {
  let controller: AuthController;
  let mockUserService: jest.Mocked<UserService>;
  let mockTokenService: jest.Mocked<TokenService>;

  beforeEach(() => {
    mockUserService = createMockUserService();
    mockTokenService = createMockTokenService();
    controller = new AuthController(mockUserService, mockTokenService);
  });

  describe('login', () => {
    it('should authenticate user with valid credentials', async () => {
      const req = createMockRequest({
        body: { email: 'user@example.com', password: 'password123' },
        ip: '127.0.0.1'
      });
      const res = createMockResponse();

      const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
        passwordHash: await bcrypt.hash('password123', 10),
        status: 'active'
      };

      mockUserService.findByEmail.mockResolvedValue(mockUser);
      mockTokenService.generateAccessToken.mockReturnValue('access-token');
      mockTokenService.generateRefreshToken.mockResolvedValue({
        id: 'refresh-123',
        userId: 'user-123'
      });

      await controller.login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-123'
        })
      );
    });

    it('should reject invalid credentials', async () => {
      const req = createMockRequest({
        body: { email: 'user@example.com', password: 'wrongpassword' }
      });
      const res = createMockResponse();

      mockUserService.findByEmail.mockResolvedValue(null);

      await controller.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_CREDENTIALS'
        })
      );
    });
  });
});
```

## Security Measures

### Password Security
```typescript
class PasswordService {
  private readonly saltRounds = 12;
  private readonly minLength = 8;
  private readonly maxLength = 128;

  async hashPassword(password: string): Promise<string> {
    this.validatePassword(password);
    return bcrypt.hash(password, this.saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  validatePassword(password: string): void {
    if (password.length < this.minLength || password.length > this.maxLength) {
      throw new Error(`Password must be between ${this.minLength} and ${this.maxLength} characters`);
    }

    // Check for required character types
    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const score = [hasLowerCase, hasUpperCase, hasNumbers, hasSpecialChars].filter(Boolean).length;
    
    if (score < 3) {
      throw new Error('Password must contain at least 3 of: lowercase, uppercase, numbers, special characters');
    }

    // Check against common passwords
    if (this.isCommonPassword(password)) {
      throw new Error('Password is too common');
    }
  }

  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password', 'password123', '123456', 'qwerty', 'abc123',
      'letmein', 'welcome', 'admin', 'login', 'password1'
    ];
    
    return commonPasswords.includes(password.toLowerCase());
  }
}
```

## Deployment Configuration

### Environment Variables
```bash
# JWT Configuration
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ISSUER=slidecraft.ai
JWT_AUDIENCE=slidecraft.ai

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# Security Settings
BCRYPT_SALT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCK_DURATION_MINUTES=30
PASSWORD_MIN_LENGTH=8

# Rate Limiting
AUTH_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
AUTH_RATE_LIMIT_MAX_REQUESTS=10
API_RATE_LIMIT_WINDOW_MS=60000    # 1 minute
API_RATE_LIMIT_MAX_REQUESTS=60

# Session Management
ACCESS_TOKEN_EXPIRY_MINUTES=15
REFRESH_TOKEN_EXPIRY_DAYS=30
```

## Future Enhancements

### Planned Features
- **Multi-Factor Authentication**: TOTP, SMS, email verification
- **Single Sign-On (SSO)**: SAML, OpenID Connect for enterprise
- **Advanced Session Management**: Device management, concurrent session limits
- **Risk-Based Authentication**: IP geolocation, device fingerprinting
- **Advanced Audit Logging**: Detailed security events, compliance reporting
- **Account Recovery**: Secure password reset, account verification flows
- **API Key Management**: Service-to-service authentication
- **Role-Based Permissions**: Granular permissions system for enterprise features