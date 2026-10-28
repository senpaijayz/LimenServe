# Enterprise transformation — delivery ledger

## Current increment: supplier orders and linked receiving

Added staff supplier-order list/detail pages, an admin draft editor and a selected-parts handoff from Replenishment. Orders distinguish drafts, placed/awaiting delivery, partial receipts, fully received and cancelled outstanding quantities. Staff must explicitly attest that an order was placed outside LimenServe; this application does not contact a supplier, issue payment or execute a purchase. Confirmed expected dates are entered, not invented from lead-time settings. Only actual linked receipt quantities affect the received/remaining totals; historical standalone receipts are not guessed into orders by name/reference matching.

Creation uses a retained request UUID and canonical payload; identical retries return the saved order, while changed payload reuse is rejected. Saved drafts have stale-version protection and may be edited only before placement. Actor/route changes remount workspaces, and device draft keys are staff/order-specific. Submitted draft/receipt payloads are retained unchanged while their outcome is unknown. Explicit server rejections unlock correction; ambiguous responses retain the identity for safe replay. Clearing a device-only draft or replacing local edits with the saved draft requires user confirmation.

Receiving locks the order, validates its current version and remaining line quantities, then calls the existing batch receiver with a stable receipt key. Stock posting, received totals, the immutable linked-receipt result and the order event commit in the same database transaction. The same receipt UUID/payload returns its prior result even after order quantities change. Excess quantities, inactive/removed parts, future received dates and receipts against unplaced/cancelled orders are rejected. Cancelling an outstanding balance never reverses received stock. Confirmed receipt display is separate from optional order refresh; linked receipts can be reopened from history and reused for locator handoff.

Applied additive migration `20261028153755_supplier_order_receiving`. New order functions are security invoker and backend-only. Four new tables have RLS; event/receipt ledgers grant backend SELECT/INSERT only, not UPDATE/DELETE. Product deletion nulls the live line reference while preserving original identity and part snapshots. Suppliers with order history cannot be deleted. A guarded patch to the existing manual receiver clears a previous supplier's lead time when a different supplier is received, and preserves it for the same supplier. The receiver's existing privilege, advisory/product/balance locking and stock-audit behavior remain.

No example order, order event or delivery was created. The four new tables remain empty, inventory movements remain 975 and receipt request rows remain 938. All 30,086 stock balances retained the same on-hand/reserved digest. Read-only list queries return honest empty pending/all views; a malformed save was rejected before any business write. Lint, frontend build/bundle budgets, backend syntax and migration consistency passed (125 migration files). No automated suites were run. New advisor notices are informational unused indexes; pre-existing notices and the legacy clean-replay gate remain.

Positive creation/edit/placement, concurrent partial delivery/over-receive rejection, timeout recovery and cancellation walkthroughs still require real authorized ordering/delivery details; they were reviewed in code but not falsely claimed as executed. Release/browser outcomes are reported in the chat handoff. This does not add financial purchase accounting, supplier integrations, arbitrary receipt-to-order backfill, physical put-away acknowledgement or demand forecasts.

## Current increment: supplier planning and settings history

Extended the existing one-supplier-per-product link with nullable expected delivery days. Replenishment now includes a No supplier filter, per-part supplier controls, page-local bulk supplier/delivery actions and on-demand paginated settings history. Unknown delivery time remains unknown; zero explicitly means same-day, measured in calendar days. These are planning settings, not orders, promised arrival dates or received quantities. Bulk controls remain collapsed by default on phones.

The combined admin-only save commits reorder values and supplier plans in one transaction with stable product/balance/link locking and comparison against loaded values. A conflict rolls back the whole batch; unchanged values do not create duplicate audit entries. Existing older threshold-only clients remain supported. A backend capability flag prevents newer supplier controls from silently submitting to an older backend during the staggered frontend/backend rollout. Supplier edits invalidate the existing catalog caches.

The product editor now reuses the same supplier-link writer. Saving an unchanged supplier preserves its delivery estimate; changing or clearing the supplier clears the old estimate. The old link helper used separate delete/insert calls and did not inspect returned Supabase errors. The replacement makes that individual link change atomic and reports errors. This does not make the entire existing product create/edit workflow atomic; its other writes are outside this function.

Applied additive migration `20261028151013_replenishment_supplier_planning`. All new functions are invoker functions, with direct anon/authenticated execution revoked. The new history ledger has RLS and backend SELECT/INSERT but no UPDATE/DELETE grants. Product/actor deletion nulls references while retaining the original product identity and supplier-name snapshots. No production supplier assignments, delivery values, thresholds, stock quantities, orders, sales or payments were changed. All 30,086 on-hand/reserved balances retained their baseline digest; the pre-existing supplier link is unchanged with unknown delivery time. A same-current-values save returned changed=0 and supplyChanged=0. New audit rows remained zero. No invented settings were submitted to create demonstration history.

