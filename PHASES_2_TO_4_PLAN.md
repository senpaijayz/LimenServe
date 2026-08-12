# LimenServe phases 2-4 implementation gates

This plan records work intentionally kept out of the urgent Phase 1 patch. The repository and production database have substantial migration drift, so architecture and deployment changes must be isolated, reviewed, and proven in a schema-compatible environment before production use.

## Audit snapshot (2026-08-10)

- The frozen pre-Phase-2 baseline contains 55 files with 11 duplicate Supabase CLI version-prefix groups. Production has 51 ledger entries, but only two exact local `(version, name)` matches; staging has a different, minimal ledger. New Phase-2 work uses unique 14-digit forward versions and does not alter that forensic baseline.
- Stockroom production data: normalized model has 1 store, 1 published layout, and 104 active locations; legacy has 2 layouts and 6 locations. Only 1 of the 6 legacy locations currently overlaps a normalized active location.
- Production advisors: 36 security notices (35 RLS-enabled-with-no-policy informational findings plus leaked-password protection) and 233 performance notices (110 unindexed foreign keys, 109 unused-index observations, 12 overlapping permissive-policy findings, one inefficient RLS expression, and one missing primary key). Each item needs query/data evidence before remediation.
- Current local production build (2026-08-10): the manifest closure no longer statically reaches Three.js/R3F/Drei, charts, or scanner code from ordinary public routes. The checked static JavaScript/CSS closure is 229.9 KiB gzip for the entry, 237.0 KiB for home, 293.7 KiB for catalog, and 557.2 KiB for the isolated 3D locator. These are build-time budgets, not real-user Web Vitals.
- Phase 1 now validates and allowlists anonymous estimate creation before the privileged RPC, forces server-owned public fields, normalizes the required phone, omits vehicle plates, returns a public-only DTO, and applies IP/phone throttles. Phase 2 prepares durable shared throttling through a service-role-only database RPC; it remains gated on the baseline rehearsal and is not yet deployed.
- Read-only hosted audit (2026-08-12) confirms the production project is healthy, the hosted ledger ends at `20260806101020`, and legacy public invoice wrappers currently need the approval-gated ACL migration `20260812142000_phase2_revoke_legacy_receiving_client_grants.sql` before rollout.

## Phase 2: architecture and security

### Supabase baseline first

1. Export and review production/staging migration ledgers and schema-only diffs; never copy customer data into development.
2. Recover the production-only compatibility migrations into uniquely versioned, immutable local files.
3. Resolve the duplicate local CLI version prefixes without rewriting migrations already recorded in production. Use an explicit baseline/repair procedure reviewed against Supabase's ledger semantics.
4. `supabase/config.toml`, an immutable-history/static SQL gate, and a gated clean-replay CI job are now present. Reconcile both hosted ledgers and replace the seed with synthetic-only data before marking the replay job ready; pgTAP conversion remains.
5. Replace or retire stale `supabase/generated/setup_full.sql`; it must never be presented as current while incomplete.
6. Triage advisor findings by evidence: add safe FK indexes after plan inspection, give `public.pricelist` a key only after duplicate/null analysis, split overlapping policies without weakening access, and rewrite RLS auth calls with scalar subqueries. Do not drop all "unused" indexes or add permissive policies to backend-only tables.

### Stockroom convergence

1. Treat normalized `stockroom` tables as the target and retain both legacy tables.
2. Snapshot legacy rows into an immutable archive and create explicit store/layout crosswalk tables.
3. Generate a conflict report for legacy locations that cannot be assigned unambiguously. A human must approve those mappings.
4. Introduce normalized-first reads with legacy fallback and shadow-comparison telemetry.
5. Add layout `revision`, expected-revision writes, immutable history, atomic draft creation/publish functions, and composite hierarchy constraints (`NOT VALID`, verify, then validate).
6. Move direct browser writes behind authenticated backend RPCs. Retire the legacy path only after zero fallback use and migration/test coverage.

### Backend and environments

1. Move anonymous estimate creation into a dedicated service-role-only database RPC and replace process-local creation/lookup throttles with a shared or platform limiter. Preserve the Phase 1 validator and public-only response DTO as defense in depth.
2. Make CORS defaults environment-specific; production accepts exact origins only. Add security headers and disable `X-Powered-By`.
3. Add request IDs, structured redacted logs, sanitized errors with server-side causes, body/request timeouts, global and endpoint rate limits, readiness checks, and graceful shutdown.
4. The repository now documents Vercel Production -> production, Preview -> staging, and Development -> local. Provisioning the isolated staging Render/Supabase resources and setting dashboard variables still require approval.
5. The hardcoded production rewrite is removed and hosted builds validate environment-scoped direct API/Supabase settings. Treat previews as read-only until the documented staging resources and exact CORS origins are configured.
6. Keep service-role credentials exclusively in backend environments and rotate them if they were ever exposed.

Required proof: backend security tests, exact CORS allow/deny tests, graceful-shutdown/readiness tests, clean database replay, pgTAP/RLS role tests, migration reconciliation report, and documented forward rollback migrations.

## Phase 3: frontend performance

1. Complete locally: remove the static entry dependency edges created by manual chunk rules. The Vite manifest/dependency closure is checked after every production build.
2. Complete locally: enforce gzip budgets for the public entry and major routes; the graph gate rejects 3D, charts, scanner code, and admin feature boundaries in the initial closure.
3. Complete locally: document a single cache owner per data class while retaining the fast catalogue path.
4. Complete locally: centralize catalogue invalidation across `catalogApi`, React Query, and tagged Render responses; cache invalidations advance `X-Limen-Cache-Version`.
5. Complete locally: record route timings and supported native Core Web Vitals in `window.__limenPerformance` with `limen:performance` events. Pending an approved hosted telemetry sink and staging cold/warm comparison.

Required proof: manifest graph test, production network trace for ordinary public routes, bundle budgets, cache-header/invalidation tests, and recorded Web Vitals/route-load measurements.

## Phase 4: 3D performance, usability, and visuals

1. Complete locally: ship high/medium/low/fallback quality tiers using device capabilities, reduced motion, DPR caps, an operator override, WebGL context-loss handling, and an accessible location-table fallback.
2. Complete locally: switch the canvas to demand-driven rendering, pause it while hidden, stop route animation after five seconds, and remove bloom, expensive shadows/environment effects, and per-object labels in the low tier.
3. Complete locally: add collision/boundary diagnostics, undo/redo, duplicate, shift-multiselect, alignment, autosave recovery, before-unload warnings, and keyboard shortcuts.
4. Partially complete: add a bounded obstacle-aware grid/A* aisle route with stairs transitions. Remaining: instancing/LOD, compressed GLTF geometry (Draco/Meshopt), and KTX2 textures.
5. Partially complete: add a floor-aware, keyboard-readable minimap with selection and located-product highlighting, editor recovery controls, and x-ray mode. Remaining: touch-specific controls.
6. Improve fixtures/materials/lighting/signage only after performance budgets pass on representative mobile hardware.

Required proof: device-tier matrix, WebGL-loss and fallback tests, accessibility/keyboard/touch tests, pathfinding fixtures, editor history/recovery tests, frame-time/memory budgets, and compressed-asset size checks.

## Approval gates

Explicit approval is required before applying production migrations, changing Vercel/Render/Supabase environment configuration, creating paid branches/projects, mapping ambiguous legacy layouts, or retiring either legacy stockroom table.
