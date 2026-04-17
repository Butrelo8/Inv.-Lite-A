import type { Express } from "express";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { webhookOutbox } from "@shared/schema";
import { db } from "../db";
import { mapWebhookDeliveriesForRole } from "../webhook-deliveries";
import { validateWebhookOutboundUrl } from "../webhook-url-policy";
import { getAuthUser, requireAuth, requireRole } from "../route-middleware";
import { storage } from "../storage";
import { parsePositiveIntPathParam, parseWebhookDeliveriesLimit } from "../validation/query-params";

export function registerWebhookRoutes(app: Express): void {
  app.get("/api/webhooks", requireAuth, requireRole("admin"), async (_req, res) => {
    const list = await storage.getWebhookEndpoints();
    res.json(list);
  });

  app.post("/api/webhooks", requireAuth, requireRole("admin"), async (req, res) => {
    const parsed = z.object({
      url: z.string().url(),
      secret: z.string().min(8),
      eventTypes: z.array(z.string()).min(1),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid payload" });
    }
    const urlCheck = await validateWebhookOutboundUrl(parsed.data.url);
    if (!urlCheck.ok) {
      return res.status(400).json({ message: urlCheck.message });
    }
    const createdByUserId = getAuthUser(req)?.id;
    const endpoint = await storage.createWebhookEndpoint({
      ...parsed.data,
      url: urlCheck.href,
      createdByUserId,
    });
    res.status(201).json(endpoint);
  });

  app.patch("/api/webhooks/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const idParsed = parsePositiveIntPathParam(req.params.id);
    if (!idParsed.ok) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.id;

    const parsed = z.object({
      url: z.string().url().optional(),
      secret: z.string().min(8).optional(),
      eventTypes: z.array(z.string()).min(1).optional(),
      enabled: z.boolean().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid payload" });
    }
    let updates = parsed.data;
    if (parsed.data.url !== undefined) {
      const urlCheck = await validateWebhookOutboundUrl(parsed.data.url);
      if (!urlCheck.ok) {
        return res.status(400).json({ message: urlCheck.message });
      }
      updates = { ...parsed.data, url: urlCheck.href };
    }
    const endpoint = await storage.updateWebhookEndpoint(id, updates);
    if (!endpoint) return res.status(404).json({ message: "Endpoint not found" });
    res.json(endpoint);
  });

  app.delete("/api/webhooks/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const idParsed = parsePositiveIntPathParam(req.params.id);
    if (!idParsed.ok) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.id;
    const deleted = await storage.deleteWebhookEndpoint(id);
    if (!deleted) return res.status(404).json({ message: "Endpoint not found" });
    res.status(204).send();
  });

  app.get("/api/webhooks/deliveries", requireAuth, requireRole("admin", "editor"), async (req, res) => {
    const { limit } = parseWebhookDeliveriesLimit(req.query);
    const deliveries = await db.select().from(webhookOutbox).orderBy(desc(webhookOutbox.createdAt)).limit(limit);
    const role = String(getAuthUser(req)?.role ?? "");
    res.json(mapWebhookDeliveriesForRole(deliveries, role));
  });
}
