import type { Request, Response } from "express";
import { db } from "./db";
import { roleTemplates, sites, userSiteRoles } from "@shared/schema";
import type { UserRole } from "@shared/schema";
import {
  ALL_SITE_CAPABILITIES,
  SITE_KNOWN_CAPABILITY_SET,
  capsForGlobalRole,
  parseSiteCapabilityStringsFromJsonb,
  type SiteCapability,
} from "@shared/site-rbac";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isSiteRbacEnabled, isSiteScopingEnabled } from "./site-config";
import { emitOpsEvent } from "./ops-events";

export type SiteAccessGrant = {
  siteId: number;
  siteName: string;
  templateId: number;
  templateKey: string;
  templateDisplayName: string;
};

export type SiteAccess = {
  /** True when SITE_SCOPING_ENABLED && SITE_RBAC_ENABLED */
  enforcing: boolean;
  /** Global admin: all sites, all capabilities */
  adminBypass: boolean;
  /** When set, inventory queries add site_id IN (...). Undefined = no extra site filter. */
  restrictToSiteIds: number[] | undefined;
  /** True when user has at least one user_site_roles row (restrictToSiteIds is then non-undefined). */
  hasExplicitSiteGrants: boolean;
  capabilities: Set<string>;
  /** Sites the user may select / see (for /api/sites and auth/me). */
  visibleSites: { id: number; name: string }[];
  grants: SiteAccessGrant[];
};

function inactiveAccess(): SiteAccess {
  return {
    enforcing: false,
    adminBypass: false,
    restrictToSiteIds: undefined,
    hasExplicitSiteGrants: false,
    capabilities: new Set(),
    visibleSites: [],
    grants: [],
  };
}

export async function loadSiteAccess(userId: number, role: UserRole): Promise<SiteAccess> {
  if (!isSiteScopingEnabled() || !isSiteRbacEnabled()) {
    return inactiveAccess();
  }

  if (role === "admin") {
    const allSites = await db
      .select({ id: sites.id, name: sites.name })
      .from(sites)
      .where(isNull(sites.archivedAt))
      .orderBy(sites.name);
    return {
      enforcing: true,
      adminBypass: true,
      restrictToSiteIds: undefined,
      hasExplicitSiteGrants: false,
      capabilities: new Set(ALL_SITE_CAPABILITIES as unknown as string[]),
      visibleSites: allSites,
      grants: [],
    };
  }

  const grantRows = await db
    .select({
      siteId: userSiteRoles.siteId,
      templateId: userSiteRoles.templateId,
      siteName: sites.name,
      templateKey: roleTemplates.key,
      templateDisplayName: roleTemplates.displayName,
      caps: roleTemplates.capabilities,
    })
    .from(userSiteRoles)
    .innerJoin(sites, eq(userSiteRoles.siteId, sites.id))
    .innerJoin(roleTemplates, eq(userSiteRoles.templateId, roleTemplates.id))
    .where(and(eq(userSiteRoles.userId, userId), isNull(sites.archivedAt)));

  if (grantRows.length === 0) {
    const allSites = await db
      .select({ id: sites.id, name: sites.name })
      .from(sites)
      .where(isNull(sites.archivedAt))
      .orderBy(sites.name);
    return {
      enforcing: true,
      adminBypass: false,
      restrictToSiteIds: undefined,
      hasExplicitSiteGrants: false,
      capabilities: capsForGlobalRole(role),
      visibleSites: allSites,
      grants: [],
    };
  }

  const restrictToSiteIds = Array.from(new Set(grantRows.map((r) => r.siteId)));
  const capabilities = new Set<string>();
  const unknownSamples = new Set<string>();
  let hadAnyRawCapabilityStrings = false;
  for (const r of grantRows) {
    const raw = parseSiteCapabilityStringsFromJsonb(r.caps);
    if (raw.length > 0) hadAnyRawCapabilityStrings = true;
    for (const c of raw) {
      if (SITE_KNOWN_CAPABILITY_SET.has(c)) {
        capabilities.add(c);
      } else if (unknownSamples.size < 12) {
        unknownSamples.add(c);
      }
    }
  }
  if (capabilities.size === 0 && grantRows.length > 0) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[site-rbac] role_templates.capabilities produced no known keys for a user with site grants; falling back to global role caps",
        {
          userId,
          unknownSamples: Array.from(unknownSamples),
          hadAnyRawCapabilityStrings,
        },
      );
    }
    for (const c of Array.from(capsForGlobalRole(role))) {
      capabilities.add(c);
    }
  }

  const visibleSites = grantRows
    .reduce<{ id: number; name: string }[]>((acc, r) => {
      if (!acc.some((x) => x.id === r.siteId)) acc.push({ id: r.siteId, name: r.siteName });
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));

  const grants: SiteAccessGrant[] = grantRows.map((r) => ({
    siteId: r.siteId,
    siteName: r.siteName,
    templateId: r.templateId,
    templateKey: r.templateKey,
    templateDisplayName: r.templateDisplayName,
  }));

  return {
    enforcing: true,
    adminBypass: false,
    restrictToSiteIds,
    hasExplicitSiteGrants: true,
    capabilities,
    visibleSites,
    grants,
  };
}

