# Project State

## Current Position
- Phase: **Responsiva DOCX stabilization** + deployment hygiene (Docker pathing + runtime template compatibility).
- Last completed (this session): Responsiva pipeline hardened end-to-end — added env-based template path (`RESPONSIVA_TEMPLATE_PATH`) with fallback; compose mount for template file; photo sizing now respects table-cell bounds; numbered slot markers `{{FOTOS1}}..{{FOTOSN}}` supported; run-split/underlined marker matching fixed; fallback no longer crashes when `{{FOTOS}}` missing; empty slots now prune table cells/empty rows; image fill XML updated (`a:stretch/a:fillRect`) to avoid clipped-strip rendering.
- Next up: Re-verify generated DOCX for 1/2/5-photo items in production-like container, then decide if HEIC should be auto-converted during responsiva generation (currently only jpg/png embed).

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
- 2026-04-06: **Roadmap stance: single-tenant perfection** — prioritize operational depth (maintenance, compliance visibility, reliability); **sites** ship **feature-flagged** (2026-04-08) without forcing multi-site UX until **`SITE_SCOPING_ENABLED`**
- 2026-04-06: **Maintenance & compliance MVP (A/A)** — **viewers** may see due/overdue and compliance queues **read-only**; **editor/admin** for mutations; **no automated escalation** in MVP (UI visibility only; alerting/escalation follow-up) — recorded in `TODOS.md`
- 2026-04-08: **Run additive SQL migrations with Node/`pg` when `psql` is missing** — `script/migrate-sites.ts` + **`npm run db:migrate:sites`** (same pattern as `migrate-webhooks.ts`) so Windows (and CI) can apply `migrations/add-sites.sql` without PostgreSQL client on `PATH`; documented in `Readme.txt`
- 2026-04-08: **Site RBAC integration tests** (`site-rbac.test.ts`) use the same **`DATABASE_URL`** as the app; only default to Docker **`inventario:inventario@127.0.0.1`** when the var is unset — avoids splitting raw `pg` fixtures and Drizzle across two databases
- 2026-04-09: **Node test `t.after` for integration servers** — register **one** async hook and run teardown in a fixed order (e.g. **`httpServer.close`** → DB deletes → **`pool.end()`**); multiple hooks run in **reverse registration order** and caused false failures after passing HTTP assertions
- 2026-04-09: **Executive summary ACL** — `/api/reports/executive-summary` uses `inventory:read` + list site context; viewers omit `getOpsSummary` (`reliability: null`); editors/admins get full ops block — aligns with `/api/ops-health/summary` boundary; details in `DECISIONS.md`
- 2026-04-09: **`npm run check` fixes** — `use-toast` **`update`** takes partial fields (id from closure); site-rbac test mocks **`isAuthenticated`** via **`Omit<express.Request, "isAuthenticated">`** to avoid Passport predicate clash; webhooks tests load modules in **`describe`** **`before()`** to avoid top-level **`await`** under **`tsc`**
- 2026-04-09: **Ops path hygiene** — no debug **`fetch`** to local ingest URLs in **`emitOpsEvent`** / **`addOpsEvent`** (best-effort observability only)
- 2026-04-09: **Hardening backlog is tracked** — **`docs/HARDENING-FOLLOWUPS.md`** (narrative) + **`TODOS.md`** + **`CHANGELOG.md`** entry; **`Readme.txt`** lists **`docs/`** (§1–§8 shipped); new follow-ups tracked in **`TODOS.md` Open** after code reviews
- 2026-04-09: **Outbound webhook URL policy** — validate on admin create/update and at delivery; private/DNS checks unless **`WEBHOOK_ALLOW_PRIVATE_TARGETS`**; **`DECISIONS.md`** entry
- 2026-04-09: **Webhook outbox claims** — **`processing_claimed_at`**, reclaim stale **`processing`** after 5m, atomic claim with **`SKIP LOCKED`**; migration **`db:migrate:webhook-outbox-claim`**
- 2026-04-09: **Site RBAC read-path cap normalization** — ignore unknown template capability strings; if explicit grants normalize to empty set, merge **`capsForGlobalRole(role)`** so corrupt JSON cannot lock users out; non-production warn — details in **`DECISIONS.md`** (post-review hardening entry)
- 2026-04-09: **Executive summary ops gate** — **`reliability`** / **`getOpsSummary`** only when **`role === "editor"` or `role === "admin"`**; PDF generated to buffer then **`res.send`** so failures need not truncate a stream
- 2026-04-09: **Webhook deliveries list** — **`editor`**: **`payload: null`**, **`payloadRedacted: true`**; **`admin`**: full row
- 2026-04-09: **`server/routes.ts` split** — domain **`register*Routes(app)`** modules under **`server/routes/`**; shared middleware + inventory list context + bulk undo string/restore split; **`registerInventoryBulkRoutes`** stays **after** single-item delete so **`/api/inventory/bulk/*`** still registers before **`/api/inventory/:id/...`**
- 2026-04-09: **Integration test flake** — parallel **`tsx --test server/tests/*.test.ts`** against one Postgres can rarely **deadlock** during schema setup; re-run usually green; consider serializing DB-heavy suites or isolating DB per worker if CI noise
- 2026-04-09: **Shared Zod query parsing** — **`server/validation/query-params.ts`** centralizes **`limit`/`offset`** (inventory list, history, webhook deliveries) and ops event feed **`limit`/`severity`** with preprocess mirroring legacy coercion; **`parseSiteIdQuery`** stays in **`inventory-list-context.ts`** — details in **`DECISIONS.md`**
- 2026-04-09: **Code review → `TODOS.md`** — shipped through session save: DNS TOCTOU, site RBAC caps + unknown **`users.role`**, IPv6 literals, webhook **`unknown`/`getAuthUser`**, ops **`webhookTarget`** redaction, ops **`severity`** query tests (**`TODOS` Open** cleared)
- 2026-04-10: **Webhook delivery pinned connect** — **`webhookHttpDelivery`** object (not bare ESM export) so **`mock.method(..., "send")`** works in **`node:test`**; delivery uses **`Host`** + TLS **SNI** from original URL; residual race only between last **`dns.lookup`** and socket connect — **`DECISIONS.md`** 2026-04-10
- 2026-04-09: **Site RBAC `capsForGlobalRole` unknown role** — garbage **`users.role`** no longer maps to full site caps; **`DECISIONS.md`** + **`TODOS.md`** completed card
- 2026-04-09: **Webhook IPv6 literal policy depth** — documentation / discard / deprecated site-local / multicast literals blocked in **`webhook-url-policy.ts`**; **`DECISIONS.md`** + **`TODOS.md`** completed card
- 2026-04-09: **`getAuthUser` in `auth-user.ts`** — avoids importing **`route-middleware`** (and **`db`**) from lightweight tests; re-exported from **`route-middleware`** for routes
- 2026-04-09: **Ops webhook dead-letter privacy** — **`webhookTarget { hostname, port, pathFingerprint }`** instead of full **`url`** in **`ops_events`**; admins use **`endpointId`** → **`webhook_endpoints`**
- 2026-04-09: **Ops health `severity` query** — invalid values preprocess to **`undefined`**; tests lock “no throw / no 400 from parser” contract for **`GET /api/ops-health/events`**
- 2026-04-09: **Site RBAC empty-template fallback observability** — if grants exist but normalized template capabilities are empty, always **non-production** **`console.warn`** (includes **`hadAnyRawCapabilityStrings`**) before merging **`capsForGlobalRole(role)`** — avoids silent **`[]`** templates
- 2026-04-09: **Strict `siteId` when site scoping on** — present query param must be digits-only, safe integer, **`> 0`**, else **`400`** **`invalid_site_id`**; avoids **`parseInt`** “prefix” surprises and accidental all-sites reads — **`server/inventory-list-context.ts`**
- 2026-04-09: **Post-review webhook + auth hygiene (follow-up session)** — admin webhook JSON never returns **`secret`** (**`DECISIONS.md`**); **`normalizeUserRoleFromApi`**; **`parsePositiveIntPathParam`** for webhook PATCH/DELETE; **`WebhookEndpointUpdateSet`**; Hardening §1 doc aligned with actual delivery stack.
- 2026-04-09: **Full-repo code review → `TODOS.md` Open** — second-pass review (wider than the prior cleared batch) captured as actionable cards: correctness (**`updateItem`**), transactional **`upsertUserSiteRole`**, LIKE escaping, delete-path consistency, **`getAuthUser`** cleanup, SQL aggregates, bulk perf, async fs, JSON limit, ops summary fan-out, **`/health`**, bootstrap tables vs Drizzle, P4 backlog — prioritize P0 before relying on **`DatabaseStorage`** edge cases.
- 2026-04-17: **Responsiva template path must be runtime-configurable** — added `RESPONSIVA_TEMPLATE_PATH` fallback chain + docker compose mount to prevent `/app/src/templates/...` ENOENT in containerized deploys.
- 2026-04-17: **Responsiva photo placeholders use numbered slots** (`{{FOTOS1}}..`) with legacy `{{FOTOS}}` fallback — allows per-item variable photo count while preserving backward compatibility with older templates.
- 2026-04-17: **Placeholder matching must tolerate Word run splitting** (underline/mixed formatting) — marker replacement now scans paragraph/cell visible text, not only contiguous raw XML markers.
- 2026-04-17: **Photo rendering should fit table cell geometry** — EMU caps tied to cell width/height + `blipFill` stretch/fillRect to prevent clipped vertical strips and improve legibility across 1–5 image layouts.

