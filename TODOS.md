# TODOS

Track open work and completed items by version. See `CHANGELOG.md` for full release notes.

---
## Open
---
### [Expansion] Ship maintenance and calibration workflow
**What:** Add recurring maintenance/calibration schedules, due/overdue states, and completion actions with evidence/notes.
**Why:** Operational value shifts from static inventory tracking to lifecycle management.
**Context:** Natural next module after assignment workflow for field/industrial use cases.
**Solution** Add a first-class maintenance/calibration workflow with a dedicated schedule table and completion log table (e.g., maintenance_schedules, maintenance_events) plus APIs to create recurring plans, compute and expose due/overdue state, and complete runs with required evidence/notes (POST /api/inventory/:id/maintenance/schedule, GET /api/maintenance/due, POST /api/maintenance/:scheduleId/complete); store next due date based on interval rules, support both maintenance and calibration types, write normalized audit/history events (MAINTENANCE_SCHEDULED, MAINTENANCE_COMPLETED, MAINTENANCE_OVERDUE), and surface status + actions in Dashboard with filters for due/overdue.
**Done When** Editors/admins can create recurring maintenance/calibration schedules per asset with interval and start date; system automatically computes next due and marks items as due/overdue; users can complete a due item only by submitting required completion metadata (performed date, condition/result, notes, optional evidence attachment); completion advances next due correctly for the recurrence rule; audit trail records schedule/create/complete/overdue events with actor and timestamps; UI provides actionable due/overdue views and item-level maintenance history; tests cover recurrence math, due/overdue transitions, permission checks, and completion validation.
**Effort:** L
**Priority:** P1
**Depends on:** Assignment workflow and notification/alerting hooks.

---
### [Expansion] Add compliance expiration action center
**What:** Build due-soon/overdue/critical queues for employee documents with escalation rules by role.
**Why:** Converts compliance risk from reactive to proactive, a key expansion differentiator.
**Context:** Document tracking exists; this adds operational workflows and accountability.
**Solution**
**Done When**
**Effort:** M
**Priority:** P1
**Depends on:** Alerting primitives and employee-document data completeness.

---
### [Expansion] Introduce site/location data model foundations
**What:** Add site/location primitives and scope inventory/doc/workflow records to location context (feature-flagged rollout).
**Why:** Enables multi-site expansion without disruptive schema rewrite later.
**Context:** Current model is effectively single-site; this is a 6-12 month scalability prerequisite.
**Solution**
**Done When**
**Effort:** L
**Priority:** P2
**Depends on:** Agreement on tenancy/scoping model and migration plan.

---
### [Expansion] Add scoped RBAC templates by site/business unit
**What:** Add reusable role templates and enforce location-scoped permissions at API boundaries.
**Why:** Reduces onboarding friction and avoids per-customer permission customization debt.
**Context:** Role model exists globally; expansion requires scoped authorization patterns.
**Solution**
**Done When**
**Effort:** L
**Priority:** P2
**Depends on:** Site/location model implementation.

---
### [Expansion] Add outbound webhook integration layer (v1)
**What:** Add webhook events for core lifecycle changes (inventory CRUD, assignment events, compliance alerts) with retries and idempotency.
**Why:** Integration readiness is required for expansion into larger teams and connected systems.
**Context:** Enables ecosystem workflows without tight coupling to specific third-party systems.
**Solution**
**Done When**
**Effort:** M
**Priority:** P2
**Depends on:** Stable event contracts and observability for delivery failures.

---
### [Expansion] Publish onboarding templates + executive summary report
**What:** Ship vertical starter templates and an executive summary report (asset health, risk, compliance posture).
**Why:** Improves time-to-value and supports go-to-market expansion beyond technical users.
**Context:** Product foundation is maturing; packaging is required for repeatable onboarding.
**Solution**
**Done When**
**Effort:** M
**Priority:** P2
**Depends on:** Workflow modules and site-scoped data model stability.

---
### [Note] Add restore-verification KPI card to Ops Health
**What:** Add a KPI card for restore-verification success rate (7d) and include related pass/fail counts.
**Why:** Makes backup recoverability confidence visible at a glance in the dashboard summary.
**Context:** Restore verification job and events already exist (`job.backup_restore_verify_success`/`failure`); this is observability polish.
**Solution**
**Done When**
**Effort:** S
**Priority:** P2
**Depends on:** Extending ops summary query and Ops Health KPI cards.

