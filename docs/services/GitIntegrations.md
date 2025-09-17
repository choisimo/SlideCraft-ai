# GitIntegrations Service

Overview
- Purpose: Connect GitHub repositories and track recent git operations for documentation automation.
- Location: `src/components/GitIntegrations.tsx`
- Type: React component

Supabase Tables
- `public.github_integrations`
  - `id`, `repository_name`, `repository_full_name`, `repository_url`, `installation_id`, `user_id`, `is_active`, `created_at`, `updated_at`, `manifest_path?`
- `public.git_operations`
  - `id`, `github_integration_id`, `operation_type`, `status`, `file_path`, `commit_message?`, `commit_sha?`, `error_message?`, `created_at`, `user_id`

Key Responsibilities
- List connected repositories (from `github_integrations`).
- Add integration by parsing GitHub URL and inserting a row.
- Show recent operations (from `git_operations`, latest 10) with status icons.
- Provide quick links to repository URL.

User Flows
- Add Repository: user enters `https://github.com/<owner>/<repo>` then clicks Connect.
  - Extract `<owner>` and `<repo>` from URL, store `repository_full_name` and `repository_name`.
  - For demo, `installation_id` is "manual"; in production, obtain via GitHub App flow.
- View Status: repositories display Active/Inactive; operations show Pending/Completed/Error.

Status Icons
- `completed`: CheckCircle (green)
- `pending`: Clock (yellow)
- `error`: AlertCircle (red)
- default/other: RefreshCw (blue)

Extensibility
- GitHub App OAuth: store real `installation_id`, sync repos via webhook.
- Webhooks: on push/PR, enqueue documentation jobs and log `git_operations`.
- Manifest: manage per-repo `manifest_configs` to control which files to generate.
- Actions: enable retry on failed operations; deep links to commits.

Validation & Errors
- URL must match `github.com/<owner>/<repo>` (with optional `.git`).
- Surface Supabase errors with toasts; disable action when input is empty.

Security
- Restrict access by `user_id`; validate ownership on insert/select via RLS.
- Avoid exposing private repo details without proper auth flow.
