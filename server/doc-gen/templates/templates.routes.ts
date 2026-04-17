import type { Express } from "express";
import { z } from "zod";
import { getAuthUser, requireAuth, requireRole } from "../../route-middleware";
import { insertDocTemplateSchema, updateDocTemplateSchema } from "./templates.schema";
import { templateService } from "./templates.service";
import { documentGenerationService } from "../documents/documents.service";

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function registerDocGenTemplateRoutes(app: Express): void {
  app.get("/api/doc-gen/templates", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const category = typeof q.category === "string" ? q.category : undefined;
    const includeInactive = q.includeInactive === "true" || q.includeInactive === "1";
    const rows = await templateService.list({
      category,
      activeOnly: !includeInactive,
    });
    res.json({ templates: rows });
  });

  app.get("/api/doc-gen/templates/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: "Invalid id" });
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";
    const row = await templateService.getById(parsed.data.id, { includeInactive });
    if (!row) return res.status(404).json({ message: "Template not found" });
    res.json(row);
  });

  app.get("/api/doc-gen/templates/:id/variables", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: "Invalid id" });
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";
    const row = await templateService.getById(parsed.data.id, { includeInactive });
    if (!row) return res.status(404).json({ message: "Template not found" });
    const hints = documentGenerationService.collectTemplateVariableHints(row);
    res.json(hints);
  });

  app.post("/api/doc-gen/templates", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const user = getAuthUser(req);
    const body = insertDocTemplateSchema.safeParse({
      ...(req.body as Record<string, unknown>),
      createdByUserId: user?.id ?? null,
    });
    if (!body.success) {
      return res.status(400).json({ message: "Validation failed", issues: body.error.flatten() });
    }
    const created = await templateService.create(body.data);
    res.status(201).json(created);
  });

  app.put("/api/doc-gen/templates/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: "Invalid id" });
    const body = updateDocTemplateSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: "Validation failed", issues: body.error.flatten() });
    }
    try {
      const updated = await templateService.update(parsed.data.id, body.data);
      res.json(updated);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 404) return res.status(404).json({ message: (e as Error).message });
      throw e;
    }
  });

  app.delete("/api/doc-gen/templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: "Invalid id" });
    try {
      const row = await templateService.softDelete(parsed.data.id);
      res.json(row);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 404) return res.status(404).json({ message: (e as Error).message });
      throw e;
    }
  });
}
