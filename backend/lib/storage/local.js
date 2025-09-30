import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { StorageAdapter } from './base.js';

export class LocalStorageAdapter extends StorageAdapter {
  constructor(rootPath) {
    super();
    this.rootPath = rootPath;
    this.multipartUploads = new Map();
  }

  async ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  resolvePath(filePath) {
    return path.join(this.rootPath, filePath);
  }

  async uploadFile(filePath, buffer, metadata = {}) {
    const fullPath = this.resolvePath(filePath);
    await this.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);
    
    if (Object.keys(metadata).length > 0) {
      const metaPath = `${fullPath}.meta.json`;
      await fs.writeFile(metaPath, JSON.stringify(metadata));
    }
    
    return { path: filePath, size: buffer.length };
  }

  async downloadFile(filePath) {
    const fullPath = this.resolvePath(filePath);
    return await fs.readFile(fullPath);
  }

  async deleteFile(filePath) {
    const fullPath = this.resolvePath(filePath);
    await fs.unlink(fullPath);
    
    const metaPath = `${fullPath}.meta.json`;
    try {
      await fs.unlink(metaPath);
    } catch (err) {
      // Ignore if metadata file doesn't exist
    }
  }

  async listFiles(prefix = '') {
    const dirPath = this.resolvePath(prefix);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(e => e.isFile() && !e.name.endsWith('.meta.json'))
        .map(e => path.join(prefix, e.name));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async getMetadata(filePath) {
    const fullPath = this.resolvePath(filePath);
    const stats = await fs.stat(fullPath);
    
    const metaPath = `${fullPath}.meta.json`;
    let customMetadata = {};
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      customMetadata = JSON.parse(metaContent);
    } catch (err) {
      // No custom metadata
    }
    
    return {
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      ...customMetadata
    };
  }

  async getSignedUrl(filePath, expiresIn = 3600) {
    return `file://${this.resolvePath(filePath)}`;
  }

  async initMultipartUpload(filePath, metadata = {}) {
    const uploadId = randomUUID();
    const fullPath = this.resolvePath(filePath);
    
    await this.ensureDir(path.dirname(fullPath));
    
    this.multipartUploads.set(uploadId, {
      filePath,
      fullPath,
      metadata,
      parts: []
    });
    
    return { uploadId, path: filePath };
  }

  async uploadPart(uploadId, partNumber, buffer) {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) {
      throw new Error(`Upload ${uploadId} not found`);
    }
    
    const partPath = `${upload.fullPath}.part${partNumber}`;
    await fs.writeFile(partPath, buffer);
    
    upload.parts.push({ partNumber, path: partPath, size: buffer.length });
    upload.parts.sort((a, b) => a.partNumber - b.partNumber);
    
    return { partNumber, etag: randomUUID() };
  }

  async completeMultipartUpload(uploadId, parts) {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) {
      throw new Error(`Upload ${uploadId} not found`);
    }
    
    const writeStream = createWriteStream(upload.fullPath);
    
    for (const part of upload.parts) {
      const readStream = createReadStream(part.path);
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream, { end: false });
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });
    }
    
    writeStream.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    for (const part of upload.parts) {
      await fs.unlink(part.path);
    }
    
    if (Object.keys(upload.metadata).length > 0) {
      const metaPath = `${upload.fullPath}.meta.json`;
      await fs.writeFile(metaPath, JSON.stringify(upload.metadata));
    }
    
    this.multipartUploads.delete(uploadId);
    
    const stats = await fs.stat(upload.fullPath);
    return { path: upload.filePath, size: stats.size };
  }

  async abortMultipartUpload(uploadId) {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) {
      return;
    }
    
    for (const part of upload.parts) {
      try {
        await fs.unlink(part.path);
      } catch (err) {
        // Ignore errors
      }
    }
    
    this.multipartUploads.delete(uploadId);
  }
}
