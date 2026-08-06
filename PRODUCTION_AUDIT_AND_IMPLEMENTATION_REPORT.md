# Production audit and implementation report

Audit snapshot: 2026-08-06 (Asia/Taipei)

This report is based on the local checkout, GitHub, the connected Vercel and Render projects, and the live Supabase project `bxrdmfdokslnnluztmgl`. Secret values were not read or recorded. Production records were queried only for aggregate counts, status distributions, schema metadata, and invariant checks.

## 1. Current architecture

LimenServe is a Vite/React single-page application hosted by Vercel. In production the browser uses same-origin `/api` requests; Vercel rewrites those requests to the Express API on Render. The browser also uses Supabase Auth for session lifecycle. It sends the resulting bearer token to Render, where middleware validates the token and resolves the authoritative role from `core.user_profiles`. Render is the only application tier allowed to use the Supabase service-role credential.

```text
Browser
  -> Vercel Vite SPA (https://limen-serve.vercel.app)
     -> /api/* rewrite
        -> Render Express API (https://limen-backend.onrender.com)
           -> Supabase Auth/PostgREST/Postgres/Storage

Browser -> Supabase Auth using the publishable/anon key
Render  -> Supabase using anon key for token validation and service role for authorized server operations
```

The application contains public catalog/CMS/estimate pages, staff dashboards, inventory and stock receipts, POS, quotations, service orders, users/mechanics, suppliers, reports, 3D stockroom layout, customer service history, mechanic assignment, and part reservations.

## 2. Technologies and connected services

- Frontend: React 19.2.8, React Router 8.3, Vite, Tailwind CSS, Framer Motion, TanStack Query, Zustand, Supabase JS, Axios, Vitest, and a self-destroying PWA service worker.
- Backend: Node.js/Express, Supabase JS, CORS, Multer, and Paddle/ONNX invoice OCR with OCR.space fallback.
- Database: Supabase Postgres 17 in `ap-southeast-2`, project `bxrdmfdokslnnluztmgl`, status `ACTIVE_HEALTHY`.
- Authentication and storage: Supabase Auth and Supabase Storage.
- Source control: GitHub repository `senpaijayz/LimenServe`, default and production branch `main`.
- Frontend deployment: Vercel project `limen-serve` (`prj_f1f3cdXviTYiCQ7efUVrf3yGX1Fs`).
- Backend deployment: Render web service `limen-backend` (`srv-d6rqmefdiees73bvimg0`) in Singapore.

The production Supabase project is on the confirmed Free plan. A previously created, unused Free staging project (`tncekqyecihscadayufs`) still exists, but no application or deployment is pointed at it and this continuation makes no changes to it. All implementation and verification in scope here use the requested production project `bxrdmfdokslnnluztmgl` only.

## 3. Production source of truth

There are two production authorities:

- Application code: GitHub `main`, commit `1b92e829cfcd2cf1066f07f9437608b4016ffa35` at the audit snapshot.
- Live schema and business data: Supabase project `bxrdmfdokslnnluztmgl`.

Vercel and Render both deploy GitHub `main` and both currently run the same commit. The local follow-up branch `feature/production-hardening-audit` starts from that production commit and contains only post-audit hardening until it is reviewed and merged.

The untracked local `outputs/` directory and root `package.json` are user files and are not part of the GitHub or production source of truth. They were not modified or included.

## 4. GitHub and Vercel deployment

- Repository: `https://github.com/senpaijayz/LimenServe`
- Production branch: `main`
- Merged feature PR: `#1`, `feature/secure-assignments-reservations` -> `main`
- Production commit: `1b92e829cfcd2cf1066f07f9437608b4016ffa35`
- Vercel production URL: `https://limen-serve.vercel.app`
- Vercel deployment: `dpl_6gxjitbgRVrUcr8ht8UQ4haK1AMp`, state `READY`, region `iad1`
- Framework: Vite; Vercel Node setting: `24.x`
- Build behavior: the connected `web-app` package runs `npm run build` and emits `dist`.
- Routing: `web-app/vercel.json` rewrites `/api/(.*)` to Render and all other paths to `/index.html` for SPA routing.
- Serverless application routes: none; `/api` is a rewrite to Render, not a Vercel Function.
- Build result: successful. The only material warning is the lazy 3D `three` chunk at about 719 kB minified. It is excluded from initial module preload and does not block deployment.

