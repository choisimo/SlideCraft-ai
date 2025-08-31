# Storage Adapters Implementation

## Overview
Storage Adapters provide a pluggable backend system for file storage, supporting Local filesystem, S3-compatible services (AWS S3, MinIO), and Google Drive integration for the SlideCraft AI platform.

## Service Responsibilities
- Unified storage interface across multiple backends
- File upload with multipart and resumable support
- Asset download and streaming
- Signed URL generation for secure access
- Storage path management and organization
- Quota tracking and enforcement
- Cleanup and garbage collection
- Storage health monitoring

## Tech Stack
- **Runtime**: Node.js 20+ with TypeScript
- **Local Storage**: Native filesystem operations with `fs/promises`
- **S3 Compatible**: AWS SDK v3 with multipart upload support
- **Google Drive**: Google Drive API v3 with resumable uploads
- **Path Management**: Custom path resolution and validation
- **Security**: Signed URLs with configurable expiration
- **Monitoring**: Storage usage metrics and health checks

## Architecture Overview

### Storage Interface
```typescript
interface StorageAdapter {
  // Core operations
  upload(path: string, data: Buffer | Stream, options?: UploadOptions): Promise<UploadResult>;
  download(path: string, options?: DownloadOptions): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  
  // Multipart operations
  initMultipartUpload(path: string, options?: InitMultipartOptions): Promise<MultipartUpload>;
  uploadPart(uploadId: string, partNumber: number, data: Buffer): Promise<PartResult>;
  completeMultipartUpload(uploadId: string, parts: PartResult[]): Promise<UploadResult>;
  abortMultipartUpload(uploadId: string): Promise<void>;
  
  // URL operations
  getSignedUrl(path: string, operation: 'get' | 'put', expiresIn: number): Promise<string>;
  
  // Metadata operations
  getMetadata(path: string): Promise<StorageMetadata>;
  listFiles(prefix: string, options?: ListOptions): Promise<FileInfo[]>;
  
  // Administrative operations  
  getStorageUsage(): Promise<StorageUsage>;
  cleanup(olderThan: Date): Promise<CleanupResult>;
}
```

### Common Types
```typescript
interface UploadResult {
  path: string;
  etag: string;
  size: number;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface MultipartUpload {
  uploadId: string;
  path: string;
  parts: PartInfo[];
}

interface PartInfo {
  partNumber: number;
  size: number;
  uploadUrl?: string; // For S3 presigned URLs
}

interface StorageMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
  etag: string;
  metadata: Record<string, string>;
}
```

## Local Filesystem Adapter

