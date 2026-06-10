# resume-tailoring-engine

API-first Resume Tailoring Service built with Next.js + TypeScript.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run worker:tailoring`

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `API_KEY_SECRET`
- `APP_BASE_URL`

Optional:

- `ALLOW_ANONYMOUS_API=true` (allow unauthenticated API access outside production for local dev only)
- `ADMIN_EMAILS` (comma-separated list of emails allowed to use the admin testing UI at `/tailoring-runs`; case-insensitive)

## Admin testing UI

The web UI at `/tailoring-runs` is a testing/admin console (the API is the product). It is protected by Supabase Auth:

- Sign in at `/login` with an admin email (magic link / email OTP).
- Access is granted only if the signed-in user's email is in `ADMIN_EMAILS` **or** their Supabase `app_metadata.role` is `admin`.
- Authorization is enforced server-side; the server action runs with server-held credentials, so no API key or service-role key is ever exposed to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` remains server-only.

For programmatic/API access, authenticate with `Authorization: Bearer <api_key>` (mint a key via `POST /api/api-keys`).
