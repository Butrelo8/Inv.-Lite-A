import type { Express } from "express";
import { eq } from "drizzle-orm";
import { sharedNotes } from "@shared/schema";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { db } from "../db";
import { storage } from "../storage";
import { getSiteAccess, can, forbidSiteRbac, itemSiteAllowed } from "../site-rbac-access";
import { requireAuth, requireAuthUser, requireRole } from "../route-middleware";

const MAX_SHARED_NOTE_TITLE_LEN = 100;
const MAX_SHARED_NOTE_CONTENT_LEN = 2000;

export function registerSharedNotesRoutes(app: Express): void {
  app.get("/api/shared-notes", requireAuth, async (req, res) => {
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const rawItemId = req.query.itemId;
    const itemId = rawItemId != null && rawItemId !== "" ? Number(rawItemId) : undefined;
    if (Number.isFinite(itemId)) {
      const item = await storage.getItem(itemId!);
      if (!item) return res.status(404).json({ message: "Item not found" });
      if (!itemSiteAllowed(access, item.siteId)) {
        forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
        return;
      }
    }
    const restrict = access.enforcing && access.restrictToSiteIds != null ? access.restrictToSiteIds : undefined;
    const notes = await storage.getSharedNotes(Number.isFinite(itemId) ? itemId : undefined, restrict);
    res.json(notes);
  });

  app.post("/api/shared-notes", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const body = req.body as { title?: unknown; content?: unknown; itemId?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const rawItemId = body.itemId;
    const itemId = rawItemId != null && rawItemId !== "" ? Number(rawItemId) : NaN;
    if (!title) return res.status(400).json({ message: "title is required" });
    if (!content) return res.status(400).json({ message: "content is required" });
    if (title.length > MAX_SHARED_NOTE_TITLE_LEN) {
      return res.status(400).json({ message: `title must be at most ${MAX_SHARED_NOTE_TITLE_LEN} characters` });
    }
    if (content.length > MAX_SHARED_NOTE_CONTENT_LEN) {
      return res.status(400).json({ message: `content must be at most ${MAX_SHARED_NOTE_CONTENT_LEN} characters` });
    }
    if (!Number.isFinite(itemId)) return res.status(400).json({ message: "itemId is required" });

    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const item = await storage.getItem(itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }

    const created = await storage.createSharedNote({ title, content, authorId: userId, itemId });
    res.status(201).json(created);
  });

  app.patch("/api/shared-notes/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const body = req.body as { title?: unknown; content?: unknown };
    const updates: { title?: string; content?: string } = {};

    if (body.title !== undefined) {
      const t = typeof body.title === "string" ? body.title.trim() : "";
      if (!t) return res.status(400).json({ message: "title cannot be empty" });
      if (t.length > MAX_SHARED_NOTE_TITLE_LEN) {
        return res.status(400).json({ message: `title must be at most ${MAX_SHARED_NOTE_TITLE_LEN} characters` });
      }
      updates.title = t;
    }
    if (body.content !== undefined) {
      const c = typeof body.content === "string" ? body.content.trim() : "";
      if (!c) return res.status(400).json({ message: "content cannot be empty" });
      if (c.length > MAX_SHARED_NOTE_CONTENT_LEN) {
        return res.status(400).json({ message: `content must be at most ${MAX_SHARED_NOTE_CONTENT_LEN} characters` });
      }
      updates.content = c;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No updates provided" });

    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const [noteRow] = await db.select({ itemId: sharedNotes.itemId }).from(sharedNotes).where(eq(sharedNotes.id, id)).limit(1);
    if (!noteRow) return res.status(404).json({ message: "Shared note not found" });
    const item = await storage.getItem(noteRow.itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }

    const updated = await storage.updateSharedNote(id, updates);
    if (!updated) return res.status(404).json({ message: "Shared note not found" });
    res.json(updated);
  });

  app.delete("/api/shared-notes/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const [noteRow] = await db.select({ itemId: sharedNotes.itemId }).from(sharedNotes).where(eq(sharedNotes.id, id)).limit(1);
    if (!noteRow) return res.status(404).json({ message: "Shared note not found" });
    const item = await storage.getItem(noteRow.itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }

    const deleted = await storage.deleteSharedNote(id);
    if (!deleted) return res.status(404).json({ message: "Shared note not found" });
    res.status(204).send();
  });
}