### Implementation
```typescript
class LocalStorageAdapter implements StorageAdapter {
  constructor(
    private rootPath: string,
    private options: LocalStorageOptions = {}
  ) {
    this.ensureRootExists();
  }

  async upload(path: string, data: Buffer | Stream, options?: UploadOptions): Promise<UploadResult> {
    const fullPath = this.resolvePath(path);
    const directory = dirname(fullPath);
    
    // Ensure directory exists
    await mkdir(directory, { recursive: true });
    
    // Write file
    if (Buffer.isBuffer(data)) {
      await writeFile(fullPath, data);
    } else {
      const writeStream = createWriteStream(fullPath);
      await pipeline(data, writeStream);
    }
    
    // Get file stats
    const stats = await stat(fullPath);
    const etag = await this.calculateEtag(fullPath);
    
    return {
      path,
      etag,
      size: stats.size,
      contentType: options?.contentType,
      metadata: options?.metadata
    };
  }

  async download(path: string, options?: DownloadOptions): Promise<Buffer> {
    const fullPath = this.resolvePath(path);
    
    if (!(await this.exists(path))) {
      throw new StorageError(`File not found: ${path}`, 'FILE_NOT_FOUND');
    }
    
    if (options?.range) {
      return this.downloadRange(fullPath, options.range);
    }
    
    return readFile(fullPath);
  }

  async initMultipartUpload(path: string, options?: InitMultipartOptions): Promise<MultipartUpload> {
    const uploadId = `local_${uuid4()}`;
    const tempDir = join(this.rootPath, '.uploads', uploadId);
    
    await mkdir(tempDir, { recursive: true });
    
    // Store upload metadata
    const metadata = {
      uploadId,
      path,
      createdAt: new Date().toISOString(),
      parts: [],
      ...options
    };
    
    await writeFile(
      join(tempDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    return {
      uploadId,
      path,
      parts: []
    };
  }

  async uploadPart(uploadId: string, partNumber: number, data: Buffer): Promise<PartResult> {
    const tempDir = join(this.rootPath, '.uploads', uploadId);
    const partPath = join(tempDir, `part-${partNumber}`);
    
    await writeFile(partPath, data);
    
    const etag = await this.calculateEtag(partPath);
    
    return {
      partNumber,
      etag,
      size: data.length
    };
  }

  async completeMultipartUpload(uploadId: string, parts: PartResult[]): Promise<UploadResult> {
    const tempDir = join(this.rootPath, '.uploads', uploadId);
    const metadataPath = join(tempDir, 'metadata.json');
    
    // Load metadata
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
    const targetPath = this.resolvePath(metadata.path);
    
    // Ensure target directory exists
    await mkdir(dirname(targetPath), { recursive: true });
    
    // Combine parts in order
    const writeStream = createWriteStream(targetPath);
    
    try {
      for (const part of parts.sort((a, b) => a.partNumber - b.partNumber)) {
        const partPath = join(tempDir, `part-${part.partNumber}`);
        const partStream = createReadStream(partPath);
        await pipeline(partStream, writeStream, { end: false });
      }
    } finally {
      writeStream.end();
    }
    
    // Get final file stats
    const stats = await stat(targetPath);
    const etag = await this.calculateEtag(targetPath);
    
    // Cleanup temp directory
    await rm(tempDir, { recursive: true });
    
    return {
      path: metadata.path,
      etag,
      size: stats.size,
      contentType: metadata.contentType
    };
  }

  private resolvePath(path: string): string {
    // Normalize and validate path
    const normalized = normalize(path).replace(/^\/+/, '');
    
    // Security: prevent directory traversal
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new StorageError(`Invalid path: ${path}`, 'INVALID_PATH');
    }
    
    return join(this.rootPath, normalized);
  }

  private async calculateEtag(filePath: string): Promise<string> {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);
    
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    
    return hash.digest('hex');
  }
}
```

## S3 Compatible Adapter