## Completed
---
### [Expansion] Ship assignment and handover workflow (2026-03-27)
**What:** Governed assign/return custody with metadata, `inventory_assignments` rows, and ASSIGN / RETURN / TRANSFER history.
**Why:** Structured workflows instead of only ad-hoc `responsible` edits; audit trail for custody.
**Context:** Migration `migrations/add-inventory-assignments.sql` and Drizzle `inventoryAssignments`; APIs `POST /api/inventory/:id/assign`, `POST /api/inventory/:id/return`, `GET /api/inventory/:id/assignments`; return sets `responsible` to **`Sin asignar`** (`UNASSIGNED_RESPONSIBLE_LABEL`, `DECISIONS.md`); list response includes `activeAssignmentItemIds`; Dashboard assign/return actions + “Asignado” badge; `AssignDialog`, `ReturnDialog`, `AssignmentTimeline` in `ItemViewDialog`; History page labels and JSON remark formatting; `client/src/hooks/use-assignments.ts`; tests `server/tests/assignment-workflow.test.ts`. Inline/bulk responsible edits remain the unstructured path (ADJUSTMENT, no assignment row).
**Effort:** L
**Priority:** P1
**Depends on:** Audit/event schema and role checks (done).
**Completed:** 2026-03-27

### [Expansion] Add data-integrity scanner + repair report (2026-03-27)
**What:** Read-only integrity scans, auditable artifacts, repair proposals, and Ops visibility for DB/filesystem drift.
**Why:** Prevents silent drift and preserves trust as data volume and team usage scale.
**Context:** Implemented `script/integrity-scan.ts` (`npm run integrity:scan`); writes `reports/integrity/integrity-scan-<timestamp>.json` and `repair-report-<timestamp>.md` with per-check counts, samples, and categorized proposed actions (safe / needs review / destructive); emits `job.integrity_scan_success` / `job.integrity_scan_failure` to `ops_events`; Ops Health shows `integrityScanSuccessRate7d` and `integrityScanIssuesLastRun` (`server/storage.ts`, `client/src/pages/OpsHealth.tsx`). Windows Task Scheduler hook: `script/integrity-scan-scheduled.bat`. Tests: `server/tests/integrity-scan-report.test.ts` (repair action generation). **Operational:** daily runs are configured outside the app (scheduler/cron/Task Scheduler)—not embedded in the Node process or Docker Compose by default. **Optional follow-ups:** machine-readable `repair-report-*.json`, deeper integration tests for SQL checks/event emission, explicit warning/critical thresholds for drift counts in Ops.
**Effort:** M
**Priority:** P0
**Depends on:** Ops dashboard event pipeline (done).
**Completed:** 2026-03-27

### [Expansion] Add guarded bulk operations + short undo window (2026-03-26)
**What:** Implemented guarded bulk actions (status/reassign/archive/delete) with confirmation and short-lived undo for destructive bulk delete.
**Why:** Improves team throughput while reducing operational mistakes at larger scale.
**Context:** Added backend bulk endpoints (`/api/inventory/bulk/update`, `/bulk/archive`, `/bulk/delete`, `/bulk/undo`), undo snapshot persistence (`inventory_bulk_undo` + migration), and Dashboard bulk action summary prompts plus undo banner.
**Effort:** M
**Priority:** P1
**Depends on:** Consistent audit recording and reversible action model.
**Completed:** 2026-03-26

### [Expansion] Add backup restore-verification job (2026-03-26)
**What:** Implemented automated restore verification to prove recoverability continuously.
**Why:** “Backup exists” alone is not enough for resilience and auditability.
**Context:** Added `script/backup-restore-verify.ts`, `script/backup-restore-verify-scheduled.bat`, and npm script `backup:verify-restore`; wired pass/fail events to `ops_events` and documented operational steps.
**Effort:** M
**Priority:** P0
**Depends on:** Access to isolated restore target and integrity-check scripts.
**Completed:** 2026-03-26

### Build Operations Health Dashboard (control tower) (2026-03-20)
**What:** Internal Ops Health dashboard: `ops_events` storage, KPI/event taxonomy, server instrumentation (auth, API errors/slow requests, import/history/thumbnail, backup script), and `/ops-health` page (editor/admin) with summary + event feed.
**Why:** Operators need one place to detect failures quickly and reduce mean time to detect incidents.
**Context:** KPIs/severity defined; migration `migrations/add-ops-events.sql`; APIs `/api/ops-health/summary` and `/api/ops-health/events`.
**Effort:** M
**Priority:** P0
**Depends on:** Defining operational KPIs and severity thresholds (done).
**Completed:** 2026-03-20

