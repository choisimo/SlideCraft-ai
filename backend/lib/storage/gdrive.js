import { StorageAdapter } from './base.js';

export class GDriveStorageAdapter extends StorageAdapter {
  constructor(config) {
    super();
    this.config = config;
    console.warn('⚠️  Google Drive storage adapter is a stub. Implement using googleapis library.');
  }

  async uploadFile(filePath, buffer, metadata = {}) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async downloadFile(filePath) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async deleteFile(filePath) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async listFiles(prefix = '') {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async getMetadata(filePath) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async getSignedUrl(filePath, expiresIn = 3600) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async initMultipartUpload(filePath, metadata = {}) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async uploadPart(uploadId, partNumber, buffer) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async completeMultipartUpload(uploadId, parts) {
    throw new Error('Google Drive adapter not yet implemented');
  }

  async abortMultipartUpload(uploadId) {
    throw new Error('Google Drive adapter not yet implemented');
  }
}