The Vercel connector does not expose a read-only environment-variable listing. Required frontend names found in code are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_API_URL`, and optional `VITE_USE_DIRECT_API_URL`. Production should keep `VITE_USE_DIRECT_API_URL` unset/false so same-origin CDN caching remains active.

## 5. GitHub and Render deployment

- Render URL: `https://limen-backend.onrender.com`
- Service: `srv-d6rqmefdiees73bvimg0`, branch `main`, automatic deploy on commit enabled
- Production deploy: `dep-d9q4ll3l550s7382m4g0`, status `live`
- Deployed commit: `1b92e829cfcd2cf1066f07f9437608b4016ffa35`
- Runtime: Node.js 22.22.0, one Starter instance, Singapore
- Executed build command in the deployment log: `cd backend && npm install`
- Executed start command: `cd backend && npm start`
- API base URL: `https://limen-backend.onrender.com/api`
- CORS: exact production Vercel origin, Vercel preview pattern, and local development origins are allowed; an unrelated origin is rejected.
- Background workers and cron jobs: none detected.

Render's service metadata reports an empty root directory, blank health-check path, and a stale `yarn` build value even though the deployment log proves that `cd backend && npm install` executed. `render.yaml` describes the desired root-directory/health-check configuration but is not the effective source for the existing dashboard-managed service. This drift should be corrected in a separate reviewed Render settings change; it does not change the currently running commit.

