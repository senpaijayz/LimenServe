# Deployment and rollback plan

Snapshot: 2026-08-06 (Asia/Taipei)

## Verified production baseline

- GitHub: `senpaijayz/LimenServe`, branch `main`, commit `1b92e829cfcd2cf1066f07f9437608b4016ffa35`.
- Vercel: `https://limen-serve.vercel.app`, deployment `dpl_6gxjitbgRVrUcr8ht8UQ4haK1AMp`, state `READY`, same Git commit.
- Render: `https://limen-backend.onrender.com`, service `srv-d6rqmefdiees73bvimg0`, deployment `dep-d9q4ll3l550s7382m4g0`, state `live`, same Git commit.
- Supabase: project `bxrdmfdokslnnluztmgl`, URL `https://bxrdmfdokslnnluztmgl.supabase.co`, Free plan, status `ACTIVE_HEALTHY`.
- Database migrations: authorization hardening, mechanic assignments, and part reservations are applied.

Production record counts were unchanged after migration: 3 user profiles, 1 mechanic, 15 service orders, 26 customers, 33,215 products, and 33,215 inventory balances. Assignment and reservation feature tables contain no production records at this snapshot. Invariant checks found no negative/over-reserved inventory and no duplicate active reservations.

## Preview and staging constraints

- Vercel creates a preview from the GitHub pull request. Verify the public UI and same-origin API behavior there.
- Render pull-request previews are disabled on the production service. Do not repoint the production service to a feature branch.
- The follow-up hardening requires no database DDL. Do not create another Supabase project, branch, or paid resource. The previously created unused Free staging project `tncekqyecihscadayufs` is not part of this rollout.
- Authenticated production mutations are not used as smoke tests unless the user supplies a disposable production account and explicitly authorizes test records.

## Deployment sequence

1. Confirm the follow-up branch is based on the currently deployed `main` commit.
2. Run `npm ci`, all frontend/backend tests, ESLint, the production build, and npm audits.
3. Confirm `git diff --check` and review the exact file list; exclude local `outputs/` and root `package.json`.
4. Push the branch and open a pull request to `main`.
5. Verify the Vercel preview: home, catalog, product detail, reservation sign-in path, responsive navigation, cache headers, console errors, and protected-route redirects.
6. Review the PR checks and merge only when green.
7. Confirm Render automatically deploys the merge commit and reaches `live`.
8. Confirm Vercel production reaches `READY` on the same merge commit.
9. Run read-only production checks: `/api/health`, public catalog response, stock labels, cache headers, CORS allow/deny behavior, and Supabase invariants/counts.
10. Record the final merge commit and deployment IDs in the handoff.

## Post-deployment checks

- `GET https://limen-backend.onrender.com/api/health` returns success.
- `https://limen-serve.vercel.app` and `/catalog` render on desktop and mobile without console errors.
- `https://limen-serve.vercel.app/my-reservations` redirects an unauthenticated user to login.
- Product catalog responses are publicly cacheable with the documented short TTL; authenticated/private endpoints return `Cache-Control: no-store`.
- Direct Render requests allow `https://limen-serve.vercel.app` and reject unrelated origins.
- Vercel and Render report the same Git commit.
- Supabase counts and inventory invariants remain unchanged unless real users have created legitimate records during rollout.

## Application rollback

1. Frontend: promote or redeploy Vercel deployment `dpl_6gxjitbgRVrUcr8ht8UQ4haK1AMp` as the last audited baseline.
2. Backend: roll Render back/redeploy deployment `dep-d9q4ll3l550s7382m4g0` or commit `1b92e829cfcd2cf1066f07f9437608b4016ffa35`.
3. Verify the two baseline deployments still use compatible `/api` routes and CORS.
4. Repeat the read-only health, cache, CORS, and Supabase invariant checks.

## Database rollback policy

- Do not drop `operations.mechanic_assignments`, `operations.part_reservations`, or `operations.part_reservation_events` after they may contain history.
- Do not reset, restore over, or recreate project `bxrdmfdokslnnluztmgl` as part of application rollback.
- The previous application safely ignores the additive columns and tables.
- If a function is defective, ship a reviewed `CREATE OR REPLACE FUNCTION` corrective migration.
- If allocation must be paused, disable only `trg_allocate_part_reservations_after_restock` in a reviewed emergency migration, then re-enable it after correction.
- Do not re-grant feature RPC execution to `PUBLIC`, `anon`, or `authenticated`, and do not restore role self-escalation paths.

## Platform-setting follow-up

The current Render service metadata has an empty health-check path and inconsistent build metadata, while its successful deployment log executed `cd backend && npm install` and `cd backend && npm start`. Align the Render dashboard with the intended `backend` root, deterministic install command, start command, and `/api/health` in a separate reviewed settings change. This repository deployment does not alter the live service plan or billing.
