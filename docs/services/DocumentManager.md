# DocumentManager Service

Overview
- Purpose: Manage project and generated documents (list, search, actions).
- Location: `src/components/DocumentManager.tsx`
- Type: React component

Document Model (UI)
- `id: string`
- `name: string`
- `type: "project" | "generated" | "source"`
- `format: "md" | "pdf" | "ppt" | "html" | "txt"`
- `size: string`
- `lastModified: Date`
- `status: "active" | "processing" | "archived"`

Key Features
- Upload area (placeholder UI for drag-and-drop and file selection).
- Search by name with inline filter.
- List view with badges, sizes, and modified dates.
- Row actions: view, download, delete (stubbed UI buttons).

Helpers
- `getTypeColor(type)`: badge color by type.
- `getFormatIcon(format)`: emoji icon by format.

Extensibility
- Wire uploads to storage (Supabase Storage or S3) with server API.
- Add previews: render Markdown/HTML, embed PDF viewer.
- Implement delete with confirmation and versioning/archival.
- Tagging and folders for organization.
- Link to generation jobs from AIAgent for traceability.

Testing
- Filter behavior: ensure case-insensitive name search.
- Action buttons call handlers; no-op in current stub.
- Render different formats/types consistently.

Security
- Validate and sanitize uploads; restrict file types and size.
- Use signed URLs for download access.
