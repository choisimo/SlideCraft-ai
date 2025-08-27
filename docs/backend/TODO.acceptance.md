# Backend Acceptance, DoD, Tests

## Foundations
- AC: docker compose up with pg, redis/rabbit, minio, gateway, worker
- DoD: health endpoints; migrations; seed scripts; logs structured

## Upload & Storage (P0)
- AC: multipart init→complete with checksum; progress events available; resume supported
- DoD: size/type validation; AV scan hook optional; error taxonomy; backpressure
- Tests: 2GB mock; restart mid-upload; slow-client simulation

## Conversion Pipeline (P0)
- AC: DOCX/PDF/PPTX parsed; normalized Deck JSON persisted; assets stored via configured provider (Local/S3/Google Drive)
- DoD: retries/backoff; partial failure handling; idempotent jobs
- Tests: fidelity on sample set; corrupted file path

## Realtime (P0)
- AC: Authz gates on channels; snapshot/compaction schedule; rate limits
- DoD: 10-client concurrency runbook; outage scenario documented

## Documents API (P0)
- AC: CRUD with optimistic concurrency; thumbnails optional
- DoD: pagination; filtering; audit logs for sensitive actions

## AI Gateway (P0)
- AC: model switch across providers; SSE streaming; cost/latency logging
- DoD: rate limiting; safety filters optional; failure fallback

## Export (P0)
- AC: PPTX/PDF jobs succeed; artifacts downloadable via signed URL
- DoD: error surfacing; retry; time/cost logging

## Comments (P1)
- AC: threads, mentions, resolve; permissions enforced
- DoD: notifications fanout; inbox optional