Read-only queries confirmed 30,070 active parts without a supplier, supplier-aware result fields and an honest empty history. Lint, frontend build/bundle budgets, backend syntax and migration consistency passed (124 migration files). No automated suites were run. Existing security/performance notices and the legacy clean-replay gate remain; the new scoped advisor notice is informational unused-index. Browser/release outcomes are reported separately after verification. Positive changed-value saves, concurrent stale-edit rollback and signed-in clerk acceptance remain manual checks with legitimate business settings.

This increment does not add pending purchase-order tracking, stock-receipt reconciliation, reorder priority or demand forecasting. Those remain distinct work; no forecast or planning setting is represented as an actual supplier order.

## Current increment: replenishment controls and receiving handoff

Added `/inventory/replenishment`, linked from Inventory without removing View Logs. Administrators and stock clerks can review paginated active parts at a configured reorder point, out of stock, without a threshold, or across the full active catalog. Part numbers lead each row. Available stock is on-hand minus reserved units; a zero threshold explicitly disables alerts. Suggested quantity is the saved preferred quantity, not a demand forecast or an automatically created purchase order.

Only administrators may save reorder settings. Single-row editing and page-local bulk editing use whole-number validation, review confirmation, an authenticated backend endpoint, stable row-lock ordering, optimistic stale-setting checks, atomic batch rollback and a server-only change ledger. Identical current settings are safe to retry. Clerks have read-only controls. Loading errors hide stale rows; unsaved settings warn on unload and anchor navigation, but SPA browser-back interception is not claimed. Bulk controls are collapsed until needed, with a separate sticky Save/Discard bar whenever edits exist. No default business thresholds or supplier orders were invented.

Confirmed receiving results now provide per-part warehouse locator links plus movement-history and replenishment shortcuts. These reuse the existing locator and receipt identity; they do not claim physical put-away completion or create additional stock movements. Optional device-storage failures after server acknowledgement can no longer reclassify a confirmed receipt as a failed receipt. A positive receiving walkthrough was not performed with fabricated stock.

Applied additive migration `20261028115755_inventory_replenishment_controls`. Read-only checks confirmed all 30,086 balances retained the same on-hand/reserved digest before and after migration, zero reorder change rows, no direct anon/authenticated RPC execution, invoker functions, and RLS on the change ledger. The backend can insert/read but cannot update/delete ledger entries. A null-actor save was rejected before any write. No stock, threshold, location, supplier, sale or payment values were changed. The active catalog currently has 30,071 parts without thresholds, so an empty reorder-due view is not evidence of sufficient stock. New index notices are informational unused-index findings before traffic; existing security/performance notices remain.

Frontend lint and production build/bundle-budget checks passed; backend route syntax and migration consistency passed (123 files). Existing large-chunk warnings and the legacy clean-replay gate remain. No automated suites were run. Actual release/browser outcomes are reported in the chat handoff, not presumed here. Positive admin saves, stale-edit rollback and clerks' signed-in read-only acceptance remain manual checks requiring legitimate settings/accounts.

This is a replenishment foundation, not completion of the entire enterprise request. Preferred-supplier/lead-time planning, pending purchase-order reconciliation, physical put-away acknowledgements, full exception inbox, customer/vehicle workspace, package/quote conversion refinements and wider financial/security/mobile acceptance remain separate work.

## Next phase: unified job workspace

Replaced the routed service detail page's page-mode modal with a dedicated job workspace. The header identifies the customer, vehicle, operational stage and priority, with a state-derived next-section action. Six compact sections cover overview/requested work/intake lines, mechanic scheduling, work progress, actual charges, billing/receipt and history. Mobile uses one labeled section dropdown instead of a long row of tabs. Existing modal-based flows elsewhere are retained; shared part search and priority formatting remain reused.

The existing workshop component stays mounted across section changes, preserving actual-charge edits, notes and payment fields. It reports loaded work state to the parent so the header and workshop agree without adding a duplicate work fetch. Unsaved charges are disclosed outside their section; document unload and anchor navigation warn before discarding charge/note edits. SPA browser-back interruption is not claimed blocked. Route-ID changes remount the workspace to prevent one job's edits appearing on another job.

The focused assignment panel reuses existing authenticated APIs, server-side schedule rules and removal confirmation. It displays recorded historical appointments independently of today's selectable slots; only future available slots can be submitted. Admin-only controls and finalized-order restrictions remain. No assignment was changed during UI verification. The charges section exposes approval notes without requiring a trip back to a hidden work section. History includes the existing workshop events and assignment records. Paid/finalized jobs cannot reopen the collection form; missing historical payment/receipt evidence is explicitly flagged rather than inferred.

