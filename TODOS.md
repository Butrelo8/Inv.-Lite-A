# TODOS

Track open work and completed items by version. See `CHANGELOG.md` for full release notes.

---
## Open
---
### Add "trusted enclosure" network exposure runbook (LAN-only verification)
:**What:** Document a repeatable checklist to verify the app is reachable only from your intended local network / trusted devices (and not from the public internet), including port `5000` exposure, router/firewall forwarding, and any tunnel usage (e.g. Tailscale Funnel) limited to trusted identities.
:**Why:** Your vision assumes a local enclosure with trusted people; without a network exposure check, â€œLAN-onlyâ€ can silently drift into â€œinternet-exposedâ€.
:**Context:** The server binds to port `5000` (see `server/index.ts`) and the risk is primarily at the network boundary, not only at auth/role checks.
:**Effort:** S
:**Priority:** P0
:**Depends on:** Confirming how you typically run the server (plain node vs docker vs reverse proxy) and whether any tunneling is allowed.

---
### Add configurable local bind host (reduce accidental wide-area exposure)
:**What:** Change the default from `host: "0.0.0.0"` to a safer default (e.g. `127.0.0.1` or a configurable `BIND_HOST`/`LOCAL_ONLY`), so the enclosure boundary is enforced by defaultâ€”not by discipline alone.
:**Why:** Even if auth and uploads are correct, wide interface binding increases accidental exposure risk when a router/firewall/tunnel is misconfigured.
:**Context:** `server/index.ts` currently listens on `host: "0.0.0.0"`.
:**Effort:** M
:**Priority:** P0
:**Depends on:** Deciding your preferred local access mode (localhost only vs LAN interface).

---
### Remove sensitive `/api` response-body logging in non-dev deployments
**What:** Disable or strictly redact the `res.json()` body logging wrapper in `server/index.ts` so production logs do not include response JSON payloads (PII and internal notes).
**Why:** Prevents accidental leakage of sensitive fields into logs (especially for inventory `notes`, user identity, and document metadata).
**Context:** `server/index.ts` overrides `res.json` and logs `JSON.stringify(capturedJsonResponse)` for all `/api` responses.
**Effort:** S
**Priority:** P0
**Depends on:** Defining what (if any) response details are safe to log (status-only vs allowlist).

---
### Sandbox PDF preview iframe
**What:** Add a `sandbox` attribute to the PDF `iframe` in `client/src/components/DocumentPreviewModal.tsx` (and keep navigation/download behavior intact).
**Why:** Unsandboxed embedded documents widen the browser security surface if a user can upload or serve a crafted PDF.
**Context:** `DocumentPreviewModal.tsx` renders `iframe` for `application/pdf` without `sandbox`.
**Effort:** S
**Priority:** P1
**Depends on:** None.

---
### Add brute-force / rate limiting to `POST /api/auth/login`
**What:** Introduce rate limiting (and optionally temporary lockout) for `POST /api/auth/login` keyed by IP and username.
**Why:** Repeated password attempts currently have no visible throttling/lockout; improves resilience.
**Context:** `server/routes.ts` handles `/api/auth/login` via `passport.authenticate("local", ...)` without a limiter.
**Effort:** M
**Priority:** P1
**Depends on:** Choosing limiter strategy (in-memory vs shared store) for your deployment mode.

---
### Use a persistent session store in non-dev local deployments
**What:** Replace the `memorystore` session store configured in `server/auth.ts` with a persistent shared store for production (so restarts/multi-instances behave correctly).
**Why:** In-memory sessions break consistency in multi-instance deployments and weaken operational guarantees.
**Context:** `server/auth.ts` uses `MemoryStore(session)` for sessions.
**Effort:** M
**Priority:** P1
**Depends on:** Deciding which shared store to use (you already have `connect-pg-simple` as a dependency).

---
### Ensure correct client IP for thumbnail rate limiting behind proxies
**What:** Configure Express `trust proxy` and ensure thumbnail throttling in `server/routes.ts` uses the real client IP (not the proxy address) for `thumbRateByIp`.
**Why:** Incorrect IP detection can render rate limiting ineffective or overly aggressive.
**Context:** `server/routes.ts` keys thumbnail rate limits by `req.ip`. No visible proxy/IP configuration is enforced in the server entry.
**Effort:** M
**Priority:** P1
**Depends on:** Your reverse proxy / load balancer setup and headers usage (`X-Forwarded-For`).

---
### Enforce length limits for shared-notes title/content
**What:** Add explicit max length validation for shared notes `title` and `content` in `server/routes.ts` (reject excessively large payloads).
**Why:** Prevents unbounded storage/memory usage and improves predictability; reduces DoS risk from large request bodies.
**Context:** Shared notes currently only `trim()` and checks non-empty; no max lengths are enforced.
**Effort:** S
**Priority:** P2
**Depends on:** Choosing acceptable max lengths for your product requirements.

---
### Add/confirm CSV import hard limits (row count + parsing cost)
**What:** Add max row-count (and ideally per-row limits) for `/api/inventory/import`, or change to a streaming parser if needed.
**Why:** CSV parsing can be CPU/memory heavy; file-size alone is not always enough.
**Context:** `server/routes.ts` reads/parses the CSV upload; only file-size cap is clearly present.
**Effort:** M
**Priority:** P2
**Depends on:** Expected CSV sizes in the real workflow.

---
### Wire server tests into `npm run test` and CI
**What:** Add a `test` script that runs `node --test` (or `tsx --test` as appropriate) across `server/tests`, and add CI so regressions are caught automatically.
**Why:** You have meaningful tests already, but they may not be executed reliably during development/CI.
**Context:** `server/tests/*.test.ts` exists, but `package.json` has no `test` script and `tsconfig.json` excludes `**/*.test.ts`.
**Effort:** M
**Priority:** P2
**Depends on:** Deciding your CI runner (GitHub Actions/etc) and how to provision Postgres for tests.

---
### Reduce brittleness of global frontend 401 fetch interception
**What:** Replace the `window.fetch` monkey-patch approach in `client/src/App.tsx` with a centralized API client (or React Query `onError` strategy) that handles auth expiry cleanly.
**Why:** Global interception is brittle and can break if other code wraps fetch; a centralized approach is safer.
**Context:** `client/src/App.tsx` wraps `window.fetch` and redirects on 401 + `message === "SesiÃ³n expirada"`.
**Effort:** M
**Priority:** P2
**Depends on:** Confirming how `apiRequest`/React Query are used across the client.

---
## Completed
---
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