const accessCache = new WeakMap<Request, Promise<SiteAccess>>();

export function getSiteAccess(req: Request): Promise<SiteAccess> {
  let p = accessCache.get(req);
  if (!p) {
    const u = req.user as Express.User | undefined;
    p = u ? loadSiteAccess(u.id, (u.role ?? "viewer") as UserRole) : Promise.resolve(inactiveAccess());
    accessCache.set(req, p);
  }
  return p;
}

export function can(access: SiteAccess, capability: SiteCapability | string): boolean {
  if (!access.enforcing) return true;
  if (access.adminBypass) return true;
  return access.capabilities.has(capability);
}

export function itemSiteAllowed(access: SiteAccess, itemSiteId: number): boolean {
  if (!access.enforcing) return true;
  if (access.adminBypass) return true;
  if (access.restrictToSiteIds == null) return true;
  return access.restrictToSiteIds.includes(itemSiteId);
}

export type ListSiteFilterResult =
  | { ok: true; siteId?: number; restrictToSiteIds?: number[] }
  | { ok: false };

/** Merge optional query siteId with RBAC restriction; fail if query asks for a forbidden site. */
export function resolveInventoryListFilters(access: SiteAccess, querySiteId: number | undefined): ListSiteFilterResult {
  if (!access.enforcing) {
    return { ok: true, siteId: querySiteId };
  }
  if (access.adminBypass) {
    return { ok: true, siteId: querySiteId };
  }
  const restrict = access.restrictToSiteIds;
  if (restrict != null) {
    if (querySiteId != null && !restrict.includes(querySiteId)) {
      return { ok: false };
    }
    return { ok: true, siteId: querySiteId, restrictToSiteIds: restrict };
  }
  return { ok: true, siteId: querySiteId };
}

function getClientIp(req: Request): string {
  return (req.ip || "unknown").toString();
}

export function forbidSiteRbac(
  req: Request,
  res: Response,
  detail: { reason: string; siteId?: number; capability?: string },
): void {
  const user = req.user as Express.User | undefined;
  void emitOpsEvent({
    eventType: "auth.forbidden",
    severity: "warning",
    endpoint: req.path,
    method: req.method,
    ip: getClientIp(req),
    userId: Number.isFinite(user?.id) ? user!.id : null,
    payload: { kind: "site_rbac", ...detail },
  });
  res.status(403).json({ message: "Forbidden: insufficient site permissions" });
}

/** Filter export/selection item ids to those in allowed sites. */
export function filterItemsBySiteAccess<T extends { siteId: number }>(access: SiteAccess, items: T[]): T[] {
  if (!access.enforcing || access.adminBypass || access.restrictToSiteIds == null) {
    return items;
  }
  const allow = new Set(access.restrictToSiteIds);
  return items.filter((i) => allow.has(i.siteId));
}
