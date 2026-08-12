# Supabase advisor review — 2026-08-10

This is a read-only snapshot of the connected LimenServe projects. It contains
no credentials and does not authorize applying migrations.

## Environment state

| Environment | PostgreSQL | Migration ledger | Stockroom state |
| --- | --- | ---: | --- |
| Production (`bxrd…tmgl`) | 17.6 | 51 rows | normalized `stockroom` data plus preserved legacy `public` data |
| Staging (`tnce…yufs`) | 17.6 | 1 row | no normalized or legacy stockroom tables |

Production has 2 legacy layouts and 6 legacy product locations. The normalized
model has 1 store, 1 layout, 104 item locations, and 33,215 synchronized items.
The repository migration history does not reproduce this state: several
production compatibility migrations are absent locally, and the historical
numbered filenames collapse to duplicate Supabase CLI versions. Staging must
not be treated as a production-compatible rehearsal target until that baseline
is reconciled.

## Security advisor

Production reported 36 notices:

- 35 `rls_enabled_no_policy` informational notices: catalog 2, CMS 10, data
  warehouse 15, operations 2, recommendations 5, and stockroom 1. An
  RLS-enabled table with no policy is deny-by-default for browser roles, so
  these are not automatically vulnerabilities. Each table must be classified
  as server-only or given a narrowly scoped policy before any change.
- 1 leaked-password-protection notice for Supabase Auth. Enabling the setting
  is a dashboard/configuration decision and is not changed by SQL here.

Staging reported no security-advisor notices, but its schema is not comparable
to production.

Reference: [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Performance advisor

Production reported 233 notices:

- 110 unindexed foreign keys: catalog 6, CMS 20, data warehouse 29, ML 17,
  operations 17, recommendations 8, and stockroom 13. Phase 2 addresses the
  normalized-stockroom hierarchy indexes. The remaining indexes require query
  and write-rate evidence; they are not added as a bulk mechanical change.
- 109 unused indexes. None are removed in Phase 2. A recently reset statistics
  window or infrequent integrity/reporting query can make a necessary index
  appear unused.
- 12 overlapping permissive RLS policies: `operations.customers` and 11
  normalized-stockroom tables. Phase 2 may consolidate only policy pairs whose
  effective `OR` semantics and write checks are covered by database tests.
- 1 inefficient RLS expression on `catalog.admin_notifications`. The policy can
  be narrowed to the `service_role` role without exposing browser access.
- 1 missing primary key on `public.pricelist`. Production currently has 28,945
  rows, no null SKUs, and no duplicate SKUs. A forward migration may promote
  `sku` to the primary key only after the import/replacement workflow is tested
  against that constraint.

Staging reported 12 performance notices (3 unindexed foreign keys and 9 unused
indexes). They are tracked separately because staging is missing most of the
production schema.

References: [database linter](https://supabase.com/docs/guides/database/database-linter),
[RLS init-plan optimization](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)

## Approval gates

1. Recover or regenerate the production-compatible baseline and prove a clean
   local reset before applying any Phase 2 migration.
2. Rehearse the complete migration chain on an isolated database or Supabase
   branch, then run the SQL security/flow tests and advisor scan.
3. Snapshot counts and constraint violations before adding composite stockroom
   foreign keys or the pricelist primary key.
4. Apply to staging only after staging is reconciled; production follows a
   reviewed backup, deployment window, and rollback plan.
