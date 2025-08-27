# Storage Backends (Local, S3, Google Drive)

This project supports pluggable storage providers for file uploads and exports.

## Providers
- Local FS (dev default)
- S3-compatible (AWS S3, MinIO)
- Google Drive (service account)

## Selection
Set STORAGE_PROVIDER to one of: local, s3, gdrive.

## Environment Variables

Common:
- STORAGE_PROVIDER=local|s3|gdrive

Local FS:
- LOCAL_STORAGE_ROOT=/var/slidecraft

S3:
- S3_BUCKET=slidecraft
- S3_REGION=ap-northeast-2
- S3_ENDPOINT=https://s3.amazonaws.com (or MinIO endpoint)
- S3_ACCESS_KEY=...
- S3_SECRET_KEY=...
- S3_FORCE_PATH_STYLE=true (MinIO)

Google Drive:
- GDRIVE_SERVICE_ACCOUNT_JSON=/path/to/sa.json (or base64 in GDRIVE_SERVICE_ACCOUNT_B64)
- GDRIVE_FOLDER_ID=xxxxxxxxxxxxxxxxx

## Paths
- Originals: {provider}://.../original/{userId}/{uuid}
- Exports: {provider}://.../export/{docId}/{jobId}.{ext}

## Notes
- Upload APIs return provider-specific signed URLs or direct endpoints.
- For local, the gateway may accept direct uploads (no presign).
- For S3, multipart upload with presigned part URLs.
- For Google Drive, use resumable upload sessions.

## Examples
- local: file://${LOCAL_STORAGE_ROOT}/original/u123/550e8400-e29b-41d4-a716-446655440000
- s3: s3://${S3_BUCKET}/original/u123/550e8400-e29b-41d4-a716-446655440000
- gdrive: drive://${GDRIVE_FOLDER_ID}/original/u123/550e8400-e29b-41d4-a716-446655440000
