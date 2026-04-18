# DECISIONS

Architectural decisions and their rationale.

Updated when decisions are made.

---

## 2026-04-17 — `getOpsSummary` query merge + 30s TTL cache

**Context:** The Ops dashboard summary method ran **11** parallel **`ops_events`** queries in one **`Promise.all`**, plus a **`user_sessions`** count — up to **12** pool connections per request. Under concurrent polls this risked pool exhaustion.

**Decision:** Merge all **`ops_events`** 24h counts into one **`GROUP BY (event_type, severity)`**; merge the three 7d backup / restore-verify / integrity counts into one **`GROUP BY event_type`**; keep **`percentile_cont(0.95)`** on **`api.slow_request`**, the import payload scan, the last-integrity **`ORDER BY`** + **`LIMIT 1`**, and the **`user_sessions`** probe as separate queries. Wrap **`DatabaseStorage.getOpsSummary`** in a **30s** in-memory TTL cache (**`server/ops-summary-cache.ts`**, **`getCachedOpsSummary`**, **`clearOpsSummaryCache`**).

**Tradeoffs:** The aggregate summary can lag up to **30s** behind live **`ops_events`**. Acceptable for a polled KPI pane; the event stream remains uncached for alert-style use.

**Invariants:** **`OpsSummaryResponse`** shape unchanged (fixture parity test). **`activeSessions`** still tolerates missing **`user_sessions`**. Failed cache loads do not poison the entry; tests call **`clearOpsSummaryCache`**.

---

## 2026-04-17 — Bulk update / archive history is transactional

**Context:** **`POST /api/inventory/bulk/update`** and **`/bulk/archive`** logged **`inventory_history`** via **`storage.addHistoryRecord`** with **`.catch(console.error)`** (update) or **`.catch(() => undefined)`** (archive), after per-row updates and without tying success to the HTTP response body. A failed insert could leave inventory mutated with no audit row.

**Decision:** Perform snapshot + batched **`UPDATE`** + multi-row **`INSERT INTO inventory_history`** inside **`db.transaction`**. Any failure rolls back both the inventory change and the history batch.

**Alternatives considered:** Keep fire-and-forget history for throughput; queue history to a worker.

**Why not the others:** Audit integrity is a product invariant; silent **`catch`** on history is unacceptable for bulk paths once batching is implemented.

---

## 2026-04-09 — Webhook signing secret omitted from admin REST JSON

**Context:** `GET` / `POST` / `PATCH /api/webhooks` returned full `webhook_endpoints` rows, including the HMAC signing secret, increasing exposure via browser tooling, proxies, or logs even for trusted admins.

**Decision:** Introduce `WebhookEndpointPublic` (`Omit<WebhookEndpoint, "secret">`) and return it from `getWebhookEndpoints`, `createWebhookEndpoint`, and `updateWebhookEndpoint` after `redactWebhookEndpointSecret` (`server/webhook-endpoint-public.ts`). The outbound delivery poller continues to select `secret` from the database for signing.

**Alternatives considered:** Return the secret once on `201 Created` for copy-paste UX; add `secretSet: boolean` alongside redaction.

**Why not the others:** On create/update the client already sent the secret in the request body; list/patch should not round-trip stored secrets. A boolean flag adds API surface without much benefit while the column remains non-null.

---

## 2026-03-18 — Privacy boundary: uploads are private by default

**Context:** This app is used locally/LAN by trusted people; employee documents are explicitly private and must not be accessible by direct URL.

**Decision:** Use an auth-gated upload serving model:
- `GET /uploads/:filename` requires login (images)
- `GET /uploads/documents/:filename` requires login + `editor/admin`
- `GET /uploads/thumbs/:filename` requires login and generates missing thumbs on-demand

**Alternatives considered:** Keep `/uploads` as public static files with auth only at the API layer.

**Why not the others:** Employee documents are sensitive; public static access breaks the privacy boundary at the filesystem URL layer.

---

## 2026-03-18 — Attachment deletion must be scoped to the parent item

**Context:** The existing delete endpoint accepted `:attachmentId` without verifying it belongs to `:id`, enabling integrity desync and cross-item deletion by ID guessing.

**Decision:** Change deletion to `deleteAttachmentForItem(itemId, attachmentId)` and only remove if the attachment matches the parent `inventory_items.id`.

