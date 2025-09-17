# AuthInterface Service

Overview
- Purpose: User authentication UI and flow using Supabase Auth.
- Location: `src/components/AuthInterface.tsx`
- Type: React component (service UI)

Key Responsibilities
- Render sign-in/sign-up form (email + password).
- Invoke Supabase `signUp` and `signInWithPassword`.
- Persist sessions via Supabase client config (localStorage, auto-refresh).
- Provide user feedback via `useToast`.

Props
- `session?: Session` (optional). Not directly used in the component but can be passed contextually.

User Flows
- Sign Up: Calls `supabase.auth.signUp({ email, password })` then shows confirmation toast.
- Sign In: Calls `supabase.auth.signInWithPassword({ email, password })`.
- Toggle Mode: `isSignUp` toggles between flows.

States
- `email: string`, `password: string`, `isSignUp: boolean`, `loading: boolean`.

Validation
- Email: HTML5 `type="email"` + required.
- Password: required, `minLength={6}`.

Dependencies
- UI: `@/components/ui/*` (button, input, card, label).
- Icons: `lucide-react` (Bot, Sparkles).
- Notifications: `@/hooks/use-toast`.
- Auth: `@/integrations/supabase/client`.

Security Notes
- Do not log raw credentials.
- Ensure `.env` holds secure keys. Client uses public anon key.
- Consider rate limiting and password policy via Supabase settings.

Supabase Interaction
- `auth.signUp`, `auth.signInWithPassword`.
- Session persistence handled in `client.ts`.

Extensibility
- Add OAuth providers via `supabase.auth.signInWithOAuth`.
- Add password reset: `supabase.auth.resetPasswordForEmail(email)`.
- Add magic link: `supabase.auth.signInWithOtp`.

Testing
- Unit: Mock `supabase.auth` and `useToast`. Assert flows and disabled states.
- E2E: Fill forms, verify success/error toasts.

Example Usage
- Render on unauthenticated routes; redirect to `Dashboard` on success.

Troubleshooting
- Common errors surface via toast with `error.message`.
- Ensure Supabase URL/key configured and reachable.
