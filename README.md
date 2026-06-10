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
