# Deployment and rollback plan

## Current preview constraints

- Render pull-request previews and preview generation are currently disabled. Do not repoint the production `limen-backend` service to the feature branch.
- Render's live dashboard settings still use repository root `yarn` plus `cd backend && npm start`, with no health-check path. Before production, align them with `render.yaml` (`backend`, `npm install`, `npm start`, `/api/health`) in a reviewed settings change.
- Supabase database branching is unavailable on the current plan. Schema validation therefore requires a free isolated Supabase staging project because local Docker/Postgres is unavailable and the repository does not contain every historical production schema migration.

## $0/month Supabase staging method

- Project: `LimenServe Staging Free` (`tncekqyecihscadayufs`), in the existing organization and `ap-southeast-2` region.
- Confirmed project cost at creation: `$0/month`. No paid database branch was created and the production project `bxrdmfdokslnnluztmgl` was not changed.
- The staging project contains a minimal production-shaped, test-only bootstrap plus the additive feature migrations. It contains no copied production users or business records.
- Database invariants and the full assignment/reservation flow run inside a transaction and end with `ROLLBACK`. Post-test counts are zero for assignments, reservations, reservation events, and Auth users.
- Supabase's security advisor reports no findings after the policy refinement. Performance notices for unused indexes are expected until the empty staging database receives representative traffic; bootstrap-only foreign-key notices correspond to indexes already verified on production.
- Keep all staging environment variables separate from production. Never reuse or expose the production service-role key. A backend staging deployment requires a staging-only secret key supplied through Render's encrypted environment settings.
- Free projects can be paused or constrained by the provider's free-plan quotas. Restore/health-check staging before preview testing; this does not affect production.

## Safe deployment order

1. Snapshot production schema metadata and counts for customers, mechanics, service orders, balances, and reservations.
2. Apply the test-only production-shaped bootstrap and the three additive migrations to the isolated Supabase staging project first.
3. Run the SQL invariants and concurrent assignment/reservation integration tests.
4. Deploy the Render backend from the feature commit and verify `/api/health`, CORS, auth, assignment, reservation, and stock APIs.
5. Deploy the Vercel preview from the same commit and run desktop/mobile end-to-end flows, including customer My Services visibility for an explicitly linked test customer.
6. Apply the migrations to production only after preview verification and a fresh production-data preflight.
7. Deploy Render production, then Vercel production, from the same immutable commit.
8. Verify production without editing existing records: health, login roles, catalog availability, service detail, and empty/read-only reservation queries.

## Rollback

- Frontend: promote the last known-good Vercel deployment.
- Backend: roll Render back to the last known-good commit/deploy.
- Database: keep the additive tables and columns in place. Do not drop reservation or assignment tables after they may contain production history.
- Disable new mutations by rolling back the backend first. The prior application ignores additive columns and tables.
- Security hardening is forward-only. Do not restore unsafe `PUBLIC`, `anon`, or `authenticated` execution on service-role RPCs and do not restore self-update access to profile roles.
- If a database function is defective, ship a corrective `CREATE OR REPLACE FUNCTION` migration. If allocation must be paused, disable only the named restock allocation trigger in a reviewed emergency migration, then re-enable it after correction.

## Production preflight and recovery evidence

Record before/after counts and constraint checks for:

- `operations.mechanic_assignments`
- `operations.part_reservations`
- `operations.part_reservation_events`
- `catalog.inventory_balances` rows where `on_hand < 0`, `reserved < 0`, or `reserved > on_hand`
- active duplicate reservations per customer/part
- overlapping active mechanic schedules

No rollback step deletes existing users, customers, inventory, services, assignments, reservations, or activity history.