## Blockers & Open Questions
<!-- Things that need resolution before we can plan/execute confidently. -->
- Data/file drift (missing uploads): cleared locally 2026-04-09 via `npm run integrity:clear-stale-refs -- --apply --include-employee-documents`; re-run `integrity:scan` after restores or bulk deletes
- Confirm production telemetry after restart (no new `ops_events does not exist` / duplicate `user_sessions` PK errors) - resolve by: next deploy verification
- Validate UI attachment list invalidation after HEIC upload in real browser flow - resolve by: next session QA pass
- **DB:** Ensure **`sites`** + **`inventory_items.site_id`** exist (`migrations/add-sites.sql` or **`npm run db:migrate:sites`**); when enabling **`SITE_RBAC_ENABLED`**, run **`npm run db:migrate:site-rbac`** (`role_templates`, `user_site_roles`); ensure **`maintenance_*`**, `inventory_assignments`, and **webhook** tables exist (migration SQL or `drizzle-kit push` where safe); for outbound webhooks, run **`npm run db:migrate:webhook-outbox-claim`** (or `db:push`) so **`webhook_outbox.processing_claimed_at`** exists; if `push` asks about `inventory_bulk_undo` unique constraint, prefer **add without truncating** unless duplicates exist
- **`npm run db:push` safety:** If Drizzle proposes **dropping** tables created outside Drizzle (e.g. **`user_sessions`**, **`login_rate_limits`** from app bootstrap), **abort** until those tables exist in `shared/schema.ts` or migrations are applied another way — avoid data loss
- Responsiva format edge-case pending: confirm 5+ photo mixed-orientation docs remain stable after latest XML fixes in deployed container (not only local run).

## Session Notes
<!-- Quick context for next session (where to resume and what to watch for). -->
Last session: **2026-04-17** (calendar)
Stopped at: `save state` after responsiva debugging/implementation loop (template path env support, marker robustness, slot replacement, empty-slot pruning, photo rendering XML fix).
Resume with: regenerate DOCX for representative items (1/2/5 photos) in docker app, validate visual output against expected grid, then either close responsiva workstream or add HEIC->JPEG conversion in responsiva embed path.

Next session should start with: run final responsiva acceptance pass in container (`/api/inventory/:id/responsiva` for 1/2/5 photos), then return to `TODOS.md` P0 items.

Consider running `/dream` to consolidate what you learned this session.
