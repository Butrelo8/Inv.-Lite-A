# CLAUDE.md — Inventario Lite A

Operational contract for Claude (and any AI agent) working inside this repository. Read this before editing code. This file encodes how the codebase *actually* works, not how a generic Node/React app would work.

---

## 1. Product posture (non-negotiable)

- **LAN-first / small trusted team.** No LLM/AI calls integrated. Do not add OpenAI/Anthropic/Google AI clients; the `script/build.ts` allowlist referencing `@google/generative-ai`, `openai`, etc. is **dead code** (see `architecture.md`).
- **Privacy boundary at the filesystem URL layer.** Uploaded files are **never** served as public static assets. Every `/uploads/*` route is auth-gated (see `DECISIONS.md` 2026-03-18). Do not add `express.static("uploads")`.
- **Audit integrity is a product promise.** Every create/update/delete/import of inventory items writes an `inventory_history` row with the acting `user_id`. Do not add code paths that mutate `inventory_items` without also logging history. Silent `catch(() => {})` on audit/history side effects is forbidden (see `DECISIONS.md` 2026-03-18).
- **Spanish is the product language.** User-facing strings are in Spanish (`"Sin asignar"`, `"Sesión expirada"`, condition labels `Nuevo/Bueno/…`). Keep new UI copy in Spanish; translation layer lives in `client/src/lib/category-translate.ts`.

---

## 2. Tech stack (verified from `package.json`)

| Layer | Tech |
|---|---|
| Runtime | Node 20 (see `Dockerfile`), ESM (`"type": "module"`) |
| Language | TypeScript 5.6 (strict) |
| Server | Express 5, Passport local + `express-session`, `bcryptjs` |
| DB | PostgreSQL 16 (Docker `postgres:16-alpine`), Drizzle ORM 0.39 + `drizzle-zod`, `pg` driver |
| Client | React 18, Vite 7, Wouter, TanStack Query 5, React Hook Form + Zod, Radix UI + shadcn/ui, Tailwind 3, `next-themes` |
| Files | `multer` (disk), `sharp` (thumbs), `heic-convert`, `exceljs`, `pdfkit`, `papaparse`, `qrcode` |
| Docs | `handlebars`, `html-to-docx`, `puppeteer` (PDF), custom DOCX manipulation via `jszip` (`server/doc-gen/responsiva/*`) |
| Build | `tsx` (dev/tests), `esbuild` (server → `dist/index.cjs` CJS), `vite build` (client → `dist/public`) |
| Tests | `node:test` via `tsx --test server/tests/*.test.ts` |

**Do not introduce** any of: a different framework (Next/Nest/Fastify/Hono), a different ORM (Prisma/TypeORM), a new router (React Router), a new state lib (Redux/Zustand), a new component lib, or an LLM SDK. If you think you need one, stop and ask.

---

## 3. Repository layout

```
client/                 # React app (Vite root)
  src/
    App.tsx             # Wouter Switch with role-based redirects
    pages/              # Page-level components (one per route)
    components/         # Feature + shadcn/ui primitives (ui/)
    hooks/              # use-auth, use-toast, etc.
    lib/                # queryClient, download-responsiva, category-translate
server/
  index.ts              # Express bootstrap, session, graceful shutdown
  auth.ts               # Passport local, session store, 5h inactivity timeout
  routes.ts             # Thin registry: CSRF mitigation + register*Routes()
  routes/               # Domain route modules (see §5)
  doc-gen/              # Templates, rendering, PDF, DOCX, responsiva
    responsiva/         # Custom DOCX manipulation (jszip + XML)
  validation/           # Shared Zod query param parsers
  tests/                # node:test suites (*.test.ts)
  storage.ts            # DatabaseStorage — Drizzle queries + history helpers
  webhooks.ts           # Outbox delivery worker (DNS-pinned, SSRF-safe)
  webhook-url-policy.ts # Scheme + IPv4/IPv6 literal + DNS resolution checks
  site-rbac-access.ts   # Per-request access loader (capabilities + sites)
  upload-config.ts      # multer + HEIC normalization + thumb rate limit
  ops-events.ts         # Observability writer (ops_events table)
  inventory-list-context.ts  # siteId query parsing + list guards
shared/
  schema.ts             # Drizzle tables + drizzle-zod insert schemas
  site-rbac.ts          # Capabilities enum + templates + capsForGlobalRole
  auth-role.ts          # normalizeUserRoleFromApi (fail-closed viewer)
  routes.ts             # Shared zod schemas (client + server)
migrations/             # Hand-written additive SQL (not drizzle-kit output)
script/                 # tsx CLI scripts (build, migrations, backup, seed)
docs/                   # HARDENING-FOLLOWUPS, LAN-SECURITY-RUNBOOK, BACKUP-RESTORE
```

