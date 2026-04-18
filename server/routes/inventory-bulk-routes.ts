import type { Express } from "express";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { inventoryItems } from "@shared/schema";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { db, pool } from "../db";
import { insertInventoryHistoryBulk } from "../inventory-bulk-helpers";
import {
  BULK_UNDO_WINDOW_MIN,
  buildDeleteHistoryRemarks,
  buildUndoToken,
} from "../inventory-bulk-undo-helpers";
import { restoreDeleteUndoByToken } from "../inventory-bulk-undo";
import { getAuthUserId, requireAuth, requireRole } from "../route-middleware";
import {
  can,
  forbidSiteRbac,
  getSiteAccess,
  itemSiteAllowed,
} from "../site-rbac-access";
import { storage } from "../storage";

const bulkUpdateSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  updates: z
    .object({
      condition: z.string().trim().min(1).max(80).optional(),
      responsible: z.string().trim().max(120).nullable().optional(),
    })
    .refine((v) => v.condition !== undefined || v.responsible !== undefined, { message: "No updates provided" }),
  reason: z.string().trim().max(240).optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  reason: z.string().trim().max(240).optional(),
});

const bulkArchiveSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  reason: z.string().trim().max(240).optional(),
});

function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

export function registerInventoryBulkRoutes(app: Express): void {
  app.post("/api/inventory/bulk/update", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = bulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const ids = uniqueIds(parsed.data.ids);
    const userId = getAuthUserId(req);
    const existing = await storage.getItemsByIds(ids);
    for (const it of existing) {
      if (!itemSiteAllowed(access, it.siteId)) {
        forbidSiteRbac(req, res, { reason: "item_site", siteId: it.siteId });
        return;
      }
    }
    const existingById = new Map(existing.map((i) => [i.id, i]));
    const missing = ids.filter((id) => !existingById.has(id));
    const idList = existing.map((i) => i.id);
    if (idList.length === 0) {
      return res.json({ updated: 0, missing });
    }

    const setPatch: { updatedAt: Date; condition?: string; responsible?: string | null } = {
      updatedAt: new Date(),
    };
    if (parsed.data.updates.condition !== undefined) setPatch.condition = parsed.data.updates.condition;
    if (parsed.data.updates.responsible !== undefined) setPatch.responsible = parsed.data.updates.responsible;

    try {
      await db.transaction(async (tx) => {
        const rowsBefore = await tx.select().from(inventoryItems).where(inArray(inventoryItems.id, idList));
        const activeIds = rowsBefore.map((r) => r.id);
        if (activeIds.length === 0) return;

        const beforeById = new Map(rowsBefore.map((r) => [r.id, r]));
        const updatedRows = await tx
          .update(inventoryItems)
          .set(setPatch)
          .where(inArray(inventoryItems.id, activeIds))
          .returning();
        const afterById = new Map(updatedRows.map((r) => [r.id, r]));

        const historyRows = activeIds.map((id) => {
          const before = beforeById.get(id)!;
          const after = afterById.get(id)!;
          const remarks = `BULK_UPDATE: ${before.name}${parsed.data.reason ? ` (${parsed.data.reason})` : ""}`;
          const qtyDelta = (after.units ?? 0) - (before.units ?? 0);
          return {
            productId: id,
            companyId: after.companyId ?? before.companyId ?? null,
            transactionType: "ADJUSTMENT",
            quantity: qtyDelta,
            userId,
            remarks,
          };
        });

        await insertInventoryHistoryBulk(tx, historyRows);
      });
    } catch (err) {
      console.error("Bulk update transaction failed", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Bulk update failed" });
    }

    return res.json({ updated: existing.length, missing });
  });

  app.post("/api/inventory/bulk/archive", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = bulkArchiveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const deduped = uniqueIds(parsed.data.ids);
    const existing = await storage.getItemsByIds(deduped);
    for (const it of existing) {
      if (!itemSiteAllowed(access, it.siteId)) {
        forbidSiteRbac(req, res, { reason: "item_site", siteId: it.siteId });
        return;
      }
    }
    const existingById = new Map(existing.map((i) => [i.id, i]));
    const missing = deduped.filter((id) => !existingById.has(id));
    const userId = getAuthUserId(req);
    const idList = existing.map((i) => i.id);
    if (idList.length === 0) {
      return res.json({ archived: 0, missing });
    }

    try {
      await db.transaction(async (tx) => {
        const rowsBefore = await tx.select().from(inventoryItems).where(inArray(inventoryItems.id, idList));
        const activeIds = rowsBefore.map((r) => r.id);
        if (activeIds.length === 0) return;

        const beforeById = new Map(rowsBefore.map((r) => [r.id, r]));
        const updatedRows = await tx
          .update(inventoryItems)
          .set({ condition: "Archived", updatedAt: new Date() })
          .where(inArray(inventoryItems.id, activeIds))
          .returning();
        const afterById = new Map(updatedRows.map((r) => [r.id, r]));

        const historyRows = activeIds.map((id) => {
          const before = beforeById.get(id)!;
          const after = afterById.get(id)!;
          return {
            productId: id,
            companyId: after.companyId ?? before.companyId ?? null,
            transactionType: "ADJUSTMENT",
            quantity: 0,
            userId,
            remarks: `BULK_ARCHIVE: ${before.name}${parsed.data.reason ? ` (${parsed.data.reason})` : ""}`,
          };
        });

        await insertInventoryHistoryBulk(tx, historyRows);
      });
    } catch (err) {
      console.error("Bulk archive transaction failed", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Bulk archive failed" });
    }

    return res.json({ archived: existing.length, missing });
  });

  app.post("/api/inventory/bulk/delete", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const ids = uniqueIds(parsed.data.ids);
    const userId = getAuthUserId(req);
    const preItems = await storage.getItemsByIds(ids);
    for (const it of preItems) {
      if (!itemSiteAllowed(access, it.siteId)) {
        forbidSiteRbac(req, res, { reason: "item_site", siteId: it.siteId });
        return;
      }
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      const itemsRes = await client.query("select * from inventory_items where id = any($1::int[])", [ids]);
      const items = itemsRes.rows as Array<Record<string, unknown> & { id: number; name?: string; units?: number; company_id?: number | null }>;
      const foundIds = new Set(items.map((i) => Number(i.id)));
      const missing = ids.filter((id) => !foundIds.has(id));
      if (items.length === 0) {
        await client.query("rollback");
        return res.json({ deleted: 0, missing, undoToken: null, undoExpiresAt: null });
      }
      const attachmentsRes = await client.query("select * from inventory_attachments where item_id = any($1::int[])", [items.map((i) => Number(i.id))]);
      const undoToken = buildUndoToken();
      const undoExpiresAt = new Date(Date.now() + BULK_UNDO_WINDOW_MIN * 60_000);
      const payload = {
        items,
        attachments: attachmentsRes.rows,
        deletedIds: items.map((i) => Number(i.id)),
      };
      await client.query(
        `insert into inventory_bulk_undo (token, action_type, payload, expires_at, created_by_user_id)
         values ($1, $2, $3::jsonb, $4, $5)`,
        [undoToken, "bulk_delete", JSON.stringify(payload), undoExpiresAt.toISOString(), userId],
      );
      await client.query("delete from inventory_items where id = any($1::int[])", [items.map((i) => Number(i.id))]);
      await client.query("commit");

      for (const item of items) {
        storage
          .addHistoryRecord({
            productId: Number(item.id),
            companyId: Number.isFinite(Number(item.company_id)) ? Number(item.company_id) : null,
            transactionType: "DELETE",
            quantity: Number(item.units ?? 0),
            userId,
            remarks: buildDeleteHistoryRemarks("BULK_DELETE", String(item.name ?? `Item #${item.id}`), undoToken, parsed.data.reason),
          })
          .catch(() => undefined);
      }

      return res.json({
        deleted: items.length,
        missing,
        undoToken,
        undoExpiresAt: undoExpiresAt.toISOString(),
      });
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Bulk delete failed" });
    } finally {
      client.release();
    }
  });

  app.post("/api/inventory/bulk/undo", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const undoToken = typeof (req.body as { undoToken?: unknown })?.undoToken === "string"
      ? (req.body as { undoToken: string }).undoToken.trim()
      : "";
    if (!undoToken) return res.status(400).json({ message: "undoToken is required" });
    const userId = getAuthUserId(req);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await restoreDeleteUndoByToken(client, undoToken, userId);
      if (result.status !== 200) {
        await client.query("rollback");
        return res.status(result.status).json({ message: result.message });
      }
      await client.query("commit");
      return res.json({ restored: result.restored });
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Undo failed" });
    } finally {
      client.release();
    }
  });
}
