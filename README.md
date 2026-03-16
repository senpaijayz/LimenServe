# LimenServe

LimenServe is now structured around the deployment stack you specified:

- Vercel: hosts the React + Vite frontend in `web-app`
- Render: hosts the Node.js + Express API in `backend`
- Supabase: hosts PostgreSQL, authentication, RPCs, warehouse tables, mining outputs, and forecasts in `supabase`

## Project structure

- `web-app`: Vite client, Supabase Auth session handling, calls the Render API through `VITE_API_URL`
- `backend`: Express API that validates Supabase tokens and calls secure Supabase RPCs with the service-role key
- `supabase`: SQL migrations, seeds, ETL procedures, association-rule mining, and monthly forecast generation

## Environment files

Frontend example:
- `web-app/.env.example`

Backend example:
- `backend/.env.example`

Render service definition:
- `render.yaml`

## Local development

1. Apply the Supabase migrations in `supabase/migrations`.
2. Run `supabase/generated/seed_full.sql` in Supabase SQL Editor.
3. Copy `web-app/.env.example` to `web-app/.env.local` and set:
   - `VITE_API_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Copy `backend/.env.example` to `backend/.env` and set:
   - `FRONTEND_URLS`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Start the backend:

```powershell
cd backend
npm install
npm run dev
```

6. Start the frontend:

```powershell
cd web-app
npm install
npm run dev
```

## Deployment

### Vercel

- Create a Vercel project with root directory set to `web-app`
- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Add these environment variables in Vercel:
  - `VITE_API_URL=https://your-render-service.onrender.com/api`
  - `VITE_SUPABASE_URL=https://your-project.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=...`
- The SPA rewrite config is already present in `web-app/vercel.json`

### Render

- Create the Render service from `render.yaml` or configure it manually
- Root directory: `backend`
- Add these environment variables in Render:
  - `FRONTEND_URLS=https://your-vercel-app.vercel.app,https://*.vercel.app`
  - `SUPABASE_URL=https://your-project.supabase.co`
  - `SUPABASE_ANON_KEY=...`
  - `SUPABASE_SERVICE_ROLE_KEY=...`
- `https://*.vercel.app` allows Vercel preview deployments to call the API without CORS failures

### Supabase

- Push the migrations from `supabase/migrations`
- Run `supabase/generated/seed_full.sql`
- Create Auth users in Supabase Authentication
- `app.user_profiles` now syncs automatically from `auth.users` through database triggers
- If you want an internal role such as `admin`, `cashier`, or `stock_clerk`, set the user's `role` in Supabase Auth app metadata or update the row in `app.user_profiles`

## Authentication flow

1. The Vercel frontend signs the user in with Supabase Auth.
2. Supabase returns an access token to the frontend.
3. The frontend sends that bearer token to the Render API.
4. The Render API validates the token with Supabase and loads the user role from `app.user_profiles`.
5. The Render API calls secure Supabase RPCs using the service-role key.
