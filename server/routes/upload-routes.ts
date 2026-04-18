import type { Express } from "express";
import path from "path";
import fsPromises from "fs/promises";
import { eq } from "drizzle-orm";
import { inventoryItems } from "@shared/schema";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { db } from "../db";
import { emitOpsEvent } from "../ops-events";
import { resolveSafeFilePath } from "../path-utils";
import { getAuthUserId, getClientIp, requireAuth, requireRole } from "../route-middleware";
import { getSiteAccess, can, forbidSiteRbac, itemSiteAllowed } from "../site-rbac-access";
import { storage } from "../storage";
import { ensureThumbnail, thumbsPath } from "../thumbnails";
import {
  documentsPath,
  uploadsPath,
  THUMB_RATE_LIMIT_WINDOW_MS,
  THUMB_RATE_LIMIT_MAX_REQUESTS,
  MAX_ORIGINAL_BYTES_FOR_THUMB,
  thumbRateByIp,
  thumbGenerationInFlight,
  evictOldThumbRates,
  imageUpload,
  normalizeHeicToJpeg,
} from "../upload-config";

async function statIsRegularFile(filePath: string): Promise<boolean> {
  try {
    const st = await fsPromises.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function unlinkUploadQuiet(filePath: string): Promise<void> {
  try {
    await fsPromises.unlink(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.error("Failed to remove temp upload", filePath, err);
    }
  }
}

export function registerUploadRoutes(app: Express): void {
  // Private upload serving (A1 + 2B)
  // - Images: any authenticated user (viewer can see inventory)
  // - Documents: editor/admin only
  // - Thumbnails: require auth; generate from existing images on-demand
  app.get("/uploads/documents/:filename", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const requestedFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filePath = resolveSafeFilePath(documentsPath, requestedFilename);
    if (!filePath || !(await statIsRegularFile(filePath))) return res.status(404).json({ message: "File not found" });
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(filePath);
  });

  app.get("/uploads/:filename", requireAuth, async (req, res) => {
    const requestedFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filePath = resolveSafeFilePath(uploadsPath, requestedFilename);
    if (!filePath || !(await statIsRegularFile(filePath))) return res.status(404).json({ message: "File not found" });
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(filePath);
  });

  // On-demand thumbnail: generates a WebP thumb for any existing image upload if it doesn't exist yet.
  app.get("/uploads/thumbs/:filename", requireAuth, async (req, res) => {
    const requestedFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const safeFilename = path.basename(requestedFilename);
    if (!safeFilename.toLowerCase().endsWith(".webp")) return res.status(404).json({ message: "File not found" });

    const thumbFilePath = resolveSafeFilePath(thumbsPath, safeFilename);
    if (!thumbFilePath) return res.status(404).json({ message: "File not found" });

    // Rate-limit thumbnail requests to reduce filesystem/CPU abuse.
    const ip = getClientIp(req);
    const now = Date.now();
    evictOldThumbRates(now);
    const current = thumbRateByIp.get(ip);
    if (!current || now - current.windowStart > THUMB_RATE_LIMIT_WINDOW_MS) {
      thumbRateByIp.set(ip, { windowStart: now, count: 1 });
    } else {
      current.count += 1;
      if (current.count > THUMB_RATE_LIMIT_MAX_REQUESTS) {
        void emitOpsEvent({
          eventType: "auth.rate_limit_hit",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          userId: getAuthUserId(req),
          payload: { category: "thumbnail", maxRequests: THUMB_RATE_LIMIT_MAX_REQUESTS },
        });
        return res.status(429).json({ message: "Too many thumbnail requests" });
      }
    }

    let thumbExists = await statIsRegularFile(thumbFilePath);

    if (!thumbExists) {
      // Derive original filename: same base name, any image extension
      const base = path.basename(safeFilename, ".webp");
      const uploadsDir = path.join(process.cwd(), "uploads");
      const exts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

      let originalPath: string | null = null;
      for (const ext of exts) {
        const candidate = path.join(uploadsDir, base + ext);
        if (await statIsRegularFile(candidate)) {
          originalPath = candidate;
          break;
        }
      }

      if (!originalPath) return res.status(404).json({ message: "Original not found" });

      // Extra safety: avoid generating thumbnails from unexpectedly large files.
      // (Upload routes already cap image size, but this protects against manual filesystem tampering.)
      const originalStat = await fsPromises.stat(originalPath);
      if (originalStat.size > MAX_ORIGINAL_BYTES_FOR_THUMB) {
        return res.status(413).json({ message: "Original image too large for thumbnail generation" });
      }

      try {
        const generationKey = thumbFilePath;
        const inFlight = thumbGenerationInFlight.get(generationKey);
        if (inFlight) {
          await inFlight;
        } else {
          const p = ensureThumbnail(originalPath).then(() => {});
          thumbGenerationInFlight.set(generationKey, p);
          await p;
        }
      } catch (err) {
        console.error("Thumbnail generation failed", { base, safeFilename }, err);
        void emitOpsEvent({
          eventType: "job.thumbnail_failure",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          userId: getAuthUserId(req),
          payload: { filename: safeFilename, error: err instanceof Error ? err.message : String(err) },
        });
        return res.status(500).json({ message: "Thumbnail generation failed" });
      } finally {
        thumbGenerationInFlight.delete(thumbFilePath);
      }

      thumbExists = await statIsRegularFile(thumbFilePath);
    }

    if (!thumbExists) return res.status(404).json({ message: "Thumbnail not found" });
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(thumbFilePath);
  });

  app.post("/api/inventory/:id/image", requireAuth, requireRole("editor", "admin"), imageUpload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No valid image file provided" });
    }
    await normalizeHeicToJpeg(req.file);
    const id = Number(req.params.id);
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      await unlinkUploadQuiet(req.file.path);
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const item = await storage.getItem(id);
    if (!item) {
      await unlinkUploadQuiet(req.file.path);
      return res.status(404).json({ message: "Item not found" });
    }
    if (!itemSiteAllowed(access, item.siteId)) {
      await unlinkUploadQuiet(req.file.path);
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    ensureThumbnail(req.file.path).catch((err) => console.error("Thumbnail pre-generation failed", { itemId: id }, err));
    await storage.addAttachment(id, imageUrl);
    const attachments = await storage.getAttachments(id);
    await db.update(inventoryItems).set({ imageUrl }).where(eq(inventoryItems.id, id));
    const [updated] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    res.json({ ...updated, attachments });
  });
}
