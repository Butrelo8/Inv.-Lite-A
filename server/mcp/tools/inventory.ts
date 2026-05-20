import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { api } from "@shared/routes";
import { db } from "../../db";
import { inventoryAssignments, inventoryHistory, inventoryItems } from "@shared/schema";
import { storage } from "../../storage";

const createItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  condition: z.string().min(1),
  code: z.string().optional(),
  serialNumber: z.string().optional(),
  size: z.string().optional(),
  units: z.number().int().min(0).optional(),
  purchaseDate: z.string().optional(),
  responsible: z.string().optional(),
  notes: z.string().optional(),
  companyId: z.number().int().positive().optional(),
  siteId: z.number().int().positive().optional(),
});

const updateItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  serialNumber: z.string().optional(),
  size: z.string().optional(),
  units: z.number().int().min(0).optional(),
  responsible: z.string().optional(),
  notes: z.string().optional(),
  companyId: z.number().int().positive().nullable().optional(),
});

function mcpJson(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function registerInventoryTools(server: any) {
  server.tool(
    "list_inventory",
    "Lista inventario con filtros opcionales",
    z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      condition: z.string().optional(),
      responsible: z.string().optional(),
      companyId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    async (input: any) => {
      const items = await storage.getItems(input.search, input.category, input.responsible, input.companyId);
      const filtered = input.condition ? items.filter((i) => i.condition === input.condition) : items;
      return mcpJson({ items: filtered.slice(0, input.limit) });
    },
  );

  server.tool("get_item", "Obtiene item por id o código", z.object({ id: z.number().int().positive().optional(), code: z.string().min(1).optional() }), async (input: any) => {
    if (!input.id && !input.code) return mcpJson({ error: "missing_identifier" });
    if (input.id) {
      const item = await storage.getItem(input.id);
      return item ? mcpJson({ item }) : mcpJson({ error: "not_found" });
    }
    const items = await storage.getItems(input.code);
    const item = items.find((i) => i.code === input.code);
    return item ? mcpJson({ item }) : mcpJson({ error: "not_found" });
  });

  server.tool("get_inventory_summary", "Resumen por categoría y condición", z.object({}), async () => {
    const items = await storage.getItems();
    const byCategoryMap = new Map<string, number>();
    const byConditionMap = new Map<string, number>();
    for (const item of items) {
      byCategoryMap.set(item.category ?? "Sin categoría", (byCategoryMap.get(item.category ?? "Sin categoría") ?? 0) + 1);
      byConditionMap.set(item.condition ?? "Sin condición", (byConditionMap.get(item.condition ?? "Sin condición") ?? 0) + 1);
    }
    return mcpJson({
      byCategory: Array.from(byCategoryMap.entries()).map(([category, count]) => ({ category, count })),
      byCondition: Array.from(byConditionMap.entries()).map(([condition, count]) => ({ condition, count })),
    });
  });

  server.tool("list_companies", "Lista compañías", z.object({}), async () => mcpJson({ companies: await storage.getCompanies() }));
  server.tool("list_employees", "Lista responsables distintos", z.object({}), async () => {
    const employees = (await storage.getResponsibleWithCounts()).map((r) => r.name);
    return mcpJson({ employees });
  });

  server.tool("create_item", "Crear nuevo item", createItemSchema, async (input: any) => mcpJson({ item: await storage.createItem(input) }));
  server.tool("update_item", "Actualizar item", updateItemSchema, async (input: any) => {
    const { id, ...updates } = input;
    const item = await storage.updateItem(id, updates);
    return mcpJson({ item });
  });

  server.tool("assign_item", "Asignar item", api.inventory.assign.input.extend({ id: z.number().int().positive() }), async (input: any) => {
    const parsed = api.inventory.assign.input.safeParse({ assignee: input.assignee, condition: input.condition, notes: input.notes, transfer: input.transfer });
    if (!parsed.success) return mcpJson({ error: "invalid_input", details: parsed.error.flatten() });
    const out = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.id));
      if (!item) return { error: "not_found" as const };
      const [active] = await tx.select().from(inventoryAssignments).where(and(eq(inventoryAssignments.itemId, input.id), isNull(inventoryAssignments.returnedAt))).limit(1);
      if (active && !parsed.data.transfer) return { error: "already_assigned" as const };
      if (active && parsed.data.transfer) {
        await tx.update(inventoryAssignments).set({ returnedAt: new Date(), returnNotes: "Transferido", returnedByUserId: null }).where(eq(inventoryAssignments.id, active.id));
        await tx.insert(inventoryHistory).values({ productId: input.id, companyId: item.companyId ?? null, transactionType: "TRANSFER", quantity: 0, userId: null, remarks: JSON.stringify({ kind: "TRANSFER", closedAssignmentId: active.id, fromAssignee: active.assignee, toAssignee: parsed.data.assignee }) });
      }
      const [assignment] = await tx.insert(inventoryAssignments).values({ itemId: input.id, assignee: parsed.data.assignee, conditionAtAssign: parsed.data.condition ?? null, notes: parsed.data.notes ?? null, assignedByUserId: null }).returning();
      await tx.update(inventoryItems).set({ responsible: parsed.data.assignee, updatedAt: new Date() }).where(eq(inventoryItems.id, input.id));
      const [updated] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.id));
      await tx.insert(inventoryHistory).values({ productId: input.id, companyId: item.companyId ?? null, transactionType: "ASSIGN", quantity: 0, userId: null, remarks: JSON.stringify({ kind: "ASSIGN", assignmentId: assignment.id, assignee: parsed.data.assignee, condition: parsed.data.condition ?? null, notes: parsed.data.notes ?? null }) });
      return { assignment, item: updated };
    });
    return mcpJson(out);
  });
  server.tool("return_item", "Regresar item", api.inventory.return.input.extend({ id: z.number().int().positive() }), async (input: any) => {
    const parsed = api.inventory.return.input.safeParse({ condition: input.condition, notes: input.notes });
    if (!parsed.success) return mcpJson({ error: "invalid_input", details: parsed.error.flatten() });
    const out = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.id));
      if (!item) return { error: "not_found" as const };
      const [active] = await tx.select().from(inventoryAssignments).where(and(eq(inventoryAssignments.itemId, input.id), isNull(inventoryAssignments.returnedAt))).limit(1);
      if (!active) return { error: "no_active_assignment" as const };
      const [assignment] = await tx.update(inventoryAssignments).set({ returnedAt: new Date(), returnCondition: parsed.data.condition ?? null, returnNotes: parsed.data.notes ?? null, returnedByUserId: null }).where(eq(inventoryAssignments.id, active.id)).returning();
      await tx.update(inventoryItems).set({ responsible: "Sin asignar", updatedAt: new Date() }).where(eq(inventoryItems.id, input.id));
      const [updated] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.id));
      await tx.insert(inventoryHistory).values({ productId: input.id, companyId: item.companyId ?? null, transactionType: "RETURN", quantity: 0, userId: null, remarks: JSON.stringify({ kind: "RETURN", assignmentId: active.id, returnCondition: parsed.data.condition ?? null, notes: parsed.data.notes ?? null }) });
      return { assignment, item: updated };
    });
    return mcpJson(out);
  });
}
