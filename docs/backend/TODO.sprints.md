# Backend Sprint Plan

Assume 2-week sprints; BE capacity ~12 dev-days/sprint.

## Sprint 1 — Uploads, Jobs, DB
Goal: Resumable uploads and conversion job skeleton.
Scope:
- BE-B0-001..003 (Foundations)
- BE-B1-001..004 (Multipart path)
- BE-B1-100..101 (Job + worker skeleton)
DoD: docker compose up; sample upload init→complete; job queued
Risks: S3/minio compatibility nuances

## Sprint 2 — Conversion parsers
Scope:
- BE-B1-102..107 (DOCX/PDF/PPTX, normalize, progress)
DoD: Sample set converted; events observed; retries functional

## Sprint 3 — Realtime + Documents API
Scope:
- BE-B2-001..003 (Realtime)
- BE-B3-001..002 (Documents CRUD + thumbs)
DoD: 10 clients test passes; snapshot compaction working

## Sprint 4 — AI + Export
Scope:
- BE-B4-001..003 (AI gateway)
- BE-B5-001..003 (Export)
DoD: PPTX/PDF export jobs complete; download works

## Backlog buffer
- BE-B6-001..002 (Comments, P1)

## Quality Gates
- Health checks; rate limiting; authz enforced; observability baseline
