import { USER_ROLES, type UserRole } from "./schema";

const ALLOWED = new Set<string>(USER_ROLES);

/**
 * Coerce API `user.role` strings (e.g. `/api/auth/me`, login) to a known role.
 * Unknown or non-string values → **`viewer`** (fail closed for UI capability checks).
 */
export function normalizeUserRoleFromApi(raw: unknown): UserRole {
  if (typeof raw !== "string") return "viewer";
  return ALLOWED.has(raw) ? (raw as UserRole) : "viewer";
}
