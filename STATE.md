# Project State

## Current Position
- Phase: Production hardening (DB bootstrap + media upload reliability)
- Last completed: Patched startup DB guards for `user_sessions` PK/`ops_events` creation and fixed HEIC upload handling with server-side conversion to JPEG
- Next up: Validate HEIC upload end-to-end from UI and confirm attachment refresh behavior after upload

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

## Blockers & Open Questions
<!-- Things that need resolution before we can plan/execute confidently. -->
- Data/file drift detected: `missing_files_for_db_references` count is 52 in latest scan - resolve by: next session
- Decide remediation strategy for missing files (restore assets vs clear stale DB refs) - resolve by: next session
- Confirm production telemetry after restart (no new `ops_events does not exist` / duplicate `user_sessions` PK errors) - resolve by: next deploy verification
- Validate UI attachment list invalidation after HEIC upload in real browser flow - resolve by: next session QA pass

## Session Notes
<!-- Quick context for next session (where to resume and what to watch for). -->
Last session: 2026-03-26
Stopped at: Rebuilt Docker app with DB/bootstrap + HEIC patches; verified clean startup logs and table presence (`ops_events`, `user_sessions`)
Resume with: Upload a real `.heic` from UI, inspect `POST /api/inventory/:id/image` + `GET /api/inventory/:id/attachments` responses, then decide if client refresh patch is needed