No backend/RPC/database/billing calculation was changed in this UI phase. No production payment, stock, work event or assignment was created as a demonstration. Lint and production build/bundle checks are required before release; deployment/browser outcomes are recorded in the chat handoff. Full payment, print-device and scheduling mutation walkthroughs remain authorized manual checks.

## Executive summary and scope

This is the first P0 reliability increment against the October 28, 2026 request, not completion of the entire transformation. The existing application, authorization, financial RPCs and production facts are preserved. No automated test suites, fake sales, payment mutations or inventory adjustments were performed.

## Verified problems and before/after

| Classification | Before | Delivered |
| --- | --- | --- |
| UX problem | Queue/detail badges display lifecycle only, obscuring finished unpaid work. | Shared display-only operational stages use lifecycle, recorded payment, workshop stage and appointment data. |
| Confirmed failure-handling bug | A successful service payment followed by a failed receipt refresh enters the generic posting-error handler. | Posting acknowledgement is separate from receipt retrieval. A receipt failure explicitly says payment succeeded and warns against collecting again. |
| Recovery risk | Failed payment HTTP responses can leave the result unknown. | Read back both the saved order and linked sale through existing APIs. Recover only when paid status and a sale ID agree; otherwise pause resubmission in this workspace and instruct staff to reopen/check Sales. No automatic second write. |
| Historical reconciliation | Completed lifecycle could look settled despite unpaid metadata. | Clearly label Completed · payment needs review; do not rewrite historical payment facts. |

## Service orders and state interpretation

The backend enriches each returned queue/detail batch with workshop stages using a bounded batched query, not one query per card. The frontend uses one interpretation for queue cards, detail badges and workshop headings. Precedence is cancelled; completed/released with explicit payment-review warning when unpaid; recorded payment awaiting release review; repair finished/unpaid; paused; in progress; future scheduled; awaiting mechanic; assessment. A finished repair is not evidence of settlement. These labels are not a new persisted state machine and do not introduce a nonexistent billing-approval state.

Read-only production checks found 22 orders: 12 in-progress/unpaid, three pending/unpaid, five completed/unpaid and two completed/paid. Workshop state has 12 work_completed and one released record. All five completed/unpaid records lack a sale under the current SERVICE-order reference. This is a reconciliation candidate set, not proof of imported status, debt, or missing payment; the records were not changed. An administrator must compare receipts and original source records before authorizing any correction.

The live billing RPC was inspected: it locks the order, looks up an existing stable service-sale reference, checks workshop completion and verified-payment input before creating a sale, and posts within its existing transaction. Anonymous and authenticated direct EXECUTE access are both false. These safeguards were preserved, not rewritten. Concurrency/financial round trips were not executed in production.

## Inventory, CMS, POS and employee/customer experience

No inventory, receiving, locator, CMS pricing, quote conversion, POS payment, reporting, dashboard or customer-history changes are claimed in this increment. The earlier unified CMS navigation remains intact. No prices, fitments, publications, administrator identities, account permissions, customers, quotes, sales or balances were modified.

## Security and performance

Current Supabase advisor output was retrieved. Categories still include leaked-password protection, RLS enabled without policies, unindexed foreign keys, tables without primary keys and unused indexes. No policies were opened or indexes dropped to silence findings. Password-protection compatibility/plan configuration and evidence-based index review remain outstanding. Advisor remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The shared stage model and existing component lifecycle were reviewed for conditional rendering, stable hook order and preservation of backend authority. The payment handler uses an immediate in-flight guard; receipt recovery never automatically resubmits money or stock operations.

## Database and checks

Migrations created/applied: none. Data reconciled: none. Data preserved: all production business facts. Frontend lint, production build/bundle-budget checks and backend route syntax checks passed for this increment. Automated suites were not run per request. Build still reports the existing large-chunk advisory; the configured bundle budgets pass. Deployment and browser verification are reported in the chat handoff after release, not presumed here.

## Manual verification checklist

1. Open Service Orders as an authorized staff member. Compare a known finished/unpaid job against its persisted workshop and payment fields: the badge should say Repair finished · awaiting payment.
2. Open that job without editing. Verify the workshop heading agrees, and requested work remains distinct from actual parts/labor.
3. Open Archive and inspect a historical completed/unpaid job: payment needs review must remain visible; no paid receipt should be invented.
4. For a legitimate authorized payment only, verify actual charges and received funds, then post once. Confirm one sale and the appropriate stock movement, using the existing stable reference. Do not create fake production payments for this checklist.
5. If receipt retrieval fails after an acknowledged payment, verify the UI says payment succeeded; reopen to retrieve the receipt without collecting again.
6. If the posting response is interrupted, verify read-back recovers the existing sale when available. If unresolved, the current workspace must refuse another posting attempt and instruct staff to reopen/check Sales.
7. Check cards/detail badges and long warning text on a phone; verify no clipped controls. Physical-device and failure-injection checks remain manual, not claimed as executed.

