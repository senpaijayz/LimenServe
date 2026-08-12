# Deployment environments

This repository separates frontend, API, and Supabase configuration by environment. The checked-in files do not create a staging service, change a Vercel project, or apply a database migration. Those dashboard changes require explicit approval and environment credentials.

## Environment contract

| Frontend target | `VITE_APP_ENV` | `VITE_API_URL` | Supabase variables | Backend target |
| --- | --- | --- | --- | --- |
| Local development | `development` | `http://localhost:3001/api` | Local URL and public anon key | Local Express process |
| Vercel Preview | `staging` | `https://<staging-render-host>/api` | Isolated staging project URL and public anon key | Dedicated staging Render service |
| Vercel custom Staging | `staging` | `https://<staging-render-host>/api` | Isolated staging project URL and public anon key | Dedicated staging Render service |
| Vercel Production | `production` | `https://limen-backend.onrender.com/api` | Production project URL and public anon key | Production Render service |

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must always belong to the same environment as `VITE_API_URL`. Never put `SUPABASE_SERVICE_ROLE_KEY`, a database password, or any server secret in a `VITE_*` variable.

The Vercel `/api` rewrite was removed. A production-mode Vite build no longer silently routes preview traffic to the production Render service. `npm run build` runs a guard that requires HTTPS, non-local hosted URLs and rejects the known production API host in preview/staging builds. Local builds continue to work without hosted credentials.

## Vercel configuration

Set the project root to `web-app`. Configure these values independently in Vercel Project Settings -> Environment Variables:

1. Production scope: `VITE_APP_ENV=production`, the production `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
2. Preview scope: `VITE_APP_ENV=staging` and only staging API/Supabase values.
3. Development scope: use `web-app/.env.local`, created from `.env.example`; do not upload that file.
4. If a Vercel custom Staging environment is enabled, give it the same staging values explicitly rather than inheriting Production.
5. Redeploy each environment after changing variables; Vercel environment-variable changes do not modify an existing deployment.

The repository also carries `web-app/.env.production` with browser-safe production
defaults so a production build remains reproducible when the Vercel environment
panel is unavailable. Vercel Project Settings should still override these values;
the file contains only the public Supabase URL/key and production API origin. It is
not a substitute for configuring Preview/Staging, which remains intentionally
blocked until an isolated backend and Supabase project are supplied.

Vercel supplies `VERCEL_ENV` during the build and exposes framework-prefixed Vite environment metadata. Do not manually override those system values. To validate a prospective hosted build without deploying:

```text
cd web-app
set REQUIRE_DEPLOYMENT_ENV=true
set VITE_APP_ENV=staging
set VITE_API_URL=https://<staging-render-host>/api
set VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co
set VITE_SUPABASE_ANON_KEY=<staging-public-anon-key>
npm run verify:deployment-env
```

Use `$env:NAME="value"` in PowerShell and `export NAME=value` in bash instead of `set`. Do not paste real secrets into committed shell scripts or CI logs.

## Render configuration

`render.yaml` describes only the existing production service. Its production CORS input now contains the exact production frontend origin, with no preview wildcard or localhost entries. Do not add staging to the production service.

Create staging manually only after approval:

1. Create a separate Render web service from the same repository with root `backend`, build command `npm ci`, start command `npm start`, and health path `/api/health`.
2. Set `APP_ENV=staging`, `TRUST_PROXY_HOPS=1`, `PUBLIC_RATE_LIMIT_STORE=supabase`, and `FRONTEND_URLS` to a comma-separated list of exact, approved staging/preview origins. Do not use `*.vercel.app`.
3. Use only the staging `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and backend-only `SUPABASE_SERVICE_ROLE_KEY`.
4. Add the staging API URL to Vercel Preview only after `/api/health` and `/api/ready` succeed.
5. Add each mutable PR preview origin explicitly or keep that preview read-only. Prefer a stable staging Vercel domain so CORS does not need an unbounded wildcard.

The production blueprint uses `APP_ENV=production`, `TRUST_PROXY_HOPS=1`, `PUBLIC_RATE_LIMIT_STORE=supabase`, and `FRONTEND_URLS=https://limen-serve.vercel.app`. `PUBLIC_RATE_LIMIT_STORE=supabase` depends on the reviewed service-role-only atomic rate-limit migration, so apply that migration in the coordinated deployment window before starting the new backend. Compare the dashboard with `render.yaml` before syncing the blueprint; repository changes alone do not prove that Render has adopted those values.

## Supabase separation

Development, staging, and production must not share customer or inventory data. Do not clone production rows into preview. Use schema-only migration reconciliation and synthetic fixtures. The service-role key stays in the corresponding Render service only; the frontend receives the public anon key.

The local CLI configuration is in `supabase/config.toml`, but clean replay is intentionally gated because the repository and hosted migration ledgers do not yet agree. See `supabase/README.md` for the reconciliation and CI path. Never use `supabase db reset` against a linked project.

## Rollout and rollback

1. Provision and verify staging Render and staging Supabase first; this is a manual, approval-required infrastructure step.
2. Set and redeploy Vercel Preview variables. Confirm the build guard reports `staging` and that browser network requests use only the staging API/Supabase hosts.
3. Run read-only health, readiness, CORS allow/deny, and public catalogue checks.
4. Set Production variables only after the reviewed backend is live, then redeploy Production.
5. Confirm Vercel and Render use the same reviewed commit.

To roll back application routing, restore the previous environment-scoped values in the affected Vercel environment and redeploy a known-good frontend. Do not point Preview at Production as a shortcut. Render can redeploy the prior application commit without altering Supabase. Database corrections use reviewed forward migrations; no reset, drop, or automatic production migration is part of this process.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel deployment environments](https://vercel.com/docs/deployments/environments), [Supabase local CLI configuration](https://supabase.com/docs/guides/local-development/cli/config), and [Supabase CI database testing](https://supabase.com/docs/guides/deployment/ci/testing).
