import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { getSiteAccess } from "./site-rbac-access";
import { emitOpsEvent } from "./ops-events";
import { getClientIp, requireAuth } from "./route-middleware";
import { parseSiteIdQuery, requireInventoryListContext } from "./inventory-list-context";
import { registerAuthRoutes } from "./routes/auth-routes";
import { registerCompanyRoutes } from "./routes/company-routes";
import { registerComplianceRoutes } from "./routes/compliance-routes";
import { registerEmployeeDocsRoutes } from "./routes/employee-docs-routes";
import { registerHistoryRoutes } from "./routes/history-routes";
import { registerInventoryAttachmentRoutes, registerInventoryItemCrudRoutes, registerInventoryListRoute } from "./routes/inventory-item-routes";
import { registerInventoryBulkRoutes } from "./routes/inventory-bulk-routes";
import { registerInventoryExportRoutes } from "./routes/inventory-export-routes";
import { registerReportsOpsRoutes } from "./routes/reports-ops-routes";
import { registerWebhookRoutes } from "./routes/webhook-routes";
import { registerMaintenanceRoutes } from "./routes/maintenance-routes";
import { registerSharedNotesRoutes } from "./routes/shared-notes-routes";
import { registerUploadRoutes } from "./routes/upload-routes";
import { registerUserRoutes } from "./routes/user-routes";
import { registerDocGenRoutes } from "./doc-gen";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // CSRF mitigation for cookie-authenticated users.
  // For state-changing requests we only allow same-origin browser requests by validating
  // `Origin` or `Referer` against the current request `Host`.
  app.use("/api", (req, res, next) => {
    const method = req.method.toUpperCase();
    const isUnsafe = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    if (!isUnsafe) return next();

    // Only enforce when the user is authenticated via the cookie-backed session.
    if (!req.isAuthenticated?.()) return next();

    const requestHost = req.headers.host;
    const secFetchSite = req.headers["sec-fetch-site"];
    const origin = req.headers.origin;
    const referer = req.headers.referer ?? req.headers.referrer;

    if (typeof requestHost !== "string" || !requestHost) return next();

    const secFetchOk =
      typeof secFetchSite === "string" &&
      (secFetchSite === "same-origin" || secFetchSite === "same-site");

    const headerHostMatches = (value: unknown) => {
      if (typeof value !== "string" || !value) return false;
      try {
        return new URL(value).host === requestHost;
      } catch {
        return false;
      }
    };

    // Prefer browser-provided fetch intent (`Sec-Fetch-Site`) when available.
    // If `Origin`/`Referer` exist, we still require their host to match.
    const originOrRefererPresent = origin != null || referer != null;
    const ok = originOrRefererPresent ? (headerHostMatches(origin) || headerHostMatches(referer)) : secFetchOk;
    if (!ok) {
      void emitOpsEvent({
        eventType: "auth.csrf_blocked",
        severity: "warning",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: Number.isFinite((req.user as any)?.id) ? (req.user as any).id : null,
        payload: { origin, referer, secFetchSite },
      });
      return res.status(403).json({ message: "CSRF protection: invalid origin" });
    }
    return next();
  });

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerHistoryRoutes(app);

  app.get("/api/inventory/filters", requireAuth, async (req, res) => {
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const options = await storage.getFilterOptions(ctx.siteId, ctx.restrictToSiteIds);
    res.json(options);
  });

  // Site RBAC (when enforcing): users with zero `user_site_roles` rows keep legacy behavior — all
  // non-archived sites. Users with explicit grants see only `access.visibleSites` (DECISIONS 2026-04-08).
  app.get("/api/sites", requireAuth, async (req, res) => {
    const access = await getSiteAccess(req);
    const list = await storage.getSites();
    if (access.enforcing && !access.adminBypass && access.hasExplicitSiteGrants) {
      const allow = new Set(access.visibleSites.map((s) => s.id));
      return res.json({ sites: list.filter((s) => allow.has(s.id)) });
    }
    res.json({ sites: list });
  });

  registerSharedNotesRoutes(app);
  registerComplianceRoutes(app);
  registerEmployeeDocsRoutes(app);
  registerCompanyRoutes(app);

  registerInventoryListRoute(app);
  registerInventoryExportRoutes(app);
  registerInventoryItemCrudRoutes(app);
  registerInventoryBulkRoutes(app);
  registerInventoryAttachmentRoutes(app);
  registerUploadRoutes(app);

  registerReportsOpsRoutes(app);

  registerWebhookRoutes(app);
  registerMaintenanceRoutes(app);
  registerDocGenRoutes(app);

  return httpServer;
}

// Migrate existing imageUrl to attachments table (one-time for old data)
async function migrateImageUrlToAttachments() {
  const items = await storage.getItems();
  for (const item of items) {
    if (item.imageUrl) {
      const attachments = await storage.getAttachments(item.id);
      if (attachments.length === 0) {
        await storage.addAttachment(item.id, item.imageUrl);
      }
    }
  }
}

// Seed function to add some initial data
async function seedDatabase() {
  await migrateImageUrlToAttachments().catch((err) => console.error("ImageUrl->attachments migration failed", err));
  const existingItems = await storage.getItems();
  if (existingItems.length === 0) {
    await storage.createItem({
      code: "LAP-001",
      name: "Laptop Dell XPS 15",
      serialNumber: "DL123456789",
      size: "15 inch",
      units: 5,
      condition: "Nuevo",
      purchaseDate: "2023-01-15",
      responsible: "Juan Perez",
      usefulLife: "3 years",
      category: "Electronics"
    });
    await storage.createItem({
      code: "MON-202",
      name: "Monitor Samsung 27\"",
      serialNumber: "SN987654321",
      size: "27 inch",
      units: 10,
      condition: "Bueno",
      purchaseDate: "2023-03-20",
      responsible: "Ana Garcia",
      usefulLife: "5 years",
      category: "Electronics"
    });
    await storage.createItem({
      code: "CHR-101",
      name: "Silla Ergonómica",
      serialNumber: "N/A",
      size: "Standard",
      units: 20,
      condition: "Excelente",
      purchaseDate: "2023-06-10",
      responsible: "Oficina Central",
      usefulLife: "10 years",
      category: "Furniture"
    });
  }
}

// Invoke seed on startup.
// This must be opt-in to avoid nondeterminism/data drift in production and container environments.
// (Tests set NODE_ENV="test" and will not seed.)
const shouldAutoSeed =
  process.env.SEED_DB === "true" ||
  process.env.SEED_DB === "1" ||
  process.env.NODE_ENV === "development";

if (shouldAutoSeed && process.env.NODE_ENV !== "test") {
  seedDatabase().catch((err) => console.error("Error seeding database:", err));
}