### Implementation
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;

  constructor(private config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle || false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async upload(path: string, data: Buffer | Stream, options?: UploadOptions): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: path,
      Body: data,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
      ServerSideEncryption: 'AES256'
    });

    const result = await this.client.send(command);

    return {
      path,
      etag: result.ETag!.replace(/"/g, ''),
      size: data instanceof Buffer ? data.length : await this.getObjectSize(path),
      contentType: options?.contentType
    };
  }

  async initMultipartUpload(path: string, options?: InitMultipartOptions): Promise<MultipartUpload> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: path,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
      ServerSideEncryption: 'AES256'
    });

    const result = await this.client.send(command);
    
    const parts: PartInfo[] = [];
    const maxParts = options?.maxParts || 100;
    
    // Generate presigned URLs for parts
    for (let partNumber = 1; partNumber <= maxParts; partNumber++) {
      const uploadUrl = await this.getSignedUrl(
        path, 
        'put', 
        3600,
        { partNumber, uploadId: result.UploadId! }
      );
      
      parts.push({
        partNumber,
        size: options?.partSize || 5 * 1024 * 1024, // 5MB default
        uploadUrl
      });
    }

    return {
      uploadId: result.UploadId!,
      path,
      parts
    };
  }

  async getSignedUrl(
    path: string, 
    operation: 'get' | 'put', 
    expiresIn: number,
    additionalParams?: Record<string, any>
  ): Promise<string> {
    const CommandClass = operation === 'get' ? GetObjectCommand : PutObjectCommand;
    
    const command = new CommandClass({
      Bucket: this.config.bucket,
      Key: path,
      ...additionalParams
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getStorageUsage(): Promise<StorageUsage> {
    // Use CloudWatch or S3 bucket metrics
    const listCommand = new ListObjectsV2Command({
      Bucket: this.config.bucket,
      MaxKeys: 1000
    });

    let totalSize = 0;
    let objectCount = 0;
    
    let continuationToken: string | undefined;
    
    do {
      if (continuationToken) {
        listCommand.input.ContinuationToken = continuationToken;
      }
      
      const result = await this.client.send(listCommand);
      
      if (result.Contents) {
        for (const object of result.Contents) {
          totalSize += object.Size || 0;
          objectCount++;
        }
      }
      
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return {
      totalSize,
      objectCount,
      provider: 's3',
      region: this.config.region
    };
  }
}
```

## Google Drive Adapter

### Implementation
```typescript
import { google, drive_v3 } from 'googleapis';

class GoogleDriveStorageAdapter implements StorageAdapter {
  private drive: drive_v3.Drive;
  private auth: any;

  constructor(private config: GoogleDriveConfig) {
    this.auth = new google.auth.GoogleAuth({
      keyFile: config.serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  async upload(path: string, data: Buffer | Stream, options?: UploadOptions): Promise<UploadResult> {
    const fileName = basename(path);
    const parentFolderId = await this.ensureFolderStructure(dirname(path));

    const fileMetadata = {
      name: fileName,
      parents: [parentFolderId],
      properties: options?.metadata
    };

    const media = {
      mimeType: options?.contentType || 'application/octet-stream',
      body: data
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id,name,size,md5Checksum,mimeType'
    });

    const file = response.data;

    return {
      path,
      etag: file.md5Checksum!,
      size: parseInt(file.size || '0'),
      contentType: file.mimeType || options?.contentType
    };
  }

  async initMultipartUpload(path: string, options?: InitMultipartOptions): Promise<MultipartUpload> {
    const fileName = basename(path);
    const parentFolderId = await this.ensureFolderStructure(dirname(path));

    // Create resumable upload session
    const fileMetadata = {
      name: fileName,
      parents: [parentFolderId],
      properties: options?.metadata
    };

    // Start resumable upload
    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: options?.contentType || 'application/octet-stream',
        body: null  // Will be uploaded in parts
      },
      uploadType: 'resumable',
      fields: 'id'
    });

    // Google Drive doesn't use traditional multipart upload like S3
    // Instead, we use resumable upload sessions
    const uploadId = response.data.id!;

    return {
      uploadId,
      path,
      parts: [] // Parts will be managed by resumable upload
    };
  }

  async getSignedUrl(path: string, operation: 'get' | 'put', expiresIn: number): Promise<string> {
    if (operation === 'put') {
      throw new StorageError('Google Drive does not support presigned PUT URLs', 'UNSUPPORTED_OPERATION');
    }

    const fileId = await this.getFileIdFromPath(path);
    if (!fileId) {
      throw new StorageError(`File not found: ${path}`, 'FILE_NOT_FOUND');
    }

    // Generate download URL
    // Note: Google Drive sharing links have different behavior than traditional signed URLs
    const response = await this.drive.files.get({
      fileId,
      fields: 'webContentLink'
    });

    return response.data.webContentLink!;
  }

  private async ensureFolderStructure(folderPath: string): Promise<string> {
    if (!folderPath || folderPath === '.') {
      return this.config.rootFolderId;
    }

    const pathParts = folderPath.split('/').filter(part => part.length > 0);
    let currentFolderId = this.config.rootFolderId;

    for (const folderName of pathParts) {
      currentFolderId = await this.createOrGetFolder(folderName, currentFolderId);
    }

    return currentFolderId;
  }

  private async createOrGetFolder(name: string, parentId: string): Promise<string> {
    // Search for existing folder
    const searchResponse = await this.drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create new folder
    const folderMetadata = {
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder'
    };

    const response = await this.drive.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    });

    return response.data.id!;
  }
}
```

## Storage Factory & Configuration

### Factory Pattern
```typescript
class StorageAdapterFactory {
  static create(config: StorageConfig): StorageAdapter {
    switch (config.provider) {
      case 'local':
        return new LocalStorageAdapter(
          config.local.rootPath,
          config.local.options
        );
        
      case 's3':
        return new S3StorageAdapter(config.s3);
        
      case 'gdrive':
        return new GoogleDriveStorageAdapter(config.gdrive);
        
      default:
        throw new Error(`Unsupported storage provider: ${config.provider}`);
    }
  }
}
```

### Configuration Schema
```typescript
interface StorageConfig {
  provider: 'local' | 's3' | 'gdrive';
  local?: {
    rootPath: string;
    options?: {
      createMissingDirs?: boolean;
      permissions?: number;
    };
  };
  s3?: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    forcePathStyle?: boolean;
  };
  gdrive?: {
    serviceAccountPath: string;
    rootFolderId: string;
  };
}
```

## Path Management

### Path Convention
```typescript
class StoragePaths {
  // Original uploaded files
  static original(userId: string, fileId: string): string {
    return `original/${userId}/${fileId}`;
  }

  // Converted assets  
  static asset(jobId: string, assetId: string, extension: string): string {
    return `assets/${jobId}/${assetId}.${extension}`;
  }

