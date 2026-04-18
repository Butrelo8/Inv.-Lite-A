import { randomUUID } from "crypto";
import { db } from "./db";
import {
  inventoryItems,
  inventoryAttachments,
  inventoryHistory,
  inventoryAssignments,
  employeeDocuments,
  sharedNotes,
  users,
  companies,
  sites,
  maintenanceSchedules,
  maintenanceEvents,
  inventoryBulkUndo,
  type InventoryItem,
  type CreateItemRequest,
  type UpdateItemRequest,
  type InventoryHistoryEntry,
  type InventoryAssignment,
  type SharedNote,
  type User,
  type UpdateSharedNoteRequest,
  type EmployeeDocument,
  opsEvents,
  webhookEndpoints,
  webhookOutbox,
  type WebhookEndpoint,
  type WebhookEndpointPublic,
  type MaintenanceSchedule,
  type MaintenanceEvent,
  type Site,
  roleTemplates,
  userSiteRoles,
  type RoleTemplate,
} from "@shared/schema";
import type { OpsEventSeverity, OpsEventType, OpsSummaryResponse } from "@shared/ops-health";
import type { ExecutiveSummaryAssetHealth } from "@shared/executive-summary";
import { eq, or, desc, asc, and, gte, lte, isNull, isNotNull, count, inArray, sql, gt, ne, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { pool } from "./db";
import { httpStatusError } from "./http-status-error";
import { BULK_UNDO_WINDOW_MIN, buildDeleteHistoryRemarks, buildUndoToken } from "./inventory-bulk-undo-helpers";
import { insertInventoryHistoryBulk, type InventoryHistoryInsertRow } from "./inventory-bulk-helpers";
import { ilikeContainsPattern } from "./sql-like-escape";
import { suggestCode } from "./code-generator";
import { isSiteScopingEnabled } from "./site-config";
import { redactWebhookEndpointSecret, redactWebhookEndpointSecrets } from "./webhook-endpoint-public";
import { getCachedOpsSummary } from "./ops-summary-cache";

/** Admin PATCH fields + `updatedAt` for `db.update(webhookEndpoints).set(...)`. */
type WebhookEndpointUpdateSet = Partial<
  Pick<typeof webhookEndpoints.$inferInsert, "url" | "secret" | "eventTypes" | "enabled">
> & { updatedAt: Date };

function badRequest(message: string): never {
  const e = new Error(message) as Error & { status: number };
  e.status = 400;
  throw e;
}

/** Substring ILIKE with `%` / `_` in user input treated literally (`ESCAPE '\\'`). */
function columnIlikeContains(column: PgColumn, rawSearch: string): SQL {
  const pattern = ilikeContainsPattern(rawSearch);
  return sql`${column} ILIKE ${pattern} ESCAPE '\\'`;
}

/** Display label for `inventory_items.responsible` (trim + empty/null → "Equipo de trabajo"). */
const inventoryResponsibleDisplaySql = sql`coalesce(nullif(btrim(${inventoryItems.responsible}), ''), 'Equipo de trabajo')`;

type SharedNoteWithAuthor = SharedNote & { authorUsername: string | null };

export interface ComplianceQueueEntry {
  responsible: string;
  documentType: string;
  bucket: "missing" | "dueSoon" | "overdue" | "critical";
  documentId: number | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
}

export interface ComplianceQueuesResponse {
  entries: ComplianceQueueEntry[];
  counts: { missing: number; dueSoon: number; overdue: number; critical: number };
  thresholds: { dueSoonDays: number; criticalOverdueDays: number };
  trackedDocumentTypes: string[];
  asOf: string;
}

export interface IStorage {
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUsers(): Promise<{ id: number; username: string; role: string; createdAt: Date }[]>;
  updateUserRole(id: number, role: string): Promise<{ id: number; username: string; role: string } | undefined>;
  getItems(
    search?: string,
    category?: string,
    responsible?: string,
    companyId?: number,
    siteId?: number,
    dateFrom?: string,
    dateTo?: string,
    addedAfter?: string,
    modifiedAfter?: string,
    restrictToSiteIds?: number[],
  ): Promise<InventoryItem[]>;
  getItemsPage(
    search?: string,
    category?: string,
    responsible?: string,
    companyId?: number,
    siteId?: number,
    dateFrom?: string,
    dateTo?: string,
    addedAfter?: string,
    modifiedAfter?: string,
    limit?: number,
    offset?: number,
    restrictToSiteIds?: number[],
  ): Promise<{ items: InventoryItem[]; total: number; activeAssignmentItemIds: number[] }>;
  getActiveAssignment(itemId: number): Promise<InventoryAssignment | undefined>;
  getAssignments(itemId: number): Promise<
    (InventoryAssignment & { assignedByUsername: string | null; returnedByUsername: string | null })[]
  >;
  getFilterOptions(
    siteId?: number,
    restrictToSiteIds?: number[],
  ): Promise<{ categories: string[]; responsible: string[]; companies: { id: number; name: string }[] }>;
  getSites(): Promise<Site[]>;
  getCompanies(): Promise<{ id: number; name: string }[]>;
  createCompany(name: string): Promise<{ id: number; name: string }>;
  updateCompany(id: number, name: string): Promise<{ id: number; name: string } | undefined>;
  deleteCompany(id: number): Promise<boolean>;
  getSharedNotes(itemId?: number, restrictToSiteIds?: number[]): Promise<SharedNoteWithAuthor[]>;
  createSharedNote(record: { title: string; content: string; authorId: number; itemId: number }): Promise<SharedNoteWithAuthor>;
  updateSharedNote(id: number, updates: UpdateSharedNoteRequest): Promise<SharedNoteWithAuthor | undefined>;
  deleteSharedNote(id: number): Promise<SharedNoteWithAuthor | undefined>;
  getResponsibleWithCounts(): Promise<{ name: string; count: number }[]>;
  /** Resolved site id for a new item (default site when scoping off). */
  resolveTargetSiteIdForCreate(body: { siteId?: number }): Promise<number>;
  getItem(id: number): Promise<InventoryItem | undefined>;
  getItemsByIds(ids: number[], restrictToSiteIds?: number[]): Promise<InventoryItem[]>;
  createItem(item: CreateItemRequest): Promise<InventoryItem>;
  updateItem(id: number, updates: UpdateItemRequest): Promise<InventoryItem>;
  deleteInventoryItemWithUndo(params: {
    item: InventoryItem;
    attachments: { id: number; imageUrl: string }[];
    userId: number | null;
  }): Promise<{ undoToken: string; undoExpiresAt: Date }>;
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
  addHistoryRecordsBulk(records: InventoryHistoryInsertRow[]): Promise<void>;
  getHistory(limit?: number, offset?: number, productId?: number, filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }): Promise<(InventoryHistoryEntry & { productCode?: string | null; productName?: string | null; userName?: string | null; companyName?: string | null })[]>;
  getHistoryCount(productId?: number, filters?: { transactionType?: string; userId?: number; dateFrom?: string; dateTo?: string; search?: string }): Promise<number>;
  getHistoryUsers(): Promise<{ userId: number; userName: string }[]>;
  getEmployeeDocuments(responsible?: string, documentType?: string): Promise<EmployeeDocument[]>;
  getDocumentsByItemId(itemId: number): Promise<EmployeeDocument[]>;
  getDocumentVersions(responsible: string, documentType: string): Promise<EmployeeDocument[]>;
  getResponsiblesWithoutDocumentType(documentType: string, options?: { expiresBefore?: string }): Promise<{ responsiblesWithout: string[]; responsiblesWithExpired: string[] }>;
  getComplianceQueues(options?: { documentTypes?: string[]; dueSoonDays?: number; criticalOverdueDays?: number }): Promise<ComplianceQueuesResponse>;
  getExecutiveSummaryInventoryMetrics(siteId?: number, restrictToSiteIds?: number[]): Promise<ExecutiveSummaryAssetHealth>;
  addEmployeeDocument(record: { responsible?: string | null; itemId?: number | null; fileUrl: string; originalName: string; mimeType?: string | null; documentType?: string | null; expiresAt?: string | null; userId?: number | null }): Promise<EmployeeDocument>;
  deleteEmployeeDocument(id: number): Promise<{ fileUrl: string } | undefined>;
  updateEmployeeDocument(id: number, updates: { itemId?: number | null; documentType?: string | null; expiresAt?: string | null }): Promise<EmployeeDocument | undefined>;
  addOpsEvent(record: {
    eventType: OpsEventType;
    severity: OpsEventSeverity;
    source: string;
    environment: string;
    payload?: Record<string, unknown>;
    userId?: number | null;
    ip?: string | null;
    requestId?: string | null;
    endpoint?: string | null;
    method?: string | null;
  }): Promise<void>;
  getOpsEventFeed(limit?: number, severity?: OpsEventSeverity): Promise<(typeof opsEvents.$inferSelect)[]>;
  getOpsSummary(): Promise<OpsSummaryResponse>;
  getWebhookEndpoints(): Promise<WebhookEndpointPublic[]>;
  createWebhookEndpoint(record: { url: string; secret: string; eventTypes: string[]; createdByUserId?: number | null }): Promise<WebhookEndpointPublic>;
  updateWebhookEndpoint(id: number, updates: { url?: string; secret?: string; eventTypes?: string[]; enabled?: boolean }): Promise<WebhookEndpointPublic | undefined>;
  deleteWebhookEndpoint(id: number): Promise<boolean>;
  enqueueWebhookEvent(eventType: string, payload: any): Promise<void>;
  
  getMaintenanceSchedules(itemId: number): Promise<MaintenanceSchedule[]>;
  getMaintenanceScheduleById(id: number): Promise<MaintenanceSchedule | undefined>;
  getDueMaintenanceSchedules(options?: {
    overdue?: boolean;
    siteId?: number;
    restrictToSiteIds?: number[];
  }): Promise<(MaintenanceSchedule & { itemCode: string | null; itemName: string | null })[]>;
  getMaintenanceEvents(scheduleId: number): Promise<(MaintenanceEvent & { completedByUsername: string | null })[]>;
  getRoleTemplates(): Promise<RoleTemplate[]>;
  listUserSiteRolesWithDetails(userId: number): Promise<
    { siteId: number; siteName: string; templateId: number; templateKey: string; templateDisplayName: string }[]
  >;
  upsertUserSiteRole(userId: number, siteId: number, templateId: number): Promise<void>;
  deleteUserSiteRole(userId: number, siteId: number): Promise<boolean>;
  getRoleTemplateById(id: number): Promise<RoleTemplate | undefined>;
  getRoleTemplateByKey(key: string): Promise<RoleTemplate | undefined>;
}

