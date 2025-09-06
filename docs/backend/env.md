# Environment Variables — Centralized Management

This document defines the single source of truth for environment variables across services (gateway, workers, realtime). It standardizes naming, required/optional status, defaults, and injection rules for dev/CI/prod.

## Principles
- Single schema and validation at process start; fail-fast on invalid config.
- No secrets in VCS. Use .env.defaults for safe defaults; secrets via secret managers or developer-local files.
- Overlays by environment: OS ENV > .env.{env} > .env.local > .env > .env.defaults
- Mask sensitive values in logs. Print a short config summary on boot.

## Files
- .env.defaults — tracked: safe defaults, no secrets
- .env — local (ignored)
- .env.local — personal overrides (ignored)
- .env.{environment} — environment overlays (ignored)

## Core
- NODE_ENV: development|test|production (required)
- APP_ENV: dev|staging|prod (default: dev)
- APP_NAME: string (default: slidecraft)
- APP_PORT: number (default: 3000)
- LOG_LEVEL: trace|debug|info|warn|error (default: info)

## Storage
- STORAGE_PROVIDER: local|s3|gdrive (required)
- LOCAL_STORAGE_ROOT: path (required if STORAGE_PROVIDER=local)

S3 (required if STORAGE_PROVIDER=s3)
- S3_BUCKET: string
- S3_REGION: string
- S3_ENDPOINT: url (optional for AWS; required for MinIO)
- S3_ACCESS_KEY: secret
- S3_SECRET_KEY: secret
- S3_FORCE_PATH_STYLE: boolean (default: true for MinIO)

Google Drive (required if STORAGE_PROVIDER=gdrive)
- GDRIVE_SERVICE_ACCOUNT_JSON: file path to JSON creds (exclusive with GDRIVE_SERVICE_ACCOUNT_B64)
- GDRIVE_SERVICE_ACCOUNT_B64: base64 of JSON creds
- GDRIVE_FOLDER_ID: root folder id for app files

## Backend Infra
- DB_URL: Postgres connection string (required in non-dev)
- REDIS_URL: redis:// (required in non-dev)

## Auth/Security
- JWT_SECRET: secret (required in non-dev; use clearly marked dev-only values in development)

## AI Providers (optional)
- OPENAI_API_KEY: secret
- OPENROUTER_API_KEY: secret

## Observability (optional)
- OTEL_EXPORTER_OTLP_ENDPOINT: url
- OTEL_SERVICE_NAME: string (default: ${APP_NAME})

## Validation Guidance
- Validate at boot using a schema library (e.g., Zod). Exit(1) on failure with clear messages.
- Conditional requirements based on STORAGE_PROVIDER.
- In dev, allow non-production values for DB_URL, JWT_SECRET, etc., but warn loudly.

## Example Defaults (.env.defaults)
See repository root .env.defaults for safe defaults you can override locally.
