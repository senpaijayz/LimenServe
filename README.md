# LimenServe

LimenServe is an incremental production application with:

- `web-app`: React 19 and Vite, deployed to Vercel
- `backend`: Node.js and Express, deployed to Render
- `supabase`: PostgreSQL, Auth, RLS, migrations, and database tests

Do not place `SUPABASE_SERVICE_ROLE_KEY` in Vercel or any `VITE_*` variable. It is a backend-only secret.

## Local setup

Requirements: Node.js 22 and npm. Supabase CLI v2.113.0 plus Docker are required for the isolated database replay after the migration baseline is reconciled.

```text
cd backend
npm ci
copy .env.example .env
npm run dev
```

In a second terminal:

```text
cd web-app
npm ci
copy .env.example .env.local
npm run dev
```

Use `cp` instead of `copy` on macOS/Linux. The frontend defaults to `http://localhost:3001/api` in development.

## Environment variables

| Target | Variable | Purpose |
| --- | --- | --- |
| Render backend | `SUPABASE_URL` | Environment-specific Supabase project URL |
| Render backend | `SUPABASE_ANON_KEY` | Token validation against that project |
| Render backend | `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged database access |
| Render backend | `FRONTEND_URLS` | Comma-separated allowed frontend origins |
| Render backend | `APP_ENV` | Explicit `development`, `staging`, `preview`, or `production` runtime mode |
| Render backend | `TRUST_PROXY_HOPS` | Trusted reverse-proxy hop count; required in hosted modes |
| Render backend | `PUBLIC_RATE_LIMIT_STORE` | `memory` only locally; `supabase` in every hosted environment after the Phase 2 migration |
| Render backend | `PORT` | Supplied by Render; local default is `3001` |
| Render backend | `OCR_SPACE_API_KEY` | Optional invoice OCR provider key |
| Vercel frontend | `VITE_SUPABASE_URL` | Matching environment's Supabase URL |
| Vercel frontend | `VITE_SUPABASE_ANON_KEY` | Public anon key; never use the service-role key |
| Vercel frontend | `VITE_APP_ENV` | Explicit `development`, `staging`, `preview`, or `production` label |
| Vercel frontend | `VITE_API_URL` | Environment-specific backend API base |

Production, preview/staging, and development must use separate values. The hardcoded production API rewrite has been removed and hosted builds fail validation when their required environment values are missing or unsafe. Dashboard configuration is still a manual step; use [the deployment environment runbook](DEPLOYMENT_ENVIRONMENTS.md) before enabling preview mutations.

## Tests and builds

```text
cd web-app
npm run lint
npm test -- --run
npm run build
npm run test:bundle

cd ../backend
npm test

cd ..
node supabase/scripts/check-migration-consistency.mjs
```

The responsive browser audit uses a locally installed Chrome and a running site:

```text
cd web-app
npm run test:responsive
```

Set `RESPONSIVE_TEST_URL=http://127.0.0.1:4173` first (`$env:RESPONSIVE_TEST_URL=...` in PowerShell). The exact script name is defined in `web-app/package.json`.

`npm run build` writes a Vite manifest and automatically checks gzip budgets for
the initial and major feature-route static closures. The graph check rejects
Three.js/R3F/Drei, scanner, chart, and admin feature edges from ordinary public
pages.

The 3D locator defaults to an adaptive quality tier. Operators can choose Auto,
High, Medium, or Low from its View controls; Low caps DPR and removes bloom,
environment effects, contact shadows, and per-object labels. If WebGL fails, the
locator retains product search and presents a keyboard-readable floor/location
table instead of blocking inventory lookup.
The View controls also expose an x-ray mode that keeps selected and located
objects opaque while making surrounding fixtures translucent.
The browser records route timing and supported native vitals in
`window.__limenPerformance` and emits `limen:performance` events; connecting
that snapshot to a hosted telemetry provider remains an environment decision.

After the Phase 1 migration has been applied to an isolated local database, run the database assertions with `ON_ERROR_STOP`:

```text
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/20260806_phase1_database_security_invariants.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/20260806_phase1_database_flows.sql
```

The automated contention harness hard-refuses non-localhost URLs and requires an explicit opt-in:

```text
cd backend
npm run test:db:stock-concurrency
```

