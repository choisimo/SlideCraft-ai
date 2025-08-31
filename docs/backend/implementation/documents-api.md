# Documents API Implementation

## Overview
The Documents API manages the lifecycle of presentation documents, providing CRUD operations, version control, collaborative features, and integration with the conversion and export pipeline.

## Service Responsibilities
- Document creation from conversion jobs
- Document retrieval and metadata management
- Permission-based access control (RBAC)
- Document sharing and collaboration features
- Thumbnail generation and caching
- Document versioning and history
- Search and filtering capabilities
- Bulk operations and batch processing

## Tech Stack
- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL with JSONB for document content
- **ORM**: Prisma or raw SQL for performance-critical operations
- **Cache**: Redis for document metadata and thumbnails
- **Search**: PostgreSQL full-text search or Elasticsearch
- **Authorization**: Role-based access control with JWT
- **Validation**: Zod for request/response schemas

## Data Model

### Database Schema
```sql
-- Core document table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Document metadata
    slide_count INTEGER DEFAULT 0,
    last_edited_by UUID REFERENCES users(id),
    last_edited_at TIMESTAMP WITH TIME ZONE,
    
    -- Search and categorization
    tags TEXT[] DEFAULT '{}',
    category VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    
    -- Indexing
    search_vector TSVECTOR
);

-- Document permissions and sharing
CREATE TABLE document_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    email VARCHAR(255), -- For invited users who haven't signed up yet
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
    granted_by UUID NOT NULL REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(document_id, user_id),
    UNIQUE(document_id, email)
);

-- Document content storage
CREATE TABLE decks (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    content JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document versions for history
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content JSONB NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    change_summary TEXT,
    
    UNIQUE(document_id, version_number)
);

-- Thumbnails
CREATE TABLE document_thumbnails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    slide_id VARCHAR(100) NOT NULL,
    size VARCHAR(20) NOT NULL, -- 'small', 'medium', 'large'
    image_path VARCHAR(500) NOT NULL,
    content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(document_id, slide_id, size)
);

-- Indexes
CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);
CREATE INDEX idx_documents_search ON documents USING GIN(search_vector);
CREATE INDEX idx_document_roles_user ON document_roles(user_id);
CREATE INDEX idx_document_roles_document ON document_roles(document_id);
CREATE INDEX idx_decks_updated ON decks(updated_at);
```

### TypeScript Interfaces
```typescript
interface Document {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  
  slideCount: number;
  lastEditedBy?: string;
  lastEditedAt?: Date;
  
  tags: string[];
  category?: string;
  status: 'active' | 'archived' | 'deleted';
}

interface DocumentRole {
  id: string;
  documentId: string;
  userId?: string;
  email?: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

interface Deck {
  documentId: string;
  content: DeckContent;
  version: number;
  schemaVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DeckContent {
  version: string;
  metadata: {
    title?: string;
    author?: string;
    createdWith?: string;
  };
  slides: Slide[];
  assets: Record<string, Asset>;
  styles: StyleDefinitions;
}
```

## API Implementation

