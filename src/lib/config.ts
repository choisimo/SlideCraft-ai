import { env } from "./env";

export type StorageProvider = "local" | "s3" | "gdrive";

export const config = {
  apiBaseUrl: env.VITE_API_BASE_URL || "/api", // default proxy path
  storageProvider: env.VITE_STORAGE_PROVIDER as StorageProvider,
  upload: {
    enabled: env.VITE_FEATURE_UPLOAD,
    maxMb: env.VITE_UPLOAD_MAX_MB,
  },
} as const;
