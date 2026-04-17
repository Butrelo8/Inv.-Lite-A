import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../route-middleware";
import { documentGenerationService } from "./documents.service";

const outputFormats = z.enum(["pdf", "docx", "html"]);

const generateBodySchema = z.object({
  templateId: z.number().int().positive(),
  data: z.record(z.unknown()),
  format: outputFormats,
  filename: z.string().min(1).max(200).optional(),
});

const previewBodySchema = z.object({
  templateId: z.number().int().positive(),
  data: z.record(z.unknown()),
});

export function registerDocGenDocumentRoutes(app: Express): void {
  app.post("/api/doc-gen/generate", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = generateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed", issues: parsed.error.flatten() });
    }
    try {
      const doc = await documentGenerationService.generateDocument(parsed.data);
      res.setHeader("Content-Type", doc.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${doc.suggestedFilename}"`);
      res.send(doc.buffer);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 500;
      const details = (e as { details?: string[] })?.details;
      const message = (e as Error)?.message || "Generation failed";
      if (status >= 400 && status < 500) {
        return res.status(status).json({ message, details });
      }
      throw e;
    }
  });

  app.post("/api/doc-gen/preview", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = previewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed", issues: parsed.error.flatten() });
    }
    try {
      const html = await documentGenerationService.previewHtml(parsed.data.templateId, parsed.data.data);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 500;
      const details = (e as { details?: string[] })?.details;
      const message = (e as Error)?.message || "Preview failed";
      if (status >= 400 && status < 500) {
        return res.status(status).json({ message, details });
      }
      throw e;
    }
  });
}