### Document CRUD Operations
```typescript
class DocumentsController {
  constructor(
    private db: DatabaseService,
    private cache: CacheService,
    private auth: AuthService,
    private thumbnails: ThumbnailService
  ) {}

  // POST /api/v1/documents - Create document from conversion job
  async createDocument(req: Request, res: Response) {
    const { jobId, title, description, tags } = req.body;
    const userId = req.user.id;

    try {
      // Validate job exists and belongs to user
      const job = await this.db.getJob(jobId);
      if (!job || job.userId !== userId || job.status !== 'succeeded') {
        return res.status(400).json({
          code: 'INVALID_JOB',
          message: 'Job not found or not completed successfully'
        });
      }

      // Check if document already exists for this job
      const existingDoc = await this.db.findDocumentByJobId(jobId);
      if (existingDoc) {
        return res.status(409).json({
          code: 'DOCUMENT_EXISTS',
          message: 'Document already exists for this job',
          documentId: existingDoc.id
        });
      }

      // Load converted deck content
      const deck = await this.db.getDeckByJobId(jobId);
      if (!deck) {
        return res.status(400).json({
          code: 'DECK_NOT_FOUND',
          message: 'Converted deck content not found'
        });
      }

      // Create document
      const document = await this.db.transaction(async (trx) => {
        // Create document record
        const doc = await trx.createDocument({
          ownerId: userId,
          title: title || this.extractTitleFromDeck(deck),
          description,
          tags: tags || [],
          slideCount: deck.content.slides.length
        });

        // Move deck content to document
        await trx.createDeck({
          documentId: doc.id,
          content: deck.content,
          version: 1,
          schemaVersion: '1.0'
        });

        // Create owner role
        await trx.createDocumentRole({
          documentId: doc.id,
          userId,
          role: 'owner',
          grantedBy: userId
        });

        return doc;
      });

      // Generate thumbnails asynchronously
      this.thumbnails.generateThumbnails(document.id).catch(error => {
        logger.error('thumbnail_generation_failed', {
          documentId: document.id,
          error: error.message
        });
      });

      // Update search vector
      await this.updateSearchVector(document.id);

      res.status(201).json({
        documentId: document.id,
        title: document.title,
        slideCount: document.slideCount,
        createdAt: document.createdAt
      });

    } catch (error) {
      logger.error('document_creation_failed', {
        userId,
        jobId,
        error: error.message
      });
      
      res.status(500).json({
        code: 'CREATION_FAILED',
        message: 'Failed to create document'
      });
    }
  }

  // GET /api/v1/documents/:id - Get document with content
  async getDocument(req: Request, res: Response) {
    const { id: documentId } = req.params;
    const userId = req.user.id;
    const { includeContent = 'true' } = req.query;

    try {
      // Check permissions
      const permission = await this.auth.checkDocumentPermission(userId, documentId);
      if (!permission) {
        return res.status(403).json({
          code: 'PERMISSION_DENIED',
          message: 'Access denied'
        });
      }

      // Get document from cache first
      const cacheKey = `document:${documentId}`;
      let document = await this.cache.get(cacheKey);

      if (!document) {
        // Load from database
        document = await this.db.getDocument(documentId);
        if (!document) {
          return res.status(404).json({
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found'
          });
        }

        // Cache for 5 minutes
        await this.cache.set(cacheKey, document, 300);
      }

      const response: any = {
        id: document.id,
        title: document.title,
        description: document.description,
        ownerId: document.ownerId,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        slideCount: document.slideCount,
        lastEditedBy: document.lastEditedBy,
        lastEditedAt: document.lastEditedAt,
        tags: document.tags,
        category: document.category,
        permission: permission.role
      };

      // Include content if requested
      if (includeContent === 'true') {
        const deck = await this.getDeck(documentId);
        if (deck) {
          response.deck = deck.content;
          response.version = deck.version;
          response.schemaVersion = deck.schemaVersion;
        }
      }

      res.json(response);

    } catch (error) {
      logger.error('document_retrieval_failed', {
        documentId,
        userId,
        error: error.message
      });
      
      res.status(500).json({
        code: 'RETRIEVAL_FAILED',
        message: 'Failed to retrieve document'
      });
    }
  }

  // PATCH /api/v1/documents/:id - Update document
  async updateDocument(req: Request, res: Response) {
    const { id: documentId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    try {
      // Check permissions (editor or owner required)
      const permission = await this.auth.checkDocumentPermission(userId, documentId);
      if (!permission || !['owner', 'editor'].includes(permission.role)) {
        return res.status(403).json({
          code: 'PERMISSION_DENIED',
          message: 'Edit permission required'
        });
      }

      // Validate updates
      const allowedFields = ['title', 'description', 'tags', 'category'];
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
          return obj;
        }, {} as any);

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({
          code: 'NO_VALID_UPDATES',
          message: 'No valid fields to update'
        });
      }

      // Update document
      const document = await this.db.updateDocument(documentId, {
        ...filteredUpdates,
        lastEditedBy: userId,
        lastEditedAt: new Date(),
        updatedAt: new Date()
      });

      // Clear cache
      await this.cache.delete(`document:${documentId}`);

      // Update search vector if title changed
      if ('title' in filteredUpdates) {
        await this.updateSearchVector(documentId);
      }

      res.json({
        id: document.id,
        title: document.title,
        description: document.description,
        updatedAt: document.updatedAt,
        lastEditedBy: document.lastEditedBy,
        lastEditedAt: document.lastEditedAt
      });

    } catch (error) {
      logger.error('document_update_failed', {
        documentId,
        userId,
        error: error.message
      });
      
      res.status(500).json({
        code: 'UPDATE_FAILED',
        message: 'Failed to update document'
      });
    }
  }
}
```

