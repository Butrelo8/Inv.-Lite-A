import type { Express } from "express";
import PDFDocument from "pdfkit";
import { loadExecutiveSummary } from "../load-executive-summary";
import { renderExecutiveSummaryPdf } from "../render-executive-summary-pdf";
import { parseSiteIdQuery, requireInventoryListContext } from "../inventory-list-context";
import { getAuthUser, requireAuth, requireRole } from "../route-middleware";
import { storage } from "../storage";
import { parseOpsHealthEventsQuery } from "../validation/query-params";

export function registerReportsOpsRoutes(app: Express): void {
  app.get("/api/reports/executive-summary", requireAuth, async (req, res) => {
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const role = String(getAuthUser(req)?.role ?? "viewer");
    const payload = await loadExecutiveSummary(storage, {
      role,
      siteId: ctx.siteId,
      restrictToSiteIds: ctx.restrictToSiteIds,
    });
    res.json(payload);
  });

  app.get("/api/reports/executive-summary/pdf", requireAuth, async (req, res) => {
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const role = String(getAuthUser(req)?.role ?? "viewer");
    try {
      const payload = await loadExecutiveSummary(storage, {
        role,
        siteId: ctx.siteId,
        restrictToSiteIds: ctx.restrictToSiteIds,
      });
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise<void>((resolve, reject) => {
        doc.on("end", () => resolve());
        doc.on("error", reject);
        try {
          renderExecutiveSummaryPdf(doc, payload);
          doc.end();
        } catch (err) {
          reject(err);
        }
      });
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="informe-ejecutivo.pdf"');
      res.status(200).send(pdfBuffer);
    } catch (err) {
      console.error("executive summary PDF generation failed", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error generating PDF" });
      }
    }
  });

  app.get("/api/ops-health/summary", requireAuth, requireRole("editor", "admin"), async (_req, res) => {
    const summary = await storage.getOpsSummary();
    res.json(summary);
  });

  app.get("/api/ops-health/events", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const { limit, severity } = parseOpsHealthEventsQuery(req.query);
    const events = await storage.getOpsEventFeed(limit, severity);
    res.json(events);
  });
}
