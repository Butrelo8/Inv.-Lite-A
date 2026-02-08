import { pgTable, text, serial, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(), // Artículo / Descripción
  serialNumber: text("serial_number"),
  size: text("size"),
  units: integer("units").notNull().default(0),
  condition: text("condition"), // Estado
  purchaseDate: date("purchase_date"), // Fecha de Compra
  responsible: text("responsible"),
  usefulLife: text("useful_life"),
  category: text("category"), // Added based on requirement for categories
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ 
  id: true 
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

export type CreateItemRequest = InsertInventoryItem;
export type UpdateItemRequest = Partial<InsertInventoryItem>;
