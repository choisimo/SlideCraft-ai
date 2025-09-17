# CapabilityRegistry Service

Overview
- Purpose: Display and manage the AI agent's capabilities with status and metadata.
- Location: `src/components/CapabilityRegistry.tsx`
- Type: React component (registry UI)

Data Model (UI)
- `id: string`
- `name: string` (e.g., `summarize_text`, `convert_to_ppt`)
- `description: string`
- `category: "core" | "generated" | "experimental"`
- `status: "active" | "learning" | "error"`
- `lastUsed?: Date`
- `usageCount: number`
- `dependencies: string[]`

Key Responsibilities
- Visualize available capabilities, status, last-used, and usage stats.
- Provide quick actions: view code, debug when status is `error`.
- Show categories with color-coded badges and icons.

Current Implementation Notes
- Uses local static state as placeholder for a future backend.
- Icons from `lucide-react`; category/status helpers determine visuals.

Extensibility
- Backed registry: store capabilities in Supabase with CRUD APIs.
- Capability execution: integrate with backend to trigger tools/workflows.
- Learning pipeline: transition capabilities from `experimental` -> `active`.
- Telemetry: update `usageCount` and `lastUsed` on invocation.

Testing
- Render list, verify grouping and badge colors per category/status.
- Actions show/hide based on `status`.

Security/UX
- Validate capability dependencies before execution.
- Guard debug actions to dev/admin roles.
