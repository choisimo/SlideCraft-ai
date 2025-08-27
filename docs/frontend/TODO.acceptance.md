# Frontend Acceptance, DoD, Tests

This file catalogs Acceptance Criteria (AC), Definition of Done (DoD), and Test ideas per epic/story.

## Foundations
- AC: App boots with npm i && npm run dev; ko/en toggle works; dark mode persists
- DoD: Lint/type/test pipelines; docs for env variables; a11y pass on core components

## Importer (P0)
- AC:
  - Accepts PPTX/PDF/DOCX; rejects others with clear reason
  - Shows progress updates at least 1/sec; cancel in <300ms; retry resumes
  - Job done auto-opens editor
- DoD: E2E happy and failure paths; network throttle tests; a11y (drag announcements)
- Tests: large file (200MB) simulated; offline/online flip; checksum mismatch path

## Editor (P0)
- AC:
  - Renderer fidelity passes snapshot tolerance on sample set
  - Text edit supports IME; formatting applies; undo/redo up to 20 steps
  - Presence shows remote users; cursors/selection do not flicker excessively
  - Reorder via DnD persists and matches server order
- DoD: Storybook stories for elements; performance budget doc; keyboard shortcuts documented

## AI Assistant (P0)
- AC: Model switch persists; streaming; diff preview matches applied changes
- DoD: Rate limit and error surfaces; telemetry event fired for each call

## Export (P0)
- AC: PPTX/PDF downloads; file opens in PowerPoint/Acrobat without repair dialogs
- DoD: Job errors surfaced; retry; time-to-download metric captured

## Comments (P1)
- AC: Anchored to element or bbox; resolve hides by default; @mention suggestions
- DoD: Permission gates visible and enforced on UI