**Alternatives considered:** Keep deleting by `attachmentId` only and rely on UI correctness.

**Why not the others:** UI correctness is not an authorization boundary; the backend must enforce resource ownership relations.

---

## 2026-03-18 — No silent failures for audit/history side effects

**Context:** “Complete history” is a core product promise. Silent `catch(() => {})` hides failures and makes audit gaps hard to detect.

**Decision:** Replace swallow-catches in affected flows with `console.error(...)` including contextual identifiers.

**Alternatives considered:** Swallow errors to avoid breaking primary user actions.

**Why not the others:** Losing history silently is worse than surfacing an operational signal; correctness/traceability wins.

---
## 2026-03-18 — CSRF protection for cookie-auth mutations

**Context:** Backend uses `express-session` cookies + Passport cookie auth; the UI performs `fetch(..., { credentials: "include" })` for POST/PATCH/DELETE requests.

**Decision:** Mitigate CSRF by:
- Setting the session cookie `sameSite` attribute to `lax`.
- Rejecting cross-origin state-changing `/api` requests by validating that `Origin` or `Referer` (when present) matches the request `Host`.

**Alternatives considered:** Double-submit cookies or synchronizer tokens.

**Why not the others:** This provides a server-side trust boundary with minimal frontend token plumbing.

---

## 2026-03-27 — Return asset sets `responsible` to “Sin asignar”

**Context:** The assignment/return workflow will update `inventory_items.responsible` as the current-holder snapshot. We need a single canonical value when nothing is actively assigned.

**Decision:** On successful **return**, set `inventory_items.responsible` to the literal string **`Sin asignar`** (not `NULL`), so filters, exports, and the Dashboard stay consistent with existing text-based “responsible” usage.

**Alternatives considered:** Set `responsible` to `NULL`; use a different label per locale.

**Why not the others:** Nullable responsible complicates filters and CSV columns that assume a string; a fixed Spanish label matches the product language already used in the UI unless/until i18n is introduced.

---

## 2026-04-06 — Passive Compliance Action Center with Role-Based Visibility

**Context:** The system tracks employee documents with expiration dates, but visibility was limited to the individual employee view. Proactive tracking was missing.

**Decision:** Implement a centralized "Compliance Action Center" (`/compliance`) that:
- Aggregates all document statuses into four buckets: Missing, Due Soon, Overdue, and Critical.
- Provides read-only visibility to ALL roles (including Viewers) to democratize operational awareness.
- Gates remediation (upload/update) to Editors/Admins only via existing Employee page links.
- Uses hardcoded thresholds for MVP (30d for Due Soon, 30d past due for Critical).

**Alternatives considered:** Automated email/webhook alerts; blocking Viewers from the center.

**Why not the others:** Passive visibility is the lowest-friction/highest-value first step; alerting adds infrastructure complexity (mailers/scheduling) out of scope for MVP. Permitting Viewers to see (but not touch) the queues improves team-wide awareness of compliance gaps.

---

## 2026-04-08 — Site / location data model (feature-flagged)

**Context:** The product is single-tenant today but needs a physical **site** dimension distinct from **company** for future multi-location inventory without a breaking schema rewrite.

**Decision:**
- Add **`sites`** (`name`, optional `slug`, optional `company_id` → `companies`, optional `archived_at`) and require **`inventory_items.site_id`** → `sites`, backfilled to a seeded row **`slug = default`** (`migrations/add-sites.sql`, DB default via `default_site_id()` for raw inserts).
- Gate behavior with env **`SITE_SCOPING_ENABLED`** (`server/site-config.ts`): when **off** (default), list APIs **ignore** `siteId` query params and all writes use the **default site** so behavior matches pre-change deployments. When **on**, inventory list/export/filters/suggest-code and maintenance **due** list accept optional **`siteId`**; Dashboard shows a **site** selector persisted in **`localStorage`** (`inventory-site-id`).
- **Company vs site:** If both **`inventory_items.company_id`** and the site’s **`company_id`** are set, they **must match** on create/update or the API returns **400**.
- **Employee documents:** Remain **org-wide** by default; site context for a document is only via linked **`item_id`** (join `inventory_items.site_id`). No `employee_documents.site_id` in v1.
- **Code uniqueness:** Not enforced with a DB unique index in this slice (existing data may duplicate codes); **`suggestCode`** scopes by **`site_id`** when scoping is enabled.

