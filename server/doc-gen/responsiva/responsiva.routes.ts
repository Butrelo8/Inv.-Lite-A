import path from "node:path";
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../route-middleware";
import { storage } from "../../storage";
import { can, getSiteAccess, itemSiteAllowed } from "../../site-rbac-access";
import { uploadsPath } from "../../upload-config";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { generateResponsivaDocx } from "./responsiva.service";
import type { ResponsivaAttachment, ResponsivaItem } from "./responsiva.service";

export interface ResponsivaRouteDeps {
  getItem: (
    id: number,
  ) => Promise<(ResponsivaItem & { id: number; siteId: number }) | null | undefined>;
  getAttachments: (itemId: number) => Promise<ResponsivaAttachment[]>;
  getSiteAccess: (req: Request) => Promise<unknown>;
  canRead: (access: unknown) => boolean;
  itemSiteAllowed: (access: unknown, siteId: number) => boolean;
  templatePath: string;
  uploadsDir: string;
  now?: () => Date;
}

export function registerResponsivaRoutes(app: Express, deps: ResponsivaRouteDeps): void {
  app.get("/api/inventory/:id/responsiva", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const access = await deps.getSiteAccess(req);
    if (!deps.canRead(access)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const item = await deps.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (!deps.itemSiteAllowed(access, item.siteId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const attachments = await deps.getAttachments(id);

    try {
      const out = await generateResponsivaDocx({
        templatePath: deps.templatePath,
        uploadsDir: deps.uploadsDir,
        item,
        attachments,
        now: deps.now ? deps.now() : undefined,
      });
      const filename = out.suggestedFilename;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(out.buffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("[responsiva] generation failed", { id, message });
      res.status(500).json({ error: "Error generating document" });
    }
  });
}

export interface RegisterResponsivaDefaultsInput {
  templatePath?: string;
  uploadsDir?: string;
}

export async function registerResponsivaRoutesDefault(
  app: Express,
  input: RegisterResponsivaDefaultsInput = {},
): Promise<void> {
  const templatePath =
    input.templatePath ?? path.join(process.cwd(), "src", "templates", "responsiva_template.docx");
  const uploadsDir = input.uploadsDir ?? uploadsPath;

  registerResponsivaRoutes(app, {
    getItem: async (id) => {
      const item = await storage.getItem(id);
      if (!item) return null;
      return {
        id: item.id,
        siteId: item.siteId,
        code: item.code,
        name: item.name,
        serialNumber: item.serialNumber,
        responsible: item.responsible,
      };
    },
    getAttachments: async (itemId) => await storage.getAttachments(itemId),
    getSiteAccess: async (req) => await getSiteAccess(req),
    canRead: (access) => can(access as never, SITE_CAPABILITIES.INVENTORY_READ),
    itemSiteAllowed: (access, siteId) => itemSiteAllowed(access as never, siteId),
    templatePath,
    uploadsDir,
  });
}
