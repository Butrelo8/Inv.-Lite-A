# TODOS

Track open work and completed items by version. See `CHANGELOG.md` for full release notes.

**Open:** 2026-04-09 full codebase review — **Critical** (0) + **Open cards** (0).

**Completed recently:** `**[Backlog] Code review 2026-04-09 — P4 umbrella**` (closed **2026-04-17**) — review follow-ups largely landed via other **`TODOS` Completed** items; residual niceties (pool tuning, `**storage.ts**` split, etc.) deferred / reopen ad hoc. · `**Equipment responsiva (.docx)`** — `**GET /api/inventory/:id/responsiva**`, `**server/doc-gen/responsiva/**`, `**server/tests/responsiva-*.test.ts**`, `**script/verify-responsiva-container.sh**`. · `**[DB] Bootstrap tables vs Drizzle**` (2026-04-17) — `**shared/schema.ts**`, `**migrations/add-bootstrap-tables.sql**`, `**npm run db:migrate:bootstrap-tables**`, `**server/tests/bootstrap-tables-parity.test.ts**`; `**docs/BACKUP-RESTORE.md**`. · `**[Perf] Client bundle — `React.lazy` + Vite `manualChunks`**` (2026-04-17) — `**client/src/App.tsx**`, `**vite.config.ts**`. · `**getOpsSummary`** merged `**ops_events**` queries + **30s TTL cache** (2026-04-17, `**docs/superpowers/plans/2026-04-17-ops-summary-perf.md`**) — `**server/ops-summary-cache.ts**`, `**computeOpsSummary**` in `**server/storage.ts**`; tests `**server/tests/ops-summary-cache.test.ts**`, `**server/tests/ops-summary-parity.test.ts**`. · `**express.json` explicit `limit` + `rawBody` docs + 413 JSON** (2026-04-09 review card, 2026-04-17) — `**limit: "1mb"`**, `**urlencoded` `limit: "1mb"**`, `**captureJsonRawBody**` (reserved for future inbound webhook HMAC); global handler `**{ message: "Payload too large" }**` for `**entity.too.large**`. Test `**server/tests/json-body-limit.test.ts**`. · **[Quality] Uploads / attachments: async `fs`** (2026-04-09 review card, 2026-04-17) — `**fs/promises**` on request paths (`**inventory-item-routes**`, `**upload-routes**`, `**employee-docs-routes**`, `**thumbnails**`, `**index**`, `**upload-config.ensureDocumentsDir**`); tests `**await ensureThumbsDir()**`. · **[Perf] Bulk inventory update + archive** (2026-04-09 review card, 2026-04-17) — `**POST /api/inventory/bulk/update`** and `**/bulk/archive**`: `**db.transaction**`, batched `**UPDATE**`, one `**inventory_history**` insert (`**insertInventoryHistoryBulk**`, `**server/inventory-bulk-helpers.ts**`); audit no longer fire-and-forget after `**res.json**`. Tests: `**server/tests/inventory-bulk-update.test.ts**`. · **[Perf] Inventory aggregates → SQL** (2026-04-09 review card, 2026-04-17) — `**getResponsibleWithCounts`** / `**getFilterOptions**`: DB-side `**GROUP BY**` and `**selectDistinct**` (`**server/storage.ts**`), `**buildInventoryAggregateSiteConditions**`, empty `**restrictToSiteIds**` → no queries, stable responsible tie-break. Tests: `**server/tests/storage-aggregates.test.ts**`. · **Routes: typed auth user** — `**getAuthUserId`**, `**requireAuthUser**` (`**server/auth-user.ts**`, `**server/route-middleware.ts**`); sweep `**server/routes/*.ts**` + `**server/index.ts**` ops logging (2026-04-17) · `**GET /health**` (DB probe `**select 1**`, **200** ok / **503** unavailable; `**server/routes.ts`**, `**server/tests/health-route.test.ts**`) (2026-04-17) · **Inventory list + history search:** escape SQL LIKE metacharacters (`**server/sql-like-escape.ts`**, `**columnIlikeContains**` in `**server/storage.ts**`, tests `**server/tests/sql-like-escape.test.ts**`) (2026-04-17) · **Inventory delete:** single `**storage.deleteInventoryItemWithUndo`** (`**DELETE /api/inventory/:id**` delegates; removed `**deleteItem**`) (2026-04-17) · **P0: `updateItem` 404 on missing row + `upsertUserSiteRole` transactional** (`**server/storage.ts`**, `**inventory-item-routes**`, `**server/tests/storage-p0.test.ts**`) (2026-04-17) · **Quality: `updateWebhookEndpoint` typed Drizzle `set`** (`**WebhookEndpointUpdateSet**` in `**server/storage.ts**`) (2026-04-09) · **API: webhook `PATCH|DELETE :id` strict int** (`**parsePositiveIntPathParam`** in `**server/validation/query-params.ts**`, `**server/routes/webhook-routes.ts**`, tests in `**server/tests/query-params.test.ts**`) (2026-04-09) · **Frontend: `use-auth` role guard** (`**normalizeUserRoleFromApi`** in `**shared/auth-role.ts**`, `**client/src/hooks/use-auth.ts**`, tests `**server/tests/auth-role-normalize.test.ts**`) (2026-04-09) · **Security: webhook REST omits signing `secret`** (`**WebhookEndpointPublic**`, `**server/webhook-endpoint-public.ts**`, `**storage**` list/create/update, `**server/tests/webhook-endpoint-public.test.ts**`) (2026-04-09) · **Docs: Hardening §1 Risk/Code — outbound delivery** (`**docs/HARDENING-FOLLOWUPS.md`**: no stale `**fetch**` claim; `**webhook-routes**`, `**resolveWebhookOutboundConnect**`, `**webhookHttpDelivery.send**`) (2026-04-09) · **Docs: HTTPS webhook literal-IP / TLS SNI** (`**docs/HARDENING-FOLLOWUPS.md`**, `**Readme.txt**`, `**CHANGELOG**`) (2026-04-09) · **Webhook ops `webhookTarget`: `hostname` + `port` + `pathFingerprint`** (`**summarizeWebhookTargetForOps**`, `**server/webhooks.ts**`, tests `**webhook-ops-url**`, `**webhooks**`, `**DECISIONS.md**`, `**CHANGELOG**`) (2026-04-09) · **Malformed `siteId` query → 400** (`**SiteIdQueryResult`**, `**requireInventoryListContext**`, tests `**inventory-list-context-siteid**`, `**sites-scoping**`, `**executive-summary**`) (2026-04-09) · **Site RBAC: warn on empty template capabilities + grants** (`**loadSiteAccess`**, `**server/tests/site-rbac.test.ts**`) (2026-04-09) · **Ops health events: invalid `severity` query tests** (`**parseOpsHealthEventsQuery`**, `**server/tests/query-params.test.ts**`) (2026-04-09) · **Ops `job.webhook_delivery_dead` URL redaction** (`**webhookTarget`** host + path fingerprint, `**server/webhook-ops-url.ts**`, tests `**webhook-ops-url.test.ts**` + `**webhooks.test.ts**`) (2026-04-09) · **Webhooks: `unknown` errors + `getAuthUser`** (`**server/webhooks.ts**`, `**server/routes/webhook-routes.ts**`, `**server/auth-user.ts**` + re-export from `**route-middleware.ts**`, `**server/auth-user.test.ts**`) (2026-04-09) · **Webhook IPv6 URL policy depth** (`**isPrivateOrReservedIpv6String`**, `**webhook-url-policy.test.ts**`) (2026-04-09) · **Site RBAC `capsForGlobalRole` unknown role fail-closed** (`**shared/site-rbac.ts`**, tests `**site-rbac-capabilities.test.ts**`) (2026-04-09) · **Shared Zod query param helpers** (`**server/validation/query-params.ts`**, inventory list + history + webhook deliveries + ops events feed) (2026-04-09) · `**server/routes.ts` thin registry** (slices 3–6) (2026-04-09) · Site RBAC template capability normalization + `/api/sites` comment + executive summary allowlist/PDF buffer + webhook deliveries redaction (2026-04-09) · Webhook outbox `**processing`** recovery (2026-04-09) · Webhook URL / SSRF (2026-04-09) · Clear stale upload refs (2026-04-09) · Templates + executive summary feature (2026-04-09) · Site RBAC + sites (2026-04-08) · Maintenance, compliance, webhooks v1, assignments, integrity, bulk/undo, backup verify — see **Completed** below.

