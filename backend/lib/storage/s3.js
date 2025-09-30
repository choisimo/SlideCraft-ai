import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageAdapter } from './base.js';

export class S3StorageAdapter extends StorageAdapter {
  constructor(config) {
    super();
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: config.forcePathStyle
    });
  }

  async uploadFile(filePath, buffer, metadata = {}) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
      Body: buffer,
      Metadata: metadata
    });
    
    await this.client.send(command);
    return { path: filePath, size: buffer.length };
  }

  async downloadFile(filePath) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });
    
    const response = await this.client.send(command);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async deleteFile(filePath) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });
    
    await this.client.send(command);
  }

  async listFiles(prefix = '') {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix
    });
    
    const response = await this.client.send(command);
    return (response.Contents || []).map(obj => obj.Key);
  }

  async getMetadata(filePath) {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });
    
    const response = await this.client.send(command);
    return {
      size: response.ContentLength,
      modifiedAt: response.LastModified,
      contentType: response.ContentType,
      ...response.Metadata
    };
  }

  async getSignedUrl(filePath, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });
    
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async initMultipartUpload(filePath, metadata = {}) {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: filePath,
      Metadata: metadata
    });
    
    const response = await this.client.send(command);
    return { uploadId: response.UploadId, path: filePath };
  }

  async uploadPart(uploadId, partNumber, buffer) {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: uploadId.key,
      UploadId: uploadId.id,
      PartNumber: partNumber,
      Body: buffer
    });
    
    const response = await this.client.send(command);
    return { partNumber, etag: response.ETag };
  }

  async completeMultipartUpload(uploadId, parts) {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: uploadId.key,
      UploadId: uploadId.id,
      MultipartUpload: {
        Parts: parts.map(p => ({
          PartNumber: p.partNumber,
          ETag: p.etag
        }))
      }
    });
    
    const response = await this.client.send(command);
    return { path: response.Key, size: parts.reduce((sum, p) => sum + p.size, 0) };
  }

  async abortMultipartUpload(uploadId) {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: uploadId.key,
      UploadId: uploadId.id
    });
    
    await this.client.send(command);
  }
}
