export class StorageAdapter {
  async uploadFile(path, buffer, metadata = {}) {
    throw new Error('uploadFile not implemented');
  }

  async downloadFile(path) {
    throw new Error('downloadFile not implemented');
  }

  async deleteFile(path) {
    throw new Error('deleteFile not implemented');
  }

  async listFiles(prefix = '') {
    throw new Error('listFiles not implemented');
  }

  async getMetadata(path) {
    throw new Error('getMetadata not implemented');
  }

  async getSignedUrl(path, expiresIn = 3600) {
    throw new Error('getSignedUrl not implemented');
  }

  async initMultipartUpload(path, metadata = {}) {
    throw new Error('initMultipartUpload not implemented');
  }

  async uploadPart(uploadId, partNumber, buffer) {
    throw new Error('uploadPart not implemented');
  }

  async completeMultipartUpload(uploadId, parts) {
    throw new Error('completeMultipartUpload not implemented');
  }

  async abortMultipartUpload(uploadId) {
    throw new Error('abortMultipartUpload not implemented');
  }
}