---

## Open

*(None.)*

---

## Completed

---

### [Backlog] Code review 2026-04-09 — P4 follow-ups (single batch) (umbrella; closed 2026-04-17)

**What:** Pool tuning (`**pg.Pool`** `**max**` / timeouts); webhook poller `**setTimeout**` recursion vs `**setInterval**`; split oversized `**storage.ts**`; `**shared/routes.ts**` `**z.custom**` runtime validation note; dev `**seedDatabase**` / image migration cost; `**productId` SET NULL** on history after item delete semantics; compliance queue unit tests depth.
**Why:** Nice-to-have maintainability, scale headroom, and clarity — not blocking ship.
**Context:** Full codebase review (Cursor), 2026-04-09.
**Solution (original umbrella):** Triage as individual cards: (a) `**pg.Pool`** tuning in `**server/db.ts**` + `**DEPLOY.md**`; (b) webhook poller `**setInterval**` + reentry guard; (c) `**server/storage.ts**` split by domain with facade re-export; (d) narrow `**shared/routes.ts**` `**z.custom**` where possible; (e) dev seed/migration guards; (f) `**inventory_history.product_id`** semantics in `**DECISIONS.md**`; (g) compliance queue date-boundary tests.
**Closure:** Umbrella **retired** — substantive 2026-04-09 review items shipped under other **`TODOS`** / **`CHANGELOG`** entries; remaining bullets are **optional** follow-ups (re-open as focused issues if needed).
**Done When** Original criterion was triage/completion of sub-bullets — **umbrella closed** instead; residual items optional / reopen ad hoc.
**Effort:** XL (combined)
**Priority:** P4
**Depends on:** None.
**Completed:** 2026-04-17

---

### Equipment receipt doc (responsiva) — signed Word export (product spec; shipped)

**What:** Printable **`.docx`** “responsiva” from inventory / custody data (template + images + fields) for HR/ops handoff.
**Why:** Formal record without manual copy-paste from the app.
**Context:** Original card spec’d `**POST /api/documents/responsiva`** + assignee body; **shipped** design is **per inventory item**: `**GET /api/inventory/:id/responsiva**` (`**server/doc-gen/responsiva/responsiva.routes.ts**`), generation in `**server/doc-gen/responsiva/**` (`**generateResponsivaDocx**`, photo table / image embedder). Template default `**client/src/templates/responsiva_template.docx**` (override `**RESPONSIVA_TEMPLATE_PATH**`). **Auth:** `**requireAuth**` on route; role/product rules as implemented in routes + storage.
**Solution (shipped):** Unit + integration coverage `**server/tests/responsiva-*.test.ts**` (template presence, service, route, photos, etc.). Optional Docker/template smoke: `**script/verify-responsiva-container.sh**` (compose build if present, template file check, runs `**npx tsx --test server/tests/responsiva-*.test.ts**`).
**Done When** `.docx` download works from app; tests green; container script validates template + tests when Docker available.
**Effort:** M
**Priority:** P2
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Perf] Client bundle: route-level code-splitting (`React.lazy` + Vite dynamic imports) (2026-04-09 review; fixed 2026-04-17)

**What:** Replace static `**import`** of `**@/pages/***` in `**client/src/App.tsx**` with `**lazy(() => import(...))**` and wrap authenticated routes in `**Suspense**` (fallback aligned with existing auth loading UI).
**Why:** Large initial JS; splitting defers unused pages so first paint / TTI improve for internal users on slow links.
**Context:** `**wouter`** `**Switch**` / `**Route**` unchanged; `**manualChunks**` for heavy `**node_modules**`. Server bundle size is a separate follow-up.
**Solution:** `**client/src/App.tsx**` — `**lazy(() => import("@/pages/<name>"))**` for authenticated pages; `**<Suspense fallback={<AppLoadingShell />}>**` around authenticated `**Switch**`; `**/login**` + `**NotFound**` eager. `**vite.config.ts**` — `**build.rollupOptions.output.manualChunks**` (`**react-vendor**`, `**radix**`, `**charts**`, `**pdf**`, `**qr**`). Optional `**<link rel="modulepreload">**` for hot routes not shipped in this pass.
**Done When** `**vite build`** shows per-route async chunks; navigation smoke-tested; fallback matches auth loader.
**Effort:** S
**Priority:** P4
**Depends on:** None.
**Completed:** 2026-04-17

---

### [DB] Bootstrap tables vs Drizzle: `user_sessions`, `login_rate_limits`, `ops_events` (2026-04-09 review; fixed 2026-04-17)

**What:** Three tables created via raw SQL at startup were absent from Drizzle schema / tracked migrations — `**drizzle-kit push`** could propose dropping them.
**Why:** Schema drift risk; accidental loss of sessions / rate limits / ops telemetry.
**Context:** `**server/auth.ts**`, `**server/rate-limiter.ts**`, `**server/ops-events.ts**` (startup `CREATE` belt-and-suspenders retained).
**Solution (shipped):** Table definitions in `**shared/schema.ts**` matching bootstrap SQL; idempotent `**migrations/add-bootstrap-tables.sql**`; runner `**script/migrate-bootstrap-tables.ts**` + `**npm run db:migrate:bootstrap-tables**`; parity test `**server/tests/bootstrap-tables-parity.test.ts**`; `**docs/BACKUP-RESTORE.md**` warns against confirming `**db:push`** drops for these tables.
**Done When** Drizzle knows the tables; operators can apply migration; no silent drop footgun.
**Effort:** L
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Perf] `getOpsSummary`: reduce parallel DB fan-out + TTL cache (2026-04-09 review; fixed 2026-04-17)

