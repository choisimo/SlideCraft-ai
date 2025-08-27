# SlideCraft AI — Backend Tasks (BMAD + parse-prd)

Scope: APIs for upload/import, conversion pipeline, realtime collab, AI proxy, export, comments, auth, permissions, storage, metrics.

Methodologies: BMAD, task-master-ai parse-prd decomposition.

## Phase 0: Platform & Foundations

### Epic B0.1: Architecture & repositories
- Choose monorepo vs polyrepo (keep within this repo as backend/ dir if needed).
- Service layout: gateway (Node.js Fastify), worker (Python Celery), realtime (WebSocket service), job queue (Redis/RabbitMQ), DB (PostgreSQL), storage backends (pluggable: Local FS, S3-compatible like AWS S3/MinIO, Google Drive), cache (Redis).
- IaC later (P1). Docker Compose for local.
- Acceptance: docker compose up boots all services.

### Epic B0.2: AuthN/AuthZ
- JWT-based access tokens; refresh tokens; OAuth providers (placeholders).
- RBAC: viewer/commenter/editor/owner.
- Share links with scoped tokens.
- Acceptance: protected APIs require valid scopes; permission checks enforced.

## Phase 1: Universal Document Importer (P0)

### Epic B1.1: Upload API and storage
- Multipart and/or tus/S3-multipart endpoints with checksum verification.
- Virus scan hook (clamav optional); type sniffing; size limits.
- Store original via configured storage backend, e.g.,
  - Local FS: file://${LOCAL_STORAGE_ROOT}/original/{userId}/{uuid}
  - S3: s3://{S3_BUCKET}/original/{userId}/{uuid}
  - Google Drive: drive://{GDRIVE_FOLDER_ID}/original/{userId}/{uuid}
- Create Job record: status=queued.
- Acceptance: >2GB resumable upload supported; progress callbacks via SSE/WebSocket.

### Epic B1.2: Conversion pipeline (workers)
- Python workers (Celery) consume ConvertJob from queue.
- Parsers:
  - PPTX → JSON + assets using python-pptx + PIL; retain slides, text boxes, images, shapes, order.
  - PDF (text-first) → pages→slides, extract text blocks/images using PyMuPDF.
  - DOCX → outline by H1/H2; paragraphs/lists/images via python-docx.
- Normalize to common Deck schema (JSON) and store in DB (jsonb) + assets in configured storage (Local/S3/Google Drive).
- Emit progress events: parsed→normalized→assets-uploaded→done.
- Acceptance: fidelity baseline met on sample set.

### Epic B1.3: Jobs API
- GET /jobs/:id (status, progress, errors)
- Requeue, cancel.
- Realtime channel: jobs.{id} publishes updates.

## Phase 2: Collaborative Editor Backend (P0)

### Epic B2.1: Realtime sync service
- Option A: Liveblocks/Ably managed; Option B: self-hosted Yjs ws server or Socket.io OT server.
- Presence channels; awareness states; rate limiting.
- Document snapshots to DB; periodic compaction.
- Acceptance: concurrency tests with 10 clients; no data loss.

### Epic B2.2: Document API
- CRUD for Deck, Slides, Elements; optimistic concurrency via version.
- Thumbnails rendering job (optional worker) to precompute slide previews.

### Epic B2.3: Sharing & permissions
- Invite API; roles; link tokens with expiry; audit logs.

## Phase 3: AI Assistant (P0)

### Epic B3.1: AI Gateway
- Unify providers: Gemini, OpenAI, OpenRouter under one interface.
- Per-model config: base URL, api key, pricing, max tokens.
- Prompt assembly with document context; tool functions: insert_slide, edit_selection.
- Streaming responses (SSE/websocket proxy).
- Safety: PII redaction option; rate limiting; usage logs.

### Epic B3.2: Context retrieval
- Extract content chunks from Deck; semantic embeddings (optional P1) using pgvector.
- Selection serialization endpoint.

## Phase 4: Export (P0)

### Epic B4.1: PPTX export
- Service converts normalized Deck JSON back to .pptx using python-pptx.
- Layout mapping; fonts; images; shapes; notes; master styles subset.
- Job endpoint + storage path based on provider, e.g., s3://{S3_BUCKET}/export/{docId}/{jobId}.pptx or file://${LOCAL_STORAGE_ROOT}/export/{docId}/{jobId}.pptx or drive://{GDRIVE_FOLDER_ID}/export/{docId}/{jobId}.pptx

### Epic B4.2: PDF export
- Headless rendering (Chrome/Puppeteer) or reportlab; pagination; DPIs.

## Phase 5: Comments & Notifications (P1)

### Epic B5.1: Comments API
- Threads anchored to (slideId, elementId?, bbox?).
- CRUD; resolve; mentions with @username; permissions.

### Epic B5.2: Notifications
- Web push/email (optional); in-app inbox; mention fanout.

## Data Model (initial)
- users(id, email, name, avatar, created_at)
- documents(id, owner_id, title, created_at, updated_at)
- document_roles(document_id, user_id, role)
- jobs(id, user_id, type, status, progress, error, created_at, updated_at, payload jsonb)
- decks(document_id FK, jsonb schema)
- comments(id, document_id, slide_id, element_id, bbox, author_id, body, resolved, created_at)
- ai_logs(id, user_id, document_id, provider, model, prompt_tokens, completion_tokens, latency_ms, cost)

## APIs (high level)
- POST /api/v1/uploads/init (initiate); PATCH /api/v1/uploads/:id/part (parts); POST /api/v1/uploads/:id/complete
- POST /api/v1/convert (objectKey, sourceType) → jobId
- GET /api/v1/jobs/:id
- GET /api/v1/documents/:id
- POST /api/v1/documents (from job)
- WS /realtime/:docId (or SSE fallback); jobs.{id} channel for updates
- POST /api/v1/ai/chat (SSE optional)
- POST /api/v1/export (docId, format)
- GET /api/v1/exports/:jobId/download
- POST /api/v1/share/:docId/invite

See also: ./openapi.yaml for detailed contracts.

## Observability
- Structured logs; OpenTelemetry traces; metrics for queue depth, job durations, realtime fanout, AI latency; dashboards.

## BMAD Mapping
- Business: unify import→collab→export with reliability.
- Metrics: job success rate, median conversion time, concurrent editors, export success.
- Actions: resilient upload, conversion, realtime, AI, export.
- Deliverables: stable services, documented APIs, infra as code.