### Permission Management
```typescript
class DocumentPermissionService {
  constructor(private db: DatabaseService) {}

  async checkPermission(userId: string, documentId: string): Promise<DocumentRole | null> {
    const role = await this.db.getDocumentRole(documentId, userId);
    
    if (!role) return null;
    
    // Check if role has expired
    if (role.expiresAt && role.expiresAt < new Date()) {
      return null;
    }
    
    return role;
  }

  async shareDocument(
    documentId: string, 
    shareWithUserId: string, 
    role: DocumentRole['role'],
    sharedBy: string,
    expiresAt?: Date
  ): Promise<DocumentRole> {
    // Verify the sharer has permission to share
    const sharerRole = await this.checkPermission(sharedBy, documentId);
    if (!sharerRole || sharerRole.role !== 'owner') {
      throw new Error('Only owners can share documents');
    }

    // Create or update role
    const documentRole = await this.db.upsertDocumentRole({
      documentId,
      userId: shareWithUserId,
      role,
      grantedBy: sharedBy,
      grantedAt: new Date(),
      expiresAt
    });

    // Send notification to shared user
    await this.notificationService.sendDocumentSharedNotification(
      shareWithUserId,
      documentId,
      role,
      sharedBy
    );

    return documentRole;
  }

  async revokeAccess(documentId: string, userId: string, revokedBy: string): Promise<void> {
    // Verify the revoker has permission
    const revokerRole = await this.checkPermission(revokedBy, documentId);
    if (!revokerRole || revokerRole.role !== 'owner') {
      throw new Error('Only owners can revoke access');
    }

    // Cannot revoke owner access
    const targetRole = await this.checkPermission(userId, documentId);
    if (targetRole?.role === 'owner') {
      throw new Error('Cannot revoke owner access');
    }

    await this.db.deleteDocumentRole(documentId, userId);
  }
}
```

### Search and Filtering
```typescript
class DocumentSearchService {
  constructor(private db: DatabaseService) {}

  async searchDocuments(
    userId: string, 
    query: string, 
    filters: SearchFilters,
    pagination: PaginationOptions
  ): Promise<SearchResult> {
    const searchQuery = `
      SELECT DISTINCT d.*, 
             dr.role,
             ts_rank(d.search_vector, plainto_tsquery($1)) as rank
      FROM documents d
      INNER JOIN document_roles dr ON d.id = dr.document_id
      WHERE dr.user_id = $2
        AND d.deleted_at IS NULL
        AND (
          $1 = '' OR 
          d.search_vector @@ plainto_tsquery($1) OR
          d.title ILIKE $3 OR
          d.description ILIKE $3
        )
        ${filters.tags?.length ? 'AND d.tags && $4' : ''}
        ${filters.category ? 'AND d.category = $5' : ''}
        ${filters.owner ? 'AND d.owner_id = $6' : ''}
        ${filters.dateFrom ? 'AND d.created_at >= $7' : ''}
        ${filters.dateTo ? 'AND d.created_at <= $8' : ''}
      ORDER BY 
        CASE WHEN $1 = '' THEN d.updated_at ELSE rank END DESC,
        d.updated_at DESC
      LIMIT $9 OFFSET $10
    `;

    const params = [
      query,
      userId,
      `%${query}%`,
      ...(filters.tags?.length ? [filters.tags] : []),
      ...(filters.category ? [filters.category] : []),
      ...(filters.owner ? [filters.owner] : []),
      ...(filters.dateFrom ? [filters.dateFrom] : []),
      ...(filters.dateTo ? [filters.dateTo] : []),
      pagination.limit,
      pagination.offset
    ];

    const [documents, totalCount] = await Promise.all([
      this.db.query(searchQuery, params),
      this.getSearchCount(userId, query, filters)
    ]);

    return {
      documents: documents.rows,
      totalCount,
      page: Math.floor(pagination.offset / pagination.limit) + 1,
      totalPages: Math.ceil(totalCount / pagination.limit),
      hasMore: pagination.offset + documents.rows.length < totalCount
    };
  }

  private async updateSearchVector(documentId: string): Promise<void> {
    const updateQuery = `
      UPDATE documents 
      SET search_vector = to_tsvector('english', 
        coalesce(title, '') || ' ' || 
        coalesce(description, '') || ' ' ||
        array_to_string(tags, ' ')
      )
      WHERE id = $1
    `;
    
    await this.db.query(updateQuery, [documentId]);
  }
}
```