**Alternatives considered:** Global unique `code`; `site_id` on `employee_documents`; always-on scoping without a flag.

**Why not the others:** Per-site codes are a better fit for multi-site operations; person-level docs without an item stay org-wide until a product need appears; the flag avoids surprising existing single-site production until operators opt in.

---

## 2026-04-08 — Site-scoped RBAC (feature-flagged, requires scoping)

**Context:** Multi-site inventory needs per-user access to a subset of sites without promoting everyone to global `admin`.

**Decision:**
- Add **`role_templates`** and **`user_site_roles`** (`migrations/add-site-rbac.sql`, `shared/schema.ts`, capability strings in **`shared/site-rbac.ts`**). Seed three templates: **`site_viewer`** (`inventory:read`), **`site_editor`** (+ `inventory:write`, `assignments:manage`), **`site_manager`** (+ `employees:read`, `reports:site`).
- Gate enforcement with **`SITE_RBAC_ENABLED`** (`server/site-config.ts`). Enforcement is active only when **both** **`SITE_SCOPING_ENABLED`** and **`SITE_RBAC_ENABLED`** are true.
- **Legacy / no grants:** If a user has **no** `user_site_roles` rows, behavior matches pre-RBAC: global `viewer` / `editor` / `admin` capabilities apply across all sites (no extra site filter from grants).
- **With grants:** Non-admin users are restricted to **union of granted sites**; effective capabilities are the **union** of template capabilities on those rows. **`admin`** bypasses grants (all sites, all capabilities); no membership rows required.
- **Request resolution:** `server/site-rbac-access.ts` loads access once per request (`getSiteAccess`); inventory and related routes apply list filters (`restrictToSiteIds`) and **403** on cross-site or missing capability (`auth.forbidden` with `kind: site_rbac` where applicable).
- **Auth payload:** Login and **`GET /api/auth/me`** include **`siteRbacEnabled`**, **`capabilities`**, **`allowedSites`**, and **`siteGrants`** when enforcing. Admins manage grants via **`GET|PUT|DELETE /api/users/:id/site-roles/...`** and **`GET /api/role-templates`**; **`/users`** (Usuarios) exposes a Sitios panel when both flags are on.

**Alternatives considered:** Always-on RBAC without a second flag; per-permission rows instead of templates.

**Why not the others:** A second flag keeps single-site deployments unchanged until operators opt in; named templates reduce configuration surface area for v1.

---

## 2026-04-09 — Executive summary report: viewer vs editor/admin payload

**Context:** Stakeholders need a single report for asset posture, compliance queues, and ops reliability; viewers already have read-only compliance and inventory list access.

**Decision:** Ship **`GET /api/reports/executive-summary`** (+ optional **`/pdf`**) gated by **`inventory:read`** (same list/site context as exports). **Viewers** receive **asset health** (scoped like inventory list when site scoping is on) and **compliance** aggregates only; **`reliability`** is **`null`** (no **`getOpsSummary`** exposure). **Editors and admins** receive the full JSON including ops KPIs (backup, restore-verify, integrity), matching the existing boundary of **`/api/ops-health/summary`**. Compliance counts stay **organization-wide** in v1 (employee documents are not site-scoped); the API includes an explicit scope note in the payload.

**Alternatives considered:** Same report for all roles; separate viewer-only route.

**Why not the others:** Omitting ops data for viewers avoids widening observability ACL beyond Ops Health while still giving them inventory + compliance visibility consistent with prior product decisions.

---

## 2026-04-09 — Outbound webhook URL policy (SSRF mitigation)

**Context:** Webhook endpoints are stored by admins and the server `fetch`es them with secrets; unconstrained URLs are an SSRF risk on networks that can reach internal or cloud metadata addresses.

**Decision:** Centralize validation in **`server/webhook-url-policy.ts`**: only **`http:`** / **`https:`**, reject URL userinfo (credentials), block literal private/reserved IPv4 and IPv6, block obvious metadata hostnames (`localhost`, `metadata.google.internal`, link-local IPv4 literal, etc.), and unless **`WEBHOOK_ALLOW_PRIVATE_TARGETS`** is set, **`dns.lookup(..., { all: true })`** and reject if **any** resolved address is private/reserved. Run validation on **`POST`/`PATCH` `/api/webhooks`** and again at delivery in **`server/webhooks.ts`**; policy failures at delivery mark the outbox row **`dead`** and log **`job.webhook_delivery_dead`** with **`reason: url_policy`**.

