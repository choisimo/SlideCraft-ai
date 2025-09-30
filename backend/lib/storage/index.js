import { ENV } from '../env.js';
import { LocalStorageAdapter } from './local.js';
import { S3StorageAdapter } from './s3.js';
import { GDriveStorageAdapter } from './gdrive.js';

let storageInstance = null;

export function getStorage() {
  if (storageInstance) return storageInstance;

  const provider = ENV.STORAGE_PROVIDER;

  switch (provider) {
    case 'local':
      storageInstance = new LocalStorageAdapter(ENV.LOCAL_STORAGE_ROOT);
      break;

    case 's3':
      storageInstance = new S3StorageAdapter({
        bucket: ENV.S3_BUCKET,
        region: ENV.S3_REGION,
        endpoint: ENV.S3_ENDPOINT,
        accessKey: ENV.S3_ACCESS_KEY,
        secretKey: ENV.S3_SECRET_KEY,
        forcePathStyle: ENV.S3_FORCE_PATH_STYLE
      });
      break;

    case 'gdrive':
      storageInstance = new GDriveStorageAdapter({
        serviceAccountJson: ENV.GDRIVE_SERVICE_ACCOUNT_JSON,
        serviceAccountB64: ENV.GDRIVE_SERVICE_ACCOUNT_B64,
        folderId: ENV.GDRIVE_FOLDER_ID
      });
      break;

    default:
      throw new Error(`Unknown storage provider: ${provider}`);
  }

  console.log(`📦 Storage initialized: ${provider}`);
  return storageInstance;
}

export { StorageAdapter } from './base.js';
export { LocalStorageAdapter } from './local.js';
export { S3StorageAdapter } from './s3.js';
export { GDriveStorageAdapter } from './gdrive.js';
