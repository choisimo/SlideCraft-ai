# Supabase Integration

Overview
- Purpose: Backend-as-a-service for auth and persistence used across services.
- Locations: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`
- Type: Client SDK (browser) with generated TypeScript types.

Client Setup
- `client.ts` creates a typed client: `createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)`.
- Auth config: `storage: localStorage`, `persistSession: true`, `autoRefreshToken: true`.
- Note: The file is auto-generated and currently embeds URL and anon key as constants. Ensure values match your `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

Environment
- `.env` entries (client-side):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Do NOT expose the service role key in client code.

Typed Schema
- `types.ts` defines `Database` and helpers: `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`.
- Public tables (as generated):
  - `github_integrations`: repository connections per user.
  - `git_operations`: logs of documentation-related git actions.
  - `manifest_configs`: per-repo config for documentation generation.
  - `profiles`: optional user profile metadata.

Usage in Components
- Auth: `AuthInterface` calls `supabase.auth.signUp` and `supabase.auth.signInWithPassword`.
- Git: `GitIntegrations` reads/writes `github_integrations` and reads recent `git_operations`.

Typical Queries
- Select integrations (latest):
  ```ts
  const { data, error } = await supabase
    .from('github_integrations')
    .select('*')
    .order('created_at', { ascending: false });
  ```
- Insert integration:
  ```ts
  const { error } = await supabase.from('github_integrations').insert({
    repository_name,
    repository_full_name,
    repository_url,
    installation_id: 'manual',
    user_id: session.user.id,
  });
  ```
- Recent operations:
  ```ts
  const { data, error } = await supabase
    .from('git_operations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  ```

RLS & Security
- Enable RLS for tables and add policies such as:
  - `github_integrations`: users can `select/insert/update` rows where `user_id = auth.uid()`.
  - `git_operations`: users can `select` rows where they own the parent integration; inserts by server or verified function.
- Use edge functions or server routes for privileged operations.

Extensibility
- OAuth providers for auth via `supabase.auth.signInWithOAuth`.
- Webhooks (GitHub App) -> Supabase functions or Edge Runtime to write `git_operations`.
- Storage buckets for documents with signed URL downloads.

Troubleshooting
- Auth errors surface as `error.message`; ensure URL/key are correct and project is reachable.
- Types mismatch: regenerate types after DB schema changes.
