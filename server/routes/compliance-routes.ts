import type { Express } from "express";
import { requireAuth } from "../route-middleware";
import { storage } from "../storage";

export function registerComplianceRoutes(app: Express): void {
  // Compliance queues: all authenticated roles (including viewers) get read-only access.
  // Returns missing / due-soon / overdue / critical buckets per (responsible, documentType).
  // No fileUrls are included — viewers cannot download documents via this endpoint.
  app.get("/api/compliance/queues", requireAuth, async (req, res) => {
    const rawTypes = req.query.documentTypes as string | undefined;
    const documentTypes = rawTypes ? rawTypes.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
    const result = await storage.getComplianceQueues({ documentTypes });
    res.json(result);
  });
}