**Alternatives considered:** IP allowlist only; rely on admin trust with no technical controls; block DNS and literals only.

**Why not the others:** Scheme + literal + full DNS coverage catches common SSRF classes without a heavy allowlist UX; env escape hatch preserves trusted LAN/dev; re-check at delivery covers rows created before policy tightening.

---

## 2026-04-10 — Webhook delivery: pinned connect target (DNS TOCTOU mitigation)

**Context:** **`fetch(url)`** performs its own DNS resolution at connect time, which can differ from an earlier **`validateWebhookOutboundUrl`** / policy check (rebinding / stale answers), widening SSRF-style risk on permissive networks.

**Decision:** Add **`resolveWebhookOutboundConnect`** after shared parse + **`assertWebhookOutboundHostPolicy`**: for hostnames, run a fresh **`dns.lookup(..., { all: true })`**, pick an allowed address (prefer **`A`** when **`WEBHOOK_ALLOW_PRIVATE_TARGETS`** is off), and POST via **`node:http`/`node:https`** to that address with **`Host`** and TLS **SNI** from the original URL (**`server/webhook-delivery-http.ts`**, **`webhookHttpDelivery.send`**). Admin CRUD keeps **`validateWebhookOutboundUrl`** for **`400`** responses.

**Alternatives considered:** Document TOCTOU as accepted risk; depend on undici **`Dispatcher`** only; single DNS at delivery without separating “policy pass” from “pin pass” (kept two lookups for hostnames when private targets disallowed: policy validation then immediate pin lookup).

**Why not the others:** Pinning aligns the socket destination with the last policy-approved resolution window; native **`http`/`https`** avoids extra deps; **`webhookHttpDelivery`** object exists so tests can mock **`.send`** (ESM namespace exports are not **`mock.method`**-friendly).

---

## 2026-04-09 — Post-review hardening: site RBAC caps, executive summary roles, webhook delivery list

**Context:** Follow-ups from `docs/HARDENING-FOLLOWUPS.md` §3–§6: corrupt `role_templates.capabilities` could yield empty capability sets; unexpected `users.role` strings could widen ops visibility in the executive summary; streaming PDF errors were awkward; editors saw full webhook outbox payloads.

**Decision:**
- **Site RBAC:** Parse template capability arrays with **`parseSiteCapabilityStringsFromJsonb`**; only strings in **`SITE_KNOWN_CAPABILITY_SET`** apply. If a user **with** `user_site_roles` rows would have **zero** known capabilities after normalization, merge in **`capsForGlobalRole(role)`** so bad JSON cannot lock them out; log a warning in non-production when falling back.
- **Executive summary:** Treat **`reliability`** (ops KPIs) as allowed only for **`editor`** and **`admin`**, not any non-viewer role string.
- **Executive summary PDF:** Buffer the generated PDF before setting response headers so failures can return **`500` JSON** when generation throws.
- **Webhook deliveries list:** **`editor`** gets **`payload: null`** and **`payloadRedacted: true`**; **`admin`** keeps full rows.

**Alternatives considered:** Reject invalid template caps at DB write time only; redact for all roles; keep streaming PDF to the socket.

**Why not the others:** Read-path normalization + fallback fixes existing bad rows without a migration; editor redaction narrows business-data exposure while preserving admin debugging; buffering avoids truncated PDF responses on error.

---

## 2026-04-09 — Webhook outbox delivery claims (crash + multi-instance)

**Context:** The poller bulk-set rows to **`processing`** then delivered sequentially; a crash mid-batch could strand rows with no path back to **`pending`**. Multiple app instances could also contend on the same rows without row-level locking.

**Decision:** Add **`webhook_outbox.processing_claimed_at`**. Each poll: (1) reset **`processing`** → **`pending`** when **`processing_claimed_at`** is older than **5 minutes**; (2) claim up to **20** rows with a single **`UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`** so only one worker owns each row; (3) clear **`processing_claimed_at`** when a row becomes **`completed`**, **`dead`**, or retried **`pending`**. Ship SQL migration + **`npm run db:migrate:webhook-outbox-claim`** (and **`drizzle-kit push`** for schema-aligned dev DBs).

**Alternatives considered:** Reset all **`processing`** on every tick (unsafe with multiple workers); no schema change and hope single-instance only.

