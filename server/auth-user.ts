import type { Express, Request } from "express";

/** Passport-attached user when authenticated — use after `requireAuth`. */
export function getAuthUser(req: Request): Express.User | undefined {
  return req.user as Express.User | undefined;
}

/** Numeric user id for audit fields, or `null` if missing / not finite. */
export function getAuthUserId(req: Request): number | null {
  const id = getAuthUser(req)?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}
