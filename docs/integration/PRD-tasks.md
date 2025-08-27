# SlideCraft AI — Integration Tasks (BMAD + parse-prd)

Scope: End-to-end flows, permissions, realtime wiring, CI/CD, QA plans, metrics, SLOs.

## End-to-End Journeys

### J1: DOCX → Upload → Convert → Edit → Export PPTX
- Preconditions: user authenticated; quotas ok.
- Steps:
  1) Upload DOCX with resumable API; progress events.
  2) Create convert job; worker parses DOCX → Deck JSON.
  3) Notify frontend via jobs channel; open editor.
  4) AI summarize to 10 slides; insert; review; reorder.
  5) Export PPTX; download.
- Success: exported PPTX opens in PowerPoint with layout close to preview.
- Telemetry: t_upload, t_convert, t_ai, t_export; errors.

### J2: PPTX import and realtime co-editing
- Steps: upload PPTX; conversion; invite teammates; co-edit with presence and cursors; comments; resolve; export PDF.

## Permissions Matrix
- Roles: viewer/commenter/editor/owner
- Actions: view, comment, edit, share, export, invite
- Enforce on: documents API, realtime channels, comments, exports.

## Realtime Contracts
- Presence: {userId, name, color, cursor, selection}
- Ops: CRDT updates; rate limit per client; backpressure protocol.
- Job updates: channel jobs.{id} events {status, progress, message}

## API Contracts (selected)
- Upload init → {uploadId, parts, urls} (see ../backend/openapi.yaml)
- Convert request → {jobId}
- Jobs get → {id, status, progress, error}
- AI chat (stream) → text/event-stream chunks {delta}
- Export request → {jobId}
- Export download → signed URL

## CI/CD
- Lint, typecheck, unit, e2e (playwright) on PRs.
- Docker images for gateway, worker, realtime.
- Dev/staging/prod envs; migrations.
- Secrets via .env + vault in prod.

## SLOs and Alerts
- Availability: 99.5%
- P95 latencies: upload init < 300ms; AI gateway < 1.5s server-side; job status < 200ms.
- Conversion success rate > 97% for text-first PDFs.
- Alerts on queue depth > N, job error spike, export failure rate.

## QA Plan
- Test matrix across file types (DOCX/PDF/PPTX) and sizes (1MB, 50MB, 500MB).
- Browser matrix: Chrome, Edge, Safari (latest-1).
- Concurrency tests: 10 editors, conflict scenarios, offline reconcilation.

## Risks and Mitigations
- Large files: enforce chunking and streaming parse.
- Fidelity gaps: define tolerance and document limitations.
- Provider limits: exponential backoff, circuit breakers, fallback models.

## Milestones (roll-up)
- M0 Foundations (2w)
- M1 Importer (3w)
- M2 Collab Editor (4w)
- M3 AI Assistant (3w)
- M4 Export (1w)
- M5 Comments + Polish (2w)

## BMAD Summary
- Business: seamless team workflow.
- Metrics: completion rates, concurrent edits, export success, CSAT.
- Actions: orchestrate end-to-end with quality gates.
- Deliverables: integrated, observable product increments.