**Why not the others:** Time-bounded reclaim fixes crashes without unbounded duplicate delivery risk from resetting in-flight work on another node; **`SKIP LOCKED`** makes claiming safe under concurrent pollers.

---

## 2026-04-09 — Split monolithic `server/routes.ts` by domain (incremental)

**Context:** `server/routes.ts` had grown large, increasing merge conflict risk and review cost.

**Decision:** Extract cohesive route groups into dedicated modules under **`server/routes/`**, registered from **`registerRoutes`**, starting with **webhooks** and **maintenance**, then **compliance**, **reports + ops-health**, and **inventory bulk** (update/archive/delete/undo). Shared Express middleware lives in **`server/route-middleware.ts`**; inventory list/export site resolution in **`server/inventory-list-context.ts`**; string/token helpers in **`server/inventory-bulk-undo-helpers.ts`** and DB restore in **`server/inventory-bulk-undo.ts`** so single-item delete, bulk delete, and history revert share one implementation. No intentional HTTP or auth behavior changes.

**Alternatives considered:** Single large file with region comments only; one mega-refactor PR.

**Why not the others:** Physical modules enforce boundaries and keep diffs reviewable; incremental extraction avoids a risky big-bang change.

---

## 2026-04-09 — `server/routes.ts` thin registry (slices 3–6)

**Context:** After the first extractions, **`server/routes.ts`** was still ~2000 lines (auth, notes, companies, uploads, inventory export/import, CRUD).

**Decision:** Complete the split: dedicated **`server/routes/*`** modules for auth/users/history, shared notes, employee documents, companies, gated uploads + inventory image upload, inventory export/import, and inventory list/CRUD/assign/return/attachments. Centralize upload/multer/HEIC/thumbnail rate-limit configuration in **`server/upload-config.ts`**. Keep **`registerInventoryBulkRoutes`** registered **after** single-item delete and **before** attachment routes + **`registerUploadRoutes`** so Express route order matches the prior monolith.

**Alternatives considered:** Leave ~2k-line **`routes.ts`**; split inventory export vs core across more files in the same change set.

**Why not the others:** Thin registry improves reviewability and conflicts; one export module is acceptable; registration order preserves behavior without a routing framework change.

---

## 2026-04-09 — Shared Zod query param parsing (list limits + ops feed)

**Context:** **`limit`**, **`offset`**, and ops **`severity`** were hand-parsed per route with slightly different defaults and caps (inventory list vs history vs webhooks vs **`/api/ops-health/events`**).

**Decision:** Add **`server/validation/query-params.ts`** with Zod **`preprocess`** steps that mirror the previous coercion semantics (no intentional HTTP behavior change). Wire **`inventory-item-routes`** (list), **`history-routes`**, **`webhook-routes`** (deliveries), and **`reports-ops-routes`** (ops event feed). Keep **`parseSiteIdQuery`** in **`inventory-list-context.ts`** because it depends on **`SITE_SCOPING_ENABLED`**.

**Alternatives considered:** Plain helper functions without Zod; one mega-schema for all endpoints.

**Why not the others:** Zod gives a single place to document bounds and keeps future extensions consistent; separate presets preserve the small behavioral differences (e.g. history falsy **`limit`** vs inventory **`limit != null`**).

---

## 2026-04-09 — Webhook URL policy: IPv6 reserved / documentation literals (best-effort)

**Context:** Literal IPv6 webhook targets were only partially classified (loopback, link-local, ULA, IPv4-mapped). Documentation and other non-global ranges could still be accepted, which is surprising for SSRF-oriented validation.

**Decision:** Extend **`isPrivateOrReservedIpv6String`** in **`server/webhook-url-policy.ts`**: block **RFC 3849** **`2001:db8::/32`** (prefix regex on normalized lowercase host), **RFC 6666** **`100::/64`** (canonical **`0*100::`** leading form), **RFC 3879** deprecated site-local **`fec0::/10`** (first hextet **`0xfec0`–`0xfeff`**), and **`ff00::/8`** multicast (first hextet **`>= 0xff00`**). Document in JSDoc that coverage is **best-effort** (not a full IANA walk); DNS-resolved addresses still pass through the same per-record checks.

**Alternatives considered:** Depend on a full IPv6 parsing library; block only via documentation comment.

