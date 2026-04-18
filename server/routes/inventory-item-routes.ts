import type { Express } from "express";
import fsPromises from "fs/promises";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  UNASSIGNED_RESPONSIBLE_LABEL,
  inventoryItems,
  inventoryAssignments,
  inventoryHistory,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { httpStatusError } from "../http-status-error";
import { emitOpsEvent } from "../ops-events";
import { parseSiteIdQuery, requireInventoryListContext } from "../inventory-list-context";
import { resolveStoredFilePath } from "../path-utils";
import { getAuthUserId, getClientIp, requireAuth, requireRole } from "../route-middleware";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { getSiteAccess, can, forbidSiteRbac, itemSiteAllowed } from "../site-rbac-access";
import { storage } from "../storage";
import { uploadsPath } from "../upload-config";
import { parseInventoryListPagination } from "../validation/query-params";

export function registerInventoryListRoute(app: Express): void {
  app.get(api.inventory.list.path, requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const { limit, offset } = parseInventoryListPagination(req.query);
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const { items, total, activeAssignmentItemIds } = await storage.getItemsPage(
      search,
      category,
      responsible,
      companyId,
      ctx.siteId,
      dateFrom,
      dateTo,
      addedAfter,
      modifiedAfter,
      limit,
      offset,
      ctx.restrictToSiteIds,
    );
    res.json({ items, total, activeAssignmentItemIds });
  });
}