### Add "trusted enclosure" network exposure runbook (LAN-only verification) (v1.5 2026-03-20)
**What:** Documented a repeatable checklist to verify the app is reachable only from trusted local network/devices and not publicly exposed.
**Why:** Prevents silent drift from LAN-only to internet-exposed deployments.
**Context:** Added runbook at `docs/LAN-SECURITY-RUNBOOK.md`.
**Effort:** S
**Priority:** P0
**Depends on:** Confirmed deployment mode and tunnel policy.
**Completed:** v1.5 (2026-03-20)

### Add configurable local bind host (reduce accidental wide-area exposure) (v1.5 2026-03-20)
**What:** Changed server bind host to configurable `BIND_HOST` with safer default `127.0.0.1`.
**Why:** Enforces safer local boundary by default.
**Context:** Updated `server/index.ts`, `.env.example`, and `docker-compose.yml`.
**Effort:** M
**Priority:** P0
**Depends on:** Preferred local access mode.
**Completed:** v1.5 (2026-03-20)

### Remove sensitive `/api` response-body logging in non-dev deployments (v1.5 2026-03-20)
**What:** Kept API request status/timing logs but restricted response-body logging to error responses only.
**Why:** Reduces risk of sensitive payload leakage into logs.
**Context:** Updated logging middleware in `server/index.ts`.
**Effort:** S
**Priority:** P0
**Depends on:** Safe production logging policy.
**Completed:** v1.5 (2026-03-20)

### Sandbox PDF preview iframe (v1.5 2026-03-20)
**What:** Added `sandbox` to the PDF preview `iframe`.
**Why:** Reduces browser attack surface for embedded PDF content.
**Context:** Updated `client/src/components/DocumentPreviewModal.tsx`.
**Effort:** S
**Priority:** P1
**Depends on:** None.
**Completed:** v1.5 (2026-03-20)

### Add brute-force / rate limiting to `POST /api/auth/login` (v1.5 2026-03-20)
**What:** Added PostgreSQL-backed login rate limiting keyed by IP and IP+username with `Retry-After`.
**Why:** Improves resilience against repeated password attempts.
**Context:** Added `server/rate-limiter.ts` and integrated it in `server/routes.ts`.
**Effort:** M
**Priority:** P1
**Depends on:** Shared-store strategy.
**Completed:** v1.5 (2026-03-20)

### Use a persistent session store in non-dev local deployments (v1.5 2026-03-20)
**What:** Switched production sessions from in-memory store to `connect-pg-simple` (PostgreSQL).
**Why:** Improves session consistency across restarts/instances.
**Context:** Updated `server/auth.ts`.
**Effort:** M
**Priority:** P1
**Depends on:** Shared store selection.
**Completed:** v1.5 (2026-03-20)

### Ensure correct client IP for thumbnail rate limiting behind proxies (v1.5 2026-03-20)
**What:** Added configurable Express `trust proxy` support.
**Why:** Ensures `req.ip` reflects real client IP when behind trusted proxies.
**Context:** Updated `server/index.ts` and `.env.example`.
**Effort:** M
**Priority:** P1
**Depends on:** Proxy/LB setup and forwarded headers.
**Completed:** v1.5 (2026-03-20)

### Enforce length limits for shared-notes title/content (v1.5 2026-03-20)
**What:** Enforced max lengths (`title` 100, `content` 2000) on shared-notes create/update flows.
**Why:** Prevents oversized payloads and improves API predictability.
**Context:** Updated `server/routes.ts`.
**Effort:** S
**Priority:** P2
**Depends on:** Product length policy.
**Completed:** v1.5 (2026-03-20)

### Add/confirm CSV import hard limits (row count + parsing cost) (v1.5 2026-03-20)
**What:** Added hard limit of 5000 rows per CSV import request.
**Why:** Reduces CPU/memory risk from very large CSV payloads.
**Context:** Updated `/api/inventory/import` handling in `server/routes.ts`.
**Effort:** M
**Priority:** P2
**Depends on:** Expected real-world import sizes.
**Completed:** v1.5 (2026-03-20)

### Wire server tests into `npm run test` and CI (v1.5 2026-03-20)
**What:** Added `npm run test` script for `server/tests` and included test files in TypeScript checking scope.
**Why:** Makes test execution explicit and repeatable in development.
**Context:** Updated `package.json` and `tsconfig.json`.
**Effort:** M
**Priority:** P2
**Depends on:** CI decision.
**Completed:** v1.5 (2026-03-20)

