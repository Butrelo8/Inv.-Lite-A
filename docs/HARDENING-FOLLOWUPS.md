# Hardening & follow-ups (post–code review)

Engineering backlog captured from internal code review (2026-04). Completed items are recorded in `**TODOS.md**` (Completed section) and here as **Shipped** notes. This file is the narrative: *why*, *where in code*, and *what “done” looks like*.

**Status (2026-04-09):** §1–§8 **shipped** (includes `**server/validation/query-params.ts`** for shared list/pagination-style query parsing on inventory list, history, webhook deliveries, ops event feed).

---

## 1. Webhook outbound URLs (SSRF / trust boundary)

**Risk:** Admins can register any URL that passes `**z.string().url()`** on input and then `**validateWebhookOutboundUrl()`** / `**resolveWebhookOutboundConnect()`** in `**server/webhook-url-policy.ts**`. The app server opens an outbound HTTP(S) connection to that target and posts the signed payload (endpoint secret), which can still reach cloud metadata IPs, internal services, or other tenants’ infrastructure if the network allows it. Delivery does **not** use a bare `**fetch(storedUrl)`**: it resolves a pinned `**connectAddress`** (fresh DNS for hostnames) and sends via Node `**http`/`https.request**`, with `**Host**` and TLS **SNI** derived from the original URL — reducing DNS rebinding between “allowed at validation” and “socket connect” to a narrow residual window.

**Code:** Webhook CRUD: `**server/routes/webhook-routes.ts`** (`POST` / `PATCH` / `DELETE` `/api/webhooks`). Delivery: `**server/webhooks.ts`** → `**resolveWebhookOutboundConnect`** (`**server/webhook-url-policy.ts**`) → `**webhookHttpDelivery.send**` (`**server/webhook-delivery-http.ts**`).

**Shipped (2026-04-09):** `server/webhook-url-policy.ts` — `validateWebhookOutboundUrl()` enforces `http`/`https` only, no URL credentials, blocks literal private/reserved IPv4/IPv6 and obvious metadata hostnames, and (unless `**WEBHOOK_ALLOW_PRIVATE_TARGETS`**) requires DNS resolution where every A/AAAA address is public. Applied on create/update and again at delivery; policy violations mark outbox rows `dead` and emit `job.webhook_delivery_dead` with `reason: url_policy`. Tests: `server/tests/webhook-url-policy.test.ts`. LAN-only webhooks: set `**WEBHOOK_ALLOW_PRIVATE_TARGETS=true`** (documented in `**.env.example**`).

**Trust model:** Webhook CRUD remains **admin-only**; operators should still treat endpoint URLs as powerful.

**Operator note (HTTPS + literal IP):** If the stored URL is `**https://<ip>/...`** (IPv4 or IPv6 in the host), delivery connects to that address and sets TLS **SNI** (`servername` in Node) to the **same IP string** — see `**resolveWebhookOutboundConnect`** (`tlsServerName: hostname`) in `**server/webhook-url-policy.ts`** and `**webhook-delivery-http.ts`**. Many HTTPS servers expect SNI (and the presented certificate) to match a **DNS name**, so handshakes or certificate verification can fail even when the IP is reachable. Prefer `**https://hostname/...`** for TLS webhooks unless the receiver explicitly supports IP-based TLS.

---

## 2. Webhook outbox stuck in `processing`

**Risk:** `processWebhooks()` bulk-marks rows `processing`, then delivers sequentially. A crash or kill mid-batch leaves rows neither `pending` nor terminal; they may never retry.

**Code:** `server/webhooks.ts`.

**Shipped (2026-04-09):** Column `**processing_claimed_at`** on `**webhook_outbox`** (`migrations/add-webhook-outbox-processing-claimed-at.sql`, `**npm run db:migrate:webhook-outbox-claim`**). Each poll: reclaim rows in `**processing**` whose claim is older than **5 minutes** back to `**pending`**; claim up to 20 rows atomically with `**FOR UPDATE SKIP LOCKED`** (multi-instance safe). Clear `**processing_claimed_at**` on `**completed**`, `**dead**`, and retry `**pending**`. Tests: `**server/tests/webhooks.test.ts**`.