Required backend environment names found in code are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URLS` (or legacy `FRONTEND_URL`), and `PORT`. Optional operational names are `OCR_SPACE_API_KEY`, `AUTH_USER_CACHE_TTL_MS`, and `AUTH_USER_CACHE_MAX_ENTRIES`. The connector did not expose secret values or a read-only configured-name list.

## 6. Synchronization comparison

| Source | Branch/commit or state | Compared with production | Result |
| --- | --- | --- | --- |
| GitHub | `main` at `1b92e82` | Code authority | Current production baseline |
| Vercel | `main` at `1b92e82` | GitHub | Exact commit match |
| Render | `main` at `1b92e82` | GitHub/Vercel | Exact commit match |
| Supabase | Healthy; feature migrations applied | Repository migrations | Feature schema matches deployed code |
| Local checkout | Follow-up branch from `1b92e82` | GitHub | Contains intentional, not-yet-deployed hardening changes |

No production-only application feature was found that is absent from GitHub. No merged GitHub feature is missing from either deployment. The material differences are deployment-setting metadata on Render, production database migration version labels generated by the platform versus local filenames, and the intentional follow-up branch changes described below.

## 7. Supabase structure related to the requested features

Live aggregate state at the audit snapshot:

| Table | Rows/status |
| --- | --- |
| `core.user_profiles` | 3: admin 1, cashier 1, stock clerk 1 |
| `operations.customers` | 26 |
| `operations.mechanics` | 1, active/available |
| `operations.service_orders` | 15: completed 12, pending 2, in progress 1 |
| `catalog.products` | 33,215 |
| `catalog.inventory_balances` | 33,215 |
| `operations.mechanic_assignments` | 0 |
| `operations.part_reservations` | 0 |
| `operations.part_reservation_events` | 0 |

Core relationships:

- `core.user_profiles.user_id` links an Auth user to the authoritative application role.
- `operations.customers.user_id` links a customer record to an Auth user.
- `operations.mechanics.user_id` optionally links a mechanic to an Auth user; `is_active` and `availability_status` control eligibility.
- `operations.service_orders.customer_id` references customers and `assigned_mechanic_id` references mechanics; scheduled start/end are nullable until assignment.
- `operations.mechanic_assignments.id` is the primary key. Foreign keys reference service order, mechanic, assigning Auth user, and ending Auth user. A partial unique index allows one active assignment per service order, and a GiST exclusion constraint prevents overlapping active assignments for a mechanic. Reassignment/removal ends the previous row instead of deleting history.
- `catalog.inventory_balances.product_id` is the product key. `on_hand` is physical stock, `reserved` is allocated reservation stock, and available stock is `on_hand - reserved`.
- `operations.part_reservations.id` is the primary key. Foreign keys reference customer, product, and processing Auth user. Quantity checks require whole numbers from 1 to 999 and ensure `0 <= allocated <= requested`.
- `operations.part_reservation_events.id` is the primary key and `reservation_id` cascades from the reservation. The actor Auth user is retained when available.
- Partial uniqueness prevents duplicate active reservations for the same customer/product; `(customer_id, request_key)` supplies idempotency.

Reservation statuses are `pending`, `approved`, `waiting_for_stock`, `partially_available`, `available`, `completed`, `rejected`, and `cancelled`. Assignment statuses are `assigned`, `reassigned`, `removed`, `completed`, and `cancelled`.

RLS permits authenticated owners and appropriate internal users to read assignments/reservations/history. Direct mutation privileges are revoked from `anon` and `authenticated`; service-only RPCs perform admin/customer checks and locked atomic mutations. Restock allocation is triggered when `inventory_balances.on_hand` increases. Live checks found zero negative/over-reserved balances and zero duplicate active reservations.

Storage contains two public, restricted image buckets: `mechanic-photos` (2 MiB, PNG/JPEG/WebP) and `public-assets` (5 MiB, PNG/JPEG/WebP/SVG). No Supabase Edge Functions or Realtime publications are active.

Applied production migrations:

- `20260806084302_harden_authorization_20260806`
- `20260806084306_mechanic_assignments_20260806`
- `20260806084309_part_reservations_20260806`

They correspond to the repository's additive, data-preserving migration files under `supabase/migrations/2026080606390*.sql`.

## 8. Existing issues and risks

- Render logged intermittent `ENOTFOUND` lookups for the correct Supabase host before the feature rollout. The latest deploy and live requests are healthy, so this is an external DNS/transient-connectivity risk to monitor rather than a configuration substitution.
- Render dashboard metadata does not fully match the executed build command or `render.yaml`; health check is blank in the live service metadata.
- A previously created Render staging service (`srv-d9q4et942hec739p91fg`) is not connected to production and its attempted deploy failed because no staging-only service secret was supplied. It is not used by this rollout and was not deleted without explicit authorization.
- At the audit snapshot, Supabase's security advisor reported three mutable-search-path functions and five authenticated SECURITY DEFINER role helpers. The reviewed security follow-up removed all eight warnings. The remaining RLS-without-policy findings are informational for intentionally inaccessible/internal tables; leaked-password protection remains disabled because it is Pro-only.
- Supabase performance advisor reports pre-existing unused indexes and multiple permissive policies. Removing indexes or merging policies without representative workload evidence is unsafe and outside this feature change.
- React Router's RSC-only CSRF advisory did not affect LimenServe's declarative `BrowserRouter` architecture. The supported React Router 8.3 upgrade is included in the security follow-up and removes the advisory from `npm audit`.
- Backend npm audit reports zero vulnerabilities after a scoped npm override moved ONNX's install-only `adm-zip` dependency to patched version 0.6.0. A clean `npm ci`, ONNX/Paddle initialization, and the exact archive extraction APIs used by ONNX were verified. The invoice OCR adapter now passes an `ArrayBuffer`, matching the installed Paddle package's Node API instead of relying on its incompatible file-path example.
- The optional 3D stockroom bundle is large, but it is route-lazy and excluded from initial preload.
- Supabase leaked-password protection should be enabled in Auth settings when available on the selected plan after testing the user-registration flow.

## 9. Files created, modified, and removed

The completed feature implementation created the reservation route/pages/API, customer service-order page, caching middleware tests, three safe migrations, two SQL invariant/flow tests, and the caching/deployment documents. It modified the existing app routes, navigation, auth resolver, product catalog, service-order API/UI, mechanic API/UI, button/input states, CORS/cache middleware, and inventory mutation invalidation.

The follow-up hardening branch creates:

- `PRODUCTION_AUDIT_AND_IMPLEMENTATION_REPORT.md`
- `web-app/src/components/ui/ConfirmDialog.jsx`
- `web-app/src/tests/confirmDialog.test.jsx`

It modifies:

- `DEPLOYMENT_AND_ROLLBACK.md`
- frontend/backend package manifests and lockfiles
- public product/reservation/service-order modal accessibility and confirmations
- existing lint failures in Dropdown, notifications, loader, toast, theme, and global search

It removes the unused one-off `web-app/bg-remover.js` and its vulnerable `@imgly/background-removal-node` dependency. Existing production functionality and generated image assets remain.

## 10. Required migrations and RLS changes

The authorization, assignment, reservation, and security follow-up migrations are applied and validated on `bxrdmfdokslnnluztmgl`. `20260806101020_move_rls_helpers_to_private_schema.sql` moves five RLS authorization helpers from the exposed `app` schema to a non-exposed `private` schema without recreating policies or changing data, fixes two incorrect stockroom relation references, and pins three remaining function `search_path` values.

The migration was rehearsed in a rolled-back transaction against production metadata, then applied only after the Vercel preview passed. PostgreSQL policy dependencies followed the moved function OIDs automatically; admin, cashier, published-layout, function-grant, policy-access, invariant, advisor, and unchanged-row-count assertions passed after application.

Rollback is forward-only for data-bearing tables: do not drop assignment, reservation, or event history. If a defect appears, roll back application mutations first and use a corrective additive migration or `CREATE OR REPLACE FUNCTION` migration. Never reset the production project.

The pre-existing advisor warnings should be handled later in a separate migration set with targeted regression tests. They must not be mixed into this deployment merely to reduce advisor counts.

## 11. Environment and deployment-setting changes

No new environment variable is required by mechanic assignment, reservations, cookies, or caching. Existing names are sufficient.

Recommended reviewed platform settings:

1. Render: set the health check to `/api/health` and make the dashboard root/build/start values unambiguous (`backend`, `npm ci`, `npm start`, or the equivalent repository-root commands).
2. Vercel: keep the project root on `web-app`, framework Vite, build `npm run build`, output `dist`, and keep the `/api` rewrite.
3. Vercel: keep production API traffic same-origin; do not set `VITE_USE_DIRECT_API_URL=true` in production.
4. Supabase: keep the project on Free and use only `https://bxrdmfdokslnnluztmgl.supabase.co`.
5. Supabase Auth: leaked-password protection is Pro-only and must remain disabled while the project stays at the required $0/month. Continue enforcing the application's existing password validation and consider MFA for privileged staff instead.

