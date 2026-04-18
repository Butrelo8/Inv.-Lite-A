import type { Express, NextFunction, Request, Response } from "express";
import fsPromises from "fs/promises";
import { storage } from "../storage";
import { resolveStoredFilePath } from "../path-utils";
import { documentsPath, documentUpload, ensureDocumentsDir } from "../upload-config";
import { getAuthUserId, requireAuth, requireRole } from "../route-middleware";

async function ensureDocumentsDirMiddleware(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureDocumentsDir();
    next();
  } catch (err) {
    next(err);
  }
}

export function registerEmployeeDocsRoutes(app: Express): void {
  app.get("/api/responsible", requireAuth, requireRole("editor", "admin"), async (_req, res) => {
    const list = await storage.getResponsibleWithCounts();
    res.json(list);
  });

  app.get("/api/employees/documents", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const responsible = req.query.responsible as string | undefined;
    const documentType = req.query.documentType as string | undefined;
    const list = await storage.getEmployeeDocuments(responsible, documentType);
    res.json(list);
  });

  app.get("/api/employees/document-status", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const documentType = (req.query.documentType as string) || "Contract";
    const expiresBefore = req.query.expiresBefore as string | undefined;
    const result = await storage.getResponsiblesWithoutDocumentType(documentType, expiresBefore ? { expiresBefore } : undefined);
    res.json(result);
  });

  app.get("/api/employees/documents/versions", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const responsible = req.query.responsible as string;
    const documentType = req.query.documentType as string;
    if (!responsible || !documentType) return res.status(400).json({ message: "responsible and documentType required" });
    const versions = await storage.getDocumentVersions(responsible, documentType);
    res.json(versions);
  });

  app.post(
    "/api/employees/documents",
    requireAuth,
    requireRole("editor", "admin"),
    ensureDocumentsDirMiddleware,
    documentUpload.single("file"),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }
      const responsible = (req.body?.responsible as string)?.trim() || null;
      const itemIdRaw = req.body?.itemId;
      const itemId = itemIdRaw !== undefined && itemIdRaw !== "" ? Number(itemIdRaw) : null;
      const documentType = (req.body?.documentType as string)?.trim() || null;
      const expiresAtRaw = req.body?.expiresAt as string | undefined;
      const expiresAt = expiresAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw) ? expiresAtRaw : null;
      const fileUrl = `/uploads/documents/${req.file.filename}`;
      const doc = await storage.addEmployeeDocument({
        responsible,
        itemId: Number.isFinite(itemId) ? itemId : null,
        fileUrl,
        originalName: req.file.originalname || req.file.filename,
        mimeType: req.file.mimetype,
        documentType,
        expiresAt,
        userId: getAuthUserId(req) ?? undefined,
      });
      res.status(201).json(doc);
    },
  );

  app.patch("/api/employees/documents/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const body = req.body as { itemId?: number | null | string; documentType?: string | null; expiresAt?: string | null };
    const updates: { itemId?: number | null; documentType?: string | null; expiresAt?: string | null } = {};
    if (body.itemId !== undefined) {
      const raw = body.itemId;
      updates.itemId = raw === null || raw === "" ? null : Number(raw);
      if (updates.itemId !== null && !Number.isFinite(updates.itemId)) return res.status(400).json({ message: "Invalid itemId" });
    }
    if (body.documentType !== undefined) updates.documentType = body.documentType === null || body.documentType === "" ? null : String(body.documentType).trim();
    if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt === null || body.expiresAt === "" ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(body.expiresAt)) ? String(body.expiresAt) : undefined;
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No updates provided" });
    const docRow = await storage.updateEmployeeDocument(id, updates);
    if (!docRow) return res.status(404).json({ message: "Document not found" });
    res.json(docRow);
  });

  app.delete("/api/employees/documents/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const deleted = await storage.deleteEmployeeDocument(id);
    if (!deleted) return res.status(404).json({ message: "Document not found" });

    const filePath = resolveStoredFilePath(documentsPath, deleted.fileUrl);
    if (!filePath) {
      console.error("Refusing to unlink employee document file outside documentsPath", {
        documentId: id,
        fileUrl: deleted.fileUrl,
      });
    } else {
      try {
        const st = await fsPromises.stat(filePath);
        if (st.isFile()) {
          await fsPromises.unlink(filePath).catch((unlinkErr: NodeJS.ErrnoException) => {
            if (unlinkErr.code !== "ENOENT") throw unlinkErr;
          });
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== "ENOENT") {
          console.error("Failed to unlink employee document file", { documentId: id, filePath }, err);
        }
      }
    }
    res.status(204).send();
  });
}