**What:** `**getOpsSummary`** issued **11** parallel `**ops_events`** queries in `**Promise.all**`, plus `**user_sessions**` — high pool fan-out under concurrent dashboard polls.
**Why:** Risk pool exhaustion; Ops summary is aggregate-only (acceptable short TTL lag).
**Context:** `**server/storage.ts`**, plan `**docs/superpowers/plans/2026-04-17-ops-summary-perf.md**`.
**Solution:** One `**GROUP BY (event_type, severity)`** for 24h counts; dedicated `**percentile_cont(0.95)**` on `**api.slow_request**`; import rows select unchanged; one `**GROUP BY event_type**` for 7d backup / restore-verify / integrity; last integrity run `**ORDER BY**` + `**LIMIT 1**`. `**getCachedOpsSummary**` (`**server/ops-summary-cache.ts**`, **30s** TTL, `**clearOpsSummaryCache`**). Parity + cache unit tests.
**Done When** Fewer round-trips; same `**OpsSummaryResponse`** shape; cache testable.
**Effort:** M
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Config] `express.json`: explicit `limit` + document `rawBody` capture scope (2026-04-09 review; fixed 2026-04-17)

**What:** `**express.json`** had `**verify**` (full buffer on `**req.rawBody**`) but no explicit `**limit**`; oversized JSON could surface as generic HTML errors.
**Why:** Pin payload size; document why `**rawBody`** exists; return consistent JSON on `**413**`.
**Context:** `**server/index.ts`**.
**Solution:** `**express.json({ limit: "1mb", verify: captureJsonRawBody })`** with JSDoc — `**rawBody**` reserved for future inbound webhook signature verification (no reader today). `**express.urlencoded({ limit: "1mb" })**`. Global error middleware handles `**status === 413**` / `**entity.too.large**` with `**{ message: "Payload too large" }**` before the `**5xx**` log/`ops` path. Test: `**server/tests/json-body-limit.test.ts**` (tiny limit, same 413 branch).
**Done When** Explicit `**limit`**; `**rawBody**` purpose documented; `**413**` JSON.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Quality] Uploads / attachments: async `fs` for delete paths (2026-04-09 review; fixed 2026-04-17)

**What:** `**existsSync`**, `**statSync**`, `**unlinkSync**` on upload/attachment delete and related serving paths blocked the event loop under concurrency.
**Why:** Synchronous filesystem I/O ties up the Node thread.
**Context:** `**server/routes/inventory-item-routes.ts`**, `**server/routes/upload-routes.ts**`, `**server/routes/employee-docs-routes.ts**`, thumbnails + server bootstrap.
**Solution:** `**fs/promises`** — `**stat**` + `**unlink**` with `**ENOENT**` swallowed only where appropriate; `**statIsRegularFile**` helper for `**GET /uploads/***`; async `**unlinkUploadQuiet**` for rejected inventory image uploads; `**ensureDocumentsDir**` middleware before employee `**documentUpload**`; tests `**await ensureThumbsDir()**`.
**Done When** No sync `**fs.*Sync`** on these request paths; behavior unchanged.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Perf] Bulk inventory update + archive: batched `UPDATE` + transactional history (2026-04-09 review; fixed 2026-04-17)

**What:** `**POST /api/inventory/bulk/update`** and `**/bulk/archive**` looped per-item `**update**` + `**getItem**` (update) and `**addHistoryRecord**` with `**.catch**` after `**res.json**` (audit could drop silently).
**Why:** Up to 200 items ⇒ hundreds of queries; history was not atomic with the bulk mutation.
**Context:** `**server/routes/inventory-bulk-routes.ts`**.
**Solution:** `**db.transaction`**: `**SELECT**` snapshot → single `**UPDATE ... WHERE id IN (...)**` with `**.returning()**` → `**insertInventoryHistoryBulk(tx, rows)**` (`**server/inventory-bulk-helpers.ts**`). `**addHistoryRecordsBulk**` on `**DatabaseStorage**` for reuse (`**server/storage.ts**`). `**/bulk/delete**` unchanged (separate undo/raw SQL path). Tests: `**server/tests/inventory-bulk-update.test.ts**` (skip when Postgres unreachable).
**Done When** Batched writes; auditable history; failure rolls back inventory + history.
**Effort:** M
**Priority:** P2
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Bug] `storage.updateItem`: missing row must not return `undefined` (2026-04-09 review; fixed 2026-04-17)

**What:** Inverted branch ran `**UPDATE`** when `**current**` was missing; `**returning()**` empty ⇒ `**undefined**` despite `**Promise<InventoryItem>**`.
**Why:** Shared storage boundary; race after `**getItem`** or future callers.
**Context:** `**server/storage.ts`** `**updateItem**`.
**Solution** `**httpStatusError(404, "Item not found")`** when no row before update and when `**returning()**` empty after update; `**PUT**` inventory handler maps `**status === 404**`. Tests: `**server/tests/storage-p0.test.ts**`.
**Done When** Missing / raced-away id never returns `**undefined`**; `**npm test**` covers throw.
**Effort:** S
**Priority:** P0
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Data] `upsertUserSiteRole`: transactional delete + insert (2026-04-09 review; fixed 2026-04-17)

**What:** `**delete`** then `**insert**` were separate awaits.
**Why:** Insert failure after delete removed site grant (silent lockout).
**Context:** `**server/storage.ts`** `**upsertUserSiteRole**`.
**Solution** `**await db.transaction(async (tx) => { ... delete; ... insert; })`**. Test: failed insert with bad `**template_id**` leaves prior row (`**server/tests/storage-p0.test.ts**`).
**Done When** Failure rolls back delete.
**Effort:** S
**Priority:** P0
**Depends on:** None.
**Completed:** 2026-04-17

---

### [Quality] `storage.updateWebhookEndpoint`: stricter typed `set` for Drizzle (2026-04-09 review)

**What:** `**updateWebhookEndpoint`** used `**Record<string, unknown>**` for `**.set()**`.
**Why:** Stray keys and typos were not caught at compile time.
**Context:** Code review P4.
**Solution** Module-local `**WebhookEndpointUpdateSet`** = `**Partial<Pick<typeof webhookEndpoints.$inferInsert, "url" | "secret" | "eventTypes" | "enabled">> & { updatedAt: Date }**` in `**server/storage.ts**`.
**Done When** `**tsc`** clean; `**set**` only allows columns the admin API may change plus `**updatedAt**`.
**Effort:** S
**Priority:** P4
**Depends on:** None.
**Completed:** 2026-04-09

---

### [API] Webhook admin routes: strict integer `id` path params (2026-04-09 review)

