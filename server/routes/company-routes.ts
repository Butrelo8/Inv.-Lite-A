import type { Express } from "express";
import { suggestCode } from "../code-generator";
import { parseSiteIdQuery, requireInventoryListContext } from "../inventory-list-context";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../route-middleware";

export function registerCompanyRoutes(app: Express): void {
  app.get("/api/inventory/suggest-code", requireAuth, async (req, res) => {
    const category = (req.query.category as string) ?? "";
    const name = (req.query.name as string) ?? "";
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const code = await suggestCode(category || undefined, name || undefined, ctx.siteId);
    res.json({ code });
  });

  app.get("/api/companies", requireAuth, async (_req, res) => {
    const list = await storage.getCompanies();
    res.json(list);
  });

  app.post("/api/companies", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const name = (req.body as { name?: string })?.name?.trim();
    if (!name) return res.status(400).json({ message: "name is required" });
    const company = await storage.createCompany(name);
    res.status(201).json(company);
  });

  app.patch("/api/companies/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const name = (req.body as { name?: string })?.name?.trim();
    if (!name) return res.status(400).json({ message: "name is required" });
    const company = await storage.updateCompany(id, name);
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  });

  app.delete("/api/companies/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const deleted = await storage.deleteCompany(id);
    if (!deleted) return res.status(404).json({ message: "Company not found" });
    res.status(204).send();
  });
}