### Thumbnail Generation
```typescript
class ThumbnailService {
  constructor(
    private storage: StorageAdapter,
    private db: DatabaseService
  ) {}

  async generateThumbnails(documentId: string): Promise<void> {
    try {
      const deck = await this.db.getDeck(documentId);
      if (!deck) return;

      const thumbnailJobs = deck.content.slides.map((slide, index) => 
        this.generateSlideThumbnail(documentId, slide, index)
      );

      await Promise.allSettled(thumbnailJobs);
      
      logger.info('thumbnails_generated', {
        documentId,
        slideCount: deck.content.slides.length
      });

    } catch (error) {
      logger.error('thumbnail_generation_failed', {
        documentId,
        error: error.message
      });
    }
  }

  private async generateSlideThumbnail(
    documentId: string, 
    slide: any, 
    slideIndex: number
  ): Promise<void> {
    const sizes = [
      { name: 'small', width: 160, height: 90 },
      { name: 'medium', width: 320, height: 180 },
      { name: 'large', width: 640, height: 360 }
    ];

    for (const size of sizes) {
      try {
        // Render slide to image
        const imageBuffer = await this.renderSlideToImage(slide, size.width, size.height);
        
        // Store thumbnail
        const thumbnailPath = `thumbnails/${documentId}/slide_${slideIndex}_${size.name}.jpg`;
        await this.storage.upload(thumbnailPath, imageBuffer, {
          contentType: 'image/jpeg'
        });

        // Save thumbnail record
        await this.db.saveThumbnail({
          documentId,
          slideId: slide.id,
          size: size.name,
          imagePath: thumbnailPath,
          contentType: 'image/jpeg'
        });

      } catch (error) {
        logger.error('slide_thumbnail_failed', {
          documentId,
          slideIndex,
          size: size.name,
          error: error.message
        });
      }
    }
  }

  private async renderSlideToImage(slide: any, width: number, height: number): Promise<Buffer> {
    // Use Puppeteer or similar to render slide HTML to image
    const html = this.generateSlideHTML(slide);
    
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setContent(html);
      
      const screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 80,
        clip: { x: 0, y: 0, width, height }
      });
      
      return Buffer.from(screenshot);
    } finally {
      await browser.close();
    }
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('DocumentsController', () => {
  let controller: DocumentsController;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockCache: jest.Mocked<CacheService>;
  let mockAuth: jest.Mocked<AuthService>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockCache = createMockCache();
    mockAuth = createMockAuth();
    controller = new DocumentsController(mockDb, mockCache, mockAuth, mockThumbnails);
  });

  describe('createDocument', () => {
    it('should create document from successful conversion job', async () => {
      const req = createMockRequest({
        body: { jobId: 'job-123', title: 'Test Document' },
        user: { id: 'user-123' }
      });
      const res = createMockResponse();

      mockDb.getJob.mockResolvedValue({
        id: 'job-123',
        userId: 'user-123',
        status: 'succeeded'
      });

      mockDb.getDeckByJobId.mockResolvedValue({
        content: { slides: [{}, {}] }
      });

      await controller.createDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockDb.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'user-123',
          title: 'Test Document',
          slideCount: 2
        })
      );
    });

    it('should reject invalid job', async () => {
      const req = createMockRequest({
        body: { jobId: 'invalid-job' },
        user: { id: 'user-123' }
      });
      const res = createMockResponse();

      mockDb.getJob.mockResolvedValue(null);

      await controller.createDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_JOB'
        })
      );
    });
  });

  describe('getDocument', () => {
    it('should return document for authorized user', async () => {
      const req = createMockRequest({
        params: { id: 'doc-123' },
        user: { id: 'user-123' }
      });
      const res = createMockResponse();

      mockAuth.checkDocumentPermission.mockResolvedValue({ role: 'editor' });
      mockDb.getDocument.mockResolvedValue(createMockDocument());

      await controller.getDocument(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'doc-123',
          permission: 'editor'
        })
      );
    });

    it('should deny access for unauthorized user', async () => {
      const req = createMockRequest({
        params: { id: 'doc-123' },
        user: { id: 'user-456' }
      });
      const res = createMockResponse();

      mockAuth.checkDocumentPermission.mockResolvedValue(null);

      await controller.getDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
```

