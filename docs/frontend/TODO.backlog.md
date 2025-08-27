# Frontend Backlog — BMAD + task-master-ai(parse-prd)

This is the canonical, ultra-granular backlog for SlideCraft AI frontend. Each task aims for 0.5–1.0d. IDs are stable and referenceable.

## BMAD Overview
- Business: Seamless import → realtime collab → AI assistance → export
- Metrics: Import completion %, concurrent editors/session, export success %, CSAT/NPS
- Actions: Build importer UI, job tracking, editor, presence, AI panel, export, comments, permissions
- Deliverables: Shipping epics with tests, docs, and demo scripts

## Epics → Capabilities → Stories → Tasks → Tests/AC → Deps → Risks → Est.

### Epic F0 Foundations
Capability: toolchain, routing, state, UI kit, i18n, env.
- Story F0-S1: As a dev, I run dev/build/test easily
  - FE-F0-001: ESLint+Prettier+Husky+lint-staged baseline (0.5d)
  - FE-F0-002: Vitest + JSDOM setup; sample tests (0.5d)
  - FE-F0-003: ErrorBoundary + 404 route (0.5d)
  - FE-F0-004: i18next scaffold (ko/en) with lazy namespace (0.5d)
  - FE-F0-005: Theme tokens (light/dark) + shadcn/ui sync (0.5d)
  - FE-F0-006: Env loader + runtime guards (0.5d)
  - Tests/AC: fresh clone runs npm i && npm run dev; test passes
  - Deps: none; Risks: ESM interop; Est: 3d

### Epic F1 Importer UI (P0)
Capability: upload zone, progress, cancel/retry, validation.
- Story F1-S1: Upload PPTX/PDF/DOCX with progress
  - FE-F1-001: FileDropzone A11y, accept filters (0.5d)
  - FE-F1-002: useUpload(strategy=tus|s3mp), progress store (1.0d)
  - FE-F1-003: Upload queue (max 3 concurrent), cancel/retry (0.5d)
  - FE-F1-004: Server-side progress via SSE/WebSocket (0.5d)
  - FE-F1-005: Error taxonomy + toasts (0.5d)
  - FE-F1-006: Large-file memory-safe reads (streams) (0.5d)
  - FE-F1-007: Dropzone empty/dragging states visuals (0.5d)
  - Tests/AC: progress >= 1Hz updates; cancel within 300ms; retry resumes
  - Deps: BE upload endpoints; Risks: network stalls; Est: 4d
- Story F1-S2: Job status → Editor open on done
  - FE-F1-010: JobCard + list; statuses (queued/processing/done/failed) (0.5d)
  - FE-F1-011: Job channel subscribe; auto-open editor (0.5d)
  - Tests/AC: deep link to /d/:docId works; Est: 1d

### Epic F2 Collaborative Editor (P0)
Capability: render, edit, organize; presence.
- Story F2-S1: Render slides faithfully
  - FE-F2-001: Deck schema types + guards (Zod) (0.5d)
  - FE-F2-002: Renderer core: layers, z-order, DPI scaling (1.0d)
  - FE-F2-003: Text element view (fonts, align) (0.5d)
  - FE-F2-004: Image element view (objectFit, placeholder) (0.5d)
  - FE-F2-005: Shape element view (rect/ellipse/line) (0.5d)
  - Tests/AC: snapshot tolerance for sample decks; Est: 3d
- Story F2-S2: Edit text/elements
  - FE-F2-010: Selection/transform layer (bbox, handles) (1.0d)
  - FE-F2-011: Text editor toolbar (marks, lists, align) (1.0d)
  - FE-F2-012: Undo/redo manager (0.5d)
  - Tests/AC: undo 20 steps; IME safe; Est: 2.5d
- Story F2-S3: Presence & cursors
  - FE-F2-020: Realtime provider abstraction (0.5d)
  - FE-F2-021: Presence list + colors (0.5d)
  - FE-F2-022: Remote cursor + selection overlays (0.5d)
  - Tests/AC: 3 clients no conflicts; Est: 1.5d
- Story F2-S4: Slide org
  - FE-F2-030: Thumbnails sidebar + DnD reorder (0.5d)
  - FE-F2-031: Sections + context menu (0.5d)
  - Tests/AC: reorder persists; Est: 1d

### Epic F3 AI Assistant (P0)
- Story F3-S1: Chat, model select, insert at cursor
  - FE-F3-001: AI panel UI + streaming (1.0d)
  - FE-F3-002: Context composer (selection/doc) (0.5d)
  - FE-F3-003: Model picker (Gemini/GPT-4/OpenRouter) (0.5d)
  - FE-F3-004: Diff preview before apply (0.5d)
  - Tests/AC: insertion matches preview; Est: 2.5d

### Epic F4 Export (P0)
- Story F4-S1: Export dialog + progress + download
  - FE-F4-001: ExportDialog UI (format options) (0.5d)
  - FE-F4-002: Start job + track + download (0.5d)
  - Tests/AC: PPTX opens successfully; Est: 1d

### Epic F5 Comments (P1)
- Story F5-S1: Anchored threads + mentions
  - FE-F5-001: Comment pins/overlay (0.5d)
  - FE-F5-002: Thread panel + resolve (0.5d)
  - FE-F5-003: @mention combobox (0.5d)
  - Tests/AC: anchors stable after edits; Est: 1.5d