export function registerInventoryItemCrudRoutes(app: Express): void {
  app.get(api.inventory.get.path, requireAuth, async (req, res) => {
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const item = await storage.getItem(Number(req.params.id));
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    res.json(item);
  });

  app.get(api.inventory.assignmentsList.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const item = await storage.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    const assignments = await storage.getAssignments(id);
    res.json({ assignments });
  });

  app.post(api.inventory.assign.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.ASSIGNMENTS_MANAGE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.ASSIGNMENTS_MANAGE });
      return;
    }
    const preItem = await storage.getItem(id);
    if (!preItem) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, preItem.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: preItem.siteId });
      return;
    }
    const parsed = api.inventory.assign.input.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid body", field: parsed.error.errors[0]?.path.join(".") });
    }
    const userId = getAuthUserId(req);
    try {
      const out = await db.transaction(async (tx) => {
        const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id));
        if (!item) throw httpStatusError(404, "Item not found");
        const [active] = await tx
          .select()
          .from(inventoryAssignments)
          .where(and(eq(inventoryAssignments.itemId, id), isNull(inventoryAssignments.returnedAt)))
          .limit(1);
        if (active && !parsed.data.transfer) throw httpStatusError(409, "Already assigned");
        if (active && parsed.data.transfer) {
          await tx
            .update(inventoryAssignments)
            .set({
              returnedAt: new Date(),
              returnNotes: "Transferido",
              returnedByUserId: userId,
            })
            .where(eq(inventoryAssignments.id, active.id));
          await tx.insert(inventoryHistory).values({
            productId: id,
            companyId: item.companyId ?? null,
            transactionType: "TRANSFER",
            quantity: 0,
            userId,
            remarks: JSON.stringify({
              kind: "TRANSFER",
              closedAssignmentId: active.id,
              fromAssignee: active.assignee,
              toAssignee: parsed.data.assignee,
            }),
          });
        }
        const [inserted] = await tx
          .insert(inventoryAssignments)
          .values({
            itemId: id,
            assignee: parsed.data.assignee,
            conditionAtAssign: parsed.data.condition ?? null,
            notes: parsed.data.notes ?? null,
            assignedByUserId: userId,
          })
          .returning();
        if (!inserted) throw new Error("Insert assignment failed");
        await tx
          .update(inventoryItems)
          .set({ responsible: parsed.data.assignee, updatedAt: new Date() })
          .where(eq(inventoryItems.id, id));
        const [updatedItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id));
        if (!updatedItem) throw new Error("Item missing after assign");
        await tx.insert(inventoryHistory).values({
          productId: id,
          companyId: item.companyId ?? null,
          transactionType: "ASSIGN",
          quantity: 0,
          userId,
          remarks: JSON.stringify({
            kind: "ASSIGN",
            assignmentId: inserted.id,
            assignee: parsed.data.assignee,
            condition: parsed.data.condition ?? null,
            notes: parsed.data.notes ?? null,
          }),
        });
        return { assignment: inserted, item: updatedItem };
      });
      storage.enqueueWebhookEvent("assignment.assigned", out).catch(e => console.error(e));
      res.json(out);
    } catch (err: unknown) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 404) return res.status(404).json({ message: (err as Error).message });
      if (status === 409) return res.status(409).json({ message: (err as Error).message });
      console.error("Assign transaction failed", err);
      return res.status(500).json({ message: "Assign failed" });
    }
  });

  app.post(api.inventory.return.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.ASSIGNMENTS_MANAGE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.ASSIGNMENTS_MANAGE });
      return;
    }
    const preItem = await storage.getItem(id);
    if (!preItem) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, preItem.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: preItem.siteId });
      return;
    }
    const parsed = api.inventory.return.input.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid body", field: parsed.error.errors[0]?.path.join(".") });
    }
    const userId = getAuthUserId(req);
    try {
      const out = await db.transaction(async (tx) => {
        const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id));
        if (!item) throw httpStatusError(404, "Item not found");
        const [active] = await tx
          .select()
          .from(inventoryAssignments)
          .where(and(eq(inventoryAssignments.itemId, id), isNull(inventoryAssignments.returnedAt)))
          .limit(1);
        if (!active) throw httpStatusError(409, "No active assignment");
        const [closed] = await tx
          .update(inventoryAssignments)
          .set({
            returnedAt: new Date(),
            returnCondition: parsed.data.condition ?? null,
            returnNotes: parsed.data.notes ?? null,
            returnedByUserId: userId,
          })
          .where(eq(inventoryAssignments.id, active.id))
          .returning();
        if (!closed) throw new Error("Return update failed");
        await tx
          .update(inventoryItems)
          .set({ responsible: UNASSIGNED_RESPONSIBLE_LABEL, updatedAt: new Date() })
          .where(eq(inventoryItems.id, id));
        const [updatedItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id));
        if (!updatedItem) throw new Error("Item missing after return");
        await tx.insert(inventoryHistory).values({
          productId: id,
          companyId: item.companyId ?? null,
          transactionType: "RETURN",
          quantity: 0,
          userId,
          remarks: JSON.stringify({
            kind: "RETURN",
            assignmentId: active.id,
            returnCondition: parsed.data.condition ?? null,
            notes: parsed.data.notes ?? null,
          }),
        });
        return { assignment: closed, item: updatedItem };
      });
      storage.enqueueWebhookEvent("assignment.returned", out).catch(e => console.error(e));
      res.json(out);
    } catch (err: unknown) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 404) return res.status(404).json({ message: (err as Error).message });
      if (status === 409) return res.status(409).json({ message: (err as Error).message });
      console.error("Return transaction failed", err);
      return res.status(500).json({ message: "Return failed" });
    }
  });

  app.post(api.inventory.create.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    try {
      const access = await getSiteAccess(req);
      if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
        forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
        return;
      }
      const input = api.inventory.create.input.parse(req.body);
      const targetSite = await storage.resolveTargetSiteIdForCreate(input);
      if (!itemSiteAllowed(access, targetSite)) {
        forbidSiteRbac(req, res, { reason: "target_site", siteId: targetSite });
        return;
      }
      const item = await storage.createItem(input);
      const userId = getAuthUserId(req);
      storage
        .addHistoryRecord({ productId: item.id, companyId: item.companyId ?? null, transactionType: "CREATE", quantity: item.units, userId, remarks: item.name })
        .catch((err) => {
          console.error("History log failed (CREATE)", { productId: item.id, userId }, err);
          void emitOpsEvent({
            eventType: "job.history_write_failure",
            severity: "critical",
            endpoint: req.path,
            method: req.method,
            ip: getClientIp(req),
            userId: Number.isFinite(userId) ? userId : null,
            payload: { action: "CREATE", productId: item.id, error: err instanceof Error ? err.message : String(err) },
          });
        });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      const st = (err as Error & { status?: number }).status;
      if (st === 400) return res.status(400).json({ message: (err as Error).message });
      throw err;
    }
  });

  app.put(api.inventory.update.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    try {
      const access = await getSiteAccess(req);
      if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
        forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
        return;
      }
      const prevItem = await storage.getItem(Number(req.params.id));
      if (!prevItem) {
        return res.status(404).json({ message: "Item not found" });
      }
      if (!itemSiteAllowed(access, prevItem.siteId)) {
        forbidSiteRbac(req, res, { reason: "item_site", siteId: prevItem.siteId });
        return;
      }
      const input = api.inventory.update.input.parse(req.body);
      if (input.siteId != null && !itemSiteAllowed(access, input.siteId)) {
        forbidSiteRbac(req, res, { reason: "target_site", siteId: input.siteId });
        return;
      }
      const item = await storage.updateItem(Number(req.params.id), input);
      const userId = getAuthUserId(req);
      const qtyDelta = (input.units ?? prevItem?.units ?? item.units) - (prevItem?.units ?? 0);
      storage
        .addHistoryRecord({ productId: item.id, companyId: item.companyId ?? null, transactionType: "ADJUSTMENT", quantity: qtyDelta, userId, remarks: item.name })
        .catch((err) => {
          console.error("History log failed (ADJUSTMENT)", { productId: item.id, userId, qtyDelta }, err);
          void emitOpsEvent({
            eventType: "job.history_write_failure",
            severity: "critical",
            endpoint: req.path,
            method: req.method,
            ip: getClientIp(req),
            userId: Number.isFinite(userId) ? userId : null,
            payload: { action: "ADJUSTMENT", productId: item.id, qtyDelta, error: err instanceof Error ? err.message : String(err) },
          });
        });
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      const st = (err as Error & { status?: number }).status;
      if (st === 400) return res.status(400).json({ message: (err as Error).message });
      if (st === 404) return res.status(404).json({ message: (err as Error).message });
      throw err;
    }
  });

  app.delete(api.inventory.delete.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const item = await storage.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    const attachments = await storage.getAttachments(id);
    const userId = getAuthUserId(req);
    try {
      const { undoToken, undoExpiresAt } = await storage.deleteInventoryItemWithUndo({
        item,
        attachments,
        userId,
      });
      res.status(200).json({ deleted: 1, undoToken, undoExpiresAt: undoExpiresAt.toISOString() });
    } catch (err) {
      console.error("Delete inventory item failed", { productId: id, userId }, err);
      void emitOpsEvent({
        eventType: "job.history_write_failure",
        severity: "critical",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: Number.isFinite(userId) ? userId : null,
        payload: { action: "DELETE", productId: id, error: err instanceof Error ? err.message : String(err) },
      });
      return res.status(500).json({ message: "Delete failed" });
    }
  });

}