export class DatabaseStorage implements IStorage {
  private defaultSiteIdCache: number | null = null;

  private async getDefaultSiteId(): Promise<number> {
    if (this.defaultSiteIdCache != null) return this.defaultSiteIdCache;
    const [row] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, "default")).limit(1);
    if (!row) {
      throw new Error("Default site not found; run migrations/add-sites.sql");
    }
    this.defaultSiteIdCache = row.id;
    return row.id;
  }

  private async assertCompanyMatchesSite(companyId: number | null | undefined, siteId: number): Promise<void> {
    const [site] = await db
      .select({ companyId: sites.companyId })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1);
    if (!site) badRequest("Invalid siteId");
    if (site.companyId != null && companyId != null && site.companyId !== companyId) {
      badRequest("companyId does not match the selected site's company");
    }
  }

  async getSites(): Promise<Site[]> {
    return db
      .select()
      .from(sites)
      .where(isNull(sites.archivedAt))
      .orderBy(sites.name);
  }

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

  private buildItemConditions(
    search?: string,
    category?: string,
    responsible?: string,
    companyId?: number,
    siteId?: number,
    dateFrom?: string,
    dateTo?: string,
    addedAfter?: string,
    modifiedAfter?: string,
    restrictToSiteIds?: number[],
  ): Parameters<typeof and>[0][] {
    const conditions: Parameters<typeof and>[0][] = [];
    if (search) {
      conditions.push(
        or(
          columnIlikeContains(inventoryItems.name, search),
          columnIlikeContains(inventoryItems.code, search),
          columnIlikeContains(inventoryItems.category, search),
          columnIlikeContains(inventoryItems.responsible, search),
        )!,
      );
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
    if (isSiteScopingEnabled() && siteId != null) conditions.push(eq(inventoryItems.siteId, siteId));
    if (restrictToSiteIds != null) {
      if (restrictToSiteIds.length === 0) conditions.push(sql`false`);
      else conditions.push(inArray(inventoryItems.siteId, restrictToSiteIds));
    }
    if (dateFrom) conditions.push(gte(inventoryItems.purchaseDate, dateFrom));
    if (dateTo) conditions.push(lte(inventoryItems.purchaseDate, dateTo));
    if (addedAfter) conditions.push(gte(inventoryItems.createdAt, new Date(addedAfter + "T00:00:00.000Z")));
    if (modifiedAfter) conditions.push(gte(inventoryItems.updatedAt, new Date(modifiedAfter + "T00:00:00.000Z")));
    return conditions;
  }

  /** Site filters for inventory aggregate queries (aligned with `getFilterOptions` / list guards). */
  private buildInventoryAggregateSiteConditions(siteId?: number, restrictToSiteIds?: number[]): SQL[] {
    const conds: SQL[] = [];
    const siteScoped = isSiteScopingEnabled() && siteId != null;
    if (siteScoped) conds.push(eq(inventoryItems.siteId, siteId!));
    if (restrictToSiteIds != null) {
      if (restrictToSiteIds.length === 0) conds.push(sql`false`);
      else conds.push(inArray(inventoryItems.siteId, restrictToSiteIds));
    }
    return conds;
  }

  async getItems(
    search?: string,
    category?: string,
    responsible?: string,
    companyId?: number,
    siteId?: number,
    dateFrom?: string,
    dateTo?: string,
    addedAfter?: string,
    modifiedAfter?: string,
    restrictToSiteIds?: number[],
  ): Promise<InventoryItem[]> {
    const conditions = this.buildItemConditions(
      search,
      category,
      responsible,
      companyId,
      siteId,
      dateFrom,
      dateTo,
      addedAfter,
      modifiedAfter,
      restrictToSiteIds,
    );
    const query = db.select().from(inventoryItems).orderBy(desc(inventoryItems.id));
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async getItemsPage(
    search?: string,
    category?: string,
    responsible?: string,
    companyId?: number,
    siteId?: number,
    dateFrom?: string,
    dateTo?: string,
    addedAfter?: string,
    modifiedAfter?: string,
    limit = 50,
    offset = 0,
    restrictToSiteIds?: number[],
  ): Promise<{ items: InventoryItem[]; total: number; activeAssignmentItemIds: number[] }> {
    const conditions = this.buildItemConditions(
      search,
      category,
      responsible,
      companyId,
      siteId,
      dateFrom,
      dateTo,
      addedAfter,
      modifiedAfter,
      restrictToSiteIds,
    );
    const baseQuery = db.select().from(inventoryItems).orderBy(desc(inventoryItems.id));
    const countQuery = db.select({ count: count() }).from(inventoryItems);
    const withWhere = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult, items] = await Promise.all([
      withWhere ? countQuery.where(withWhere) : countQuery,
      withWhere ? baseQuery.where(withWhere).limit(limit).offset(offset) : baseQuery.limit(limit).offset(offset),
    ]);
    const total = Number((countResult as { count: number }[])[0]?.count ?? 0);
    const list = items as InventoryItem[];
    const ids = list.map((i) => i.id);
    let activeAssignmentItemIds: number[] = [];
    if (ids.length > 0) {
      const activeRows = await db
        .select({ itemId: inventoryAssignments.itemId })
        .from(inventoryAssignments)
        .where(and(inArray(inventoryAssignments.itemId, ids), isNull(inventoryAssignments.returnedAt)));
      activeAssignmentItemIds = activeRows.map((r) => r.itemId);
    }
    return { items: list, total, activeAssignmentItemIds };
  }

  async getActiveAssignment(itemId: number): Promise<InventoryAssignment | undefined> {
    const [row] = await db
      .select()
      .from(inventoryAssignments)
      .where(and(eq(inventoryAssignments.itemId, itemId), isNull(inventoryAssignments.returnedAt)))
      .limit(1);
    return row;
  }

  async getAssignments(itemId: number): Promise<
    (InventoryAssignment & { assignedByUsername: string | null; returnedByUsername: string | null })[]
  > {
    const assigner = alias(users, "assignment_assigner");
    const returner = alias(users, "assignment_returner");
    const rows = await db
      .select({
        id: inventoryAssignments.id,
        itemId: inventoryAssignments.itemId,
        assignee: inventoryAssignments.assignee,
        assignedAt: inventoryAssignments.assignedAt,
        conditionAtAssign: inventoryAssignments.conditionAtAssign,
        notes: inventoryAssignments.notes,
        assignedByUserId: inventoryAssignments.assignedByUserId,
        returnedAt: inventoryAssignments.returnedAt,
        returnCondition: inventoryAssignments.returnCondition,
        returnNotes: inventoryAssignments.returnNotes,
        returnedByUserId: inventoryAssignments.returnedByUserId,
        createdAt: inventoryAssignments.createdAt,
        assignedByUsername: assigner.username,
        returnedByUsername: returner.username,
      })
      .from(inventoryAssignments)
      .leftJoin(assigner, eq(inventoryAssignments.assignedByUserId, assigner.id))
      .leftJoin(returner, eq(inventoryAssignments.returnedByUserId, returner.id))
      .where(eq(inventoryAssignments.itemId, itemId))
      .orderBy(desc(inventoryAssignments.assignedAt));
    return rows as (InventoryAssignment & { assignedByUsername: string | null; returnedByUsername: string | null })[];
  }

  async getFilterOptions(
    siteId?: number,
    restrictToSiteIds?: number[],
  ): Promise<{ categories: string[]; responsible: string[]; companies: { id: number; name: string }[] }> {
    if (restrictToSiteIds != null && restrictToSiteIds.length === 0) {
      return { categories: [], responsible: [], companies: [] };
    }

    const invConds = this.buildInventoryAggregateSiteConditions(siteId, restrictToSiteIds);
    const siteWhere = invConds.length > 0 ? and(...invConds) : undefined;
    const categoryBase = and(isNotNull(inventoryItems.category), ne(inventoryItems.category, ""));

    const categoriesQuery = siteWhere
      ? db
          .selectDistinct({ category: inventoryItems.category })
          .from(inventoryItems)
          .where(and(categoryBase, siteWhere))
          .orderBy(inventoryItems.category)
      : db
          .selectDistinct({ category: inventoryItems.category })
          .from(inventoryItems)
          .where(categoryBase)
          .orderBy(inventoryItems.category);

    const responsibleQuery = siteWhere
      ? db
          .select({ name: inventoryResponsibleDisplaySql })
          .from(inventoryItems)
          .where(siteWhere)
          .groupBy(inventoryResponsibleDisplaySql)
          .orderBy(asc(inventoryResponsibleDisplaySql))
      : db
          .select({ name: inventoryResponsibleDisplaySql })
          .from(inventoryItems)
          .groupBy(inventoryResponsibleDisplaySql)
          .orderBy(asc(inventoryResponsibleDisplaySql));

    const companiesQuery = db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(companies.name);

    const [categoryRows, responsibleRows, companyList] = await Promise.all([
      categoriesQuery,
      responsibleQuery,
      companiesQuery,
    ]);

    const categories = categoryRows.map((r) => r.category as string);
    const responsible = responsibleRows.map((r) => String(r.name));
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

  async getSharedNotes(itemId?: number, restrictToSiteIds?: number[]): Promise<SharedNoteWithAuthor[]> {
    const conds: Parameters<typeof and>[0][] = [];
    if (itemId != null) conds.push(eq(sharedNotes.itemId, itemId));
    if (restrictToSiteIds != null) {
      if (restrictToSiteIds.length === 0) return [];
      conds.push(inArray(inventoryItems.siteId, restrictToSiteIds));
    }

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

    if (restrictToSiteIds != null) {
      const q = base.innerJoin(inventoryItems, eq(sharedNotes.itemId, inventoryItems.id));
      return await q.where(and(...conds)).orderBy(desc(sharedNotes.createdAt));
    }

    if (conds.length > 0) {
      return await base.where(and(...conds)).orderBy(desc(sharedNotes.createdAt));
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
    const rows = await db
      .select({
        name: inventoryResponsibleDisplaySql,
        count: sql<number>`count(*)::int`,
      })
      .from(inventoryItems)
      .groupBy(inventoryResponsibleDisplaySql)
      .orderBy(desc(sql`count(*)::int`), asc(inventoryResponsibleDisplaySql));
    return rows.map((r) => ({ name: String(r.name), count: Number(r.count) }));
  }

  async resolveTargetSiteIdForCreate(body: { siteId?: number }): Promise<number> {
    const defaultSiteId = await this.getDefaultSiteId();
    if (!isSiteScopingEnabled()) return defaultSiteId;
    return body.siteId ?? defaultSiteId;
  }

  async getItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item;
  }

  async getItemsByIds(ids: number[], restrictToSiteIds?: number[]): Promise<InventoryItem[]> {
    if (ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids));
    const idCond = inArray(inventoryItems.id, uniqueIds);
    const rows =
      restrictToSiteIds != null
        ? restrictToSiteIds.length === 0
          ? []
          : await db
              .select()
              .from(inventoryItems)
              .where(and(idCond, inArray(inventoryItems.siteId, restrictToSiteIds)))
        : await db.select().from(inventoryItems).where(idCond);
    const order = new Map(uniqueIds.map((id, i) => [id, i]));
    return (rows as InventoryItem[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async createItem(item: CreateItemRequest): Promise<InventoryItem> {
    const defaultSiteId = await this.getDefaultSiteId();
    const scoping = isSiteScopingEnabled();
    let resolvedSiteId = item.siteId ?? defaultSiteId;
    if (!scoping) {
      resolvedSiteId = defaultSiteId;
    }
    const [siteRow] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, resolvedSiteId)).limit(1);
    if (!siteRow) badRequest("Invalid siteId");
    await this.assertCompanyMatchesSite(item.companyId ?? null, resolvedSiteId);

    let code = item.code?.trim();
    if (!code) {
      code = await suggestCode(item.category, item.name, scoping ? resolvedSiteId : undefined);
    }
    const { siteId: _omit, ...rest } = item;
    const toInsert = { ...rest, code, siteId: resolvedSiteId };
    const [newItem] = await db.insert(inventoryItems).values(toInsert).returning();
    this.enqueueWebhookEvent("inventory.created", newItem).catch((e) => console.error("Webhook enqueue failed", e));
    return newItem;
  }

  async updateItem(id: number, updates: UpdateItemRequest): Promise<InventoryItem> {
    const [current] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!current) {
      throw httpStatusError(404, "Item not found");
    }
    const scoping = isSiteScopingEnabled();
    const nextSiteId = updates.siteId !== undefined ? updates.siteId! : current.siteId;
    const nextCompanyId = updates.companyId !== undefined ? updates.companyId : current.companyId;
    if (!scoping) {
      if (updates.siteId !== undefined && updates.siteId !== current.siteId) {
        badRequest("Site changes require SITE_SCOPING_ENABLED");
      }
    } else if (updates.siteId !== undefined) {
      const [siteRow] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, nextSiteId)).limit(1);
      if (!siteRow) badRequest("Invalid siteId");
    }
    await this.assertCompanyMatchesSite(nextCompanyId ?? null, nextSiteId);

    const setBody = { ...updates, updatedAt: new Date() } as UpdateItemRequest & { updatedAt: Date };
    if (!scoping) {
      delete (setBody as Record<string, unknown>).siteId;
    }
    const [updated] = await db
      .update(inventoryItems)
      .set(setBody)
      .where(eq(inventoryItems.id, id))
      .returning();
    if (!updated) {
      throw httpStatusError(404, "Item not found");
    }
    this.enqueueWebhookEvent("inventory.updated", updated).catch((e) => console.error("Webhook enqueue failed", e));
    return updated;
  }

  async deleteInventoryItemWithUndo(params: {
    item: InventoryItem;
    attachments: { id: number; imageUrl: string }[];
    userId: number | null;
  }): Promise<{ undoToken: string; undoExpiresAt: Date }> {
    const { item, attachments, userId } = params;
    const id = item.id;
    const undoToken = buildUndoToken();
    const undoExpiresAt = new Date(Date.now() + BULK_UNDO_WINDOW_MIN * 60_000);
    const payload = { items: [item], attachments, deletedIds: [id] };
    const itemName = item.name ?? `Item #${id}`;
    const remarks = buildDeleteHistoryRemarks("DELETE", itemName, undoToken);

    await db.transaction(async (tx) => {
      await tx.insert(inventoryBulkUndo).values({
        token: undoToken,
        actionType: "single_delete",
        payload,
        expiresAt: undoExpiresAt,
        createdByUserId: userId ?? null,
      });
      await tx.insert(inventoryHistory).values({
        productId: id,
        companyId: item.companyId ?? null,
        transactionType: "DELETE",
        quantity: item.units ?? 0,
        userId: userId ?? null,
        remarks,
      });
      await tx.delete(inventoryItems).where(eq(inventoryItems.id, id));
    });

    this.enqueueWebhookEvent("inventory.deleted", item).catch((e) => console.error("Webhook enqueue failed", e));
    return { undoToken, undoExpiresAt };
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

  async addHistoryRecordsBulk(records: InventoryHistoryInsertRow[]): Promise<void> {
    await insertInventoryHistoryBulk(db, records);
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
      const s = filters.search.trim();
      conditions.push(or(columnIlikeContains(inventoryItems.code, s), columnIlikeContains(inventoryItems.name, s))!);
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

  async addOpsEvent(record: {
    eventType: OpsEventType;
    severity: OpsEventSeverity;
    source: string;
    environment: string;
    payload?: Record<string, unknown>;
    userId?: number | null;
    ip?: string | null;
    requestId?: string | null;
    endpoint?: string | null;
    method?: string | null;
  }): Promise<void> {
    try {
      await db.insert(opsEvents).values({
        eventType: record.eventType,
        severity: record.severity,
        source: record.source,
        environment: record.environment,
        payload: record.payload ?? {},
        userId: record.userId ?? null,
        ip: record.ip ?? null,
        requestId: record.requestId ?? null,
        endpoint: record.endpoint ?? null,
        method: record.method ?? null,
      });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "42P01") {
        // ops_events table may be absent before migrations are applied; observability must stay best-effort.
        return;
      }
      throw err;
    }
  }

  async getOpsEventFeed(limit = 100, severity?: OpsEventSeverity): Promise<(typeof opsEvents.$inferSelect)[]> {
    const q = db
      .select()
      .from(opsEvents)
      .orderBy(desc(opsEvents.createdAt))
      .limit(Math.max(1, Math.min(limit, 500)));
    if (severity) return q.where(eq(opsEvents.severity, severity));
    return q;
  }

  async getOpsSummary(): Promise<OpsSummaryResponse> {
    return getCachedOpsSummary(() => this.computeOpsSummary());
  }

  private async computeOpsSummary(): Promise<OpsSummaryResponse> {
    const now = new Date();
    const last5m = new Date(now.getTime() - 5 * 60_000);
    const last1h = new Date(now.getTime() - 60 * 60_000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60_000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

    const [
      events24hGrouped,
      slowRequestLatencyRows,
      importRows24h,
      counts7dGrouped,
      lastIntegrityRunRows,
    ] = await Promise.all([
      db
        .select({
          eventType: opsEvents.eventType,
          severity: opsEvents.severity,
          total: count(),
        })
        .from(opsEvents)
        .where(gt(opsEvents.createdAt, last24h))
        .groupBy(opsEvents.eventType, opsEvents.severity),

      db
        .select({
          p95: sql<number>`percentile_cont(0.95) within group (order by (( ${opsEvents.payload} ->> 'durationMs')::numeric ))`,
        })
        .from(opsEvents)
        .where(
          and(
            gt(opsEvents.createdAt, last24h),
            eq(opsEvents.eventType, "api.slow_request"),
          ),
        ),

      db
        .select({ eventType: opsEvents.eventType, payload: opsEvents.payload })
        .from(opsEvents)
        .where(
          and(
            gt(opsEvents.createdAt, last24h),
            inArray(opsEvents.eventType, ["job.import_success", "job.import_failure"]),
          ),
        ),

      db
        .select({ eventType: opsEvents.eventType, total: count() })
        .from(opsEvents)
        .where(
          and(
            gt(opsEvents.createdAt, last7d),
            inArray(opsEvents.eventType, [
              "job.backup_success",
              "job.backup_failure",
              "job.backup_restore_verify_success",
              "job.backup_restore_verify_failure",
              "job.integrity_scan_success",
              "job.integrity_scan_failure",
            ]),
          ),
        )
        .groupBy(opsEvents.eventType),

      db
        .select({ eventType: opsEvents.eventType, payload: opsEvents.payload })
        .from(opsEvents)
        .where(
          inArray(opsEvents.eventType, ["job.integrity_scan_success", "job.integrity_scan_failure"]),
        )
        .orderBy(desc(opsEvents.createdAt))
        .limit(1),
    ]);

    let activeSessions: number | null = null;
    try {
      const sessions = await pool.query("select count(*)::int as count from user_sessions where expire > now()");
      activeSessions = Number(sessions.rows?.[0]?.count ?? 0);
    } catch {
      activeSessions = null;
    }

    const alerts = { critical: 0, warning: 0, info: 0 };
    const count24hByType = new Map<string, number>();
    for (const row of events24hGrouped) {
      const n = Number(row.total ?? 0);
      count24hByType.set(row.eventType, (count24hByType.get(row.eventType) ?? 0) + n);
      if (row.severity === "critical") alerts.critical += n;
      else if (row.severity === "warning") alerts.warning += n;
      else if (row.severity === "info") alerts.info += n;
    }

    const total4xx = count24hByType.get("api.error_4xx") ?? 0;
    const total5xx = count24hByType.get("api.error_5xx") ?? 0;
    const totalApiErrors24h = total4xx + total5xx;
    const api5xxRate24h = totalApiErrors24h > 0 ? total5xx / totalApiErrors24h : 0;
    const apiSuccessRate24h = Math.max(0, 1 - api5xxRate24h);

    const p95Raw = slowRequestLatencyRows?.[0]?.p95;
    const p95ApiLatencyMs24h =
      p95Raw != null && Number.isFinite(Number(p95Raw)) ? Number(p95Raw) : null;

    const authFailures24h = count24hByType.get("auth.login_failure") ?? 0;
    const authFailureRatePerHour = authFailures24h / 24;
    const rateLimitHits24h = count24hByType.get("auth.rate_limit_hit") ?? 0;
    const csrfBlocks24h = count24hByType.get("auth.csrf_blocked") ?? 0;
    const historyWriteFailures24h = count24hByType.get("job.history_write_failure") ?? 0;
    const historyWritesApprox24h = Math.max(1, historyWriteFailures24h);
    const historyWriteSuccessRate24h = Math.max(
      0,
      (historyWritesApprox24h - historyWriteFailures24h) / historyWritesApprox24h,
    );

    const by7d = new Map<string, number>();
    for (const row of counts7dGrouped) {
      by7d.set(row.eventType, Number(row.total ?? 0));
    }
    const backupSuccess7d = by7d.get("job.backup_success") ?? 0;
    const backupFailure7d = by7d.get("job.backup_failure") ?? 0;
    const backupTotal7d = backupSuccess7d + backupFailure7d;
    const backupSuccessRate7d = backupTotal7d > 0 ? backupSuccess7d / backupTotal7d : null;
    const restoreVerificationPassCount7d = by7d.get("job.backup_restore_verify_success") ?? 0;
    const restoreVerificationFailCount7d = by7d.get("job.backup_restore_verify_failure") ?? 0;
    const restoreVerificationTotal7d = restoreVerificationPassCount7d + restoreVerificationFailCount7d;
    const restoreVerificationSuccessRate7d =
      restoreVerificationTotal7d > 0
        ? restoreVerificationPassCount7d / restoreVerificationTotal7d
        : null;
    const integritySuccess7d = by7d.get("job.integrity_scan_success") ?? 0;
    const integrityFailure7d = by7d.get("job.integrity_scan_failure") ?? 0;
    const integrityTotal7d = integritySuccess7d + integrityFailure7d;
    const integrityScanSuccessRate7d = integrityTotal7d > 0 ? integritySuccess7d / integrityTotal7d : null;

    const lastIntegrityPayload = (lastIntegrityRunRows?.[0]?.payload ?? {}) as Record<string, unknown>;
    const integrityScanIssuesLastRun =
      lastIntegrityRunRows.length > 0
        ? Number.isFinite(Number(lastIntegrityPayload.totalIssues))
          ? Number(lastIntegrityPayload.totalIssues)
          : null
        : null;

    const importSuccesses = importRows24h.filter((r) => r.eventType === "job.import_success");
    const importFailures = importRows24h.filter((r) => r.eventType === "job.import_failure").length;
    const importRuns = importSuccesses.length + importFailures;
    const totalRowsImported = importSuccesses.reduce((sum, row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const n = Number(payload.rowCount ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    const importRowsPerRun24h = importSuccesses.length > 0 ? totalRowsImported / importSuccesses.length : null;
    const importFailureRate24h = importRuns > 0 ? importFailures / importRuns : 0;

    return {
      windows: {
        last5m: last5m.toISOString(),
        last1h: last1h.toISOString(),
        last24h: last24h.toISOString(),
      },
      kpis: {
        apiSuccessRate24h,
        api5xxRate24h,
        authFailureRatePerHour,
        rateLimitHits24h,
        csrfBlocks24h,
        backupSuccessRate7d,
        restoreVerificationSuccessRate7d,
        restoreVerificationPassCount7d,
        restoreVerificationFailCount7d,
        integrityScanSuccessRate7d,
        integrityScanIssuesLastRun,
        historyWriteSuccessRate24h,
        p95ApiLatencyMs24h,
        activeSessions,
        importRowsPerRun24h,
        importFailureRate24h,
      },
      alerts,
    };
  }

  async getWebhookEndpoints(): Promise<WebhookEndpointPublic[]> {
    const rows = await db.select().from(webhookEndpoints).orderBy(desc(webhookEndpoints.createdAt));
    return redactWebhookEndpointSecrets(rows);
  }

  async createWebhookEndpoint(record: { url: string; secret: string; eventTypes: string[]; createdByUserId?: number | null }): Promise<WebhookEndpointPublic> {
    const [row] = await db.insert(webhookEndpoints).values({
      url: record.url,
      secret: record.secret,
      eventTypes: record.eventTypes,
      createdByUserId: record.createdByUserId ?? null,
    }).returning();
    return redactWebhookEndpointSecret(row!);
  }

  async updateWebhookEndpoint(id: number, updates: { url?: string; secret?: string; eventTypes?: string[]; enabled?: boolean }): Promise<WebhookEndpointPublic | undefined> {
    const set: WebhookEndpointUpdateSet = { updatedAt: new Date() };
    if (updates.url !== undefined) set.url = updates.url;
    if (updates.secret !== undefined) set.secret = updates.secret;
    if (updates.eventTypes !== undefined) set.eventTypes = updates.eventTypes;
    if (updates.enabled !== undefined) set.enabled = updates.enabled;

    const [row] = await db.update(webhookEndpoints).set(set).where(eq(webhookEndpoints.id, id)).returning();
    return row ? redactWebhookEndpointSecret(row) : undefined;
  }

  async deleteWebhookEndpoint(id: number): Promise<boolean> {
    const [row] = await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id)).returning({ id: webhookEndpoints.id });
    return !!row;
  }

  async enqueueWebhookEvent(eventType: string, payload: any): Promise<void> {
    try {
      const endpoints = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.enabled, true));
      // Wildcard * or specific event match
      const matchingEndpoints = endpoints.filter(ep => ep.eventTypes?.includes(eventType) || ep.eventTypes?.includes('*'));
      
      if (matchingEndpoints.length === 0) return;

      const eventId = randomUUID();
      const outboxRows = matchingEndpoints.map(ep => ({
        eventId,
        eventType,
        payload,
        endpointId: ep.id,
        status: "pending",
        attemptCount: 0,
      }));

      await db.insert(webhookOutbox).values(outboxRows);
    } catch (e) {
      console.error(`Failed to enqueue webhook event ${eventType}`, e);
    }
  }

  async getMaintenanceSchedules(itemId: number): Promise<MaintenanceSchedule[]> {
    return await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.itemId, itemId))
      .orderBy(desc(maintenanceSchedules.active), desc(maintenanceSchedules.createdAt));
  }

  async getMaintenanceScheduleById(id: number): Promise<MaintenanceSchedule | undefined> {
    const [row] = await db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
    return row;
  }

  async getDueMaintenanceSchedules(options?: {
    overdue?: boolean;
    siteId?: number;
    restrictToSiteIds?: number[];
  }): Promise<(MaintenanceSchedule & { itemCode: string | null; itemName: string | null })[]> {
    // Current date string YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0]!;

    // We consider "due soon" as within 30 days. This can be parameterized later.
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

    const conditions: Parameters<typeof and>[0][] = [
      eq(maintenanceSchedules.active, true)
    ];

    if (options?.overdue) {
      conditions.push(sql`${maintenanceSchedules.nextDueAt} < ${today}`);
    } else {
      conditions.push(sql`${maintenanceSchedules.nextDueAt} <= ${in30Days}`);
    }
    if (isSiteScopingEnabled() && options?.siteId != null) {
      conditions.push(eq(inventoryItems.siteId, options.siteId));
    }
    if (options?.restrictToSiteIds != null) {
      if (options.restrictToSiteIds.length === 0) {
        conditions.push(sql`false`);
      } else {
        conditions.push(inArray(inventoryItems.siteId, options.restrictToSiteIds));
      }
    }

    const rows = await db
      .select({
        id: maintenanceSchedules.id,
        itemId: maintenanceSchedules.itemId,
        scheduleType: maintenanceSchedules.scheduleType,
        title: maintenanceSchedules.title,
        intervalDays: maintenanceSchedules.intervalDays,
        startDate: maintenanceSchedules.startDate,
        nextDueAt: maintenanceSchedules.nextDueAt,
        notes: maintenanceSchedules.notes,
        active: maintenanceSchedules.active,
        createdByUserId: maintenanceSchedules.createdByUserId,
        createdAt: maintenanceSchedules.createdAt,
        updatedAt: maintenanceSchedules.updatedAt,
        itemCode: inventoryItems.code,
        itemName: inventoryItems.name,
      })
      .from(maintenanceSchedules)
      .innerJoin(inventoryItems, eq(maintenanceSchedules.itemId, inventoryItems.id))
      .where(and(...conditions))
      .orderBy(maintenanceSchedules.nextDueAt);
      
    // Fix types, SQL strings come back as objects from driver sometimes, but Drizzle should map them.
    return rows;
  }

  async getRoleTemplates(): Promise<RoleTemplate[]> {
    return db.select().from(roleTemplates).orderBy(roleTemplates.key);
  }

  async listUserSiteRolesWithDetails(userId: number): Promise<
    { siteId: number; siteName: string; templateId: number; templateKey: string; templateDisplayName: string }[]
  > {
    const rows = await db
      .select({
        siteId: userSiteRoles.siteId,
        siteName: sites.name,
        templateId: userSiteRoles.templateId,
        templateKey: roleTemplates.key,
        templateDisplayName: roleTemplates.displayName,
      })
      .from(userSiteRoles)
      .innerJoin(sites, eq(userSiteRoles.siteId, sites.id))
      .innerJoin(roleTemplates, eq(userSiteRoles.templateId, roleTemplates.id))
      .where(eq(userSiteRoles.userId, userId))
      .orderBy(sites.name);
    return rows;
  }

  async upsertUserSiteRole(userId: number, siteId: number, templateId: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(userSiteRoles)
        .where(and(eq(userSiteRoles.userId, userId), eq(userSiteRoles.siteId, siteId)));
      await tx.insert(userSiteRoles).values({ userId, siteId, templateId });
    });
  }

  async deleteUserSiteRole(userId: number, siteId: number): Promise<boolean> {
    const deleted = await db
      .delete(userSiteRoles)
      .where(and(eq(userSiteRoles.userId, userId), eq(userSiteRoles.siteId, siteId)))
      .returning({ id: userSiteRoles.id });
    return deleted.length > 0;
  }

  async getRoleTemplateById(id: number): Promise<RoleTemplate | undefined> {
    const [row] = await db.select().from(roleTemplates).where(eq(roleTemplates.id, id)).limit(1);
    return row;
  }

  async getRoleTemplateByKey(key: string): Promise<RoleTemplate | undefined> {
    const [row] = await db.select().from(roleTemplates).where(eq(roleTemplates.key, key)).limit(1);
    return row;
  }

  async getMaintenanceEvents(scheduleId: number): Promise<(MaintenanceEvent & { completedByUsername: string | null })[]> {
    const returner = alias(users, "event_completer");
    return await db
      .select({
        id: maintenanceEvents.id,
        scheduleId: maintenanceEvents.scheduleId,
        performedAt: maintenanceEvents.performedAt,
        conditionResult: maintenanceEvents.conditionResult,
        notes: maintenanceEvents.notes,
        evidenceUrl: maintenanceEvents.evidenceUrl,
        completedByUserId: maintenanceEvents.completedByUserId,
        createdAt: maintenanceEvents.createdAt,
        completedByUsername: returner.username,
      })
      .from(maintenanceEvents)
      .leftJoin(returner, eq(maintenanceEvents.completedByUserId, returner.id))
      .where(eq(maintenanceEvents.scheduleId, scheduleId))
      .orderBy(desc(maintenanceEvents.performedAt), desc(maintenanceEvents.createdAt));
  }
  async getExecutiveSummaryInventoryMetrics(
    siteId?: number,
    restrictToSiteIds?: number[],
  ): Promise<ExecutiveSummaryAssetHealth> {
    const conditions = this.buildItemConditions(
      undefined,
      undefined,
      undefined,
      undefined,
      siteId,
      undefined,
      undefined,
      undefined,
      undefined,
      restrictToSiteIds,
    );
    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;
    const filter = baseWhere ?? sql`true`;

    const [totalRow] = await db.select({ c: count() }).from(inventoryItems).where(filter);
    const totalItems = Number(totalRow?.c ?? 0);

    const categoryKey = sql<string>`COALESCE(NULLIF(TRIM(${inventoryItems.category}), ''), 'Uncategorized')`;
    const byCategoryRows = await db
      .select({ name: categoryKey, count: count() })
      .from(inventoryItems)
      .where(filter)
      .groupBy(categoryKey)
      .orderBy(desc(count()));

    const conditionKey = sql<string>`COALESCE(NULLIF(TRIM(${inventoryItems.condition}), ''), 'Unknown')`;
    const byConditionRows = await db
      .select({ name: conditionKey, count: count() })
      .from(inventoryItems)
      .where(filter)
      .groupBy(conditionKey)
      .orderBy(desc(count()));

    // Custody labels must match `client/src/lib/inventory-aggregates.ts` and UNASSIGNED_RESPONSIBLE_LABEL in schema.
    const personFilter = sql`trim(coalesce(${inventoryItems.responsible}, '')) NOT IN ('', 'Equipo de trabajo', 'Sin asignar')`;
    const poolFilter = sql`(trim(coalesce(${inventoryItems.responsible}, '')) = '' OR trim(coalesce(${inventoryItems.responsible}, '')) = 'Equipo de trabajo')`;
    const unassignedFilter = sql`trim(coalesce(${inventoryItems.responsible}, '')) = 'Sin asignar'`;

    const [assignedToPersonRow] = await db.select({ c: count() }).from(inventoryItems).where(and(filter, personFilter));
    const [sharedPoolRow] = await db.select({ c: count() }).from(inventoryItems).where(and(filter, poolFilter));
    const [unassignedRow] = await db.select({ c: count() }).from(inventoryItems).where(and(filter, unassignedFilter));

    const [activeRow] = await db
      .select({
        c: sql<number>`count(distinct ${inventoryItems.id})::int`,
      })
      .from(inventoryItems)
      .innerJoin(
        inventoryAssignments,
        and(eq(inventoryItems.id, inventoryAssignments.itemId), isNull(inventoryAssignments.returnedAt)),
      )
      .where(filter);

    return {
      totalItems,
      byCategory: byCategoryRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      byCondition: byConditionRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      custody: {
        assignedToPerson: Number(assignedToPersonRow?.c ?? 0),
        sharedPool: Number(sharedPoolRow?.c ?? 0),
        unassignedLabel: Number(unassignedRow?.c ?? 0),
      },
      itemsWithActiveAssignment: Number(activeRow?.c ?? 0),
    };
  }

  async getComplianceQueues(options?: { documentTypes?: string[]; dueSoonDays?: number; criticalOverdueDays?: number }): Promise<ComplianceQueuesResponse> {
    const COMPLIANCE_DOCUMENT_TYPES = ["Contract", "Identification", "Certifications", "Other"] as const;
    const dueSoonDays = options?.dueSoonDays ?? 30;
    const criticalOverdueDays = options?.criticalOverdueDays ?? 30;
    const trackedTypes: string[] = options?.documentTypes?.length
      ? options.documentTypes.filter((t) => (COMPLIANCE_DOCUMENT_TYPES as readonly string[]).includes(t))
      : [...COMPLIANCE_DOCUMENT_TYPES];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Two reads: all responsibles + all docs for tracked types ordered desc so first-seen = latest
    const [responsibles, allDocs] = await Promise.all([
      this.getResponsibleWithCounts(),
      db
        .select()
        .from(employeeDocuments)
        .where(
          and(
            inArray(employeeDocuments.documentType, trackedTypes),
            sql`${employeeDocuments.responsible} IS NOT NULL AND ${employeeDocuments.responsible} <> ''`
          )
        )
        .orderBy(desc(employeeDocuments.createdAt)),
    ]);

    // Latest row per (responsible, documentType) — first occurrence in desc order wins
    const latestByKey = new Map<string, EmployeeDocument>();
    for (const doc of allDocs) {
      if (!doc.responsible) continue;
      const key = `${doc.responsible}|${doc.documentType}`;
      if (!latestByKey.has(key)) latestByKey.set(key, doc);
    }

    const entries: ComplianceQueueEntry[] = [];

    for (const { name: responsible } of responsibles) {
      for (const docType of trackedTypes) {
        const key = `${responsible}|${docType}`;
        const latest = latestByKey.get(key);

        if (!latest) {
          // No document at all for this (responsible, docType) pair
          entries.push({ responsible, documentType: docType, bucket: "missing", documentId: null, expiresAt: null, daysUntilExpiry: null });
          continue;
        }

        // No expiry on the latest doc — treat as current, omit from queue
        if (!latest.expiresAt) continue;

        const expiresDate = new Date(latest.expiresAt);
        expiresDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((expiresDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Expires well in the future — current, omit
        if (diffDays > dueSoonDays) continue;

        let bucket: ComplianceQueueEntry["bucket"];
        if (diffDays >= 0) {
          bucket = "dueSoon";
        } else if (diffDays >= -criticalOverdueDays) {
          bucket = "overdue";
        } else {
          bucket = "critical";
        }

        entries.push({
          responsible,
          documentType: docType,
          bucket,
          documentId: latest.id,
          expiresAt: String(latest.expiresAt).slice(0, 10),
          daysUntilExpiry: diffDays,
        });
      }
    }

    const counts = { missing: 0, dueSoon: 0, overdue: 0, critical: 0 };
    for (const e of entries) counts[e.bucket]++;

    return {
      entries,
      counts,
      thresholds: { dueSoonDays, criticalOverdueDays },
      trackedDocumentTypes: trackedTypes,
      asOf: new Date().toISOString(),
    };
  }
}

export const storage = new DatabaseStorage();
