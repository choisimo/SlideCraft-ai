# Backend Backlog — BMAD + task-master-ai(parse-prd)

Scope: gateway API, workers, realtime, storage, AI proxy, export, comments, auth/perm, metrics.

## BMAD Summary
- Business: Reliable import→collab→export
- Metrics: Job success %, median convert time, concurrent editors, export success
- Actions: Upload, convert, realtime, AI, export, comments, sharing
- Deliverables: Services, APIs, infra, tests, dashboards

## Epics

### Epic B0 Foundations
- BE-B0-001: Docker Compose (pg, redis/rabbit, minio, gateway, worker) (1.0d)
- BE-B0-002: Migrations (Prisma/Knex) for core tables (1.0d)
- BE-B0-003: Auth service (JWT, refresh, roles) skeleton (1.0d)
- Tests/AC: compose up works; health endpoints; token flow

### Epic B1 Upload & Storage (P0)
- Story B1-S1: Init & multipart
  - BE-B1-001: POST /uploads init (size, hash, type) (0.5d)
  - BE-B1-002: S3 multipart presign; part size policy (0.5d)
  - BE-B1-003: Complete + ETag verification (0.5d)
  - BE-B1-004: Progress events (SSE/ws) (0.5d)
  - Tests/AC: 2GB mock, resume, checksum match; Est: 2d
- Story B1-S2: tus alternative
  - BE-B1-010: tus server endpoint skeleton (1.0d)
  - BE-B1-011: Storage to MinIO pathing rules (0.5d)
  - Tests/AC: resume across restarts; Est: 1.5d

### Epic B1.2 Conversion Pipeline (P0)
- BE-B1-100: Job model (queued→processing→done/failed) (0.5d)
- BE-B1-101: Worker consume ConvertJob (0.5d)
- BE-B1-102: DOCX parser (python-docx) (1.0d)
- BE-B1-103: PDF parser text-first (PyMuPDF) (1.0d)
- BE-B1-104: PPTX parser (python-pptx) (1.0d)
- BE-B1-105: Normalize to Deck JSON schema (0.5d)
- BE-B1-106: Asset upload + mapping (0.5d)
- BE-B1-107: Progress events emissions (0.5d)
- Tests/AC: sample set baseline; retries on transient; Est: 5d

### Epic B2 Realtime Sync (P0)
- BE-B2-001: Choose provider (Liveblocks vs Yjs) ADR (0.5d)
- BE-B2-002: Authz on doc channels (0.5d)
- BE-B2-003: Snapshot/compaction job (0.5d)
- Tests/AC: 10 clients simulation; Est: 1.5d

### Epic B3 Documents API (P0)
- BE-B3-001: CRUD documents, slides, elements (1.0d)
- BE-B3-002: Thumbnails job (optional) (0.5d)
- Tests/AC: optimistic concurrency; Est: 1.5d

### Epic B4 AI Gateway (P0)
- BE-B4-001: Provider abstraction (Gemini/OpenAI/OpenRouter) (1.0d)
- BE-B4-002: SSE streaming proxy (0.5d)
- BE-B4-003: Cost/latency logging (0.5d)
- Tests/AC: model switch; backoff; Est: 2d

### Epic B5 Export (P0)
- BE-B5-001: PPTX export worker (python-pptx) (1.0d)
- BE-B5-002: PDF export (puppeteer) (1.0d)
- BE-B5-003: Export jobs API + download URLs (0.5d)
- Tests/AC: opens in target apps; Est: 2.5d

### Epic B6 Comments/Notifications (P1)
- BE-B6-001: Comments CRUD + anchors (0.5d)
- BE-B6-002: Mentions + notifications (0.5d)
- Tests/AC: permissions enforced; Est: 1d
