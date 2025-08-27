# SlideCraft AI — Frontend Tasks (BMAD + parse-prd)

Scope: Web client for universal import, real-time collaborative editor, AI assistant, export UI, comments, auth, permissions, presence, and settings.

Methodology used:
- BMAD-method breakdown: Business → Metrics → Actions → Deliverables
- task-master-ai parse-prd style: Decompose PRD into epics → capabilities → user stories → tasks → test cases → acceptance criteria → dependencies → risks → estimates

## Phase 0: Foundations

### Epic F0.1: Project bootstrap and architecture
- Capabilities: Vite + React + TypeScript; routing; state; design system; i18n; env mgmt.
- Stories:
  - As a developer, I can run dev/build/test locally with one command.
- Tasks:
  - Tooling: ESLint, Prettier, Husky, lint-staged, Vitest.
  - Routing with lazy chunks; error boundaries; 404.
  - State: TanStack Query for server, Zustand for UI; React Context for session.
  - UI kit: shadcn/ui with Tailwind tokens (brand, dark mode); icon set.
  - i18n scaffold (ko, en) using i18next.
  - Env loader: public vs private keys, runtime guard.
- Tests:
  - Build passes; route-level smoke tests; snapshot of core components.
- Acceptance:
  - Fresh clone launches with: npm i && npm run dev.
- Dependencies: none.
- Risks: CSS token drift; ESM/CJS interop.
- Estimate: 5d.

### Epic F0.2: Authentication and session
- Capabilities: Sign-in modal, OAuth providers placeholder, token storage, session refresh, role claims.
- Stories:
  - As a user, I sign in and see my workspace.
- Tasks:
  - Auth UI: SignInDialog, SignOutButton, AvatarMenu.
  - Session store with refresh; CSRF protection (if cookie-based); social provider buttons.
  - Guarded routes: redirect to /signin when not authenticated.
- Tests: session persistence across reload; unauthorized redirects.
- Acceptance: protected routes hidden until sign-in.
- Dependencies: backend auth endpoints.
- Risks: token leakage in logs.
- Estimate: 3d.

## Phase 1: Universal Document Importer (P0)

### Epic F1.1: Upload pipeline UI
- Capabilities: drag-and-drop zone, file picker; progress; cancel/retry; size/type validation.
- Stories:
  - As a user, I can upload PPTX/PDF/DOCX and see progress.
- Tasks:
  - Component: <FileDropzone/> with accept filters.
  - Hook: useUpload(queue, progress, cancel, retry).
  - Show server-side chunked upload progress; resumable via tus or S3-multipart compatible backend; support storage selection (Local, S3, Google Drive) surfaced from BE capability.
  - Error surfaces and retry.
- Tests: upload happy path; invalid type; large file progress; cancel.
- Acceptance: files reach server; UI reflects server progress.
- Dependencies: backend upload endpoints; websocket/SSE for progress.
- Risks: browser memory spikes; slow networks.
- Estimate: 4d.

### Epic F1.2: Import job tracking and results view
- Capabilities: job status (queued, processing, failed, done); converted HTML preview loader.
- Stories: 
  - As a user, after upload I see conversion status and open the resulting doc.
- Tasks:
  - JobCard component; Polling or realtime channel per job.
  - Result router: /d/:docId loads editor with converted model.
- Tests: state transitions; error retries; deep link to result.
- Acceptance: post-conversion automatically opens editor.
- Dependencies: backend jobs API; realtime events.
- Risks: race between job ready and route.
- Estimate: 2d.

## Phase 2: Real-time Collaborative Editor (P0)

### Epic F2.1: Slide data model and renderer
- Capabilities: Render slides from normalized model; text boxes, images, shapes; z-order; master styles.
- Stories:
  - As a user, I can view imported slides accurately.
- Tasks:
  - Schema types: Deck, Slide, Element(Text, Image, Shape), Style.
  - Renderer: responsive, pixel-accurate mode vs fluid mode.
  - Grid, guides, snap.
  - Asset loader with cache; missing asset placeholders.
- Tests: layout snapshots for sample docs; DPI scaling.
- Acceptance: imported decks resemble originals within defined tolerance.
- Dependencies: backend conversion produces normalized JSON + assets.
- Risks: CSS fidelity vs PPT constraints.
- Estimate: 6d.

### Epic F2.2: WYSIWYG editing
- Capabilities: select, move, resize, rotate; text edit with rich toolbar; undo/redo; keyboard shortcuts.
- Stories:
  - As a user, I can edit text and arrange elements.
