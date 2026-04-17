import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { docTemplates, type DocTemplate, type InsertDocTemplate } from "@shared/schema";
import type { TemplateListFilters } from "../types";
import { httpStatusError } from "../../http-status-error";

export class TemplateService {
  async create(input: InsertDocTemplate): Promise<DocTemplate> {
    const now = new Date();
    const [row] = await db
      .insert(docTemplates)
      .values({
        ...input,
        updatedAt: now,
        createdAt: now,
      })
      .returning();
    if (!row) throw httpStatusError(500, "Failed to create template");
    return row;
  }

  async getById(id: number, opts?: { includeInactive?: boolean }): Promise<DocTemplate | undefined> {
    const conditions: SQL[] = [eq(docTemplates.id, id)];
    if (!opts?.includeInactive) {
      conditions.push(eq(docTemplates.active, true));
    }
    const [row] = await db
      .select()
      .from(docTemplates)
      .where(and(...conditions))
      .limit(1);
    return row;
  }

  async getByIdOrThrow(id: number, opts?: { includeInactive?: boolean }): Promise<DocTemplate> {
    const row = await this.getById(id, opts);
    if (!row) throw httpStatusError(404, "Template not found");
    return row;
  }

  async getBySlug(slug: string, opts?: { includeInactive?: boolean }): Promise<DocTemplate | undefined> {
    const conditions: SQL[] = [eq(docTemplates.slug, slug)];
    if (!opts?.includeInactive) {
      conditions.push(eq(docTemplates.active, true));
    }
    const [row] = await db
      .select()
      .from(docTemplates)
      .where(and(...conditions))
      .limit(1);
    return row;
  }

  async list(filters: TemplateListFilters = {}): Promise<DocTemplate[]> {
    const conditions: SQL[] = [];
    if (filters.category) {
      conditions.push(eq(docTemplates.category, filters.category));
    }
    if (filters.activeOnly !== false) {
      conditions.push(eq(docTemplates.active, true));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;
    return db
      .select()
      .from(docTemplates)
      .where(whereClause)
      .orderBy(desc(docTemplates.updatedAt));
  }

  async update(id: number, patch: Partial<InsertDocTemplate>): Promise<DocTemplate> {
    const [row] = await db
      .update(docTemplates)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(docTemplates.id, id))
      .returning();
    if (!row) throw httpStatusError(404, "Template not found");
    return row;
  }

  /** Soft-delete: marks template inactive. */
  async softDelete(id: number): Promise<DocTemplate> {
    return this.update(id, { active: false });
  }
}

export const templateService = new TemplateService();