---

## 3. Site RBAC: template `capabilities` JSON

**Risk:** Malformed or typo’d capability strings in `role_templates.capabilities` can yield an **empty** effective capability set (user locked out) or unexpected unions.

**Code:** `server/site-rbac-access.ts`, `shared/site-rbac.ts` (`parseSiteCapabilityStringsFromJsonb`, `SITE_KNOWN_CAPABILITY_SET`).

**Shipped (2026-04-09):** Only known capability strings apply; if explicit grants would normalize to an empty set, fall back to global role caps; non-production warning. Tests: `server/tests/site-rbac.test.ts`, `server/tests/site-rbac-capabilities.test.ts`.

---

## 4. `GET /api/sites` behavior (legacy vs grants)

**Intent:** With site RBAC enforcing, users **with** explicit `user_site_roles` rows see only granted sites; users **with zero** grant rows keep legacy behavior (all non-archived sites). This matches `DECISIONS.md` (2026-04-08).

**Code:** `server/routes.ts` (`/api/sites`).

**Shipped (2026-04-09):** Inline comment on the handler documents the contract.

---

## 5. Executive summary report

**Roles:** `load-executive-summary.ts` used `options.role !== "viewer"` for ops (`getOpsSummary`). If the DB ever stored an unexpected role string, ops could leak.

**PDF:** `GET /api/reports/executive-summary/pdf` piped `PDFDocument` to the response; a throw mid-stream could yield a bad client experience.

**Shipped (2026-04-09):** Ops only for `editor` and `admin`; PDF buffered then sent with `try/catch` and `500` JSON on failure. Tests: `server/tests/executive-summary.test.ts`.

---

## 6. Webhook deliveries API (`GET /api/webhooks/deliveries`)

**Note:** Editors and admins received recent outbox rows including **payload** bodies—useful for integration debugging, broader than some teams want.

**Code:** `server/routes.ts`, `server/webhook-deliveries.ts`.

**Shipped (2026-04-09):** `editor` gets `payload: null` and `payloadRedacted: true`; `admin` keeps full payload. Tests: `server/tests/webhook-deliveries-redaction.test.ts`.

---

## 7. Maintainability: `server/routes.ts` size

The file had grown very large (inventory, compliance, webhooks, maintenance, reports, etc.). Splitting by domain reduces merge conflicts and review load.

**Shipped (2026-04-09):** Domain modules under `**server/routes/`** (webhooks, maintenance, compliance, reports+ops, inventory bulk, auth, users, history, shared notes, employee docs, companies, uploads, inventory export, inventory item CRUD/list/assign/attachments) plus `**server/upload-config.ts`**, `**server/route-middleware.ts`**, `**server/inventory-list-context.ts**`, bulk-undo helpers. Main `**server/routes.ts**` is a thin dispatcher (CSRF, `**/api/inventory/filters**`, `**/api/sites**`, `register*` calls, opt-in seed). No intentional HTTP behavior change.

---

## 8. Nice to have: shared Zod for query params

Repeated parsing for `siteId`, limits, etc. could move next to `shared/routes.ts` patterns for consistency and fewer divergent bounds.

**Shipped (2026-04-09):** `**server/validation/query-params.ts`** — `**parseInventoryListPagination`**, `**parseHistoryPagination`**, `**parseWebhookDeliveriesLimit**`, `**parseOpsHealthEventsQuery**` (severity aligned with `**OPS_EVENT_SEVERITIES**` in `**shared/ops-health.ts**`). `**siteId**` for inventory list / reports remains `**parseSiteIdQuery**` in `**inventory-list-context.ts**` (scoping flags). Tests: `**server/tests/query-params.test.ts**`.