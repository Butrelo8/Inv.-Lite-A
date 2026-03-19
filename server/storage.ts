import { db } from "./db";
import {
  inventoryItems,
  inventoryAttachments,
  inventoryHistory,
  employeeDocuments,
  sharedNotes,
  users,
  companies,
  type InventoryItem,
  type CreateItemRequest,
  type UpdateItemRequest,
  type InventoryHistoryEntry,
  type SharedNote,
  type User,
  type UpdateSharedNoteRequest,
  type EmployeeDocument,
} from "@shared/schema";
import { eq, ilike, or, desc, and, gte, lte, isNull, count, inArray } from "drizzle-orm";
import { suggestCode } from "./code-generator";

type SharedNoteWithAuthor = SharedNote & { authorUsername: string | null };

export interface IStorage {
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUsers(): Promise<{ id: number; username: string; role: string; createdAt: Date }[]>;
  updateUserRole(id: number, role: string): Promise<{ id: number; username: string; role: string } | undefined>;
  getItems(search?: string, category?: string, responsible?: string, companyId?: number, dateFrom?: string, dateTo?: string, addedAfter?: string, modifiedAfter?: string): Promise<InventoryItem[]>;
  getItemsPage(search?: string, category?: string, responsible?: string, companyId?: number, dateFrom?: string, dateTo?: string, addedAfter?: string, modifiedAfter?: string, limit?: number, offset?: number): Promise<{ items: InventoryItem[]; total: number }>;
  getFilterOptions(): Promise<{ categories: string[]; responsible: string[]; companies: { id: number; name: string }[] }>;
  getCompanies(): Promise<{ id: number; name: string }[]>;
  createCompany(name: string): Promise<{ id: number; name: string }>;
  updateCompany(id: number, name: string): Promise<{ id: number; name: string } | undefined>;
  deleteCompany(id: number): Promise<boolean>;
  getSharedNotes(itemId?: number): Promise<SharedNoteWithAuthor[]>;
  createSharedNote(record: { title: string; content: string; authorId: number; itemId: number }): Promise<SharedNoteWithAuthor>;
  updateSharedNote(id: number, updates: UpdateSharedNoteRequest): Promise<SharedNoteWithAuthor | undefined>;
  deleteSharedNote(id: number): Promise<SharedNoteWithAuthor | undefined>;
  getResponsibleWithCounts(): Promise<{ name: string; count: number }[]>;
  getItem(id: number): Promise<InventoryItem | undefined>;
  getItemsByIds(ids: number[]): Promise<InventoryItem[]>;
  createItem(item: CreateItemRequest): Promise<InventoryItem>;
  updateItem(id: number, updates: UpdateItemRequest): Promise<InventoryItem>;
  deleteItem(id: number): Promise<void>;
  getAttachments(itemId: number): Promise<{ id: number; imageUrl: string }[]>;
  addAttachment(itemId: number, imageUrl: string): Promise<{ id: number; imageUrl: string }>;
  deleteAttachment(attachmentId: number): Promise<{ imageUrl: string } | undefined>;
  deleteAttachmentForItem(itemId: number, attachmentId: number): Promise<{ imageUrl: string } | undefined>;
  addHistoryRecord(record: {
    productId: number | null;
    companyId?: number | null;
    transactionType: string;
    quantity: number;
    userId?: number | null;
    remarks?: string | null;
  }): Promise<InventoryHistoryEntry>;
  getHistory(limit?: number, offset?: number, productId?: number, filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }): Promise<(InventoryHistoryEntry & { productCode?: string | null; productName?: string | null; userName?: string | null; companyName?: string | null })[]>;
  getHistoryCount(productId?: number, filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }): Promise<number>;
  getHistoryUsers(): Promise<{ userId: number; userName: string }[]>;
  getEmployeeDocuments(responsible?: string, documentType?: string): Promise<EmployeeDocument[]>;
  getDocumentsByItemId(itemId: number): Promise<EmployeeDocument[]>;
  getDocumentVersions(responsible: string, documentType: string): Promise<EmployeeDocument[]>;
  getResponsiblesWithoutDocumentType(documentType: string, options?: { expiresBefore?: string }): Promise<{ responsiblesWithout: string[]; responsiblesWithExpired: string[] }>;
  addEmployeeDocument(record: { responsible?: string | null; itemId?: number | null; fileUrl: string; originalName: string; mimeType?: string | null; documentType?: string | null; expiresAt?: string | null; userId?: number | null }): Promise<EmployeeDocument>;
  deleteEmployeeDocument(id: number): Promise<{ fileUrl: string } | undefined>;
  updateEmployeeDocument(id: number, updates: { itemId?: number | null; documentType?: string | null; expiresAt?: string | null }): Promise<EmployeeDocument | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUsers(): Promise<{ id: number; username: string; role: string; createdAt: Date }[]> {
    return db
      .select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(users.username);
  }

  async updateUserRole(id: number, role: string): Promise<{ id: number; username: string; role: string } | undefined> {
    const [row] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning({ id: users.id, username: users.username, role: users.role });
    return row;
  }

  private buildItemConditions(search?: string, category?: string, responsible?: string, companyId?: number, dateFrom?: string, dateTo?: string, addedAfter?: string, modifiedAfter?: string): Parameters<typeof and>[0][] {
    const conditions: Parameters<typeof and>[0][] = [];
    if (search) {
      conditions.push(or(
        ilike(inventoryItems.name, `%${search}%`),
        ilike(inventoryItems.code, `%${search}%`),
        ilike(inventoryItems.category, `%${search}%`),
        ilike(inventoryItems.responsible, `%${search}%`)
      )!);
    }
    if (category) conditions.push(eq(inventoryItems.category, category));
    if (responsible) {
      if (responsible === "Equipo de trabajo") {
        conditions.push(or(
          isNull(inventoryItems.responsible),
          eq(inventoryItems.responsible, ""),
          eq(inventoryItems.responsible, "Equipo de trabajo")
        )!);
      } else {
        conditions.push(eq(inventoryItems.responsible, responsible));
      }
    }
    if (companyId != null) conditions.push(eq(inventoryItems.companyId, companyId));
    if (dateFrom) conditions.push(gte(inventoryItems.purchaseDate, dateFrom));
    if (dateTo) conditions.push(lte(inventoryItems.purchaseDate, dateTo));
    if (addedAfter) conditions.push(gte(inventoryItems.createdAt, new Date(addedAfter + "T00:00:00.000Z")));
    if (modifiedAfter) conditions.push(gte(inventoryItems.updatedAt, new Date(modifiedAfter + "T00:00:00.000Z")));
    return conditions;
  }

  async getItems(search?: string, category?: string, responsible?: string, companyId?: number, dateFrom?: string, dateTo?: string, addedAfter?: string, modifiedAfter?: string): Promise<InventoryItem[]> {
    const conditions = this.buildItemConditions(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const query = db.select().from(inventoryItems).orderBy(desc(inventoryItems.id));
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async getItemsPage(search?: string, category?: string, responsible?: string, companyId?: number, dateFrom?: string, dateTo?: string, addedAfter?: string, modifiedAfter?: string, limit = 50, offset = 0): Promise<{ items: InventoryItem[]; total: number }> {
    const conditions = this.buildItemConditions(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const baseQuery = db.select().from(inventoryItems).orderBy(desc(inventoryItems.id));
    const countQuery = db.select({ count: count() }).from(inventoryItems);
    const withWhere = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult, items] = await Promise.all([
      withWhere ? countQuery.where(withWhere) : countQuery,
      withWhere ? baseQuery.where(withWhere).limit(limit).offset(offset) : baseQuery.limit(limit).offset(offset),
    ]);
    const total = Number((countResult as { count: number }[])[0]?.count ?? 0);
    return { items: items as InventoryItem[], total };
  }

  async getFilterOptions(): Promise<{ categories: string[]; responsible: string[]; companies: { id: number; name: string }[] }> {
    const items = await db.select({ category: inventoryItems.category, responsible: inventoryItems.responsible }).from(inventoryItems);
    const categories = Array.from(new Set(items.map((r) => r.category).filter(Boolean))).sort() as string[];
    const respSet = new Set<string>();
    for (const r of items) {
      const val = r.responsible?.trim() || "Equipo de trabajo";
      if (val) respSet.add(val);
    }
    const responsible = Array.from(respSet).sort();
    const companyList = await db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(companies.name);
    return { categories, responsible, companies: companyList };
  }

  async getCompanies(): Promise<{ id: number; name: string }[]> {
    return await db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(companies.name);
  }

  async createCompany(name: string): Promise<{ id: number; name: string }> {
    const [row] = await db.insert(companies).values({ name: name.trim() }).returning({ id: companies.id, name: companies.name });
    return row!;
  }

  async updateCompany(id: number, name: string): Promise<{ id: number; name: string } | undefined> {
    const [row] = await db.update(companies).set({ name: name.trim() }).where(eq(companies.id, id)).returning({ id: companies.id, name: companies.name });
    return row;
  }

  async deleteCompany(id: number): Promise<boolean> {
    const [row] = await db.delete(companies).where(eq(companies.id, id)).returning({ id: companies.id });
    return !!row;
  }

  async getSharedNotes(itemId?: number): Promise<SharedNoteWithAuthor[]> {
    const base = db
      .select({
        id: sharedNotes.id,
        title: sharedNotes.title,
        content: sharedNotes.content,
        itemId: sharedNotes.itemId,
        authorId: sharedNotes.authorId,
        createdAt: sharedNotes.createdAt,
        updatedAt: sharedNotes.updatedAt,
        authorUsername: users.username,
      })
      .from(sharedNotes)
      .leftJoin(users, eq(sharedNotes.authorId, users.id));

    if (itemId != null) {
      return await base.where(eq(sharedNotes.itemId, itemId)).orderBy(desc(sharedNotes.createdAt));
    }
    return await base.orderBy(desc(sharedNotes.createdAt));
  }

  async createSharedNote(record: { title: string; content: string; authorId: number; itemId: number }): Promise<SharedNoteWithAuthor> {
    const [row] = await db
      .insert(sharedNotes)
      .values({ title: record.title, content: record.content, authorId: record.authorId, itemId: record.itemId })
      .returning();
    if (!row) throw new Error("Failed to insert shared note");

    const authorId = row.authorId;
    const [author] = authorId != null ? await db.select({ authorUsername: users.username }).from(users).where(eq(users.id, authorId)) : [undefined];

    return { ...row, authorUsername: author?.authorUsername ?? null };
  }

  async updateSharedNote(id: number, updates: UpdateSharedNoteRequest): Promise<SharedNoteWithAuthor | undefined> {
    const set: { title?: string; content?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (updates.title !== undefined) set.title = updates.title;
    if (updates.content !== undefined) set.content = updates.content;

    const [row] = await db
      .update(sharedNotes)
      .set(set)
      .where(eq(sharedNotes.id, id))
      .returning();

    if (!row) return undefined;

    const authorId = row.authorId;
    const [author] = authorId != null ? await db.select({ authorUsername: users.username }).from(users).where(eq(users.id, authorId)) : [undefined];
    return { ...row, authorUsername: author?.authorUsername ?? null };
  }

  async deleteSharedNote(id: number): Promise<SharedNoteWithAuthor | undefined> {
    const [row] = await db.delete(sharedNotes).where(eq(sharedNotes.id, id)).returning();
    if (!row) return undefined;

    const authorId = row.authorId;
    const [author] = authorId != null ? await db.select({ authorUsername: users.username }).from(users).where(eq(users.id, authorId)) : [undefined];
    return { ...row, authorUsername: author?.authorUsername ?? null };
  }

  async getResponsibleWithCounts(): Promise<{ name: string; count: number }[]> {
    const rows = await db.select({ responsible: inventoryItems.responsible }).from(inventoryItems);
    const map = new Map<string, number>();
    for (const r of rows) {
      const name = r.responsible?.trim() || "Equipo de trabajo";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item;
  }

  async getItemsByIds(ids: number[]): Promise<InventoryItem[]> {
    if (ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids));
    const rows = await db.select().from(inventoryItems).where(inArray(inventoryItems.id, uniqueIds));
    const order = new Map(uniqueIds.map((id, i) => [id, i]));
    return (rows as InventoryItem[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async createItem(item: CreateItemRequest): Promise<InventoryItem> {
    let code = item.code?.trim();
    if (!code) {
      code = await suggestCode(item.category, item.name);
    }
    const toInsert = { ...item, code };
    const [newItem] = await db.insert(inventoryItems).values(toInsert).returning();
    return newItem;
  }

  async updateItem(id: number, updates: UpdateItemRequest): Promise<InventoryItem> {
    const [updated] = await db
      .update(inventoryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return updated;
  }

  async deleteItem(id: number): Promise<void> {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }

  async getAttachments(itemId: number): Promise<{ id: number; imageUrl: string }[]> {
    return await db
      .select({ id: inventoryAttachments.id, imageUrl: inventoryAttachments.imageUrl })
      .from(inventoryAttachments)
      .where(eq(inventoryAttachments.itemId, itemId));
  }

  async addAttachment(itemId: number, imageUrl: string): Promise<{ id: number; imageUrl: string }> {
    const [row] = await db.insert(inventoryAttachments).values({ itemId, imageUrl }).returning();
    return row!;
  }

  async deleteAttachment(attachmentId: number): Promise<{ imageUrl: string } | undefined> {
    const [row] = await db
      .delete(inventoryAttachments)
      .where(eq(inventoryAttachments.id, attachmentId))
      .returning({ imageUrl: inventoryAttachments.imageUrl });
    return row;
  }

  async deleteAttachmentForItem(itemId: number, attachmentId: number): Promise<{ imageUrl: string } | undefined> {
    const [row] = await db
      .delete(inventoryAttachments)
      .where(and(eq(inventoryAttachments.id, attachmentId), eq(inventoryAttachments.itemId, itemId)))
      .returning({ imageUrl: inventoryAttachments.imageUrl });
    return row;
  }

  async addHistoryRecord(record: {
    productId: number | null;
    companyId?: number | null;
    transactionType: string;
    quantity: number;
    userId?: number | null;
    remarks?: string | null;
  }): Promise<InventoryHistoryEntry> {
    const [row] = await db.insert(inventoryHistory).values(record).returning();
    return row!;
  }

  private buildHistoryConditions(
    productId?: number,
    filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }
  ): Parameters<typeof and>[0][] {
    const conditions: Parameters<typeof and>[0][] = [];
    if (productId != null) conditions.push(eq(inventoryHistory.productId, productId));
    if (filters?.transactionType) conditions.push(eq(inventoryHistory.transactionType, filters.transactionType));
    if (filters?.userId != null) conditions.push(eq(inventoryHistory.userId, filters.userId));
    if (filters?.dateFrom) conditions.push(gte(inventoryHistory.createdAt, new Date(filters.dateFrom + "T00:00:00.000Z")));
    if (filters?.dateTo) conditions.push(lte(inventoryHistory.createdAt, new Date(filters.dateTo + "T23:59:59.999Z")));
    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(or(ilike(inventoryItems.code, term), ilike(inventoryItems.name, term))!);
    }
    return conditions;
  }

  async getHistory(
    limit = 200,
    offset = 0,
    productId?: number,
    filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }
  ): Promise<(InventoryHistoryEntry & { productCode?: string | null; productName?: string | null; userName?: string | null; companyName?: string | null })[]> {
    const conditions = this.buildHistoryConditions(productId, filters);
    const q = db
      .select({
        id: inventoryHistory.id,
        productId: inventoryHistory.productId,
        companyId: inventoryHistory.companyId,
        transactionType: inventoryHistory.transactionType,
        quantity: inventoryHistory.quantity,
        userId: inventoryHistory.userId,
        createdAt: inventoryHistory.createdAt,
        remarks: inventoryHistory.remarks,
        productCode: inventoryItems.code,
        productName: inventoryItems.name,
        userName: users.username,
        companyName: companies.name,
      })
      .from(inventoryHistory)
      .leftJoin(inventoryItems, eq(inventoryHistory.productId, inventoryItems.id))
      .leftJoin(users, eq(inventoryHistory.userId, users.id))
      .leftJoin(companies, eq(inventoryHistory.companyId, companies.id))
      .orderBy(desc(inventoryHistory.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = conditions.length > 0 ? await q.where(and(...conditions)) : await q;
    return rows;
  }

  async getHistoryCount(
    productId?: number,
    filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }
  ): Promise<number> {
    const conditions = this.buildHistoryConditions(productId, filters);
    const base = db
      .select({ count: count() })
      .from(inventoryHistory)
      .leftJoin(inventoryItems, eq(inventoryHistory.productId, inventoryItems.id));
    const q = conditions.length > 0 ? base.where(and(...conditions)) : base;
    const rows = await q;
    return Number((rows as { count: number }[])[0]?.count ?? 0);
  }

  async getHistoryUsers(): Promise<{ userId: number; userName: string }[]> {
    const rows = await db
      .selectDistinct({ userId: inventoryHistory.userId, userName: users.username })
      .from(inventoryHistory)
      .innerJoin(users, eq(inventoryHistory.userId, users.id));
    return rows.filter((r) => r.userId != null && r.userName != null) as { userId: number; userName: string }[];
  }

  async getEmployeeDocuments(responsible?: string, documentType?: string): Promise<EmployeeDocument[]> {
    const conditions: Parameters<typeof and>[0][] = [];
    if (responsible !== undefined && responsible !== "") {
      conditions.push(eq(employeeDocuments.responsible, responsible));
    }
    if (documentType !== undefined && documentType !== "") {
      conditions.push(eq(employeeDocuments.documentType, documentType));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const query = db.select().from(employeeDocuments).orderBy(desc(employeeDocuments.createdAt));
    return whereClause ? query.where(whereClause) : query;
  }

  async getDocumentVersions(responsible: string, documentType: string): Promise<EmployeeDocument[]> {
    return await db
      .select()
      .from(employeeDocuments)
      .where(and(eq(employeeDocuments.responsible, responsible), eq(employeeDocuments.documentType, documentType)))
      .orderBy(desc(employeeDocuments.createdAt));
  }

  async getResponsiblesWithoutDocumentType(documentType: string, options?: { expiresBefore?: string }): Promise<{ responsiblesWithout: string[]; responsiblesWithExpired: string[] }> {
    const allResponsibles = (await this.getResponsibleWithCounts()).map((r) => r.name);
    const docsOfType = await this.getEmployeeDocuments(undefined, documentType);
    const byResponsible = new Map<string, EmployeeDocument[]>();
    for (const doc of docsOfType) {
      const r = doc.responsible ?? "";
      if (!byResponsible.has(r)) byResponsible.set(r, []);
      byResponsible.get(r)!.push(doc);
    }
    const responsiblesWithout = allResponsibles.filter((r) => !byResponsible.has(r) || byResponsible.get(r)!.length === 0);
    const responsiblesWithExpired: string[] = [];
    if (options?.expiresBefore) {
      const expiresBefore = options.expiresBefore;
      byResponsible.forEach((docs, r) => {
        const latest = docs[0];
        if (latest?.expiresAt && latest.expiresAt < expiresBefore) {
          responsiblesWithExpired.push(r);
        }
      });
    }
    return { responsiblesWithout, responsiblesWithExpired };
  }

  async getDocumentsByItemId(itemId: number): Promise<EmployeeDocument[]> {
    return await db
      .select()
      .from(employeeDocuments)
      .where(eq(employeeDocuments.itemId, itemId))
      .orderBy(desc(employeeDocuments.createdAt));
  }

  async addEmployeeDocument(record: {
    responsible?: string | null;
    itemId?: number | null;
    fileUrl: string;
    originalName: string;
    mimeType?: string | null;
    documentType?: string | null;
    expiresAt?: string | null;
    userId?: number | null;
  }): Promise<EmployeeDocument> {
    const [row] = await db.insert(employeeDocuments).values(record).returning();
    return row!;
  }

  async deleteEmployeeDocument(id: number): Promise<{ fileUrl: string } | undefined> {
    const [row] = await db
      .delete(employeeDocuments)
      .where(eq(employeeDocuments.id, id))
      .returning({ fileUrl: employeeDocuments.fileUrl });
    return row;
  }

  async updateEmployeeDocument(id: number, updates: { itemId?: number | null; documentType?: string | null; expiresAt?: string | null }): Promise<EmployeeDocument | undefined> {
    const [row] = await db
      .update(employeeDocuments)
      .set(updates)
      .where(eq(employeeDocuments.id, id))
      .returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