## Remaining work — prioritized, not claimed complete

1. P0: durable idempotent intake/create-and-schedule. Existing creation writes the order, then priority/read-back, with scheduling as a separate request. A lost response can still leave an ambiguous intake result. Safely solve this with versioned request identity and reviewed atomic/recoverable database flow before expanding intake UX.
2. P0: evidence-based historical reconciliation, complete financial/stock cross-RPC audit and password-protection compatibility review. No automatic payment backfill.
3. P1: coherent job workspace replacing the page-mode detail modal, with progressive sections and next-action hierarchy. The current detail/modal architecture is not yet replaced.
4. P1: role dashboards, actionable operations inbox and workflow navigation; preserve backend permissions.
5. P1: replenishment configuration/bulk workflow, receiving-to-put-away handoff and locator validation. No automatic purchasing or stock edits.
6. P1: package browsing versus contextual recommendations, quote conversion with stable references and approved pricing snapshots.
7. P2: customer/vehicle history, verified payment expansion, reporting separation, measured performance/index changes, privacy-conscious observability and all requested mobile widths.

Git workflow: main only, explicit task files, no PR, no force-push. The release commit and actual Vercel/Render outcomes are provided in the handoff. Unrelated local untracked files remain untouched.

## Verified release

## Continuation: atomic intake and role task dashboards

Implemented the next P0 intake flow using a server-only, security-invoker wrapper and an append-only request ledger. An actor/request lock serializes retries. An identical committed request returns the existing job; a changed payload with that same committed reference is rejected with the existing job ID. Priority, intake lines and an optional mechanic assignment commit together. A slot conflict rolls back the whole new intake, allowing the retained form to select another slot without a partially created job. Existing Manila-hours trigger and overlap constraint are reused unchanged. The endpoint validates request UUIDs and timezone-bearing appointment timestamps. Existing clients without a request reference retain the legacy endpoint behavior and are not claimed idempotent.

The intake form persists its request ID before submission, guards repeat clicks, and uses staff-specific draft keys. Old unowned v1 local drafts are retained but not automatically exposed to another signed-in employee. After acknowledged creation, optional detail enrichment cannot turn success into a creation error. No estimate is treated as consumed stock or a verified payment.

Applied additive migrations: `20261028103838_atomic_service_intake_requests` and `20261028104228_restrict_intake_request_ledger_updates`. Verified 22 existing orders and zero request-ledger rows after migration. Anonymous/authenticated direct execution is denied; RLS is enabled; service_role has SELECT/INSERT but not UPDATE/DELETE on the ledger. A manual invalid-request invocation was rejected before any business write. No successful dummy intake, appointment or payment was created. Positive retries, slot-conflict rollback and concurrent requests remain manual verification items, not claimed executed. New index advisor finding is informational unused-index, expected before live traffic. Other pre-existing advisor categories remain unresolved.

Added role-dispatched dashboards: administrators retain analytics plus a recent-job attention list; cashiers receive POS/service/schedule shortcuts and a recent-job attention list using their existing service-order permissions; clerks receive inventory/receiving/movement/locator shortcuts without analytics calls. Only the existing staff roles can open the dashboard route. No backend financial permissions were expanded. Attention lists are explicitly bounded to loaded recent records and show at most eight direct job links, not misleading global totals. This is a starter operations inbox, not the complete exception/replenishment/approval inbox requested.

Continuation checks: frontend lint/build/bundle budgets and backend syntax passed. Migration consistency passes for 122 files; legacy clean replay remains gated. No automated suites. Remaining work still includes a replacement unified job workspace, full inbox/navigation refinements, replenishment and receiving/locator handoffs, expanded package discovery and quote conversion, customer/vehicle workspace, reporting, full security/performance review and mobile/device acceptance. Durable intake implementation is delivered but its positive business walkthrough is still awaiting authorized manual verification.

Code commit: `dcf2473a48a4e3b63c0ad5305d801b728dc4c200`, pushed to origin/main. Vercel `dpl_34yATd6phZbEupuYBf9hc6zVkZyB` is READY with the production alias. Render `dep-dbgspvvb9u1s7399k84g` is live on the same commit and `/api/health` returned ready. This local delivery report is in the repository's ignored Docs directory; it is provided as a local artifact, not claimed as part of that code commit.

Read-only signed-in browser inspection confirmed the new stage on a finished/unpaid queue card and on its job detail/workshop heading. The same job had no actual charges and its final payment button remained disabled. No financial or stock action was submitted. Payment timeout recovery and receipt-refresh failures were reviewed in code but were not failure-injected against live payments. Full mobile-width coverage, historical reconciliation and complete platform acceptance remain outstanding.