Path aliases (`tsconfig.json` + `vite.config.ts`):
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*` (Vite only)

Server code **must not** import from `@/*` (client alias is Vite-only). Shared code goes in `shared/`.

---

## 4. Coding conventions (inferred from the codebase, not imposed)

### 4.1 TypeScript

- **Strict mode is on.** `tsc` via `npm run check` must stay green.
- **ESM everywhere.** Project uses `allowImportingTsExtensions`; do not add `.js` extensions to TS imports.
- Prefer `unknown` + narrowing over `any`. Existing `(req as any).user?.id` is legacy; new code should use `getAuthUser(req)` from `server/auth-user.ts` (see `TODOS.md`).
- Drizzle inferred types are the source of truth: `type User = typeof users.$inferSelect`. Do not hand-maintain parallel DTO types unless redacting a field (see `WebhookEndpointPublic` in `server/webhook-endpoint-public.ts`).

### 4.2 Server routes

- One domain per file under `server/routes/*.ts`, exported as `register<Domain>Routes(app)`.
- Always gate with `requireAuth` (from `server/route-middleware.ts`). For role gates use `requireRole("editor", "admin")`.
- For inventory-list endpoints, resolve site context via `requireInventoryListContext(req, res, parseSiteIdQuery(req))` — it returns `null` after sending the response on invalid input; early-return without re-replying.
- For any `POST/PUT/PATCH/DELETE` on `/api`, the global CSRF middleware in `server/routes.ts` is already applied. Do not add per-route CSRF checks.
- When inventory state changes, you **must** write an `inventory_history` row in the same logical unit. Bulk flows should use `server/inventory-bulk-undo.ts` helpers.
- Use `emitOpsEvent({ eventType, severity, … })` for security/integrity signals (`auth.csrf_blocked`, `auth.forbidden`, `job.webhook_delivery_dead`, slow/error requests). Severity is one of `info | warning | critical`.

### 4.3 Validation

- **Input at system boundary goes through Zod.** Shared schemas in `shared/schema.ts` via `createInsertSchema(...)`; query-param Zod parsers in `server/validation/query-params.ts`.
- `siteId` path/query numeric validation uses `parsePositiveIntPathParam` — do **not** `parseInt`; strict digits-only avoids `"12abc"` coercion surprises (`DECISIONS.md` 2026-04-09).

### 4.4 Database

- All queries go through `server/storage.ts` (`DatabaseStorage` singleton exported as `storage`). Raw `pool` usage is limited to transaction boundaries (delete+undo, bulk flows).
- Migrations are **additive SQL in `migrations/`** plus matching `tsx` runners in `script/migrate-*.ts`. `drizzle-kit push` is an operator convenience for dev, not the source of truth. Three bootstrap tables (`user_sessions`, `login_rate_limits`, `ops_events`) are created by app startup SQL, *not* in `shared/schema.ts` — see `STATE.md` blocker. Do not run `db:push` without reading the prompts; it may propose dropping these.
- LIKE patterns built from user input must escape `%` and `_` (open `TODOS.md` P1 item). New search code should use an escape helper rather than raw `%${term}%`.

### 4.5 Client

- Pages live in `client/src/pages/*.tsx`; routing is Wouter `Switch`/`Route` in `App.tsx`. Role-based redirects happen **in** `App.tsx` (see viewer blocks on `/employees`, `/history`, `/ops-health`, `/companies`, admin-only `/users`).
- Data fetching is **TanStack Query**. `queryClient` defaults: `staleTime: Infinity`, `refetchOnWindowFocus: false`, `retry: false`, `refetchInterval: false`. If your feature needs live data, opt in per-query; do not change the global defaults.
- Mutations use `apiRequest(method, url, data)` from `client/src/lib/queryClient.ts`. It sets `credentials: "include"` — do not replicate this with bare `fetch`.
- 401 `{ message: "Sesión expirada" }` is globally intercepted → clears the cache and redirects to `/login?expired=1`. Do not handle this 401 shape in individual components.
- Forms use React Hook Form + `zodResolver` from `@hookform/resolvers/zod` against the shared insert schemas.
- UI primitives come from `client/src/components/ui/*` (shadcn/ui over Radix). Styling is Tailwind utility classes + CSS variables defined in `client/src/index.css`; theme toggle via `next-themes`.

### 4.6 Naming

- Files: kebab-case for server (`inventory-list-context.ts`), PascalCase for React components (`Dashboard.tsx`, `ItemViewDialog.tsx`), kebab-case for hooks (`use-auth.ts`).
- DB columns: `snake_case`; Drizzle field keys: `camelCase`. The mapping is explicit in `shared/schema.ts` (`text("password_hash")` → `passwordHash`).
- API paths: `/api/<resource>` plural nouns, REST verbs. Bulk ops under `/api/inventory/bulk/*`. Responsiva under `/api/inventory/:id/responsiva`.

### 4.7 Errors

- Server routes return JSON `{ message: "..." }` on error, with optional `code` string for machine-readable cases (`code: "invalid_site_id"`). Status codes: 400 bad input, 401 unauth, 403 forbidden, 404 not found, 409 conflict, 500 on server failure.
- Do not leak raw error messages or stack traces in JSON responses. Log via `console.error` and `emitOpsEvent` for operator visibility.

---

## 5. Route registration order (fragile; do not reorder blindly)

In `server/routes.ts` → `registerRoutes`:

1. CSRF middleware (`app.use("/api", …)`)
2. `registerAuthRoutes` / `registerUserRoutes` / `registerHistoryRoutes`
3. Inline `GET /api/inventory/filters` and `GET /api/sites` (site-grant aware)
4. `registerSharedNotesRoutes` → `registerComplianceRoutes` → `registerEmployeeDocsRoutes` → `registerCompanyRoutes`
5. **Inventory order matters:** `registerInventoryListRoute` → `registerInventoryExportRoutes` → `registerInventoryItemCrudRoutes` → `registerInventoryBulkRoutes` → `registerInventoryAttachmentRoutes` → `registerUploadRoutes`. `inventoryBulkRoutes` **must** register after single-item CRUD and before attachments so `/api/inventory/bulk/*` wins over `/api/inventory/:id/*` (see `DECISIONS.md` 2026-04-09).
6. `registerReportsOpsRoutes` → `registerWebhookRoutes` → `registerMaintenanceRoutes` → `registerDocGenRoutes` (async).

---

## 6. Feature flags

Read via `server/site-config.ts`:

- `SITE_SCOPING_ENABLED` — when off, all writes use default site; list APIs ignore `siteId` param.
- `SITE_RBAC_ENABLED` — only meaningful when `SITE_SCOPING_ENABLED` is also on. Non-admin users with grants get per-site capability checks. Users with zero grant rows keep legacy global-role access (backward-compat escape hatch).
- `WEBHOOK_ALLOW_PRIVATE_TARGETS` — defaults false; when false, outbound webhooks are rejected if DNS resolves to private/reserved IP (SSRF mitigation).

When adding a new capability-gated feature, use `can(access, SITE_CAPABILITIES.X)` and `itemSiteAllowed(access, item.siteId)` from `server/site-rbac-access.ts`.

---

## 7. Tests

- Run: `npm test` (`tsx --test server/tests/*.test.ts server/*.test.ts`).
- Framework: `node:test` — **no Jest, no Vitest.** Use `describe`, `test`, `t.after` for teardown.
- Integration tests share the app's `DATABASE_URL`; when unset they default to `postgresql://inventario:inventario@127.0.0.1/inventario` (Docker compose default).
- Single `t.after` per suite with ordered teardown (httpServer.close → DB cleanup → `pool.end()`) — multiple hooks run in reverse order (`STATE.md` 2026-04-09).
- Responsiva tests cover: DOCX XML replacement, rels/Content-Types XML, image embedding, photo table layout, Spanish date formatting, route auth, service unit (`server/tests/responsiva-*.test.ts`).

Required coverage: new routes need happy-path + 401/403 + invalid-input tests. Storage helpers need parity tests when behavior changes.

---

## 8. Build & deploy

- `npm run build`: runs `vite build` then `esbuild` for server. Output: `dist/public/` (static) + `dist/index.cjs`.
- The `esbuild` allowlist in `script/build.ts` is a **hard edit risk**: it enumerates which deps to bundle into the CJS output. Packages **not** on the list are `external` and must exist in `node_modules/` at runtime. The Dockerfile runs `npm install --omit=dev` in the runtime stage so prod deps are still installed.
- `dist/index.cjs` is **CommonJS**; all server files are ESM in source but bundled to CJS for cold-start speed. Dynamic `await import(...)` (used for Vite in dev) must stay behind `NODE_ENV === "development"` gates so esbuild doesn't try to resolve dev-only deps.
- **Docker compose:** binds `127.0.0.1:5000` on host, `0.0.0.0:5000` inside container. Requires `SESSION_SECRET` env. Mounts `client/src/templates` read-only into `/app/src/templates` so the responsiva template is present without rebuilding.

---

## 9. What to do / what not to do

### Do

- Read `DECISIONS.md` before touching auth, webhooks, site RBAC, or privacy boundaries. Add a new entry when making a call that isn't obvious from the code.
- Append to `STATE.md` ("Accumulated Decisions" and "Session Notes") at end of session.
- Update `FEATURES.md` and `CHANGELOG.md` when shipping new user-visible behavior.
- Keep commits scoped (`feat:`, `fix:`, `refactor:`, `docs:`).
- Run `npm run check` (tsc) and `npm test` before declaring work done.

### Don't

- Don't widen the privacy boundary (no public `/uploads`, no bypassing `requireAuth` "just for this one thing").
- Don't add an LLM/AI dependency. The project explicitly does not integrate AI.
- Don't add `dangerouslySetInnerHTML` without a sanitizer.
- Don't use `parseInt` on user-supplied numeric input; use `parsePositiveIntPathParam` or the zod preprocess in `server/validation/query-params.ts`.
- Don't store secrets in source. `SESSION_SECRET` validation refuses placeholder values in production (`server/auth.ts`).
- Don't run `npm run db:push` in production without reading the diff — it can propose dropping bootstrap tables.
- Don't call `fetch(url)` for outbound webhook delivery; use `webhookHttpDelivery.send` which pins DNS + sets SNI to mitigate TOCTOU (`DECISIONS.md` 2026-04-10).

---

## 10. Pointers

- Feature catalog: `FEATURES.md`
- Decisions with rationale: `DECISIONS.md`
- Current blockers + session handoff: `STATE.md`
- Open work (priority P0–P4): `TODOS.md`
- Architecture deep-dive: `architecture.md`
- Deployment + post-deploy verification: `DEPLOY.md`
- Backup/restore runbook: `docs/BACKUP-RESTORE.md`
- LAN security runbook: `docs/LAN-SECURITY-RUNBOOK.md`
- Hardening backlog: `docs/HARDENING-FOLLOWUPS.md`
- Agent catalog: `agents.md`
