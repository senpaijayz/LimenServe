# Supabase live audit

Read-only connector snapshot taken 2026-08-12 for the LimenServe project.

## Project

- Project: `LimenServe Project`
- Ref: `bxrdmfdokslnnluztmgl`
- Region: `ap-southeast-2`
- Status: `ACTIVE_HEALTHY`
- PostgreSQL: 17.6.1 (GA)

## Hosted migration ledger

The hosted ledger currently ends at `20260806101020 move_rls_helpers_to_private_schema_20260806`.
The repository migrations `20260806184500_phase1_secure_lookup_and_stock_receiving.sql`,
`20260809160122_phase2_normalized_stockroom_convergence.sql`, and
`20260809160534_phase2_shared_rate_limits_and_advisor_repairs.sql` are not deployed.

This is an observation only. No migration, SQL write, branch reset, or infrastructure change was
performed during this audit.

## Stockroom schema

The live database contains both models:

- Normalized `stockroom.stores`, `layouts`, `floors`, `zones`, `aisles`, `shelves`,
  `shelf_levels`, `shelf_slots`, `items`, and `item_locations`.
- Legacy `public.store_layouts` and `public.product_locations`.
- `stockroom.legacy_layout_archives` is present for compatibility history.

The normalized tables have primary keys and layout-scoped foreign keys for locations. The
repository’s convergence migration remains gated until the hosted ledger is reconciled and the
migration is replayed against an isolated schema-compatible database.

The live ACL audit also found that the historical `public.receive_supplier_invoice_stock` and
`public.receive_existing_supplier_invoice_stock` wrappers still grant `anon` and
`authenticated` execution. The new `20260812142000_phase2_revoke_legacy_receiving_client_grants.sql`
forward migration removes those client grants and preserves `service_role` compatibility. It is
not deployed.

## Advisor snapshot

- Security: 36 notices — primarily RLS-enabled tables without policies, plus leaked-password
  protection configuration.
- Performance: 233 notices — including 110 unindexed foreign keys, 109 unused-index
  observations, 12 overlapping permissive-policy notices, one RLS init-plan notice, and the
  missing primary key on `public.pricelist`.

These notices are not blanket permission to add/drop indexes or weaken RLS. Each change requires
duplicate/null analysis, query-plan evidence, and role-policy regression tests. The repository
contains static advisor snapshots and invariant SQL for the proposed safe subset.

## Approval-gated rollout

1. Export the hosted production and staging migration ledgers and schema-only definitions.
2. Recover missing compatibility migrations into immutable, uniquely versioned local files.
3. Rehearse the Phase 1/2 migrations on an isolated database with synthetic data only.
4. Run the SQL flow, role/ACL, stockroom, and rate-limit invariant suites plus the receiving
   contention harness.
5. Review the diff and rollback plan, then obtain explicit approval before applying anything to
   production.

Use [`supabase/README.md`](supabase/README.md) and
[`DEPLOYMENT_ENVIRONMENTS.md`](DEPLOYMENT_ENVIRONMENTS.md) for the commands and environment
requirements. Do not run `supabase db reset` against a linked environment.