### Reduce brittleness of global frontend 401 fetch interception (v1.5 2026-03-20)
**What:** Removed global `window.fetch` monkey patch and centralized session-expiry handling in API/query utilities.
**Why:** Avoids brittle global interception and keeps auth-expiry behavior consistent.
**Context:** Updated `client/src/App.tsx` and `client/src/lib/queryClient.ts`.
**Effort:** M
**Priority:** P2
**Depends on:** Centralized API/React Query handling.
**Completed:** v1.5 (2026-03-20)

### Fail fast if `SESSION_SECRET` is missing in production (v1.3 2026-03-18)
**What:** Require `SESSION_SECRET` in production and exit with a clear error when itâ€™s unset (no unsafe default).
**Why:** A weak default session secret can undermine session integrity.
**Context:** `server/auth.ts` refuses to start if `SESSION_SECRET` is missing/placeholder in production.
**Effort:** S
**Priority:** P1
**Depends on:** Defining what â€œproductionâ€ means in your local setup (NODE_ENV value).
**Completed:** v1.3 (2026-03-18)

### Stop public `/uploads` static file serving (v1.3 2026-03-18)
**What:** Removed public static serving of `/uploads` so uploads require authentication.
**Why:** Ensures private employee documents and attachments are not accessible by direct URL.
**Context:** Previously `server/index.ts` exposed the entire uploads directory via `express.static`.
**Effort:** S
**Priority:** P0
**Depends on:** None.
**Completed:** v1.3 (2026-03-18)

### Add auth-gated upload serving endpoints (+ roles) (v1.3 2026-03-18)
**What:** Implemented private upload serving: authenticated image reads, role-gated employee document reads, and authenticated thumbnail generation.
**Why:** Matches your confirmed policy (A1 + 2B) and prevents public fetch access.
**Context:** Implemented in `server/routes.ts` for `/uploads/:filename`, `/uploads/documents/:filename`, and `/uploads/thumbs/:filename`.
**Effort:** M
**Priority:** P0
**Depends on:** A1 + 2B policy decision.
**Completed:** v1.3 (2026-03-18)

### Add automated access-boundary tests for private uploads (v1.3 2026-03-18)
**What:** Add tests verifying upload endpoints return correct status codes for `viewer` vs `editor/admin` (images, thumbnails, employee documents).
**Why:** Private-by-default files are high-risk; tests prevent regressions when routes change again.
**Context:** Upload privacy boundary is implemented in `server/routes.ts` via auth + role checks for `/uploads/:filename`, `/uploads/documents/:filename`, and `/uploads/thumbs/:filename`.
**Effort:** M
**Priority:** P1
**Depends on:** Ability to run a local test server + test fixtures.
**Completed:** v1.3 (2026-03-18)

### Reduce thumbnail generation abuse surface (rate/size guard) (v1.3 2026-03-18)
**What:** Add server-side throttling and stronger constraints around on-demand thumbnail generation.
**Why:** Even behind auth, thumbnail generation can become a resource-exhaustion vector (CPU/disk).
**Context:** `/uploads/thumbs/:filename` generates WebP thumbnails on-demand using `sharp`.
**Effort:** M
**Priority:** P2
**Depends on:** Current traffic expectations and deployment mode (Docker vs local Node).
**Completed:** v1.3 (2026-03-18)

### Create a repeatable â€œprivacy checkâ€ runbook for LAN use (v1.3 2026-03-18)
**What:** Document a small checklist to verify that sensitive uploads (especially employee documents) cannot be accessed without auth and that viewer/editor permissions behave as expected.
**Why:** With privacy boundaries, ops discipline prevents accidental exposure.
**Context:** This app is intended for LAN/private use; the upload boundary is a key safety property.
**Effort:** M
**Priority:** P2
**Depends on:** Your preferred verification steps (browser manual vs curl).
**Completed:** v1.3 (2026-03-18)

### Enforce CSRF protection for cookie-auth mutations (v1.3 2026-03-18)
**What:** Add CSRF mitigation for all state-changing endpoints using cookie sessions.
**Why:** Cookie-auth without CSRF protection is a common failure mode; it turns â€œLAN-onlyâ€ into â€œbrowser-session exploitableâ€ if someone visits a malicious page.
**Context:** Backend blocks cross-origin state-changing requests by validating `Origin`/`Referer` host for cookie-auth sessions.
**Effort:** L
**Priority:** P1
**Depends on:** Decision on CSRF strategy (double-submit cookie, synchronizer token, or same-site-only approach).
**Completed:** v1.3 (2026-03-18)