**What:** `**PATCH`** / `**DELETE /api/webhooks/:id**` used `**Number**` + `**isFinite**`, accepting `**1.5**`-style values.
**Why:** Predictable `**400`** for non–positive-integer ids.
**Context:** Code review P4.
**Solution** `**parsePositiveIntPathParam`** (`**z.coerce.number().int().positive()**`, `**server/validation/query-params.ts**`) used in `**server/routes/webhook-routes.ts**`. Tests: `**describe("parsePositiveIntPathParam")**` in `**server/tests/query-params.test.ts**`.
**Done When** Invalid `**id`** → `**400**` `**Invalid id**`; good ids unchanged.
**Effort:** S
**Priority:** P4
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Frontend] `use-auth`: validate `role` from `/api/auth/me` (2026-04-09 review)

**What:** `**mapAuthPayload`** cast `**(u.role ?? "viewer") as UserRole**` without validating `**USER_ROLES**`.
**Why:** Unknown API strings were a silent type lie; UI gates could misbehave.
**Context:** Code review P3.
**Solution** `**shared/auth-role.ts`**: `**normalizeUserRoleFromApi**` uses `**USER_ROLES**` from `**shared/schema.ts**`. `**use-auth**` imports `**UserRole**` from schema, re-exports it, and maps with `**normalizeUserRoleFromApi(u.role)**`. Tests: `**server/tests/auth-role-normalize.test.ts**`.
**Done When** Only `**admin` | `editor` | `viewer`** propagate; else `**viewer**`.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Security] Webhook REST: redact signing `secret` on list/create/update responses (2026-04-09 review)

**What:** `**GET|POST|PATCH /api/webhooks`** returned full rows including plaintext `**secret**`.
**Why:** Reduce exposure via browser extensions, logs, or compromised admin sessions; admins already supply `**secret`** in write bodies when setting or rotating it.
**Context:** Code review P1. `**server/routes/webhook-routes.ts`**, `**server/storage.ts**`.
**Solution** `**WebhookEndpointPublic`** = `**Omit<WebhookEndpoint, "secret">**` (`**shared/schema.ts**`). `**redactWebhookEndpointSecret(s)**` in `**server/webhook-endpoint-public.ts**`; `**getWebhookEndpoints**`, `**createWebhookEndpoint**`, `**updateWebhookEndpoint**` return public shapes. Delivery poller unchanged (reads `**secret**` from DB). Tests: `**server/tests/webhook-endpoint-public.test.ts**`. `**updateWebhookEndpoint**` `**set**` no longer uses `**any**` (`**Record<string, unknown>**` interim).
**Done When** JSON responses never include `**secret`**; tests cover mapper.
**Effort:** S
**Priority:** P1
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Docs] Hardening §1: webhook outbound Risk/Code aligned with pinned delivery (2026-04-09)

**What:** `**docs/HARDENING-FOLLOWUPS.md`** §1 **Risk** still said the app `**fetch`es the stored URL; Code pointed at `server/routes.ts` for webhook CRUD.
Why: Threat-model readers need the real path: `http`/`https.request` to a pinned `connectAddress`, `Host` + TLS SNI from the URL — not `fetch(storedUrl)`.
Context: Code review; shipped behavior in `CHANGELOG` (DNS TOCTOU mitigation).
Solution §1 Risk documents `validateWebhookOutboundUrl` / `resolveWebhookOutboundConnect`, outbound signed POST, explicit negation of bare `fetch(storedUrl)`, pinned DNS + residual window note. Code line: `server/routes/webhook-routes.ts` for CRUD; `server/webhooks.ts` → `resolveWebhookOutboundConnect` (`webhook-url-policy.ts`**) → `**webhookHttpDelivery.send**` (`**webhook-delivery-http.ts**`).
**Done When** §1 matches implementation; `**TODOS`** Open card cleared.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Docs] Outbound webhooks: HTTPS URLs with literal IP targets (2026-04-09 review)

**What:** Document that stored `**https://<ip>/...`** webhooks use `**tlsServerName**` = that IP string; many servers expect SNI matching a DNS name, so operators should prefer hostnames when using TLS.
**Why:** Avoid support churn when deliveries fail TLS verification against IP-only URLs.
**Context:** `**server/webhook-delivery-http.ts`** + `**resolveWebhookOutboundConnect**` (`**server/webhook-url-policy.ts**`). Code review 2026-04-09.
**Solution** Operator note in `**docs/HARDENING-FOLLOWUPS.md`** §1; cross-reference in `**Readme.txt**` DOCUMENTATION index.
**Done When** Short subsection in `**Readme.txt`** or `**docs/HARDENING-FOLLOWUPS.md**` (or operator FAQ) with the above caveat.
**Effort:** S
**Priority:** P4
**Depends on:** None.
**Completed:** 2026-04-09

---

### [API] Inventory list / reports: reject malformed `**siteId`** query (2026-04-09 review)

**What:** When `**SITE_SCOPING_ENABLED`**, invalid `**siteId**` query values were ignored (same as no filter), which could surprise clients.
**Why:** Stricter contract avoids accidental “all sites” reads when the parameter is malformed.
**Context:** `**parseSiteIdQuery`** / `**requireInventoryListContext**` (`**server/inventory-list-context.ts**`). Code review 2026-04-09.
**Solution** `**SiteIdQueryResult`**: present `**siteId**` must match `**/^\d+$/**`, `**Number.isSafeInteger**`, and `**> 0**`. `**requireInventoryListContext**` responds `**400**` with `**{ message, code: "invalid_site_id" }**`. Omission / empty unchanged. `**/api/inventory/filters**` uses `**ctx.siteId**`. Tests: `**server/tests/inventory-list-context-siteid.test.ts**`, `**server/tests/sites-scoping.test.ts**`, `**server/tests/executive-summary.test.ts**`.
**Done When** Invalid `**siteId`** → `**400**`; list + executive summary covered; scoping off unchanged.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Quality] Site RBAC: observability when site grants yield zero template capabilities (2026-04-09 review)

**What:** When a user has `**user_site_roles`** rows but every linked template’s `**capabilities**` normalizes to empty (e.g. `**[]**`), `**loadSiteAccess**` merged `**capsForGlobalRole(role)**` without a non-production warning (warning path only ran for unknown keys or non-empty raw lists).
**Why:** Misconfigured templates are hard to spot; operators may assume grants alone define caps.
**Context:** `**server/site-rbac-access.ts`**; code review 2026-04-09.
**Solution** Non-production `**console.warn`** on every fallback when `**grantRows.length > 0**` and normalized capability set is empty before merging global caps; payload includes `**unknownSamples**` and `**hadAnyRawCapabilityStrings**`. Test: `**server/tests/site-rbac.test.ts**` (`**empty template capabilities log non-production warn**`).
**Done When** Operators see a warn for `**[]`** templates and for unknown-only caps (unchanged); production unchanged.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Testing] Ops health events query: invalid `severity` behavior (2026-04-09)

