# Frontend Dev PRD (Implementation-focused)

This document derives concrete implementation steps from `docs/frontend/PRD-tasks.md` and the current code in `src/`.

## Scope and Goals
- Build a React + Vite client that supports upload/import flows, collaborative editing, AI assistance, and export UI.
- Short term: wire fake progress flows in `Index.tsx` to real APIs incrementally.

## Tech Stack
- React 18 + TypeScript + Vite
- Router: react-router-dom
- Data: TanStack Query
- UI: Tailwind + shadcn/ui
- Notifications: sonner + toaster
- State: local React state; consider Zustand for editor state later

## Current Implementation Snapshot
- Routes: `/` and `/d/:docId` mapped to `pages/Index.tsx`; `NotFound` for `*`
- Layout: `AppShell` with `Header`, `AppSidebar`, and `auxiliary` mounting `CommentPanel` on desktop
- Query client initialized in `App.tsx`
- Core components: `AIChatInterface`, `AIStatusBar`, `AppShell`, `AppSidebar`, `Header`, `CommentPanel`
- Dev server: Vite at `http://localhost:8080` with `/api` proxied to `DEV_PROXY_TARGET` (default `http://localhost:3000`)
- Env: `VITE_API_BASE_URL=/api`, optional `DEV_PROXY_TARGET` for local backend
- Demo behavior: `handleSendMessage` simulates progress via interval; to be replaced by job polling or SSE.

## Target Routes (progressive)
- `/` Dashboard (upload, recent jobs)
- `/d/:docId` Editor
- `/jobs/:jobId` Job details (debug)

## Client API Layer
Create `src/lib/api.ts` to centralize calls and match backend contracts.
- postUploadInit(fileMeta)
- patchUploadPart(uploadId, part)
- postUploadComplete(uploadId, parts)
- postConvert(objectKey, sourceType, documentTitle?)
- getJob(id)
- postDocuments({ jobId })
- postExport({ documentId, format })
- getExportDownload(jobId)
- postAIChat({ documentId?, selection?, messages, model, stream? })

Include an SSE helper for streaming chat and job updates.

## React Query Keys
- ["job", jobId]
- ["document", docId]
- ["export", jobId]
- ["ai", conversationId]

## Components and Responsibilities
- AIChatInterface
  - Props: onSendMessage(message), isProcessing
  - Replace with: onSendMessage → calls postAIChat(stream=true) and appends streaming chunks; enable stop.
- AIStatusBar
  - Display stage/progress/status; source from job state or chat stream
- AppSidebar
  - Show upload section and recent jobs; integrate with query
- Editor (future)
  - Render Deck JSON; maintain selection; integrate AI actions

## Error Handling and UX
- Global ErrorBoundary around Routes
- Toast taxonomy: info (start), success (done), error (retryable vs fatal)
- Spinners vs skeletons; optimistic updates only for template/UI settings

## Accessibility and i18n
- ARIA labels for buttons and inputs
- i18n scaffold: `src/i18n/` with ko/en namespaces (copy after API wiring)

## Telemetry hooks
- Client events: upload_start, upload_complete, convert_request, job_view, ai_start, ai_chunk, ai_complete, export_request, export_complete

## Testing Strategy
- Unit: rendering of Header/AppSidebar/AI components
- Integration: use real API; contract fixtures for /jobs and /ai/chat align with backend OpenAPI
- E2E (later): Playwright for import→edit→export

## Step-by-step Integration Plan
1) Create API client and job polling hooks
2) Wire Index.tsx: replace fake progress with real job lifecycle
3) Add `/jobs/:jobId` route for debug
4) Add SSE support for AI chat streaming
5) Introduce `/d/:docId` route and progressively enhance

## Checklists
- [ ] `src/lib/api.ts` with baseURL from env (VITE_API_BASE_URL)
- [ ] Job polling hook with backoff
- [ ] SSE utility with abort controller
- [ ] ErrorBoundary wrapper
- [ ] Ensure local dev proxy to real backend is configured

## Open Questions / TODO
- Decide on state store for editor (Zustand vs Jotai)
- Decide on managed realtime provider vs self-hosted
- Define Deck JSON schema for renderer