### Fix attachment deletion integrity (scope delete to parent item) (v1.3 2026-03-18)
**What:** Updated attachment deletion to only delete an attachment if it belongs to the specified inventory item.
**Why:** Prevents integrity desync and cross-item deletion by ID guessing.
**Context:** Endpoint `DELETE /api/inventory/:id/attachments/:attachmentId` previously deleted by `attachmentId` alone.
**Effort:** S
**Priority:** P0
**Depends on:** Confirmed private environment permissions donâ€™t eliminate ID-guessing risk.
**Completed:** v1.3 (2026-03-18)

### Replace silent audit/thumb side-effect failures with contextual logging (v1.3 2026-03-18)
**What:** Removed `catch(() => {})` swallowing in the code paths we touched (history logging + thumbnail pre-generation) and replaced with `console.error(...)` including context.
**Why:** Protects the â€œcomplete historyâ€ promise and reduces time-to-diagnosis for operational issues.
**Context:** `server/routes.ts` previously swallowed errors in CREATE/UPDATE/DELETE/IMPORT history logging and thumbnail pre-generation.
**Effort:** S
**Priority:** P0
**Depends on:** The upload-hardening changes being applied.
**Completed:** v1.3 (2026-03-18)

### Add thumb rate-limiter and CSRF host-mismatch tests (v1.3 2026-03-18)
**What:** Add automated regression tests for:
- thumbnail rate limiting (`429` after max)
- thumbnail rate-limit eviction after the time window
- CSRF rejection when `Origin` is present but host mismatches
**Why:** These mitigations are security-sensitive; tests prevent regressions.
**Context:** Implemented in `server/tests/thumb-rate-limiter.test.ts` and `server/tests/csrf-middleware.test.ts`.
**Effort:** S
**Priority:** P1
**Depends on:** Running `tsx --test` for server tests.
**Completed:** v1.3 (2026-03-18)

### Audit remaining auth boundaries (role checks + file serving) (v1.3 2026-03-18)
**What:** Do a full route audit to confirm every data/file access is consistently gated by `requireAuth`/`requireRole`, including edge endpoints (history, uploads, exports/imports, auth flows).
**Why:** Authorization is the primary product safety boundary; inconsistencies can become data leaks even in â€œLAN-onlyâ€ setups.
**Context:** Private upload access is implemented, but other endpoints may still have missing/insufficient role checks.
**Effort:** M
**Priority:** P1
**Depends on:** Ability to run integration tests (or add targeted route tests).
**Completed:** v1.3 (2026-03-18)

### Upload filename handling: safe unlink + diagnostics (v1.3 2026-03-18)
**What:** For every filesystem delete path that uses stored `fileUrl`/`imageUrl`, ensure we only `unlink` when the resolved path is a file (`stat.isFile()`), and emit contextual logs when resolution fails (to avoid silent orphaning).
**Why:** Prevents runtime exceptions (e.g., `EISDIR`) and improves operational debuggability if legacy/malformed DB rows exist.
**Context:** Delete handlers constrain resolved paths but rely on existence checks and skip logging when resolution fails.
**Effort:** S
**Priority:** P1
**Depends on:** Implementing/keeping `resolveStoredFilePath(...)` as the single source of truth.
**Completed:** v1.3 (2026-03-18)

### Runtime seeding / DB assumptions hardening (v1.3 2026-03-18)
**What:** Gate `seedDatabase()` behind an explicit env flag (or run only in dev) and remove the startup `setTimeout` hack; ensure startup doesnâ€™t create duplicate/partial state in production or test.
**Why:** Runtime seeding can introduce nondeterminism and data drift across environments; `setTimeout` suggests ordering assumptions.
**Context:** `server/routes.ts` seeds DB on startup when `NODE_ENV !== "test"` using a delayed call.
**Effort:** M
**Priority:** P1
**Depends on:** Deciding what environments should be able to auto-seed.
**Completed:** v1.3 (2026-03-18)

### Split inventory exports by role (viewer-safe vs admin/internal) (v1.4 2026-03-19)
**What:** Create separate inventory export endpoints so viewer-safe exports omit internal fields (e.g. `notes`) while editor/admin exports include them; update the dashboard to route exports to the correct endpoint; centralize the export field policy and add a regression test (`server/tests/inventory-export-roles.test.ts`).
**Why:** Prevents field-level data leaks through â€œexportâ€ even when UI edit controls are role-gated; makes admin reporting defensible and stable over time.
**Context:** Export field policy and RBAC are validated with `server/tests/inventory-export-roles.test.ts`.
**Effort:** M
**Priority:** P1
**Depends on:** Role checks and existing export pipeline (`/api/inventory/export*`).
**Completed:** v1.4 (2026-03-19)






