import type { Express } from "express";
import { eq } from "drizzle-orm";
import { api } from "@shared/routes";
import { maintenanceEvents, maintenanceSchedules } from "@shared/schema";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import { db } from "../db";
import { parseSiteIdQuery, requireInventoryListContext } from "../inventory-list-context";
import { requireAuth, requireRole } from "../route-middleware";
import {
  can,
  forbidSiteRbac,
  getSiteAccess,
  itemSiteAllowed,
} from "../site-rbac-access";
import { storage } from "../storage";

export function registerMaintenanceRoutes(app: Express): void {
  app.get(api.maintenance.schedulesList.path, requireAuth, async (req, res) => {
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
    const schedules = await storage.getMaintenanceSchedules(id);
    res.json({ schedules });
  });

  app.post(api.maintenance.scheduleCreate.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = api.maintenance.scheduleCreate.input.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
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

    const existingSchedules = await storage.getMaintenanceSchedules(id);
    if (existingSchedules.some((s) => s.active && s.scheduleType === parsed.data.scheduleType)) {
      return res.status(409).json({ message: `An active schedule of type '${parsed.data.scheduleType}' already exists.` });
    }

    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
    const nextDueAt = parsed.data.startDate; // Initially due on start date

    try {
      const [schedule] = await db.insert(maintenanceSchedules).values({
        itemId: id,
        scheduleType: parsed.data.scheduleType,
        title: parsed.data.title,
        intervalDays: parsed.data.intervalDays,
        startDate: parsed.data.startDate,
        nextDueAt,
        notes: parsed.data.notes,
        createdByUserId: userId,
      }).returning();

      await storage.addHistoryRecord({
        productId: id,
        companyId: item.companyId ?? null,
        transactionType: "MAINTENANCE_SCHEDULED",
        quantity: item.units,
        userId,
        remarks: JSON.stringify({ scheduleId: schedule.id, type: schedule.scheduleType, title: schedule.title }),
      });

      storage.enqueueWebhookEvent("maintenance.scheduled", { item, schedule }).catch((e) => console.error(e));

      res.status(201).json(schedule);
    } catch (e) {
      res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  app.get(api.maintenance.dueList.path, requireAuth, async (req, res) => {
    const overdue = req.query.overdue === "true";
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const schedules = await storage.getDueMaintenanceSchedules({
      overdue,
      siteId: ctx.siteId,
      restrictToSiteIds: ctx.restrictToSiteIds,
    });
    res.json({ schedules });
  });

  app.patch(api.maintenance.scheduleUpdate.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = api.maintenance.scheduleUpdate.input.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isFinite(scheduleId)) return res.status(400).json({ message: "Invalid id" });

    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const schedule = await storage.getMaintenanceScheduleById(scheduleId);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    const item = await storage.getItem(schedule.itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }

    const [updated] = await db
      .update(maintenanceSchedules)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceSchedules.id, scheduleId))
      .returning();

    if (!updated) return res.status(404).json({ message: "Schedule not found" });
    res.json(updated);
  });

  app.post(api.maintenance.scheduleComplete.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = api.maintenance.scheduleComplete.input.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isFinite(scheduleId)) return res.status(400).json({ message: "Invalid id" });

    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const schedule = await storage.getMaintenanceScheduleById(scheduleId);
    if (!schedule || !schedule.active) return res.status(404).json({ message: "Active schedule not found" });

    const item = await storage.getItem(schedule.itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }

    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;

    try {
      const result = await db.transaction(async (tx) => {
        const [event] = await tx
          .insert(maintenanceEvents)
          .values({
            scheduleId,
            performedAt: parsed.data.performedAt,
            conditionResult: parsed.data.conditionResult,
            notes: parsed.data.notes,
            evidenceUrl: parsed.data.evidenceUrl,
            completedByUserId: userId,
          })
          .returning();

        // Calculate next due date
        const performedDate = new Date(parsed.data.performedAt);
        const nextDueDate = new Date(performedDate.getTime() + schedule.intervalDays * 24 * 60 * 60 * 1000);
        const nextDueAt = nextDueDate.toISOString().split("T")[0]!;

        const [updatedSchedule] = await tx
          .update(maintenanceSchedules)
          .set({ nextDueAt, updatedAt: new Date() })
          .where(eq(maintenanceSchedules.id, scheduleId))
          .returning();

        return { event, schedule: updatedSchedule };
      });

      await storage.addHistoryRecord({
        productId: item.id,
        companyId: item.companyId ?? null,
        transactionType: "MAINTENANCE_COMPLETED",
        quantity: item.units,
        userId,
        remarks: JSON.stringify({ scheduleId, eventId: result.event.id, notes: result.event.notes }),
      });

      storage
        .enqueueWebhookEvent("maintenance.completed", { item, schedule: result.schedule, event: result.event })
        .catch((e) => console.error(e));

      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to complete schedule" });
    }
  });

  app.get(api.maintenance.eventsList.path, requireAuth, async (req, res) => {
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isFinite(scheduleId)) return res.status(400).json({ message: "Invalid id" });
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const schedule = await storage.getMaintenanceScheduleById(scheduleId);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    const item = await storage.getItem(schedule.itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!itemSiteAllowed(access, item.siteId)) {
      forbidSiteRbac(req, res, { reason: "item_site", siteId: item.siteId });
      return;
    }
    const events = await storage.getMaintenanceEvents(scheduleId);
    res.json({ events });
  });
}
