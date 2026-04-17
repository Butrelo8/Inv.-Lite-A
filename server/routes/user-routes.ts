import type { Express } from "express";
import type { UserRole } from "@shared/schema";
import { USER_ROLES } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../route-middleware";

export function registerUserRoutes(app: Express): void {
  app.get("/api/users", requireAuth, requireRole("admin"), async (_req, res) => {
    const list = await storage.getUsers();
    res.json(list);
  });

  app.patch("/api/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid user id" });
    const role = (req.body as { role?: string })?.role;
    if (!role || !USER_ROLES.includes(role as UserRole)) {
      return res.status(400).json({ message: "Invalid role; use admin, editor, or viewer" });
    }
    const updated = await storage.updateUserRole(id, role);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  });

  app.get("/api/role-templates", requireAuth, requireRole("admin"), async (_req, res) => {
    res.json(await storage.getRoleTemplates());
  });

  app.get("/api/users/:id/site-roles", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid user id" });
    const grants = await storage.listUserSiteRolesWithDetails(id);
    res.json({ grants });
  });

  app.put("/api/users/:id/site-roles/:siteId", requireAuth, requireRole("admin"), async (req, res) => {
    const userId = Number(req.params.id);
    const siteId = Number(req.params.siteId);
    if (!Number.isFinite(userId) || !Number.isFinite(siteId)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const body = req.body as { templateId?: unknown; templateKey?: unknown };
    let templateId: number | undefined;
    if (typeof body.templateId === "number" && Number.isFinite(body.templateId)) {
      templateId = body.templateId;
    } else if (typeof body.templateKey === "string" && body.templateKey.trim()) {
      const t = await storage.getRoleTemplateByKey(body.templateKey.trim());
      if (!t) return res.status(400).json({ message: "Unknown templateKey" });
      templateId = t.id;
    }
    if (templateId == null) {
      return res.status(400).json({ message: "templateId or templateKey is required" });
    }
    const tpl = await storage.getRoleTemplateById(templateId);
    if (!tpl) return res.status(400).json({ message: "Unknown templateId" });
    const sitesList = await storage.getSites();
    if (!sitesList.some((s) => s.id === siteId)) {
      return res.status(400).json({ message: "Unknown siteId" });
    }
    const u = await storage.getUserById(userId);
    if (!u) return res.status(404).json({ message: "User not found" });
    await storage.upsertUserSiteRole(userId, siteId, templateId);
    res.status(204).send();
  });

  app.delete("/api/users/:id/site-roles/:siteId", requireAuth, requireRole("admin"), async (req, res) => {
    const userId = Number(req.params.id);
    const siteId = Number(req.params.siteId);
    if (!Number.isFinite(userId) || !Number.isFinite(siteId)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const ok = await storage.deleteUserSiteRole(userId, siteId);
    if (!ok) return res.status(404).json({ message: "Grant not found" });
    res.status(204).send();
  });
}