Set `RUN_LOCAL_SUPABASE_INTEGRATION_TESTS=true`, `LOCAL_SUPABASE_URL`, and `LOCAL_SUPABASE_SERVICE_ROLE_KEY` only for the disposable local database. The harness cleans its UUID-scoped relational fixtures; idempotency-ledger rows remain until that disposable database is reset because direct service-role table access is intentionally denied.

## Phase 1 security and inventory migration

`supabase/migrations/20260806184500_phase1_secure_lookup_and_stock_receiving.sql` is additive except for replacing the existing public-estimate lookup function with a narrower implementation and tightening estimate-function privileges. It:

- verifies a normalized Philippine phone number and exposes only an allowlisted quote response;
- validates and allowlists anonymous quote creation, resolves active product/service identities and current prices server-side, derives every persisted line and total, forces server-owned public fields, drops vehicle plates, and throttles by IP and normalized phone;
- makes estimate create/list/detail/revision/revise/convert RPCs and their retained legacy helpers service-role-only, so browser clients cannot bypass backend authorization or response shaping;
- adds a private RLS-protected receipt idempotency ledger;
- makes manual stock receipt balance, movement, supplier link, and receiving log writes one transaction; and
- wraps invoice receiving with idempotent replay and payload-conflict detection, and gives manual/invoice receiving one deterministic advisory -> product -> supplier -> balance lock order. A reviewed forward migration revokes anonymous/authenticated execution on historical invoice wrappers while retaining service-role compatibility; apply it only after the isolated database rehearsal.

Anonymous product prices may match the current imported pricelist row for the product's server-owned SKU or its current retail price; service prices must match the active service's standard price. Bundle savings are accepted only when every discounted line references a unique active recommendation item, the qualifying anchor quantity is present, each bundle line has quantity one, and the submitted redistributed group total equals the authoritative resolved total. Dynamic recommendations without verifiable package-item provenance are submitted at catalogue price; stale or tampered package references are rejected. Anonymous bundled requests are capped at 12 bundle lines and 8 distinct product/anchor candidates before recommendation readers run. Staging-only rows without an active product UUID remain visible for reference but are disabled in the online quote builder.

Saved quotation lists exclude rows whose `valid_until` date is before the current UTC date. Public quote lookup already applies the same expiry rule. The forward migration is `supabase/migrations/20260820140000_hide_expired_estimates.sql`; the backend also filters defensively while databases are being migrated.

Staff can remove a quotation from the saved list only while its status is `draft`. The delete action requires administrator authentication, confirms the quotation in the UI, locks and rechecks the row in `public.delete_draft_estimate(uuid)`, and is rejected for sent, approved, or converted quotations. The service-role-only RPC and its invariants are in `supabase/migrations/20260820160000_delete_draft_estimates.sql` and `supabase/tests/20260820_delete_draft_estimates_invariants.sql`.

## Guest part requests and admin reservations

Customers can request an unavailable or insufficiently stocked part directly from the public catalogue without creating an account. The request form collects a name and normalized phone number (email and note are optional), is idempotent, and is rate limited. Customer account registration and the customer service/reservation portal are not exposed; service orders and reservations are managed by staff. Only authenticated internal administrators can list, inspect, approve, allocate, reject, cancel, or complete part requests from the admin queue. The queue also provides **Reserve for customer**, where staff enter the customer's name and contact details, search for an active part by name or part number, set a quantity, record paid/partially paid/unpaid status, and add an internal note. Customer matching/upsert and reservation creation are transactional and idempotent; the flow does not impersonate customer authentication. Existing reservation rows are intentionally retained as audit history; no production rows are deleted by migrations. Apply `supabase/migrations/20260817120000_public_guest_reservations_admin_only.sql`, `supabase/migrations/20260820120000_admin_part_reservations.sql`, and `supabase/migrations/20260820150000_admin_reservation_customer_fields.sql` only after an isolated staging rehearsal and run the matching invariant tests.

Do not apply this migration automatically to production. Validate it first against a schema-compatible non-production database and run the SQL tests. Deployment must be coordinated because the new backend requires these RPCs and the new lookup UI requires the backend phone-verification contract.

Recommended production order:

