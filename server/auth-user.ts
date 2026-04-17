import type { Express, Request } from "express";

/** Passport-attached user when authenticated — use after `requireAuth`. */
export function getAuthUser(req: Request): Express.User | undefined {
  return req.user as Express.User | undefined;
}
