# DECISIONS

Architectural decisions and their rationale.

Updated when decisions are made.

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

<!-- Add new decisions above this line -->