  // Export results
  static export(documentId: string, jobId: string, format: string): string {
    return `exports/${documentId}/${jobId}.${format}`;
  }

  // Thumbnails
  static thumbnail(documentId: string, slideId: string, size: string): string {
    return `thumbnails/${documentId}/${slideId}_${size}.jpg`;
  }

  // User avatars
  static avatar(userId: string): string {
    return `avatars/${userId}.jpg`;
  }
}
```

## Storage Manager

### Unified Storage Interface
```typescript
class StorageManager {
  private adapter: StorageAdapter;
  private metrics: StorageMetrics;

  constructor(config: StorageConfig) {
    this.adapter = StorageAdapterFactory.create(config);
    this.metrics = new StorageMetrics();
  }

  async uploadOriginal(userId: string, fileId: string, data: Buffer, contentType: string): Promise<UploadResult> {
    const path = StoragePaths.original(userId, fileId);
    
    const startTime = Date.now();
    
    try {
      const result = await this.adapter.upload(path, data, { contentType });
      
      this.metrics.recordUpload(result.size, Date.now() - startTime, 'success');
      
      logger.info('file_uploaded', {
        userId,
        fileId,
        path,
        size: result.size,
        contentType
      });
      
      return result;
    } catch (error) {
      this.metrics.recordUpload(data.length, Date.now() - startTime, 'error');
      
      logger.error('upload_failed', {
        userId,
        fileId,
        path,
        error: error.message
      });
      
      throw error;
    }
  }

  async downloadAsset(assetPath: string): Promise<Buffer> {
    const startTime = Date.now();
    
    try {
      const data = await this.adapter.download(assetPath);
      
      this.metrics.recordDownload(data.length, Date.now() - startTime, 'success');
      
      return data;
    } catch (error) {
      this.metrics.recordDownload(0, Date.now() - startTime, 'error');
      throw error;
    }
  }

  async generateDownloadUrl(path: string, expiresIn: number = 3600): Promise<string> {
    return this.adapter.getSignedUrl(path, 'get', expiresIn);
  }

  async cleanup(olderThan: Date): Promise<CleanupResult> {
    logger.info('storage_cleanup_started', { olderThan });
    
    const result = await this.adapter.cleanup(olderThan);
    
    logger.info('storage_cleanup_completed', {
      deletedFiles: result.deletedCount,
      freedBytes: result.freedBytes
    });
    
    return result;
  }
}
```

## Error Handling

### Storage Errors
```typescript
class StorageError extends Error {
  constructor(
    message: string,
    public code: StorageErrorCode,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

enum StorageErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_PATH = 'INVALID_PATH',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION'
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('StorageAdapters', () => {
  describe('LocalStorageAdapter', () => {
    let adapter: LocalStorageAdapter;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'test-storage-'));
      adapter = new LocalStorageAdapter(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true });
    });

    it('should upload and download files', async () => {
      const testData = Buffer.from('test content');
      const path = 'test/file.txt';

      const uploadResult = await adapter.upload(path, testData, {
        contentType: 'text/plain'
      });

      expect(uploadResult.path).toBe(path);
      expect(uploadResult.size).toBe(testData.length);

      const downloadResult = await adapter.download(path);
      expect(downloadResult).toEqual(testData);
    });