export function registerInventoryAttachmentRoutes(app: Express): void {
  app.get("/api/inventory/:id/documents", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const item = await storage.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    const list = await storage.getDocumentsByItemId(id);
    res.json(list);
  });

  app.get("/api/inventory/:id/attachments", requireAuth, async (req, res) => {
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const item = await storage.getItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    const attachments = await storage.getAttachments(Number(req.params.id));
    res.json(attachments);
  });

  app.delete("/api/inventory/:id/attachments/:attachmentId", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const itemId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);
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
    const deleted = await storage.deleteAttachmentForItem(itemId, attachmentId);
    if (!deleted) return res.status(404).json({ message: "Attachment not found" });
    const imgPath = resolveStoredFilePath(uploadsPath, deleted.imageUrl);
    if (!imgPath) {
      console.error("Refusing to unlink inventory attachment image outside uploadsPath", {
        itemId,
        attachmentId,
        imageUrl: deleted.imageUrl,
      });
    } else {
      try {
        const st = await fsPromises.stat(imgPath);
        if (st.isFile()) {
          await fsPromises.unlink(imgPath).catch((unlinkErr: NodeJS.ErrnoException) => {
            if (unlinkErr.code !== "ENOENT") throw unlinkErr;
          });
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== "ENOENT") {
          console.error("Failed to unlink inventory attachment image", { itemId, attachmentId, imgPath }, err);
        }
      }
    }
    if (item.imageUrl === deleted.imageUrl) {
      const remaining = await storage.getAttachments(itemId);
      const newPrimary = remaining[0]?.imageUrl ?? null;
      await db.update(inventoryItems).set({ imageUrl: newPrimary }).where(eq(inventoryItems.id, itemId));
    }
    res.status(204).send();
  });
}
