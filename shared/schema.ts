import {
  pgTable,
  text,
  serial,
  integer,
  date,
  timestamp,
  json,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** Allowed user roles. Use for authorization checks. */
export const USER_ROLES = ["admin", "editor", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Users table for authentication.
 * Passwords are stored as bcrypt hashes (never plain text).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export type Company = typeof companies.$inferSelect;

/** Physical / logical location. Optional company_id aligns rollup with inventory_items.company_id when both are set. */
export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => ({
    companyIdx: index("sites_company_id_idx").on(table.companyId),
  })
);

export type Site = typeof sites.$inferSelect;

/**
 * Seeded presets for per-site RBAC (`user_site_roles`), enabled with SITE_RBAC_ENABLED + SITE_SCOPING_ENABLED.
 * Capabilities are documented in `shared/site-rbac.ts`.
 */
export const roleTemplates = pgTable("role_templates", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  displayName: text("display_name").notNull(),
  capabilities: jsonb("capabilities").notNull().$type<string[]>(),
});

export type RoleTemplate = typeof roleTemplates.$inferSelect;

export const userSiteRoles = pgTable(
  "user_site_roles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    templateId: integer("template_id")
      .notNull()
      .references(() => roleTemplates.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSiteUnique: uniqueIndex("user_site_roles_user_site_idx").on(table.userId, table.siteId),
    userSiteRolesUserIdIdx: index("user_site_roles_user_id_idx").on(table.userId),
  })
);

export type UserSiteRole = typeof userSiteRoles.$inferSelect;

export const inventoryItems = pgTable(
  "inventory_items",
  {
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
    imageUrl: text("image_url"), // Primary/thumbnail image (first or selected)
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    notes: text("notes"), // Observaciones / comentarios internos, mantenimiento, etc.
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => ({
    siteIdx: index("inventory_items_site_id_idx").on(table.siteId),
  })
);

export const inventoryAttachments = pgTable("inventory_attachments", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    /** Omitted on create/import when server assigns default site (see SITE_SCOPING_ENABLED). */
    siteId: z.number().int().positive().optional(),
  });

export const insertAttachmentSchema = createInsertSchema(inventoryAttachments).omit({ id: true });

/** Complete audit history: product transactions with user, company, quantity */
export const inventoryHistory = pgTable("inventory_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  transactionType: text("transaction_type").notNull(),
  quantity: integer("quantity").notNull().default(0),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  remarks: text("remarks"),
});

export type InventoryHistoryEntry = typeof inventoryHistory.$inferSelect;

export const sharedNotes = pgTable("shared_notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Nullable by design: updates are set explicitly in the API.
  updatedAt: timestamp("updated_at"),
});

export type SharedNote = typeof sharedNotes.$inferSelect;

export const insertSharedNoteSchema = createInsertSchema(sharedNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
});

export type InsertSharedNote = z.infer<typeof insertSharedNoteSchema>;
export type CreateSharedNoteRequest = InsertSharedNote;
export type UpdateSharedNoteRequest = Partial<InsertSharedNote>;

