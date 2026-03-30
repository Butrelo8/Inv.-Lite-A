# Project State

## Current Position
- Phase: Feature delivery + production hardening (inventory workflows, DB/media) + **Resumen/Inventario analytics UX**
- Last completed: **Toggleable analytics** on `/inventory` (`InventoryAnalytics`, shared `inventory-aggregates`); **Eco-style** KPI/cards (`KpiCard`); **Overview** category donut + **text list** (“Distribución por categoría”); **Top responsables** as avatar/name/count list (bar chart removed); **`RecentActivityFeed`** on Resumen + analytics with **`/api/history`** subtitles for editor/admin (`history-display.ts`, `useHistory.enabled`); viewer fallback to inventory-based lines; **Historial** table uses shared `formatHistorySubtitle`.
- Next up: Run **`migrations/add-inventory-assignments.sql`** (or Drizzle push) on each environment if not done; smoke-test **Assign/Return**, **history activity** card, and **Overview** layouts in browser; address **integrity scan** missing files (52) when ready.

## Accumulated Decisions
<!-- Key decisions made during development. Keep each decision as:
     - YYYY-MM-DD: decision — rationale
-->
- 2026-03-26: Use `STATE.md` at repo root for session continuity - keeps handoff context explicit and avoids losing decisions between sessions
- 2026-03-26: Implement backup restore verification as a dedicated scheduled job - keeps backup and recoverability concerns independently observable
- 2026-03-26: Implement guarded bulk operations with short undo window - improves throughput while preserving reversibility for destructive actions
- 2026-03-26: Implement read-only integrity scanner with repair proposal artifacts - enables auditable drift detection without risky auto-mutation
- 2026-03-26: Fail integrity scan process when issues are found - makes drift visible in automation and prevents silent health regressions
- 2026-03-26: Make startup schema bootstrap idempotent for `user_sessions` primary key - prevents crash loops when constraint already exists or differs
- 2026-03-26: Ensure `ops_events` table on app startup in production - keeps observability writes from failing when migrations lag
- 2026-03-26: Accept HEIC/HEIF uploads and normalize to JPEG server-side - avoids silent upload skip and keeps thumbnails/UI compatibility
- 2026-03-26: Return `400` when no valid image file is uploaded - prevents false-positive "success" in audit/user flow
- 2026-03-27: On formal **return**, set `inventory_items.responsible` to **«Sin asignar»** (not NULL) - consistent filters/exports; see `DECISIONS.md`
- 2026-03-27: **Activity feed** subtitles from **`/api/history`** for editor/admin; **viewers** keep inventory-derived fallback (API is editor/admin-only) - matches audit truth without widening history ACL

## Blockers & Open Questions
<!-- Things that need resolution before we can plan/execute confidently. -->
- Data/file drift detected: `missing_files_for_db_references` count is 52 in latest scan - resolve by: next session
- Decide remediation strategy for missing files (restore assets vs clear stale DB refs) - resolve by: next session
- Confirm production telemetry after restart (no new `ops_events does not exist` / duplicate `user_sessions` PK errors) - resolve by: next deploy verification
- Validate UI attachment list invalidation after HEIC upload in real browser flow - resolve by: next session QA pass
- **DB:** Ensure `inventory_assignments` exists in deployed DB (run migration SQL or successful `drizzle-kit push`); if `push` asks about `inventory_bulk_undo` unique constraint, prefer **add without truncating** unless duplicates exist

## Session Notes
<!-- Quick context for next session (where to resume and what to watch for). -->
Last session: 2026-03-27
Stopped at: Analytics + Overview visual and list refactors landed; history-backed activity feed; `STATE.md` save
Resume with: Deploy/migration check for `inventory_assignments` if pending; browser QA on `/`, `/inventory` (Analíticas), Historial remarks column; continue integrity-file remediation when prioritized
