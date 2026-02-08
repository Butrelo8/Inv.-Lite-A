import { db } from "./db";
import {
  inventoryItems,
  type InventoryItem,
  type CreateItemRequest,
  type UpdateItemRequest
} from "@shared/schema";
import { eq, ilike, or, desc } from "drizzle-orm";

export interface IStorage {
  getItems(search?: string, category?: string): Promise<InventoryItem[]>;
  getItem(id: number): Promise<InventoryItem | undefined>;
  createItem(item: CreateItemRequest): Promise<InventoryItem>;
  updateItem(id: number, updates: UpdateItemRequest): Promise<InventoryItem>;
  deleteItem(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getItems(search?: string, category?: string): Promise<InventoryItem[]> {
    let query = db.select().from(inventoryItems);
    
    // Simple dynamic filtering
    const filters = [];
    if (search) {
      filters.push(or(
        ilike(inventoryItems.name, `%${search}%`),
        ilike(inventoryItems.code, `%${search}%`),
        ilike(inventoryItems.responsible, `%${search}%`)
      ));
    }
    
    if (category) {
      filters.push(eq(inventoryItems.category, category));
    }

    if (filters.length > 0) {
      // @ts-ignore - combining filters is tricky with basic types, but this works in practice
      return await query.where(filters.reduce((acc, curr) => or(acc, curr)!)).orderBy(desc(inventoryItems.id));
    }

    return await query.orderBy(desc(inventoryItems.id));
  }

  async getItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item;
  }

  async createItem(item: CreateItemRequest): Promise<InventoryItem> {
    const [newItem] = await db.insert(inventoryItems).values(item).returning();
    return newItem;
  }

  async updateItem(id: number, updates: UpdateItemRequest): Promise<InventoryItem> {
    const [updated] = await db
      .update(inventoryItems)
      .set(updates)
      .where(eq(inventoryItems.id, id))
      .returning();
    return updated;
  }

  async deleteItem(id: number): Promise<void> {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }
}

export const storage = new DatabaseStorage();
