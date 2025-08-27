# Backend Dev PRD (Implementation-focused)

This document translates high-level PRD to concrete implementation details for the backend of SlideCraft AI, aligned with current repo state and target architecture in `docs/backend/PRD-tasks.md`.

## Scope and Goals
- Provide API façade for: upload/init, conversion job, job status, AI proxy, export, comments, auth/permissions, realtime channels, observability.
- Prioritize API contracts and data models that the current frontend can integrate with incrementally (single-page demo in `src/pages/Index.tsx`).

## Tech Stack (target)
- Gateway: Node.js (Fastify/Express) + TypeScript
- Workers: Python (Celery/RQ) for conversion/export; optional Node worker for light tasks
- Queue: Redis/RabbitMQ
- DB: PostgreSQL (+ pgvector optional)
- Object storage: S3-compatible (MinIO in dev)
- Realtime: WebSocket/SSE (socket.io or y-websocket if Yjs is chosen)
- Observability: OpenTelemetry, Prometheus metrics, structured logs (JSON)

## Services and Responsibilities
- api-gateway: auth, REST endpoints, signing upload parts, job creation, job status, AI proxy
- worker-convert: parse PPTX/PDF/DOCX → normalized Deck JSON + assets
- worker-export: Deck JSON → PPTX/PDF
- realtime: publish job status events, optional CRDT transport

## Data Model (initial, PostgreSQL)
- users(id, email, name, avatar, plan, quota_used, created_at)
- documents(id, owner_id, title, created_at, updated_at)
- document_roles(document_id, user_id, role)
- jobs(id, user_id, type[convert|export|thumb|ai], status[pending|running|succeeded|failed|canceled], progress int, error jsonb, payload jsonb, created_at, updated_at)
- decks(document_id PK, jsonb schema)
- comments(id, document_id, slide_id, element_id, bbox jsonb, author_id, body, resolved bool, created_at)
- ai_logs(id, user_id, provider, model, prompt_tokens, completion_tokens, latency_ms, cost, created_at)

Indexes: jobs(user_id, status), decks(document_id), comments(document_id, slide_id), ai_logs(provider, model, created_at)

## API Contracts (v1)
Base path: /api/v1

- POST /uploads/init
  - body: { filename, size, contentType }
  - resp: { uploadId, parts: [{partNumber, url}], completeUrl, checksumAlgo }
- PATCH /uploads/:uploadId/part
  - query/body: { partNumber, checksum }
  - resp: { etag }
- POST /uploads/:uploadId/complete
  - body: { parts: [{partNumber, etag}] }
  - resp: { objectUrl, objectKey }

- POST /convert
  - body: { objectKey, sourceType: "pptx"|"pdf"|"docx", documentTitle? }
  - resp: { jobId }

- GET /jobs/:id
  - resp: { id, type, status, progress, error?, result?: { documentId?, exportUrl? } }

- POST /documents
  - body: { jobId } -> imports conversion result into `documents`
  - resp: { documentId }

- GET /documents/:id
  - resp: { id, title, ownerId, updatedAt, deck: { ...normalizedJSON } }

- POST /export
  - body: { documentId, format: "pptx"|"pdf" }
  - resp: { jobId }

- GET /exports/:jobId/download
  - resp: 302 redirect to signed URL

- POST /ai/chat
  - headers: { X-Streaming: sse? }
  - body: { documentId?, selection?, messages: [{role, content}], model }
  - resp: event-stream or JSON { messageId, content }

Auth
- JWT (Bearer); roles: viewer|commenter|editor|owner; document scoping by role
- Rate limit: 60 rpm/user; burst 10

Error model
- { code, message, details? }
- Codes: AUTH_REQUIRED, PERMISSION_DENIED, UPLOAD_INCOMPLETE, CONVERT_UNSUPPORTED, JOB_NOT_FOUND, EXPORT_FAILED, AI_RATE_LIMIT

## Events (Realtime)
- Channel jobs.{jobId}: { type: "job.update", status, progress, message? }
- Channel docs.{docId}: reserved for CRDT/OT updates
- Transport: socket.io or SSE fallback

## Worker Protocol
- ConvertJob payload: { jobId, userId, objectKey, sourceType }
- ExportJob payload: { jobId, userId, documentId, format }
- Backoff: exp backoff up to 3 retries; DLQ on permanent errors

## Observability
- Metrics: job_created_total{type}, job_duration_seconds_bucket{type,status}, queue_depth, ai_latency_seconds, export_fail_total
- Traces: traceId propagate via headers; span names: upload.init, convert.enqueue, worker.parse, export.render
- Logs: request_id, user_id, route, status_code, latency_ms

## Security
- Secrets via env: OPENAI_API_KEY, OPENROUTER_API_KEY, S3_*, JWT_SECRET, DB_URL, REDIS_URL
- PII: avoid storing prompts raw; redact emails in logs
- Object access: signed URLs; private by default

## Testing Strategy
- Contract tests generated from OpenAPI
- Worker integration tests with sample files (small PPTX/PDF/DOCX)
- Idempotency tests for upload complete and job enqueue
- Load test targets: GET /jobs/:id P95 < 200ms

## Migration Plan
- Phase A (stub): implement minimal gateway with in-memory job store to unblock UI
- Phase B (persist): add Postgres + Redis; wire queues; S3 mock (MinIO)
- Phase C (scale): observability, rate-limit, retries

## OpenAPI Skeleton (to be added under docs/backend/openapi.yaml)
- Info: title SlideCraft API, version 0.1.0
- Tags: Uploads, Jobs, Documents, Exports, AI

## Mapping to Frontend (current state)
- Frontend currently has a single route `/` with chat interface and fake progress. Earliest integration endpoints:
  - POST /ai/chat (stream or mock)
  - POST /convert + GET /jobs/:id (progress)
  - POST /export + GET /exports/:jobId/download

## Checklists
- [ ] Auth middleware stubs
- [ ] Rate limiter
- [ ] SSE helper
- [ ] S3 signer util
- [ ] Job repo (PG) + publisher (Redis)
- [ ] Health checks

## Open Questions / TODO
- Choose queue (Redis vs RabbitMQ) and CRDT stack (Yjs vs managed)
- Define Deck JSON schema versioning
- Define PPTX style fidelity scope