**Why not the others:** Zero new dependencies keeps the boundary small; explicit code + tests beats documentation-only for **`2001:db8::`**-style footguns.

---

## 2026-04-09 — Site RBAC: `capsForGlobalRole` unknown global role fail-closed

**Context:** `users.role` is a Postgres `text` column; runtime values can be typos or legacy strings. `capsForGlobalRole` previously treated any value other than `viewer` / `editor` as full site capability union (intended only as a dead branch when TypeScript assumed three roles).

**Decision:** Implement `capsForGlobalRole` in **`shared/site-rbac.ts`**: `viewer` / `editor` / `admin` map to explicit sets; any other string gets **`inventory:read`** only, with a non-production **`console.warn`**. `loadSiteAccess` still returns early for **`admin`**, so the **`admin`** branch is defense-in-depth for call sites and empty-template fallback.

**Alternatives considered:** Empty capability set (deny-all); map unknown to `editor`.

**Why not the others:** Deny-all could lock users out of read paths unexpectedly; mapping unknown to `editor` would widen privilege on typos.

---

## 2026-04-09 — Ops events: redact webhook URLs on delivery failure

**Context:** `job.webhook_delivery_dead` rows stored the full outbound webhook URL in JSON. Editors can read the ops event feed; paths and query strings may carry sensitive tokens or internal routes even though URL userinfo is already forbidden on stored endpoints.

**Decision:** Persist **`webhookTarget: { hostname, port, pathFingerprint }`** instead of **`url`**: **`port`** is **`null`** when the URL uses the default port for **`http`/`https`** (80/443), otherwise the explicit numeric port. **`pathFingerprint`** is the first 16 hex chars of SHA-256(**`pathname + search`**). Implement in **`server/webhook-ops-url.ts`** (`summarizeWebhookTargetForOps`); wire from **`server/webhooks.ts`** for URL-policy failures and exhausted retries. Admins still resolve the real URL via **`endpointId`** → **`webhook_endpoints`**.

**Alternatives considered:** Store full URL only for admins (split insert by role — not applicable server-side); truncate URL string only (still leaks path prefixes).

**Why not the others:** Hostname + optional port preserves operator context without encoding port into a single **`host`** string; hashed path+query fingerprint correlates failures without exposing secrets; **`endpointId`** keeps admin debugging viable.

---

## 2026-04-09 — Webhook target summary: separate hostname and port

**Context:** `summarizeWebhookTargetForOps` initially returned **`host`** (URL **`host`** / `hostname:port`), which cluttered ops dashboards when non-default ports were used and mixed concerns in one string.

**Decision:** Split into **`hostname`** and **`port`** fields. **`port`** is **`null`** for default ports (**`443`** / **`https`**, **`80`** / **`http`**), otherwise an explicit number.

**Alternatives considered:** Keep **`host`** and add **`hostname`**/**`port`** (redundant); migrate existing **`ops_events`** rows to the new shape (unnecessary — old rows may keep the prior JSON shape).

**Why not the others:** A clean payload is simpler; ops queries can handle mixed historical formats by field presence (**`host`** vs **`hostname`**).

**Breaking change:** Dashboards or queries reading **`webhookTarget.host`** must use **`webhookTarget.hostname`** and **`webhookTarget.port`**.

---

## 2026-04-09 — Strict `siteId` query validation when site scoping is enabled

**Context:** **`parseSiteIdQuery`** used **`parseInt`**, so invalid values (e.g. **`abc`**, **`0`**) became **`undefined`** and behaved like “no site filter,” which could widen list/report reads unexpectedly when a client typo sent garbage.

**Decision:** When **`SITE_SCOPING_ENABLED`**, if **`siteId`** appears in the query (non-empty after trim), require decimal digits only, **`Number.isSafeInteger`**, and **`> 0`**. Otherwise **`400`** with **`{ message, code: "invalid_site_id" }`**. Omitted / empty **`siteId`** remains “no filter” for the query. When scoping is off, the parameter is still ignored (unchanged). Implemented via **`SiteIdQueryResult`** and **`requireInventoryListContext`** in **`server/inventory-list-context.ts`**.

**Alternatives considered:** Continue coercing invalid values to **`undefined`**; reject only some shapes.

**Why not the others:** Explicit **`400`** makes client bugs visible; strict digit-only parsing avoids **`parseInt`** prefix surprises (**`12abc`**).

---

<!-- Add new decisions above this line -->

