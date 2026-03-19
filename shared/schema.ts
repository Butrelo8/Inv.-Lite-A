import { pgTable, text, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
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
  imageUrl: text("image_url"), // Primary/thumbnail image (first or selected)
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  notes: text("notes"), // Observaciones / comentarios internos, mantenimiento, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const inventoryAttachments = pgTable("inventory_attachments", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryAttachment = typeof inventoryAttachments.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

export type CreateItemRequest = InsertInventoryItem;
export type UpdateItemRequest = Partial<InsertInventoryItem>;