1. Back up schema metadata and record current migration/deployment identifiers.
2. Validate the migration plus `supabase/tests/20260806_phase1_database_flows.sql` and `supabase/tests/20260806_phase1_database_security_invariants.sql` in an isolated, schema-compatible database.
3. Start a short maintenance window for public quote lookup and stock receiving, then apply the reviewed migration explicitly.
4. Deploy the secured backend first. Old frontend lookup/receiving calls will fail safely until the matching frontend is live; do not restore the insecure handlers to avoid that temporary outage.
5. Deploy the frontend immediately afterward, then end the maintenance window.
6. Verify lookup rejection/acceptance, rate-limit headers, idempotent replay, and one explicitly authorized disposable stock receipt.
7. Confirm Vercel and Render run the same reviewed commit and rerun read-only inventory invariants.

## Rollback policy

- Never use `supabase db reset`, destructive restores, or table drops against production.
- Keep `catalog.stock_receipt_idempotency`; it is an audit/replay record and is harmless to older application code.
- Correct database functions with a reviewed forward migration. Do not restore the quote-number-only lookup or re-grant any estimate RPC/helper to `PUBLIC`, `anon`, or `authenticated`.
- Do not roll the backend back to a version with quote-only lookup or non-transactional receiving. If an incident occurs, temporarily return `503` for the affected mutation/lookup and deploy a forward fix.
- A frontend-only rollback is data-safe, but an old lookup form cannot use the phone-required backend and should be treated as a temporary feature outage.
- Application deployment rollback details and known-good historical identifiers are in [DEPLOYMENT_AND_ROLLBACK.md](DEPLOYMENT_AND_ROLLBACK.md).

## Supabase baseline warning

`supabase/config.toml`, an immutable migration-history check, and a gated database-test workflow now exist. The repository is still not a trustworthy clean-database bootstrap: 11 local version groups collapse multiple files in the Supabase CLI ledger, production and staging contain different history, and `supabase/generated/setup_full.sql` is stale. The default CI job checks that this known drift does not change; full local replay remains skipped until both remote ledgers are reconciled and an isolated replay succeeds. Do not claim `supabase db reset` works or run production repair commands. Existing data in either stockroom model must not be deleted.

The normalized `stockroom` schema is the intended long-term source of truth. Legacy `public.store_layouts` and `public.product_locations` remain in service and require an archive/crosswalk, normalized-first compatibility reads, revisioned draft/publish RPCs, and migration coverage before retirement. Detailed gates are in [PHASES_2_TO_4_PLAN.md](PHASES_2_TO_4_PLAN.md).

## Phase 2 migration and rollout gate

Two forward-only migrations are prepared but **not applied** to either hosted project:

- `20260809160534_phase2_shared_rate_limits_and_advisor_repairs.sql` adds the server-only atomic rate-limit RPC used by hosted anonymous estimate routes, adds the verified `public.pricelist(sku)` primary key, and makes two narrowly reviewed RLS-policy repairs.
- `20260809160122_phase2_normalized_stockroom_convergence.sql` makes `stockroom` the normalized future target while preserving legacy rows in archive/crosswalk tables. It adds store-scoped location integrity, revisions, draft/publish lifecycle RPCs, audit history, and service-role-only compatibility views.

The read-only hosted audit found that production has the normalized `stockroom` schema but staging does not, and that production-only compatibility migrations are missing from this repository. First recover and reconcile that baseline in an isolated database, then run the Phase 1 and Phase 2 SQL assertions through `supabase/scripts/run-database-tests.mjs`. Only after a reviewed staging rehearsal should the migrations and the Render `PUBLIC_RATE_LIMIT_STORE=supabase` configuration be promoted. Do not apply either migration to staging or production directly from this workspace.

## Deployment references

See [DEPLOYMENT_ENVIRONMENTS.md](DEPLOYMENT_ENVIRONMENTS.md) for exact Production, Preview/Staging, and Development variable scopes, manual rollout, and rollback.

The latest read-only hosted Supabase snapshot is recorded in [SUPABASE_LIVE_AUDIT.md](SUPABASE_LIVE_AUDIT.md). It does not authorize applying the pending migrations; use the approval-gated rehearsal documented there.

- Production frontend: `https://limen-serve.vercel.app`
- Production backend: `https://limen-backend.onrender.com`
- Render root directory: `backend`
- Vercel root directory: `web-app`
- Render health path: `/api/health`

Never use production customer or inventory mutations as smoke tests without an explicitly authorized disposable record.
