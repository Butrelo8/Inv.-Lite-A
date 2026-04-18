import type { Express, NextFunction, Request, Response } from "express";
import type { UserRole } from "@shared/schema";
import { getAuthUser } from "./auth-user";
import { emitOpsEvent } from "./ops-events";
import { isSiteRbacEnabled, isSiteScopingEnabled } from "./site-config";
import { getSiteAccess } from "./site-rbac-access";

export { getAuthUser, getAuthUserId } from "./auth-user";

/** Site feature flags included in auth responses. */
export function authEnvFlags() {
  return { siteScopingEnabled: isSiteScopingEnabled(), siteRbacEnabled: isSiteRbacEnabled() };
}

/** Site RBAC fields for authenticated `/api/auth/me` and login payloads. */
export async function siteAccessJson(req: Request) {
  const access = await getSiteAccess(req);
  return {
    ...authEnvFlags(),
    capabilities: access.enforcing ? Array.from(access.capabilities).sort() : [],
    allowedSites: access.enforcing ? access.visibleSites : undefined,
    siteGrants: access.enforcing ? access.grants : undefined,
  };
}

export function getClientIp(req: Request): string {
  return (req.ip || "unknown").toString();
}

/** Require user to be logged in. Returns 401 if not. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.()) return next();
  res.status(401).json({ message: "Not authenticated" });
}

/**
 * After `requireAuth`, require a Passport user with a finite numeric id.
 * Sends **401** `{ message: "Sesión expirada" }` if the session user is missing or invalid.
 */
export function requireAuthUser(req: Request, res: Response): Express.User | null {
  const user = getAuthUser(req);
  if (!user || !Number.isFinite(user.id)) {
    res.status(401).json({ message: "Sesión expirada" });
    return null;
  }
  return user;
}

/** Require user to have one of the given roles. Use after requireAuth. Returns 403 if forbidden. */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getAuthUser(req);
    const role = (user?.role ?? "viewer") as UserRole;
    if (allowedRoles.includes(role)) return next();
    void emitOpsEvent({
      eventType: "auth.forbidden",
      severity: "warning",
      endpoint: req.path,
      method: req.method,
      ip: getClientIp(req),
      userId: Number.isFinite(user?.id) ? user!.id : null,
      payload: { requiredRoles: allowedRoles, actualRole: role },
    });
    res.status(403).json({ message: "Forbidden: insufficient permissions" });
  };
}
