# Supabase Backend

This directory contains the database implementation for the LimenServe transactional backend, warehouse, data-mining rules, and forecasting pipeline.

> **Baseline warning (2026-08-10):** the local migration ledger is not yet a reproducible clean-database bootstrap. Eleven version groups collapse multiple files in the Supabase CLI ledger, production and staging contain different histories, and `generated/setup_full.sql` stops at the early migration set. `config.toml` and CI now preserve this known baseline without claiming it is replayable. Do not run that generated file or `supabase db reset` against a linked environment.

## Files

- `migrations/20260316_000001_core_schema.sql`
  Creates the `app`, `dw`, and `ml` schemas plus all core tables.
- `migrations/20260316_000002_operational_and_etl_functions.sql`
  Adds transactional workflow functions and ETL loaders.
- `migrations/20260316_000003_analytics_rpc.sql`
  Adds association-rule mining, forecasts, views, and RPCs.
- `migrations/20260316_000004_seed_and_security.sql`
  Adds demo seed data, triggers, RLS, and grants.
- `migrations/20260316_000007_auth_profile_sync.sql`
  Keeps `app.user_profiles` aligned with Supabase Auth users automatically.
- `seed.sql`
  Seeds demo data and runs the first analytics refresh.
- `generated/setup_full.sql`
  Deprecated, incomplete snapshot retained for audit history. It is not a current deployment artifact.

## Expected flow

1. Run `node supabase/scripts/check-migration-consistency.mjs`. It verifies the frozen migration digest, known duplicate groups, forward-migration naming, unresolved merge markers, and SQL test manifest.
2. Export the production and staging migration ledgers read-only, then compare each export with `--remote-ledger <path>`. Do not use a linked write command for this audit.
3. Recover missing hosted compatibility migrations as reviewed, uniquely versioned forward files. Do not rename or edit migrations recorded by a hosted environment.
4. After the repository/production/staging ledgers are reconciled, prove a clean replay against an isolated local database and retain the CI evidence.
5. Only then set both readiness flags in `migration-history-policy.json` in the same reviewed change. CI will start the local database and run the SQL suite automatically.
6. Replace `seed.sql` with synthetic-only data before enabling `[db.seed]`, then run the analytics refresh only in development.

The optional remote-ledger input is JSON shaped as either an array or `{ "migrations": [...] }`; every row needs `version` and `name`. Store exports under ignored `supabase/.temp/`, never commit database passwords or production row data. Use `--require-remote-match` only after the compatibility history has been recovered.

The checked-in policy freezes the pre-Phase-2 files by SHA-256. New migrations must use a unique 14-digit UTC prefix later than the frozen cutoff. The policy deliberately records `cleanReplayReady: false` and `remoteLedgersReconciled: false`, so the default GitHub workflow performs safe consistency checks and skips its Docker database job rather than knowingly failing or pretending replay works.

`config.toml` follows the Supabase CLI v2.113.0 configuration model and uses PostgreSQL 17, the current platform default. Confirm every hosted project's `SHOW server_version` result before marking reconciliation complete. Local seed loading is disabled because the existing seed is not yet a reviewed synthetic fixture.

Useful commands:

```text
node supabase/scripts/check-migration-consistency.mjs
node supabase/scripts/check-migration-consistency.mjs --remote-ledger supabase/.temp/production-ledger.json
node supabase/scripts/check-migration-consistency.mjs --remote-ledger supabase/.temp/staging-ledger.json
node supabase/scripts/check-migration-consistency.mjs --require-clean-replay
```

The final command is expected to fail until reconciliation is complete. Supabase CLI command defaults differ between local and linked operations, so pass `--local` or `--linked` explicitly whenever the selected command supports those flags.

## Smaller manual SQL files

If you prefer smaller files in Supabase SQL Editor instead of one large setup script, use:

