# Integration Dev PRD (Implementation-focused)

This document ties together backend and frontend contracts into end-to-end, testable flows, refining `docs/integration/PRD-tasks.md`.

## End-to-End Flows (E2E)

### Flow A: Upload → Convert → Document Created → Export
- Preconditions: Auth token available; quotas ok
- Steps
  1) FE: POST /uploads/init; perform upload to selected storage (S3-multipart, Local direct, or Google Drive); POST /uploads/:id/complete
  2) FE: POST /convert { objectKey, sourceType }
  3) FE: Poll GET /jobs/:id or subscribe to jobs.{id}
  4) FE: On success, POST /documents { jobId } → { documentId }
  5) FE: Navigate to /d/:documentId and fetch GET /documents/:id
  6) FE: For export, POST /export { documentId, format } → jobId → GET /exports/:jobId/download
- Error Paths
  - Upload failures: retry part; checksum mismatch → re-upload part
  - Convert unsupported: show guidance; keep original for support ticket
  - Export failed: show error and link to logs

### Flow B: AI Chat Assist (context-aware)
- Steps
  1) FE: POST /ai/chat with documentId/selection and stream=true
  2) BE: Stream tokens via SSE; include tool calls when needed
  3) FE: Apply insert/edit operations; allow user review before commit
- Errors: 429/backoff; token overflow → ask to reduce scope

## Contracts and Conventions
- Authentication: Bearer JWT; `Authorization` header
- Idempotency: header `Idempotency-Key` on POST /convert, /export, /ai/chat
- Pagination defaults: limit=20, cursor-based where applicable
- Error body: { code, message, details? }

## Secrets and Envs
- FE: VITE_API_BASE_URL; optional VITE_ENABLE_MSW for mocks
- BE: DB_URL, REDIS_URL, STORAGE_PROVIDER, LOCAL_STORAGE_ROOT, S3_*, GDRIVE_*, JWT_SECRET, OPENAI_API_KEY, OPENROUTER_API_KEY
- Local: provide `.env.example` with placeholders across repos

## Observability
- Trace propagation: `traceparent` header from FE → BE → workers
- Metrics correlation: jobId and documentId as dimensions
- Frontend RUM: minimal Web Vitals + custom events

## Quality Gates
- Contract tests: json-schema for key endpoints; FE MSW fixtures mirror BE OpenAPI examples
- SLIs and SLOs from `docs/integration/PRD-tasks.md` enforced in alerts

## CI/CD Hooks
- PR: lint, typecheck, unit, MSW contract tests; build
- Main: build Docker images (api, worker, realtime); push to registry; run migrations

## Checklists
- [ ] Align OpenAPI and FE client types (typescript-fetch or zodios)
- [ ] Add Idempotency-Key usage in FE client
- [ ] Add SSE helper and backoff policies
- [ ] Provide .env.example and verify variables in build

## Open Questions
- Provider matrix (OpenAI vs OpenRouter vs Gemini) and default models
- SSE vs WebSocket for jobs and chat