/** Document type tags for categorization and versioning */
export const DOCUMENT_TYPES = ["Contract", "Identification", "Certifications", "Other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Documents uploaded in the Empleados section or linked to inventory items (PDF, Word, etc.) */
export const employeeDocuments = pgTable("employee_documents", {
  id: serial("id").primaryKey(),
  responsible: text("responsible"), // optional: link to a persona responsable
  itemId: integer("item_id").references(() => inventoryItems.id, { onDelete: "set null" }), // optional: link to an inventory item
  fileUrl: text("file_url").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  documentType: text("document_type"), // Contract, Identification, Certifications, Other
  expiresAt: date("expires_at"), // optional expiry for contracts/certifications
  createdAt: timestamp("created_at").notNull().defaultNow(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
});

export type EmployeeDocument = typeof employeeDocuments.$inferSelect;

/**
 * Express session store (connect-pg-simple). Created at startup by
 * `server/auth.ts` and by `migrations/add-bootstrap-tables.sql`. Keep columns,
 * index name, and PK in lockstep with both of those.
 *
 * NOTE: column type is `json` (not `jsonb`) — connect-pg-simple writes `json`
 * and the existing bootstrap SQL matches that.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey().notNull(),
    sess: json("sess").notNull().$type<Record<string, unknown>>(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_user_sessions_expire").on(table.expire),
  }),
);

export type UserSession = typeof userSessions.$inferSelect;

/**
 * Per-IP and per-IP+username login throttle state. Created at startup by
 * `server/rate-limiter.ts` and by `migrations/add-bootstrap-tables.sql`.
 */
export const loginRateLimits = pgTable("login_rate_limits", {
  key: text("key").primaryKey().notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

export type LoginRateLimit = typeof loginRateLimits.$inferSelect;

export const opsEvents = pgTable(
  "ops_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull(),
    source: text("source").notNull().default("api"),
    environment: text("environment").notNull().default("development"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    ip: text("ip"),
    requestId: text("request_id"),
    endpoint: text("endpoint"),
    method: text("method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventTypeCreatedAtIdx: index("ops_events_event_type_created_at_idx").on(table.eventType, table.createdAt),
    createdAtIdx: index("ops_events_created_at_idx").on(table.createdAt),
    severityCreatedAtIdx: index("ops_events_severity_created_at_idx").on(table.severity, table.createdAt),
  })
);

export const inventoryBulkUndo = pgTable(
  "inventory_bulk_undo",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: index("inventory_bulk_undo_token_idx").on(table.token),
    expiresAtIdx: index("inventory_bulk_undo_expires_at_idx").on(table.expiresAt),
  })
);

/** Custody assignments: at most one active row per item (returned_at IS NULL), enforced in DB. */
export const inventoryAssignments = pgTable(
  "inventory_assignments",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    assignee: text("assignee").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    conditionAtAssign: text("condition_at_assign"),
    notes: text("notes"),
    assignedByUserId: integer("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnCondition: text("return_condition"),
    returnNotes: text("return_notes"),
    returnedByUserId: integer("returned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeItemUnique: uniqueIndex("inventory_assignments_active_item_idx")
      .on(table.itemId)
      .where(sql`${table.returnedAt} is null`),
    itemAssignedIdx: index("inventory_assignments_item_assigned_idx").on(table.itemId, table.assignedAt),
  })
);

export type InventoryAssignment = typeof inventoryAssignments.$inferSelect;

/** Canonical label when an asset has no active assignee (see DECISIONS.md). */
export const UNASSIGNED_RESPONSIBLE_LABEL = "Sin asignar" as const;

export const MAINTENANCE_SCHEDULE_TYPES = ["maintenance", "calibration"] as const;
export type MaintenanceScheduleType = (typeof MAINTENANCE_SCHEDULE_TYPES)[number];

export const maintenanceSchedules = pgTable(
  "maintenance_schedules",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    scheduleType: text("schedule_type").notNull(),
    title: text("title").notNull(),
    intervalDays: integer("interval_days").notNull(),
    startDate: date("start_date").notNull(),
    nextDueAt: date("next_due_at").notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    activeTypeUnique: uniqueIndex("maintenance_schedules_item_type_active_idx")
      .on(table.itemId, table.scheduleType)
      .where(sql`${table.active} = true`),
    nextDueIdx: index("maintenance_schedules_next_due_idx").on(table.nextDueAt),
  })
);

export const maintenanceEvents = pgTable(
  "maintenance_events",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => maintenanceSchedules.id, { onDelete: "cascade" }),
    performedAt: date("performed_at").notNull(),
    conditionResult: text("condition_result"),
    notes: text("notes").notNull(),
    evidenceUrl: text("evidence_url"),
    completedByUserId: integer("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdx: index("maintenance_events_schedule_idx").on(table.scheduleId, table.performedAt),
  })
);
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryAttachment = typeof inventoryAttachments.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type OpsEvent = typeof opsEvents.$inferSelect;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type MaintenanceEvent = typeof maintenanceEvents.$inferSelect;

export type CreateItemRequest = InsertInventoryItem;
export type UpdateItemRequest = Partial<InsertInventoryItem>;

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  eventTypes: jsonb("event_types").notNull().$type<string[]>(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookOutbox = pgTable(
  "webhook_outbox",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    endpointId: integer("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when status becomes `processing`; cleared on terminal / retry. Used to reclaim stale claims after crash. */
    processingClaimedAt: timestamp("processing_claimed_at", { withTimezone: true }),
  },
  (table) => ({
    statusNextAttemptIdx: index("webhook_outbox_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
    endpointEventIdx: uniqueIndex("webhook_outbox_endpoint_event_idx").on(table.endpointId, table.eventId),
  })
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
/** REST list/create/update responses omit `secret` (signing material never round-trips). */
export type WebhookEndpointPublic = Omit<WebhookEndpoint, "secret">;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookOutbox = typeof webhookOutbox.$inferSelect;

/** Dynamic document templates (Handlebars HTML) for PDF/DOCX generation. */
export const DOC_TEMPLATE_VARIABLE_TYPES = ["text", "date", "number", "image", "list"] as const;
export type DocTemplateVariableType = (typeof DOC_TEMPLATE_VARIABLE_TYPES)[number];

export interface DocTemplateVariable {
  key: string;
  label: string;
  type: DocTemplateVariableType;
  required: boolean;
  defaultValue?: string;
}

export interface DocTemplatePageConfig {
  format?: "A4" | "Letter";
  landscape?: boolean;
  margins?: { top: string; right: string; bottom: string; left: string };
  printBackground?: boolean;
}

export const docTemplates = pgTable(
  "doc_templates",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    bodyHtml: text("body_html").notNull(),
    headerHtml: text("header_html"),
    footerHtml: text("footer_html"),
    cssStyles: text("css_styles"),
    variables: jsonb("variables").notNull().$type<DocTemplateVariable[]>(),
    pageConfig: jsonb("page_config").$type<DocTemplatePageConfig>(),
    category: text("category"),
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("doc_templates_category_idx").on(table.category),
    activeIdx: index("doc_templates_active_idx").on(table.active),
  })
);

export type DocTemplate = typeof docTemplates.$inferSelect;
export type InsertDocTemplate = typeof docTemplates.$inferInsert;