**What:** Confirm coverage that invalid `**severity`** for `**GET /api/ops-health/events**` is ignored (no client error from query parsing).
**Why:** Locks `**parseOpsHealthEventsQuery`** / Zod preprocess + `**z.enum**` behavior after refactor.
**Context:** Code review 2026-04-09. `**server/validation/query-params.ts`**.
**Solution** Extended `**server/tests/query-params.test.ts`**: all valid severities; empty/whitespace; wrong case; limit still applied with bad severity; `**doesNotThrow**`. JSDoc on `**parseOpsHealthEventsQuery**` notes contract.
**Done When** Tests document that invalid `**severity`** → `**undefined**` and `**parse()**` always succeeds for typical query shapes.
**Effort:** S
**Priority:** P4
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Privacy] Ops events: webhook URL exposure in delivery failure payloads (2026-04-09)

**What:** Redact or shorten `**url`** in `**ops_events**` payloads for `**job.webhook_delivery_dead**` (URL-policy failures and exhausted retries).
**Why:** Paths/query strings can be sensitive; ops feed is visible to editors like webhook delivery metadata.
**Context:** Code review 2026-04-09; `**server/webhooks.ts`** inserts.
**Solution** `**summarizeWebhookTargetForOps`** in `**server/webhook-ops-url.ts**`: payload field `**webhookTarget: { hostname, port, pathFingerprint }**` (SHA-256 hex prefix of `**pathname + search**`; `**port**` null for default `**http`/`https**` ports); removed raw `**url**`. Full URL still in `**webhook_endpoints**` for admins. Tests: `**server/webhook-ops-url.test.ts**`, `**server/tests/webhooks.test.ts**`.
**Done When** No full webhook URL in `**job.webhook_delivery_dead`** JSON; `**endpointId**` + hostname/port + fingerprint sufficient for triage.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Quality] Webhooks: typed errors and `req.user` on admin CRUD (2026-04-09)

**What:** Replace loose error typing in `**server/webhooks.ts`** with `**unknown**` + safe log messages; replace `**(req as any).user**` on webhook admin `**POST**` with a shared typed accessor.
**Why:** Matches TypeScript strictness and boundary typing conventions.
**Context:** Code review 2026-04-09.
**Solution** `**messageFromUnknown`** in `**server/webhooks.ts**` (poller + ops insert catches + interval tick); `**getAuthUser**` in `**server/auth-user.ts**` (re-exported from `**route-middleware.ts**` for `**requireRole**` + `**webhook-routes**`). Tests: `**server/auth-user.test.ts**` (no DB import).
**Done When** No `**any`** on those paths; `**npm run check**` / targeted tests green.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Hardening] Webhook URL policy: IPv6 reserved / documentation ranges (2026-04-09)

**What:** Deepen `**isPrivateOrReservedIpv6String`** vs full reserved-space policy or document as best-effort.
**Why:** Conservative SSRF posture for literal IPv6 webhook targets.
**Context:** Code review 2026-04-09; `**TODOS.md`** P3.
**Solution** Block **RFC 3849** `**2001:db8::/32`**, **RFC 6666** `**100::/64`** (canonical compressed form), **RFC 3879** `**fec0::/10`**, `**ff00::/8**` multicast; JSDoc states best-effort limits. Tests: `**server/tests/webhook-url-policy.test.ts**` (+ validation test for `**[2001:db8::1]**`).
**Done When** Extended checks + tests + `**DECISIONS.md`** / `**CHANGELOG.md**` updated.
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Security] Site RBAC: unknown `users.role` must not widen `capsForGlobalRole` (2026-04-09)

**What:** `capsForGlobalRole` treated any string other than `**viewer`** / `**editor**` as full `**ALL_SITE_CAPABILITIES**`; tighten to **viewer**-like (`**inventory:read`**) for unknown `users.role` values.
**Why:** Avoid privilege expansion on typos or unexpected DB text; align with strict role gates (e.g. executive summary).
**Context:** Code review 2026-04-09; `**TODOS.md`** P1.
**Solution** Exported `**capsForGlobalRole`** from `**shared/site-rbac.ts**`; `**server/site-rbac-access.ts**` imports it. Explicit `**admin**` branch for defense-in-depth; non-production warn on unknown role. Tests: `**server/tests/site-rbac-capabilities.test.ts**`.
**Done When** Unknown roles get read-only site caps; `**viewer`** / `**editor**` / `**admin**` unchanged; tests green.
**Effort:** S
**Priority:** P1
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Security] Webhook outbound: DNS TOCTOU — pinned `http`/`https` delivery (2026-04-10)

**What:** Stop using `**fetch(storedUrl)`** for webhook delivery; resolve a connect address immediately before open socket and POST with `**Host**` / TLS SNI from the original URL.
**Why:** `**fetch`** re-resolves DNS at connect time, which can diverge from earlier policy checks (rebinding / stale TTL).
**Context:** Code review `**TODOS.md`** P1 2026-04-09. `**resolveWebhookOutboundConnect**`, `**buildWebhookHostHeader**`, `**webhookHttpDelivery.send**` in `**server/webhook-delivery-http.ts**`; `**server/webhooks.ts**` poller; shared parse + `**assertWebhookOutboundHostPolicy**` in `**server/webhook-url-policy.ts**`. `**webhookHttpDelivery**` object for test `**mock.method**`.
**Solution** Two lookups for public hostnames when private targets disallowed (policy + pin); literal IPs skip second meaning. Residual race: last lookup vs TCP connect (narrow).
**Done When** Delivery uses pinned address + tests green (`**server/tests/webhooks.test.ts`**, `**server/tests/webhook-url-policy.test.ts**`).
**Effort:** M
**Priority:** P1
**Depends on:** None.
**Completed:** 2026-04-10

---

### [Nice to have] Shared Zod helpers for common query params (2026-04-09)

**What:** Centralize `**limit`**, `**offset**`, and ops `**severity**` parsing used across inventory list, history, webhook deliveries, and `**GET /api/ops-health/events**`.
**Why:** Fewer divergent bounds and coercion bugs between endpoints.
**Context:** `**docs/HARDENING-FOLLOWUPS.md` §8** (now shipped). `**siteId`** for list/report context stays in `**server/inventory-list-context.ts**` (`**parseSiteIdQuery**`, feature-flag behavior).
**Solution** `**server/validation/query-params.ts`** (Zod preprocess mirroring legacy `**parseInt**` / `**Number**` semantics); wired from `**inventory-item-routes**`, `**history-routes**`, `**webhook-routes**`, `**reports-ops-routes**`. Tests: `**server/tests/query-params.test.ts**`.
**Done When** Inventory + report ops feed + at least one other path share helpers (achieved: + history + webhook deliveries).
**Effort:** S
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Expansion] Split `server/routes.ts` by domain — thin registry (2026-04-09)

