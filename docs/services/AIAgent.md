# AIAgent Service

Overview
- Purpose: Conversational UI for interacting with the Auto-Doc AI agent.
- Location: `src/components/AIAgent.tsx`
- Type: React component (chat agent surface)

Key Responsibilities
- Render real-time chat between user and agent/system.
- Maintain message history with timestamps and statuses.
- Simulate agent responses (placeholder for future backend integration).
- Show attachments (e.g., generated file downloads) when relevant.

Message Model
- `id: string`
- `type: "user" | "agent" | "system"`
- `content: string`
- `timestamp: Date`
- `status?: "processing" | "completed" | "error"`
- `attachments?: { type: "file" | "download"; name: string; url?: string }[]`

User Flows
- Send message: Enter text and press Enter or click send.
- Auto-scroll: Keeps the latest message in view.
- Processing state: Shows spinner and placeholder until response.

Current Implementation Notes
- Responses are simulated with `setTimeout` (2s delay).
- Attachments appear if input includes "ppt" or "pdf" (demo).

Extensibility
- Replace simulation with backend API (e.g., `/api/agent`):
  - Post `{ messages }` and stream responses for token-by-token UI updates.
  - Support tool usage and capability execution via Capability Registry.
- Add file uploads and context selection (project docs, code files).
- Persist conversations per user via Supabase.

UI/UX Details
- Icons: `lucide-react` (Send, Bot, User, FileText, Download, Cpu, Zap).
- Status badges: Active, Self-Evolving Mode indicators.
- Keyboard: Enter to send, Shift+Enter for newline.

Testing
- Snapshot UI for message variants.
- Interaction tests: input clearing, disabled state while processing, autoscroll.

Security
- Sanitize displayed content; avoid rendering raw HTML from agent.
- Limit attachment URLs to trusted origins.