- `manual-sql/README.md`
- `manual-sql/01_login_and_roles.sql`
- `manual-sql/02_inventory_and_catalog.sql`
- `manual-sql/03_estimation_and_services.sql`
- `manual-sql/04_sales_service_and_upsell.sql`
- `manual-sql/05_data_warehouse_tables.sql`
- `manual-sql/06_operational_functions.sql`
- `manual-sql/07_analytics_and_refresh_functions.sql`
- `manual-sql/08_public_rpcs.sql`
- `manual-sql/09_security_and_permissions.sql`
- `manual-sql/10_auth_profile_sync.sql`
- `manual-sql/11_demo_seed.sql`

The ERD is available in:

- `manual-sql/ERD.md`

## Catalog seeding from the current frontend data

To convert the existing curated product catalog into SQL seed statements:

```bash
node supabase/scripts/export-product-seed.mjs supabase/generated/product_catalog_seed.sql
```

Then run the generated SQL file before `seed.sql` if you want the live app catalog to come from Supabase instead of the local fallback data.

If you want a single SQL file that includes both the product catalog seed and the demo analytics seed, use:

- `generated/seed_full.sql`

Do not use `generated/setup_full.sql` for new environments until it is regenerated from the reconciled migration baseline and verified in CI.

## Phase 1 database checks

After applying `migrations/20260806184500_phase1_secure_lookup_and_stock_receiving.sql` to an isolated schema-compatible test database, run both SQL assertion files with `ON_ERROR_STOP`:

- `tests/20260806_phase1_database_security_invariants.sql`
- `tests/20260806_phase1_database_flows.sql`

True lock contention is covered by `../backend/scripts/run-stock-receiving-concurrency.mjs`, including inverse-order invoices and a same-product manual-vs-invoice call with distinct suppliers. The harness hard-refuses non-localhost database URLs. See the root README for its opt-in environment variables. These tests must pass before requesting approval for a production migration.

The Phase 1 migration also makes all estimate create/list/detail/revision/revise/convert RPCs and any retained `app`-schema estimate helpers executable only by `service_role`. The browser frontend uses the Express API boundary for these flows; do not re-grant direct execution to `PUBLIC`, `anon`, or `authenticated`.

## Phase 2 forward migrations

`20260809160534_phase2_shared_rate_limits_and_advisor_repairs.sql` introduces the service-role-only shared limiter required by hosted anonymous estimate endpoints and makes only preflight-protected advisor repairs. `20260809160122_phase2_normalized_stockroom_convergence.sql` targets the deployed `stockroom` schema, retains legacy public stockroom rows in archive/crosswalk tables, and adds revisioned draft/publish lifecycle functions plus audit history.

Both migrations require a recovered, production-compatible baseline; staging currently lacks the normalized stockroom relations. Rehearse them in an isolated database, then run `tests/20260810_phase2_rate_limit_and_advisor_invariants.sql` and `tests/20260810_phase2_stockroom_convergence_test.sql` with `ON_ERROR_STOP`. Do not set a hosted backend to `PUBLIC_RATE_LIMIT_STORE=supabase` until the shared limiter migration has passed that rehearsal and is applied in the same coordinated release window.

`20260812142000_phase2_revoke_legacy_receiving_client_grants.sql` closes the live ACL gap on the historical public invoice wrappers: it removes `anon`/`authenticated` execution while retaining `service_role` compatibility. Apply it only after the same isolated rehearsal and caller inventory; the read-only live audit in [`SUPABASE_LIVE_AUDIT.md`](../SUPABASE_LIVE_AUDIT.md) confirmed those client grants are currently present.

## Main RPCs

- `get_product_catalog`
- `create_estimate`
- `convert_estimate_to_sale`
- `convert_estimate_to_service_order`
- `record_upsell_action`
- `get_product_upsell_recommendations`
- `get_monthly_product_forecasts`
- `get_monthly_service_forecasts`
- `get_analytics_dashboard_snapshot`
- `run_full_analytics_refresh`