**What:** Finish incremental extraction so `**registerRoutes`** is a small dispatcher: CSRF, short read-only endpoints (`**/api/inventory/filters**`, `**/api/sites**`), domain `**register*Routes(app)**`, opt-in seed.
**Why:** Merge/review surface; boundaries match domains (auth, uploads, inventory, compliance, etc.).
**Context:** `**docs/HARDENING-FOLLOWUPS.md` §7** (now shipped). Prior slices: middleware, list context, bulk undo, webhooks, maintenance, compliance, reports+ops, inventory bulk. This completion adds `**auth-routes`**, `**user-routes**`, `**history-routes**`, `**shared-notes-routes**`, `**employee-docs-routes**`, `**company-routes**`, `**upload-config.ts**` + `**upload-routes**`, `**inventory-export-routes**`, `**inventory-item-routes**`; `**authEnvFlags**` / `**siteAccessJson**` on `**route-middleware.ts**`. `**registerInventoryBulkRoutes**` after single-item delete; attachments + `**registerUploadRoutes**` after bulk.
**Solution** No HTTP contract changes; `**npm run test`** / `**npm run check**` green.
**Done When** Main `**server/routes.ts`** is ~~150–250 lines including seed (achieved **~~189**).
**Effort:** L
**Priority:** P3
**Depends on:** None.
**Completed:** 2026-04-09

---

### [Hardening] Site RBAC template capabilities + executive summary + webhook deliveries (2026-04-09)

**What:** Normalize `role_templates.capabilities` to known site capability strings; document `**GET /api/sites`** legacy vs grant filtering; restrict executive-summary ops KPIs to `**editor`/`admin**` and buffer PDF generation; redact `**GET /api/webhooks/deliveries**` `**payload**` for **editor**.
**Why:** Corrupt template JSON could empty capability sets; unexpected role strings could expose ops; PDF stream errors were ambiguous; editors saw full webhook bodies.
**Context:** `**docs/HARDENING-FOLLOWUPS.md` §3–§6**; `**DECISIONS.md`** 2026-04-09 (bundle entry).
**Solution** `**shared/site-rbac.ts`** (`SITE_KNOWN_CAPABILITY_SET`, `parseSiteCapabilityStringsFromJsonb`); `**server/site-rbac-access.ts**` fallback to global role caps; comment on `**/api/sites**`; `**server/load-executive-summary.ts**`; `**server/routes.ts**` PDF buffer + `**server/webhook-deliveries.ts**`. Tests: `**site-rbac.test.ts**`, `**site-rbac-capabilities.test.ts**`, `**executive-summary.test.ts**`, `**webhook-deliveries-redaction.test.ts**`.
**Done When** (Shipped) `**npm run test`** / `**npm run check**` green; `**CHANGELOG.md**` / `**DECISIONS.md**` / `**HARDENING-FOLLOWUPS**` updated.
**Effort:** S
**Priority:** P2
**Depends on:** Site RBAC, executive summary, webhooks v1 (done).
**Completed:** 2026-04-09

---

### [Hardening] Webhook outbox recovery for stale `processing` rows (2026-04-09)

**What:** Ensure outbox rows are not left permanently in `processing` after process crash or mid-batch failure.
**Why:** Bulk transition to `processing` before delivery could strand rows with no retry; multiple workers could double-claim without row locks.
**Context:** `**docs/HARDENING-FOLLOWUPS.md` §2**; `**server/webhooks.ts`**.
**Solution** `**webhook_outbox.processing_claimed_at`** (`migrations/add-webhook-outbox-processing-claimed-at.sql`, `**npm run db:migrate:webhook-outbox-claim**`); each poll reclaims `**processing**` older than **5m** to `**pending`**; claim batch via `**UPDATE … FOR UPDATE SKIP LOCKED**`; clear timestamp on `**completed**` / `**dead**` / retry `**pending**`. Tests `**server/tests/webhooks.test.ts**` (stale reclaim + recent in-flight unchanged).
**Done When** (Shipped) Migration + poller + tests + `**CHANGELOG.md`** / `**DECISIONS.md**` / `**HARDENING-FOLLOWUPS**` §2.
**Effort:** M
**Priority:** P1
**Depends on:** Webhooks v1 (done).
**Completed:** 2026-04-09

---

### [Tooling] Clear stale upload DB references (2026-04-09)

**What:** Operational script to fix DB/filesystem drift for inventory images, attachments, and (optionally) employee documents when files are missing on disk.
**Why:** Orphaned paths break listing, exports, and integrity KPIs until refs are cleared or files restored.
**Context:** Same path rules as `**npm run integrity:scan`**; `**docs/BACKUP-RESTORE.md**` integrity section.
**Solution** `**script/clear-stale-file-refs.ts`**, `**npm run integrity:clear-stale-refs**`; shared `**script/integrity-file-paths.ts**`; `**findMissingDbFileReferences**` exported from `**script/integrity-scan.ts**`. Dry-run default; `**--apply**`; `**--include-employee-documents**` with `**--apply**` deletes doc rows with missing files.
**Done When** (Shipped) Script + tests `**server/tests/integrity-file-paths.test.ts`** + docs `**Readme.txt**`, `**BACKUP-RESTORE.md**`, `**CHANGELOG.md**`.
**Effort:** S
**Priority:** P1 (ops hygiene)
**Depends on:** Integrity scanner (done).
**Completed:** 2026-04-09

---

### [Hardening] Webhook URL allowlist and SSRF trust boundary (2026-04-09)

**What:** Restrict outbound webhook targets (`http`/`https` only; block private/reserved literals and DNS; optional LAN escape hatch) and document **trusted-admin** webhook CRUD.
**Why:** `z.string().url()` allowed arbitrary `fetch` targets (SSRF-style risk on permissive networks).
**Context:** `**docs/HARDENING-FOLLOWUPS.md` §1**; `**server/routes.ts`**; `**server/webhooks.ts**`.
**Solution** `**server/webhook-url-policy.ts`** — `validateWebhookOutboundUrl()`: scheme + no URL credentials + literal IP/host checks + `dns.lookup` all addresses non-private unless `**WEBHOOK_ALLOW_PRIVATE_TARGETS**`. `**POST`/`PATCH` `/api/webhooks**` and delivery-time enforcement; delivery violations → outbox `**dead**`, `**job.webhook_delivery_dead**` with `**reason: url_policy**`. `**.env.example**`, `**DECISIONS.md**`, `**CHANGELOG.md**`. Tests: `**server/tests/webhook-url-policy.test.ts**`.
**Done When** (Shipped) Policy + tests + operator doc (`HARDENING-FOLLOWUPS` §1).
**Effort:** M
**Priority:** P1
**Depends on:** Webhooks v1 (done).
**Completed:** 2026-04-09

---

### [Expansion] Publish onboarding templates + executive summary report (2026-04-09)