## 12. Implementation plan and completed sequence

1. Audit local, GitHub, Vercel, Render, and live Supabase independently.
2. Identify the shared production commit and configuration/schema drift.
3. Apply authorization hardening, then additive assignment and reservation migrations.
4. Add server routes with role guards, validation, locked RPC mutations, history, and cache invalidation.
5. Add responsive customer/admin UI, action variants, loading/empty/error states, and accessibility labels.
6. Add public/private cache classification, bounded in-memory caches, CDN headers, and mutation invalidation.
7. Preserve Supabase Auth as the only session authority and avoid duplicate auth cookies.
8. Add confirmation dialogs and modal keyboard/accessibility hardening.
9. Remove the unused vulnerable image tool and apply compatible dependency security updates.
10. Run SQL invariants, unit tests, lint, production build, and live platform checks.
11. Publish the follow-up through a PR/preview and merge only after the checks pass.
12. Verify both deployments use the merged immutable commit and repeat production smoke checks without creating business records.

## 13. Testing plan and evidence

- Database: migration presence, aggregate before/after counts, RLS/grants, FK/constraint metadata, no negative/over-reserved inventory, no duplicate active reservations, and transaction-rollback feature flow.
- Backend: token-cache behavior, customer-role safety, cache classification/invalidation, CMS behavior, and batching utilities.
- Frontend: component/model/API tests, confirmation behavior, session refresh, inventory workflows, schema expectations, and barcode/3D UI tests.
- Build quality: ESLint, Vite production build, and npm audit review without `--force`.
- Browser: production desktop/mobile home and catalog, stock labels, registration labels, protected-route redirect, cache headers, Render health, and CORS allow/deny behavior.
- Authenticated mutation flows: exercised against isolated test data inside a rolled-back transaction. Production aggregate verification is read-only because no production test credentials or disposable business records were authorized.

Current local evidence: 102/102 frontend tests pass, 14/14 backend tests pass, ESLint passes, the Vite production build passes, and both frontend and backend npm audits report zero vulnerabilities. The backend dependency fix also passes a clean-install OCR initialization and production-shaped image-recognition smoke test.

## 14. Deployment and rollback plan

Use the exact sequence in `DEPLOYMENT_AND_ROLLBACK.md`. Vercel previews are available from a GitHub PR. Render PR previews are disabled, so backend verification consists of local tests plus the production deployment only after the reviewed merge. Supabase requires no follow-up DDL.

Rollback order is frontend, backend, then corrective database action only if needed. Application rollback must never delete or reverse existing production users, inventory, services, assignments, reservations, or event history.
