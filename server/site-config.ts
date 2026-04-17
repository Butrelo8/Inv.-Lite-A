/**
 * When false (default), all inventory rows use the default site and list APIs ignore site filters.
 * Set SITE_SCOPING_ENABLED=true to enable multi-site list/create/update and the client site switcher.
 */
export function isSiteScopingEnabled(): boolean {
  const v = process.env.SITE_SCOPING_ENABLED;
  return v === "true" || v === "1";
}

/**
 * When true (with SITE_SCOPING_ENABLED), inventory-related APIs enforce `user_site_roles` + capabilities.
 * Users with no rows keep legacy behavior: global role applies to all sites until grants are assigned.
 */
export function isSiteRbacEnabled(): boolean {
  const v = process.env.SITE_RBAC_ENABLED;
  return v === "true" || v === "1";
}
