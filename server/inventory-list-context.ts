import type { Request, Response } from "express";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { isSiteScopingEnabled } from "./site-config";
import {
  can,
  forbidSiteRbac,
  getSiteAccess,
  resolveInventoryListFilters,
} from "./site-rbac-access";

/** Stable client-facing validation errors for malformed `siteId` (when site scoping is on). */
export const INVALID_SITE_ID_QUERY_MESSAGE =
  "Invalid siteId query parameter; expected a positive integer.";
export const INVALID_SITE_ID_QUERY_CODE = "invalid_site_id";

export type SiteIdQueryResult =
  | { ok: true; siteId: number | undefined }
  | { ok: false };

function normalizeSiteIdQueryRaw(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first == null || first === "") return undefined;
    const t = String(first).trim();
    return t === "" ? undefined : t;
  }
  const s = String(raw).trim();
  return s === "" ? undefined : s;
}

/**
 * When **`SITE_SCOPING_ENABLED`**, optional **`siteId`** must be a positive integer string if present.
 * Absent / empty → **`{ ok: true, siteId: undefined }`**. Malformed → **`{ ok: false }`** (caller should **`400`**).
 */
export function parseSiteIdQuery(req: Request): SiteIdQueryResult {
  if (!isSiteScopingEnabled()) {
    return { ok: true, siteId: undefined };
  }
  const trimmed = normalizeSiteIdQueryRaw(req.query.siteId);
  if (trimmed === undefined) {
    return { ok: true, siteId: undefined };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return { ok: false };
  }
  return { ok: true, siteId: n };
}

/** List/export/filter site context; **`400`** on invalid **`siteId`**; **`403`** on RBAC → **`null`**. */
export async function requireInventoryListContext(req: Request, res: Response, siteQuery: SiteIdQueryResult) {
  if (!siteQuery.ok) {
    res.status(400).json({
      message: INVALID_SITE_ID_QUERY_MESSAGE,
      code: INVALID_SITE_ID_QUERY_CODE,
    });
    return null;
  }
  const querySiteId = siteQuery.siteId;
  const access = await getSiteAccess(req);
  if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
    forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
    return null;
  }
  const r = resolveInventoryListFilters(access, querySiteId);
  if (!r.ok) {
    forbidSiteRbac(req, res, { reason: "site_not_allowed", siteId: querySiteId });
    return null;
  }
  return { access, siteId: r.siteId, restrictToSiteIds: r.restrictToSiteIds };
}