**What:** Vertical CSV/XLSX import presets and executive summary (asset health, ops KPIs for privileged roles, compliance posture).
**Why:** Faster onboarding and stakeholder-ready reporting without duplicating column semantics.
**Context:** `**DECISIONS.md`** 2026-04-09 (viewer payload vs editor/admin).
**Solution** **Templates:** `**server/inventory-template-presets.ts`**; `**GET /api/inventory/export/template**` and `**GET /api/inventory/export/template/xlsx**` with `**?preset=**` `generic` | `field` (`industrial`) | `office` (`it`); Dashboard **Plantillas** dropdown (all roles with inventario). **Executive:** `**getExecutiveSummaryInventoryMetrics()`** in `**server/storage.ts**` (custody aligned with `**inventory-aggregates**`); `**loadExecutiveSummary**` (`server/load-executive-summary.ts`); `**GET /api/reports/executive-summary**` + `**GET /api/reports/executive-summary/pdf**` (`server/render-executive-summary-pdf.ts`); types `**shared/executive-summary.ts**`. **ACL:** `**inventory:read`** + list site context; **viewers** → `**reliability: null`**; **editors/admins** → `**getOpsSummary`**. Compliance = org-wide + note in JSON. **Client:** `**/reports/executive-summary`**, nav **Informe**, `**use-executive-summary.ts`**. **Tests:** `**server/tests/executive-summary.test.ts`**.
**Done When** (Shipped v1) Presets + report + PDF + UI + tests + `**CHANGELOG.md`** / `**DECISIONS.md**`. **Follow-up:** “all sites” admin rollup; optional `reports:site` gate; localized copy.
**Effort:** M
**Priority:** P2
**Depends on:** Sites/scoping (when enabled).
**Completed:** 2026-04-09

---

### [Expansion] Add scoped RBAC templates by site/business unit (2026-04-08)

**What:** Reusable **role templates** and **user–site grants** with capability checks at inventory-scoped API boundaries.
**Why:** Onboarding and operations need location-scoped access without per-customer permission sprawl.
**Context:** Builds on `**inventory_items.site_id`** and `**SITE_SCOPING_ENABLED**` (`DECISIONS.md` same date).
**Solution** Tables `**role_templates`**, `**user_site_roles**` (`migrations/add-site-rbac.sql`, apply via `**npm run db:migrate:site-rbac**`); seed `**site_viewer**`, `**site_editor**`, `**site_manager**`; capabilities in `**shared/site-rbac.ts**`; enforcement when `**SITE_RBAC_ENABLED**` and scoping on (`server/site-config.ts`, `**server/site-rbac-access.ts**`). **No grant rows** → legacy global role across all sites; **grants** → site union + capability union; `**admin`** bypass. Routes: extended auth JSON, admin `**/api/role-templates**`, `**/api/users/:id/site-roles/***`; storage list filters and item-level 403s. **Client:** `**use-auth`** fields; **Usuarios** → **Sitios** panel. **Tests:** `server/tests/site-rbac.test.ts`.
**Done When** (Shipped v1) Three templates documented; enforcing paths gated; admin UI + APIs; tests for cross-site deny + admin bypass.
**Effort:** L
**Priority:** P2
**Depends on:** Site foundations (done).
**Completed:** 2026-04-08

### [Expansion] Introduce site/location data model foundations (2026-04-08)

**What:** `**sites`**, required `**inventory_items.site_id**`, default site `**Principal**` (`slug = default`), feature-flagged list/filter/export/import and UI site selector.
**Why:** Physical **site** dimension distinct from **company**; multi-site-ready data shape without forcing behavior until operators opt in.
**Context:** Decisions in `**DECISIONS.md`** (2026-04-08): `**SITE_SCOPING_ENABLED**` off → server ignores `siteId` query params and uses default site; on → optional `**siteId**` on inventory list/export/template/import, filters, `**suggest-code**`, maintenance **due**, `**GET /api/sites`**; company vs site alignment **400** when both set and mismatch; employee docs **org-wide** unless tied to an item; `**suggestCode`** scoped by site when flag on; no DB unique on `code` in this slice.
**Solution** SQL `**migrations/add-sites.sql`**; apply with `**npm run db:migrate:sites**` (Node/`pg`, no `psql` required) or paste in a SQL client. Drizzle `**shared/schema.ts**`; `**server/site-config.ts**`; storage/routes for sites + inventory site fields; `**siteScopingEnabled**` on auth; Dashboard `**localStorage**` key `**inventory-site-id**`; analytics/inventory hooks pass `**siteId**` when enabled. **Tests:** `server/tests/sites-scoping.test.ts`.
**Done When** (Shipped v1) Migrated DBs have `**sites`** and non-null `**inventory_items.site_id**`; APIs and client respect flag and site as above; `**CHANGELOG.md**` / `**DECISIONS.md**` updated. **Follow-up:** optional `**employee_documents.site_id`** if product needs site-filtered person docs without item link. **Scoped RBAC:** completed same day (**Add scoped RBAC templates**).
**Effort:** L
**Priority:** P2
**Depends on:** Tenancy/scoping agreement (recorded in `DECISIONS.md`).
**Completed:** 2026-04-08

### [Expansion] Ship maintenance and calibration workflow (2026-04-07)

**What:** Add recurring maintenance/calibration schedules, due/overdue states, and completion actions with evidence/notes.
**Why:** Operational value shifts from static inventory tracking to lifecycle management.
**Context:** Natural next module after assignment workflow for field/industrial use cases. **Product decisions (2026-04-06):** **Viewers** see schedules and item-level maintenance context **read-only**; create/complete/deactivate **editor/admin**. **MVP = passive visibility** — no automated escalation; due/overdue in UI/API only.
**Solution** Schema `maintenance_schedules` and `maintenance_events` (`migrations/add-maintenance.sql`, `shared/schema.ts`); unique partial index **one active schedule per `(item_id, schedule_type)`**; types `maintenance` | `calibration`. **APIs (`shared/routes.ts`, `server/routes.ts`):** `GET /api/inventory/:id/maintenance/schedules` (auth); `POST /api/inventory/:id/maintenance/schedule` (editor/admin); `GET /api/maintenance/due` (`?overdue=true` for overdue-only); `PATCH /api/maintenance/:scheduleId` (editor/admin, deactivate/update); `POST /api/maintenance/:scheduleId/complete` (editor/admin — `performedAt`, `conditionResult`, `notes`, optional `evidenceUrl`); `GET /api/maintenance/:scheduleId/events` (auth). `**inventory_history`:** `MAINTENANCE_SCHEDULED`, `MAINTENANCE_COMPLETED` on schedule create and complete. **Webhooks:** `maintenance.scheduled`, `maintenance.completed` via `storage.enqueueWebhookEvent`. **Client:** `MaintenanceScheduleDialog`, `MaintenanceCompleteDialog`, `MaintenanceTimeline` (`ItemViewDialog` for viewers); Dashboard **Wrench** row action, **Mantenimiento Vencido** badge, filter **Sólo con mantenimientos vencidos**; `use-maintenance.ts`. **Tests:** `server/tests/maintenance-workflow.test.ts`.
**Done When** (Shipped v1) Editors/admins create schedules with interval + start date; completion advances `next_due_at`; viewers read schedules/events via API + item dialog; Dashboard surfaces overdue badge and filter; history + webhooks fire on schedule/complete. **Follow-up:** optional `MAINTENANCE_OVERDUE` history row or job (not in v1); alerting/escalation; richer evidence than URL if needed.
**Effort:** L
**Priority:** P1
**Depends on:** Assignment workflow (done).
**Completed:** 2026-04-07

