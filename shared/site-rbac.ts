/**
 * Site-scoped capability strings (per-site grants via `role_templates` + `user_site_roles`).
 *
 * Built-in templates (seeded in migrations/add-site-rbac.sql):
 * | Template key    | Capabilities |
 * |-----------------|--------------|
 * | site_viewer     | inventory:read |
 * | site_editor     | inventory:read, inventory:write, assignments:manage |
 * | site_manager    | site_editor + employees:read, reports:site |
 */
export const SITE_CAPABILITIES = {
  INVENTORY_READ: "inventory:read",
  INVENTORY_WRITE: "inventory:write",
  ASSIGNMENTS_MANAGE: "assignments:manage",
  EMPLOYEES_READ: "employees:read",
  REPORTS_SITE: "reports:site",
} as const;

export type SiteCapability = (typeof SITE_CAPABILITIES)[keyof typeof SITE_CAPABILITIES];

export const ROLE_TEMPLATE_KEYS = ["site_viewer", "site_editor", "site_manager"] as const;
export type RoleTemplateKey = (typeof ROLE_TEMPLATE_KEYS)[number];

/** Full capability set for org-wide admin (no `user_site_roles` rows required). */
export const ALL_SITE_CAPABILITIES: readonly SiteCapability[] = [
  SITE_CAPABILITIES.INVENTORY_READ,
  SITE_CAPABILITIES.INVENTORY_WRITE,
  SITE_CAPABILITIES.ASSIGNMENTS_MANAGE,
  SITE_CAPABILITIES.EMPLOYEES_READ,
  SITE_CAPABILITIES.REPORTS_SITE,
];

/** Fast membership check for normalizing `role_templates.capabilities` JSON. */
export const SITE_KNOWN_CAPABILITY_SET = new Set<string>(ALL_SITE_CAPABILITIES as readonly string[]);

/**
 * Parse JSONB-backed capability arrays as string lists (driver may return array or stringified JSON).
 */
export function parseSiteCapabilityStringsFromJsonb(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) return j.filter((x): x is string => typeof x === "string");
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function isKnownSiteCapability(value: string): value is SiteCapability {
  return SITE_KNOWN_CAPABILITY_SET.has(value);
}

/**
 * Capabilities implied by global `users.role` when site RBAC is enforcing and we
 * need legacy caps (no `user_site_roles` rows) or a fallback after empty template
 * normalization. The DB column is plain text — unknown values must not widen beyond
 * viewer (fail closed); `admin` is listed for callers that bypass `loadSiteAccess`'s
 * early return.
 */
export function capsForGlobalRole(role: string): Set<string> {
  const s = new Set<string>();
  if (role === "viewer") {
    s.add(SITE_CAPABILITIES.INVENTORY_READ);
    return s;
  }
  if (role === "editor") {
    s.add(SITE_CAPABILITIES.INVENTORY_READ);
    s.add(SITE_CAPABILITIES.INVENTORY_WRITE);
    s.add(SITE_CAPABILITIES.ASSIGNMENTS_MANAGE);
    return s;
  }
  if (role === "admin") {
    for (const c of ALL_SITE_CAPABILITIES) s.add(c);
    return s;
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[site-rbac] unknown users.role for global site cap fallback; using viewer caps",
      { role },
    );
  }
  s.add(SITE_CAPABILITIES.INVENTORY_READ);
  return s;
}