- Tasks:
  - Selection/transform layer; bounding boxes; handles; constraints.
  - Text editor: contenteditable + marks (bold/italic/underline), lists, alignment, font, size, color.
  - Toolbar + context menu; property panel.
  - Undo/redo manager.
- Tests: e2e for edit flows; keyboard shortcuts.
- Acceptance: edits persist, undo/redo works across sessions.
- Dependencies: CRDT integration.
- Risks: IME composition; selection sync.
- Estimate: 10d.

### Epic F2.3: Real-time collaboration and presence
- Capabilities: CRDT/OT sync, presence, remote cursors, selection highlights; conflict-free merges.
- Stories:
  - As a team, we can edit simultaneously without conflicts.
- Tasks:
  - Integrate Liveblocks/Yjs provider; awareness API for presence.
  - Color assignment; cursor avatars; selection rectangles.
  - Connection status indicator; offline/online reconciliation.
- Tests: multi-client simulations; network flaps.
- Acceptance: low-latency sync (<200ms on LAN typical); no lost edits.
- Dependencies: realtime service and auth.
- Risks: cursor jitter; large doc performance.
- Estimate: 7d.

### Epic F2.4: Slide organization
- Capabilities: add/duplicate/delete; reorder via drag; sections.
- Stories: As a user, I can manage slide order.
- Tasks: Sidebar slide thumbnails; DnD; context actions; section headers.
- Tests: reorder persistence; cross-session consistency.
- Acceptance: thumbnail previews update within 1s of edit.
- Estimate: 3d.

## Phase 3: AI Content Assistant (P0)

### Epic F3.1: Prompting and context
- Capabilities: chat panel; slash-commands; insert at cursor; operate on selection; model selector.
- Stories: 
  - As a user, I ask “이 내용을 3장으로 요약해줘” and get slides inserted.
- Tasks:
  - AI panel UI; message list; streaming responses; stop/regenerate.
  - Prompt compositors: document context, selection serialization.
  - Model switcher: Gemini, GPT-4, OpenRouter; cost/time indicators.
- Tests: streaming UX; insertion correctness; selection scoping.
- Acceptance: AI can create/edit slides respecting context.
- Dependencies: backend AI proxy APIs; rate limits.
- Risks: token limits; hallucinations.
- Estimate: 6d.

### Epic F3.2: Import-aware generation
- Capabilities: operate on imported DOCX/PDF/PPTX content: summarize, rewrite, split/merge slides.
- Tasks: content extractors on client for previews; commands; diff preview before apply.
- Tests: diff UX; rollback.
- Acceptance: changes previewed and reversible.
- Estimate: 3d.

## Phase 4: Export (P0)

### Epic F4.1: PPTX export trigger
- Capabilities: export panel; server job kickoff; progress; download.
- Tasks: ExportDialog; choose format (PPTX, PDF); options (size, notes);
  job polling.
- Tests: kickoff, failure handling.
- Acceptance: exported file downloads and opens in PowerPoint/Keynote.
- Dependencies: backend export jobs.
- Estimate: 2d.

### Epic F4.2: PDF export
- Capabilities: choose paper size; background vs transparent; link handling.
- Tasks: same as above; print CSS for client-side fallback if needed.
- Estimate: 2d.

## Phase 5: Comments and Feedback (P1)

### Epic F5.1: Commenting on slides/elements
- Capabilities: anchor to element/region; threads; resolve; @mention; notifications.
- Tasks: comment pin overlay; thread panel; mention combobox; permissions.
- Tests: anchor stability under layout changes.
- Acceptance: resolved threads hidden by default; mention notifies.
- Dependencies: backend comments API; notifications.
- Estimate: 5d.

## Cross-cutting

### Security & Permissions
- Role-based UI gates: viewer, commenter, editor, owner.
- Share dialog: link settings; copy link; invite by email.

### Performance
- Virtualization for thumbnail lists; canvas caching for thumbnails; incremental rendering.

### Telemetry
- Event hooks: uploads, edits, AI calls, exports; session spans; anonymized by user ID.

## BMAD Mapping
- Business: enable seamless import→collab→export for teams.
- Metrics: import completion rate; concurrent editors; export success; CSAT.
- Actions: build upload/import UI, collab editor, AI assistant, export, comments.
- Deliverables: user flows implemented with tests and docs.

## Deliverables
- Frontend readmes per epic with component lists and props; Storybook entries; e2e tests for critical flows (Cypress/Playwright).
- Dev PRD: ./dev_prd.md
- Contracts: align with ../backend/openapi.yaml; generate client types from OpenAPI or zod schemas.