### [Expansion] Add compliance expiration action center (2026-04-06)

**What:** Passive compliance queues for employee documents: **Faltante** (missing), **Por vencer** (expiry date **today through +30d** vs midnight-truncated “today” in `getComplianceQueues`), **Vencido** (1–30d past due), **Crítico** (>30d past due), per latest row per `(responsible, documentType)`.
**Why:** Shifts compliance from reactive (per-person only) to an org-wide action center without email/scheduling in MVP.
**Context:** **Product decisions (2026-04-06):** **Viewers** see queues read-only on `/compliance`; remediation stays on existing Responsables document upload/patch/delete (**editor/admin**). **MVP = passive visibility** — no automated escalation; `**compliance.*` webhooks** deferred (see webhook card follow-up). Tracked document types follow `**DOCUMENT_TYPES`** in `shared/schema.ts`. Captured in `DECISIONS.md`.
**Solution** `**getComplianceQueues()`** in `server/storage.ts`; `**GET /api/compliance/queues**` in `server/routes.ts` (`requireAuth`, optional `?documentTypes=`); response includes `counts`, `thresholds`, `trackedDocumentTypes`, `asOf` — **no** download/file URLs. **Client:** `client/src/pages/Compliance.tsx`, `client/src/hooks/use-compliance.ts`, `**ShieldCheck`** nav **Cumplimiento** in `AppLayout.tsx`, route in `App.tsx`; `EmployeeQuickViewDialog` for read-only detail; editors/admins get links to existing remediation flows. **Tests:** `server/tests/compliance-queues.test.ts` (bucket boundaries, latest-wins, null `expiresAt` omitted, counts = list cardinality, viewer GET 200, unauthenticated 401, viewer document POST 403).
**Done When** (Shipped v1) API + page + nav + tests green; `CHANGELOG.md` / `DECISIONS.md` updated. **Follow-up:** outbound `compliance.*` events; configurable `dueSoonDays` / `criticalOverdueDays`; optional merge of critical into overdue if product simplifies.
**Effort:** M
**Priority:** P1
**Depends on:** `employee_documents` and responsibles model (done).
**Completed:** 2026-04-06

### [Expansion] Add outbound webhook integration layer (v1) (2026-04-06)

**What:** Add webhook events for core lifecycle changes (inventory CRUD, assignment events, compliance alerts) with retries and idempotency.
**Why:** Integration readiness is required for expansion into larger teams and connected systems.
**Context:** Enables ecosystem workflows without tight coupling to specific third-party systems.
**Solution** Schema `webhook_endpoints` and `webhook_outbox` (`migrations/add-webhooks.sql`, `shared/schema.ts`); **admin-only** CRUD `GET|POST /api/webhooks`, `PATCH|DELETE /api/webhooks/:id`; **editor/admin** `GET /api/webhooks/deliveries` for recent outbox rows. Enqueue after successful writes: `inventory.created` / `inventory.updated` / `inventory.deleted` (`server/storage.ts`); `assignment.assigned` / `assignment.returned` (`server/routes.ts`); `maintenance.scheduled` / `maintenance.completed` (`server/routes.ts`, with maintenance module 2026-04-07). Outbox rows use per-endpoint `**event_id`** (UUID) with unique `(endpoint_id, event_id)` for idempotency. Background poller `server/webhooks.ts` (`startWebhookPoller` from `server/index.ts`): HMAC-SHA256 on `eventId:timestamp:JSON.stringify(payload)` in `**X-Webhook-Signature**`, plus `**X-Webhook-Id**`, `**X-Webhook-Timestamp**`, `**X-Webhook-Event**`; five stepped backoff delays (5s → 1h); exhausted failures → outbox `**dead**` and `**ops_events**` `job.webhook_delivery_dead`. Subscriptions support explicit event types or `*****`. Tests: `server/tests/webhooks.test.ts` (mocked `globalThis.fetch`, signature and dead-letter behavior).
**Done When** (Shipped v1) Endpoints manageable via API; inventory, assign/return, and maintenance schedule/complete enqueue matching subscribers; poller delivers with signed POSTs, retries, and ops-visible permanent failure; deliveries listable; automated tests green. **Follow-up:** `assignment.transferred` (if/when exposed as its own route); compliance-alert hooks; integrator-facing HTTP schema doc if not yet in repo.
**Effort:** M
**Priority:** P2
**Depends on:** Stable event contracts and observability for delivery failures.
**Completed:** 2026-04-06

### [Note] Add restore-verification KPI card to Ops Health (2026-03-31)

**What:** Add a KPI card for restore-verification success rate (7d) and include related pass/fail counts.
**Why:** Makes backup recoverability confidence visible at a glance in the dashboard summary.
**Context:** Restore verification job and events already exist (`job.backup_restore_verify_success`/`failure`); this is observability polish.
**Solution** Extend OpsSummaryResponse.kpis with restore-verify rate + pass/fail counts; add 7d grouped query in getOpsSummary() for restore-verify success/failure events; render new Ops Health KPI card showing rate plus pass/fail subcounts.
**Done When** /api/ops-health/summary returns the 3 new restore-verify fields; Ops Health dashboard displays the new card with 7d rate and pass/fail counts; card shows - rate when no runs in 7d and still shows numeric pass/fail counts.
**Effort:** S
**Priority:** P2
**Depends on:** Extending ops summary query and Ops Health KPI cards.
**Completed:** 2026-03-31

### [Expansion] Ship assignment and handover workflow (2026-03-27)

**What:** Governed assign/return custody with metadata, `inventory_assignments` rows, and ASSIGN / RETURN / TRANSFER history.
**Why:** Structured workflows instead of only ad-hoc `responsible` edits; audit trail for custody.
**Context:** Migration `migrations/add-inventory-assignments.sql` and Drizzle `inventoryAssignments`; APIs `POST /api/inventory/:id/assign`, `POST /api/inventory/:id/return`, `GET /api/inventory/:id/assignments`; return sets `responsible` to `**Sin asignar`** (`UNASSIGNED_RESPONSIBLE_LABEL`, `DECISIONS.md`); list response includes `activeAssignmentItemIds`; Dashboard assign/return actions + “Asignado” badge; `AssignDialog`, `ReturnDialog`, `AssignmentTimeline` in `ItemViewDialog`; History page labels and JSON remark formatting; `client/src/hooks/use-assignments.ts`; tests `server/tests/assignment-workflow.test.ts`. Inline/bulk responsible edits remain the unstructured path (ADJUSTMENT, no assignment row).
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
**Depends on:** Role checks and existing export pipeline (`/api/inventory/export`*).
**Completed:** v1.4 (2026-03-19)