### Integration Tests
```typescript
describe('Documents API Integration', () => {
  let app: Application;
  let db: DatabaseService;

  beforeEach(async () => {
    app = await createTestApp();
    db = new DatabaseService();
    await db.migrate();
  });

  it('should handle complete document lifecycle', async () => {
    // Create user
    const user = await createTestUser();
    const token = createJWTToken(user.id);

    // Create conversion job
    const job = await createTestJob(user.id, 'succeeded');
    const deck = await createTestDeck(job.id);

    // Create document
    const createResponse = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobId: job.id,
        title: 'Integration Test Document',
        description: 'Test document for integration testing',
        tags: ['test', 'integration']
      });

    expect(createResponse.status).toBe(201);
    const documentId = createResponse.body.documentId;

    // Get document
    const getResponse = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      id: documentId,
      title: 'Integration Test Document',
      permission: 'owner'
    });

    // Update document
    const updateResponse = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Updated Document Title',
        tags: ['test', 'integration', 'updated']
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe('Updated Document Title');

    // Share document
    const otherUser = await createTestUser();
    const shareResponse = await request(app)
      .post(`/api/v1/documents/${documentId}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: otherUser.id,
        role: 'editor'
      });

    expect(shareResponse.status).toBe(200);

    // Verify other user can access
    const otherToken = createJWTToken(otherUser.id);
    const sharedAccessResponse = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(sharedAccessResponse.status).toBe(200);
    expect(sharedAccessResponse.body.permission).toBe('editor');
  });
});
```

## Performance Optimization

### Database Optimization
```typescript
class DocumentsRepository {
  // Optimized bulk operations
  async getBulkDocuments(documentIds: string[], userId: string): Promise<Document[]> {
    const query = `
      SELECT d.*, dr.role as permission
      FROM documents d
      INNER JOIN document_roles dr ON d.id = dr.document_id
      WHERE d.id = ANY($1) 
        AND dr.user_id = $2
        AND d.deleted_at IS NULL
      ORDER BY d.updated_at DESC
    `;
    
    const result = await this.db.query(query, [documentIds, userId]);
    return result.rows;
  }

  // Optimized recent documents
  async getRecentDocuments(userId: string, limit: number = 10): Promise<Document[]> {
    const query = `
      SELECT d.*, dr.role as permission
      FROM documents d
      INNER JOIN document_roles dr ON d.id = dr.document_id
      WHERE dr.user_id = $1 
        AND d.deleted_at IS NULL
      ORDER BY d.updated_at DESC
      LIMIT $2
    `;
    
    const result = await this.db.query(query, [userId, limit]);
    return result.rows;
  }
}
```

### Caching Strategy
```typescript
class DocumentCacheService {
  private cache: RedisClient;
  private readonly TTL = {
    document: 300,      // 5 minutes
    permissions: 600,   // 10 minutes
    thumbnails: 3600,   // 1 hour
    search: 180         // 3 minutes
  };

  async getDocument(documentId: string): Promise<Document | null> {
    const cached = await this.cache.get(`doc:${documentId}`);
    if (cached) {
      METRICS.cacheHits.inc({ type: 'document' });
      return JSON.parse(cached);
    }
    
    METRICS.cacheMisses.inc({ type: 'document' });
    return null;
  }

  async setDocument(documentId: string, document: Document): Promise<void> {
    await this.cache.setex(
      `doc:${documentId}`, 
      this.TTL.document, 
      JSON.stringify(document)
    );
  }

  async invalidateDocument(documentId: string): Promise<void> {
    const pipeline = this.cache.pipeline();
    pipeline.del(`doc:${documentId}`);
    pipeline.del(`deck:${documentId}`);
    pipeline.del(`thumbs:${documentId}:*`);
    await pipeline.exec();
  }
}
```

## Deployment Configuration

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/slidecraft

# Cache
REDIS_URL=redis://localhost:6379

# Storage for thumbnails
STORAGE_PROVIDER=s3
S3_BUCKET=slidecraft-thumbnails

# Search
ELASTICSEARCH_URL=http://localhost:9200
ENABLE_FULLTEXT_SEARCH=true

# Performance
DOCUMENT_CACHE_TTL=300
THUMBNAIL_GENERATION_TIMEOUT=30000
MAX_SEARCH_RESULTS=100

# Features
ENABLE_DOCUMENT_VERSIONING=true
ENABLE_DOCUMENT_SHARING=true
MAX_DOCUMENT_SIZE_MB=50
```

## Future Enhancements

### Planned Features
- **Advanced Versioning**: Full document history with diff visualization
- **Real-time Collaboration**: Live editing with operational transforms
- **Advanced Search**: Elasticsearch integration with content indexing
- **Document Templates**: Template creation and marketplace
- **Folder Organization**: Hierarchical document organization
- **Advanced Sharing**: Public links, password protection, download limits
- **Content Analysis**: AI-powered content insights and suggestions
- **Backup and Export**: Automated backups and bulk export capabilities