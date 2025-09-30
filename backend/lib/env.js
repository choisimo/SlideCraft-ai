import { config } from 'dotenv';
config();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

function validateEnv() {
  const errors = [];

  if (!process.env.STORAGE_PROVIDER) {
    errors.push('STORAGE_PROVIDER is required (local|s3|gdrive)');
  }

  const storageProvider = process.env.STORAGE_PROVIDER;
  if (storageProvider === 'local' && !process.env.LOCAL_STORAGE_ROOT) {
    errors.push('LOCAL_STORAGE_ROOT is required when STORAGE_PROVIDER=local');
  }

  if (storageProvider === 's3') {
    if (!process.env.S3_BUCKET) errors.push('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    if (!process.env.S3_REGION) errors.push('S3_REGION is required when STORAGE_PROVIDER=s3');
    if (!process.env.S3_ACCESS_KEY) errors.push('S3_ACCESS_KEY is required when STORAGE_PROVIDER=s3');
    if (!process.env.S3_SECRET_KEY) errors.push('S3_SECRET_KEY is required when STORAGE_PROVIDER=s3');
  }

  if (storageProvider === 'gdrive') {
    if (!process.env.GDRIVE_SERVICE_ACCOUNT_JSON && !process.env.GDRIVE_SERVICE_ACCOUNT_B64) {
      errors.push('GDRIVE_SERVICE_ACCOUNT_JSON or GDRIVE_SERVICE_ACCOUNT_B64 is required when STORAGE_PROVIDER=gdrive');
    }
    if (!process.env.GDRIVE_FOLDER_ID) {
      errors.push('GDRIVE_FOLDER_ID is required when STORAGE_PROVIDER=gdrive');
    }
  }

  const isNonDev = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  if (isNonDev) {
    if (!process.env.DB_URL) errors.push('DB_URL is required in non-dev environments');
    if (!process.env.REDIS_URL) errors.push('REDIS_URL is required in non-dev environments');
    if (!process.env.JWT_SECRET) errors.push('JWT_SECRET is required in non-dev environments');
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'development' && !process.env.JWT_SECRET) {
    console.warn('⚠️  Using development mode without JWT_SECRET (auth disabled)');
  }
}

validateEnv();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_ENV: process.env.APP_ENV || 'dev',
  APP_NAME: process.env.APP_NAME || 'slidecraft',
  PORT: Number(process.env.BACKEND_PORT || process.env.APP_PORT || 8787),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
  LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,

  S3_BUCKET: process.env.S3_BUCKET,
  S3_REGION: process.env.S3_REGION,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  S3_FORCE_PATH_STYLE: parseBoolean(process.env.S3_FORCE_PATH_STYLE, true),

  GDRIVE_SERVICE_ACCOUNT_JSON: process.env.GDRIVE_SERVICE_ACCOUNT_JSON,
  GDRIVE_SERVICE_ACCOUNT_B64: process.env.GDRIVE_SERVICE_ACCOUNT_B64,
  GDRIVE_FOLDER_ID: process.env.GDRIVE_FOLDER_ID,

  DB_URL: process.env.DB_URL,
  REDIS_URL: process.env.REDIS_URL,

  JWT_SECRET: process.env.JWT_SECRET,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',

  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || process.env.APP_NAME || 'slidecraft',
};

const masked = (val) => val ? `${val.slice(0, 4)}***` : '(not set)';
console.log('🚀 Environment loaded:');
console.log(`  NODE_ENV: ${ENV.NODE_ENV}`);
console.log(`  APP_ENV: ${ENV.APP_ENV}`);
console.log(`  PORT: ${ENV.PORT}`);
console.log(`  STORAGE_PROVIDER: ${ENV.STORAGE_PROVIDER}`);
console.log(`  DB_URL: ${masked(ENV.DB_URL)}`);
console.log(`  REDIS_URL: ${masked(ENV.REDIS_URL)}`);
console.log(`  JWT_SECRET: ${masked(ENV.JWT_SECRET)}`);
console.log(`  OPENAI_API_KEY: ${masked(ENV.OPENAI_API_KEY)}`);