    it('should handle multipart uploads', async () => {
      const path = 'test/large-file.bin';
      
      const multipart = await adapter.initMultipartUpload(path, {
        contentType: 'application/octet-stream'
      });

      const part1 = Buffer.from('part1');
      const part2 = Buffer.from('part2');

      const partResult1 = await adapter.uploadPart(multipart.uploadId, 1, part1);
      const partResult2 = await adapter.uploadPart(multipart.uploadId, 2, part2);

      const result = await adapter.completeMultipartUpload(multipart.uploadId, [
        partResult1,
        partResult2
      ]);

      expect(result.size).toBe(part1.length + part2.length);

      const downloaded = await adapter.download(path);
      expect(downloaded).toEqual(Buffer.concat([part1, part2]));
    });
  });

  describe('S3StorageAdapter', () => {
    // Mock S3 client tests
    let adapter: S3StorageAdapter;
    let mockS3: jest.Mocked<S3Client>;

    beforeEach(() => {
      mockS3 = createMockS3Client();
      adapter = new S3StorageAdapter({
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      });
    });

    it('should generate presigned URLs', async () => {
      const path = 'test/file.txt';
      const url = await adapter.getSignedUrl(path, 'get', 3600);
      
      expect(url).toMatch(/^https:\/\/.*amazonaws\.com/);
      expect(url).toContain('X-Amz-Expires=3600');
    });
  });
});
```

### Integration Tests
```typescript
describe('Storage Integration', () => {
  it('should work with all storage providers', async () => {
    const testData = Buffer.from('integration test data');
    const path = 'integration/test.bin';

    const providers: StorageConfig[] = [
      { provider: 'local', local: { rootPath: '/tmp/test-storage' } },
      { provider: 's3', s3: { /* S3 config */ } },
      { provider: 'gdrive', gdrive: { /* GDrive config */ } }
    ];

    for (const config of providers) {
      const manager = new StorageManager(config);
      
      // Upload
      const uploadResult = await manager.uploadOriginal('user123', 'file456', testData, 'application/octet-stream');
      expect(uploadResult.size).toBe(testData.length);

      // Download  
      const downloaded = await manager.downloadAsset(uploadResult.path);
      expect(downloaded).toEqual(testData);

      // Signed URL
      const url = await manager.generateDownloadUrl(uploadResult.path);
      expect(url).toBeTruthy();
    }
  });
});
```

## Monitoring & Observability

### Metrics
```typescript
class StorageMetrics {
  private uploadDuration = new Histogram({
    name: 'storage_upload_duration_seconds',
    help: 'Upload operation duration',
    labelNames: ['provider', 'status']
  });

  private downloadDuration = new Histogram({
    name: 'storage_download_duration_seconds', 
    help: 'Download operation duration',
    labelNames: ['provider', 'status']
  });

  private storageUsage = new Gauge({
    name: 'storage_usage_bytes',
    help: 'Storage usage in bytes',
    labelNames: ['provider', 'path_prefix']
  });

  recordUpload(bytes: number, duration: number, status: 'success' | 'error') {
    this.uploadDuration.labels(this.provider, status).observe(duration / 1000);
  }

  recordDownload(bytes: number, duration: number, status: 'success' | 'error') {
    this.downloadDuration.labels(this.provider, status).observe(duration / 1000);
  }
}
```

### Health Monitoring
```typescript
class StorageHealthCheck {
  constructor(private adapter: StorageAdapter) {}

  async checkHealth(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];

    // Upload test
    try {
      const testData = Buffer.from('health-check');
      const testPath = `health-check/${Date.now()}.txt`;
      
      await this.adapter.upload(testPath, testData);
      await this.adapter.download(testPath);
      await this.adapter.delete(testPath);
      
      checks.push({ name: 'upload_download', status: 'healthy' });
    } catch (error) {
      checks.push({ 
        name: 'upload_download', 
        status: 'unhealthy',
        error: error.message 
      });
    }

    // Storage usage
    try {
      const usage = await this.adapter.getStorageUsage();
      checks.push({ 
        name: 'storage_usage', 
        status: 'healthy',
        details: usage
      });
    } catch (error) {
      checks.push({
        name: 'storage_usage',
        status: 'unhealthy', 
        error: error.message
      });
    }

    return {
      status: checks.every(c => c.status === 'healthy') ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    };
  }
}
```

## Deployment Configuration

### Environment Variables
```bash
# Storage provider selection
STORAGE_PROVIDER=local|s3|gdrive

# Local filesystem
LOCAL_STORAGE_ROOT=/var/slidecraft/storage

# AWS S3
S3_REGION=us-east-1
S3_BUCKET=slidecraft-storage
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_ENDPOINT=https://s3.amazonaws.com
S3_FORCE_PATH_STYLE=false

# Google Drive
GDRIVE_SERVICE_ACCOUNT_JSON=/secrets/gdrive-sa.json
GDRIVE_ROOT_FOLDER_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms

# Performance
MULTIPART_CHUNK_SIZE=5242880  # 5MB
MAX_CONCURRENT_UPLOADS=3
SIGNED_URL_EXPIRY=3600        # 1 hour
```

## Future Enhancements

### Planned Features
- **CDN Integration**: CloudFront/CloudFlare for asset delivery
- **Compression**: Automatic compression for text-based assets  
- **Deduplication**: Content-based deduplication to save storage
- **Versioning**: File versioning for document history
- **Encryption**: Client-side encryption for sensitive content
- **Bandwidth Throttling**: Upload/download speed limiting
- **Storage Tiering**: Automatic archiving of old files
- **Multi-Region Support**: Cross-region replication and failover
- **Storage Analytics**: Detailed usage reporting and cost optimization