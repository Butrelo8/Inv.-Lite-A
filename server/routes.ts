import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { randomBytes } from "crypto";
import pg from "pg";
import multer from "multer";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import passport from "passport";
import { storage } from "./storage";
import { suggestCode } from "./code-generator";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertInventoryItemSchema, inventoryAttachments } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { inventoryItems } from "@shared/schema";
import type { UserRole } from "@shared/schema";
import { USER_ROLES } from "@shared/schema";
import { ensureThumbnail, thumbsPath } from "./thumbnails";
import { resolveSafeFilePath, resolveStoredFilePath } from "./path-utils";
import { consumeLoginRateLimit, clearLoginRateLimitForUser } from "./rate-limiter";
import { emitOpsEvent } from "./ops-events";
import {
  INVENTORY_EXPORT_HEADERS_ADMIN,
  INVENTORY_EXPORT_HEADERS_VIEWER,
  inventoryExportRowKey,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_ADMIN,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER,
  INVENTORY_EXPORT_PDF_HEADERS_ADMIN,
  INVENTORY_EXPORT_PDF_HEADERS_VIEWER,
  INVENTORY_EXPORT_PDF_KEY_MAP_ADMIN,
  INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER,
  INVENTORY_EXPORT_PDF_MAX_LEN_ADMIN,
  INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER,
} from "./inventory-export-config";

// Thumbnail hardening: avoid CPU/disk exhaustion from repeated on-demand generation.
const THUMB_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const THUMB_RATE_LIMIT_MAX_REQUESTS = 12; // per IP per window
const MAX_ORIGINAL_BYTES_FOR_THUMB = 8 * 1024 * 1024; // 8MB
const MAX_SHARED_NOTE_TITLE_LEN = 100;
const MAX_SHARED_NOTE_CONTENT_LEN = 2000;
const MAX_CSV_IMPORT_ROWS = 5000;
const BULK_UNDO_WINDOW_MIN = parseInt(process.env.BULK_UNDO_WINDOW_MIN ?? "10", 10);

type ThumbRate = { windowStart: number; count: number };
const thumbRateByIp = new Map<string, ThumbRate>();

// Coalesce concurrent generation for the same thumb so only one `sharp()` runs.
const thumbGenerationInFlight = new Map<string, Promise<void>>();

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

function buildUndoToken(): string {
  return `bulk_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

function buildDeleteHistoryRemarks(prefix: string, name: string, undoToken: string, reason?: string): string {
  const reasonPart = reason ? ` (${reason})` : "";
  return `${prefix}: ${name}${reasonPart} [undo:${undoToken}]`;
}

function extractUndoTokenFromRemarks(remarks?: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/\[undo:([A-Za-z0-9_]+)\]/);
  return match?.[1] ?? null;
}

async function restoreDeleteUndoByToken(client: pg.PoolClient, undoToken: string, userId: number | null) {
  const rowRes = await client.query(
    `select id, action_type, payload, expires_at, consumed_at
     from inventory_bulk_undo
     where token = $1
     for update`,
    [undoToken],
  );
  const row = rowRes.rows[0] as
    | {
        id: number;
        action_type: string;
        payload: { items: Record<string, unknown>[]; attachments: Record<string, unknown>[] };
        expires_at: Date;
        consumed_at: Date | null;
      }
    | undefined;
  if (!row) return { status: 404 as const, message: "Undo token not found" };
  if (row.consumed_at) return { status: 409 as const, message: "Undo token already consumed" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { status: 410 as const, message: "Undo token expired" };
  if (row.action_type !== "bulk_delete" && row.action_type !== "single_delete") {
    return { status: 400 as const, message: "Unsupported undo token type" };
  }

  const payload = row.payload || { items: [], attachments: [] };
  for (const item of payload.items || []) {
    await client.query(
      `insert into inventory_items
        (id, code, name, serial_number, size, units, condition, purchase_date, responsible, useful_life, category, image_url, company_id, notes, created_at, updated_at)
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (id) do nothing`,
      [
        item.id, item.code, item.name, item.serial_number, item.size, item.units, item.condition, item.purchase_date,
        item.responsible, item.useful_life, item.category, item.image_url, item.company_id, item.notes, item.created_at, item.updated_at,
      ],
    );
  }
  for (const attachment of payload.attachments || []) {
    await client.query(
      `insert into inventory_attachments (id, item_id, image_url)
       values ($1, $2, $3)
       on conflict (id) do nothing`,
      [attachment.id, attachment.item_id, attachment.image_url],
    );
  }
  await client.query(`update inventory_bulk_undo set consumed_at = now() where id = $1`, [row.id]);

  for (const item of payload.items || []) {
    storage
      .addHistoryRecord({
        productId: Number(item.id),
        companyId: Number.isFinite(Number(item.company_id)) ? Number(item.company_id) : null,
        transactionType: "CREATE",
        quantity: Number(item.units ?? 0),
        userId,
        remarks: `${row.action_type === "bulk_delete" ? "UNDO_BULK_DELETE" : "UNDO_DELETE"}: ${String(item.name ?? `Item #${item.id}`)}`,
      })
      .catch(() => undefined);
  }

  return { status: 200 as const, restored: (payload.items || []).length };
}

function getClientIp(req: Request): string {
  return (req.ip || "unknown").toString();
}

function evictOldThumbRates(now: number) {
  const toDelete: string[] = [];
  thumbRateByIp.forEach((rate, ip) => {
    if (now - rate.windowStart > THUMB_RATE_LIMIT_WINDOW_MS) toDelete.push(ip);
  });
  for (const ip of toDelete) thumbRateByIp.delete(ip);
}

/** Require user to be logged in. Returns 401 if not. */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.()) return next();
  res.status(401).json({ message: "Not authenticated" });
}

/** Require user to have one of the given roles. Use after requireAuth. Returns 403 if forbidden. */
function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as Express.User | undefined;
    const role = (user?.role ?? "viewer") as UserRole;
    if (allowedRoles.includes(role)) return next();
    void emitOpsEvent({
      eventType: "auth.forbidden",
      severity: "warning",
      endpoint: req.path,
      method: req.method,
      ip: getClientIp(req),
      userId: Number.isFinite(user?.id) ? user!.id : null,
      payload: { requiredRoles: allowedRoles, actualRole: role },
    });
    res.status(403).json({ message: "Forbidden: insufficient permissions" });
  };
}

const uploadsPath = path.join(process.cwd(), "uploads");

function isHeicUpload(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  return ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif";
}

async function normalizeHeicToJpeg(file: Express.Multer.File): Promise<Express.Multer.File> {
  if (!isHeicUpload(file)) return file;
  const heicConvertModule = await import("heic-convert");
  const heicConvert =
    (heicConvertModule as { default?: (options: { buffer: Buffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer | Buffer> })
      .default ??
    (heicConvertModule as unknown as (options: { buffer: Buffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer | Buffer>);
  const input = await fsPromises.readFile(file.path);
  const converted = await heicConvert({
    buffer: input,
    format: "JPEG",
    quality: 0.92,
  });
  const jpgPath = file.path.replace(/\.(heic|heif)$/i, ".jpg");
  await fsPromises.writeFile(jpgPath, Buffer.from(converted));
  await fsPromises.unlink(file.path).catch(() => undefined);
  file.path = jpgPath;
  file.filename = path.basename(jpgPath);
  file.mimetype = "image/jpeg";
  return file;
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"].includes(ext.toLowerCase()) ? ext : ".jpg";
    cb(null, `${req.params.id}-${Date.now()}${safeExt}`);
  },
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedMime = /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/i.test(file.mimetype);
    const allowedExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"].includes(ext);
    const allowed = allowedMime || allowedExt;
    cb(null, allowed);
  },
});
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /text\/csv|application\/csv/i.test(file.mimetype) || file.originalname.toLowerCase().endsWith(".csv");
    cb(null, ok);
  },
});

const documentsPath = path.join(process.cwd(), "uploads", "documents");
const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(documentsPath)) fs.mkdirSync(documentsPath, { recursive: true });
    cb(null, documentsPath);
  },
  filename: (_req, file, cb) => {
    const base = path.basename(file.originalname || "document").replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(base) || "";
    const name = ext ? base.slice(0, -ext.length) : base;
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});
const ALLOWED_DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/vnd.oasis.opendocument.text",
];
const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_DOC_MIMES.some((m) => file.mimetype === m) ||
      file.originalname?.toLowerCase().match(/\.(pdf|doc|docx|xls|xlsx|txt|odt)$/);
    cb(null, !!ok);
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // CSRF mitigation for cookie-authenticated users.
  // For state-changing requests we only allow same-origin browser requests by validating
  // `Origin` or `Referer` against the current request `Host`.
  app.use("/api", (req, res, next) => {
    const method = req.method.toUpperCase();
    const isUnsafe = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    if (!isUnsafe) return next();

    // Only enforce when the user is authenticated via the cookie-backed session.
    if (!req.isAuthenticated?.()) return next();

    const requestHost = req.headers.host;
    const secFetchSite = req.headers["sec-fetch-site"];
    const origin = req.headers.origin;
    const referer = req.headers.referer ?? req.headers.referrer;

    if (typeof requestHost !== "string" || !requestHost) return next();

    const secFetchOk =
      typeof secFetchSite === "string" &&
      (secFetchSite === "same-origin" || secFetchSite === "same-site");

    const headerHostMatches = (value: unknown) => {
      if (typeof value !== "string" || !value) return false;
      try {
        return new URL(value).host === requestHost;
      } catch {
        return false;
      }
    };

    // Prefer browser-provided fetch intent (`Sec-Fetch-Site`) when available.
    // If `Origin`/`Referer` exist, we still require their host to match.
    const originOrRefererPresent = origin != null || referer != null;
    const ok = originOrRefererPresent ? (headerHostMatches(origin) || headerHostMatches(referer)) : secFetchOk;
    if (!ok) {
      void emitOpsEvent({
        eventType: "auth.csrf_blocked",
        severity: "warning",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: Number.isFinite((req.user as any)?.id) ? (req.user as any).id : null,
        payload: { origin, referer, secFetchSite },
      });
      return res.status(403).json({ message: "CSRF protection: invalid origin" });
    }
    return next();
  });

  app.post("/api/auth/login", async (req, res, next) => {
    const username = typeof (req.body as { username?: unknown })?.username === "string"
      ? ((req.body as { username?: string }).username || "")
      : "";
    const ip = getClientIp(req);

    try {
      const limit = await consumeLoginRateLimit(ip, username);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        void emitOpsEvent({
          eventType: "auth.rate_limit_hit",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          payload: { username, retryAfterSec: limit.retryAfterSeconds },
        });
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
    } catch (err) {
      console.error("Login rate limiter failure", { ip, username }, err);
    }

    passport.authenticate("local", async (err: any, user: Express.User | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        void emitOpsEvent({
          eventType: "auth.login_failure",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          payload: { username, reason: info?.message || "invalid_credentials" },
        });
        return res.status(401).json({ message: info?.message || "Invalid username or password" });
      }
      try {
        await clearLoginRateLimitForUser(ip, username);
      } catch (clearErr) {
        console.error("Failed to clear login rate limiter entry", { ip, username }, clearErr);
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        void emitOpsEvent({
          eventType: "auth.login_success",
          severity: "info",
          endpoint: req.path,
          method: req.method,
          ip,
          userId: user.id,
          payload: { username: user.username },
        });
        res.json({ user: { id: user.id, username: user.username, role: user.role } });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated?.() && req.user) {
      res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role } });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.get("/api/users", requireAuth, requireRole("admin"), async (_req, res) => {
    const list = await storage.getUsers();
    res.json(list);
  });

  app.patch("/api/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid user id" });
    const role = (req.body as { role?: string })?.role;
    if (!role || !USER_ROLES.includes(role as UserRole)) {
      return res.status(400).json({ message: "Invalid role; use admin, editor, or viewer" });
    }
    const updated = await storage.updateUserRole(id, role);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  });

  app.get("/api/history", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const limit = req.query.limit ? Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 100)) : 100;
    const offset = req.query.offset != null ? Math.max(0, parseInt(String(req.query.offset), 10) || 0) : 0;
    const productId = req.query.productId ? parseInt(String(req.query.productId), 10) : undefined;
    const transactionType = (req.query.transactionType as string) || undefined;
    const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : undefined;
    const dateFrom = (req.query.dateFrom as string) || undefined;
    const dateTo = (req.query.dateTo as string) || undefined;
    const search = (req.query.search as string) || undefined;
    const filters =
      transactionType || userId != null || dateFrom || dateTo || search
        ? { transactionType, userId, dateFrom, dateTo, search }
        : undefined;
    const [entries, total] = await Promise.all([
      storage.getHistory(limit, offset, productId, filters),
      storage.getHistoryCount(productId, filters),
    ]);
    const tokens = Array.from(
      new Set(
        entries
          .filter((entry) => entry.transactionType === "DELETE")
          .map((entry) => extractUndoTokenFromRemarks(entry.remarks))
          .filter((token): token is string => !!token),
      ),
    );
    const undoRows = tokens.length > 0
      ? await pool.query(
          `select token, action_type, expires_at, consumed_at
           from inventory_bulk_undo
           where token = any($1::text[])`,
          [tokens],
        )
      : { rows: [] };
    const undoByToken = new Map(
      undoRows.rows.map((r: { token: string; action_type: string; expires_at: Date; consumed_at: Date | null }) => [r.token, r]),
    );
    const now = Date.now();
    const enriched = entries.map((entry) => {
      const undoToken = extractUndoTokenFromRemarks(entry.remarks);
      const undo = undoToken ? undoByToken.get(undoToken) : undefined;
      const undoExpiresAt = undo?.expires_at ? new Date(undo.expires_at).toISOString() : null;
      const canRevert = !!(
        entry.transactionType === "DELETE"
        && undoToken
        && undo
        && !undo.consumed_at
        && new Date(undo.expires_at).getTime() >= now
      );
      return {
        ...entry,
        undoToken: undoToken ?? null,
        undoExpiresAt,
        canRevert,
        revertKind: undo?.action_type === "bulk_delete" ? "bulk_delete" : undo?.action_type === "single_delete" ? "single_delete" : null,
      };
    });
    res.json({ entries: enriched, total });
  });

  app.post("/api/history/:id/revert", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const historyId = Number(req.params.id);
    if (!Number.isFinite(historyId)) return res.status(400).json({ message: "Invalid history id" });
    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
    const historyRes = await pool.query(
      `select id, transaction_type, remarks
       from inventory_history
       where id = $1`,
      [historyId],
    );
    const historyRow = historyRes.rows[0] as { id: number; transaction_type: string; remarks: string | null } | undefined;
    if (!historyRow) return res.status(404).json({ message: "History entry not found" });
    if (historyRow.transaction_type !== "DELETE") {
      return res.status(400).json({ message: "Only delete history entries can be reverted" });
    }
    const undoToken = extractUndoTokenFromRemarks(historyRow.remarks);
    if (!undoToken) return res.status(400).json({ message: "History entry is not revertible" });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await restoreDeleteUndoByToken(client, undoToken, userId);
      if (result.status !== 200) {
        await client.query("rollback");
        return res.status(result.status).json({ message: result.message });
      }
      await client.query("commit");
      return res.json({ restored: result.restored, undoToken });
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Revert failed" });
    } finally {
      client.release();
    }
  });

  app.get("/api/history/users", requireAuth, requireRole("editor", "admin"), async (_req, res) => {
    const users = await storage.getHistoryUsers();
    res.json(users);
  });

  app.get("/api/inventory/filters", requireAuth, async (_req, res) => {
    const options = await storage.getFilterOptions();
    res.json(options);
  });

  // Shared notes: viewers can read, editors/admin can write.
  app.get("/api/shared-notes", requireAuth, async (req, res) => {
    const rawItemId = req.query.itemId;
    const itemId = rawItemId != null && rawItemId !== "" ? Number(rawItemId) : undefined;
    const notes = await storage.getSharedNotes(Number.isFinite(itemId) ? itemId : undefined);
    res.json(notes);
  });

  app.post("/api/shared-notes", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const body = req.body as { title?: unknown; content?: unknown; itemId?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const rawItemId = body.itemId;
    const itemId = rawItemId != null && rawItemId !== "" ? Number(rawItemId) : NaN;
    if (!title) return res.status(400).json({ message: "title is required" });
    if (!content) return res.status(400).json({ message: "content is required" });
    if (title.length > MAX_SHARED_NOTE_TITLE_LEN) {
      return res.status(400).json({ message: `title must be at most ${MAX_SHARED_NOTE_TITLE_LEN} characters` });
    }
    if (content.length > MAX_SHARED_NOTE_CONTENT_LEN) {
      return res.status(400).json({ message: `content must be at most ${MAX_SHARED_NOTE_CONTENT_LEN} characters` });
    }
    if (!Number.isFinite(itemId)) return res.status(400).json({ message: "itemId is required" });

    const userId = (req.user as any)?.id;
    if (!Number.isFinite(userId)) return res.status(401).json({ message: "Not authenticated" });

    const created = await storage.createSharedNote({ title, content, authorId: userId, itemId });
    res.status(201).json(created);
  });

  app.patch("/api/shared-notes/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const body = req.body as { title?: unknown; content?: unknown };
    const updates: { title?: string; content?: string } = {};

    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return res.status(400).json({ message: "title cannot be empty" });
      if (title.length > MAX_SHARED_NOTE_TITLE_LEN) {
        return res.status(400).json({ message: `title must be at most ${MAX_SHARED_NOTE_TITLE_LEN} characters` });
      }
      updates.title = title;
    }
    if (body.content !== undefined) {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return res.status(400).json({ message: "content cannot be empty" });
      if (content.length > MAX_SHARED_NOTE_CONTENT_LEN) {
        return res.status(400).json({ message: `content must be at most ${MAX_SHARED_NOTE_CONTENT_LEN} characters` });
      }
      updates.content = content;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No updates provided" });

    const updated = await storage.updateSharedNote(id, updates);
    if (!updated) return res.status(404).json({ message: "Shared note not found" });
    res.json(updated);
  });

  app.delete("/api/shared-notes/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const deleted = await storage.deleteSharedNote(id);
    if (!deleted) return res.status(404).json({ message: "Shared note not found" });
    res.status(204).send();
  });

  app.get("/api/responsible", requireAuth, requireRole("editor", "admin"), async (_req, res) => {
    const list = await storage.getResponsibleWithCounts();
    res.json(list);
  });

  app.get("/api/employees/documents", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const responsible = req.query.responsible as string | undefined;
    const documentType = req.query.documentType as string | undefined;
    const list = await storage.getEmployeeDocuments(responsible, documentType);
    res.json(list);
  });

  app.get("/api/employees/document-status", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const documentType = (req.query.documentType as string) || "Contract";
    const expiresBefore = req.query.expiresBefore as string | undefined;
    const result = await storage.getResponsiblesWithoutDocumentType(documentType, expiresBefore ? { expiresBefore } : undefined);
    res.json(result);
  });

  app.get("/api/employees/documents/versions", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const responsible = req.query.responsible as string;
    const documentType = req.query.documentType as string;
    if (!responsible || !documentType) return res.status(400).json({ message: "responsible and documentType required" });
    const versions = await storage.getDocumentVersions(responsible, documentType);
    res.json(versions);
  });

  app.post("/api/employees/documents", requireAuth, requireRole("editor", "admin"), documentUpload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }
    const responsible = (req.body?.responsible as string)?.trim() || null;
    const itemIdRaw = req.body?.itemId;
    const itemId = itemIdRaw !== undefined && itemIdRaw !== "" ? Number(itemIdRaw) : null;
    const documentType = (req.body?.documentType as string)?.trim() || null;
    const expiresAtRaw = req.body?.expiresAt as string | undefined;
    const expiresAt = expiresAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw) ? expiresAtRaw : null;
    const fileUrl = `/uploads/documents/${req.file.filename}`;
    const doc = await storage.addEmployeeDocument({
      responsible,
      itemId: Number.isFinite(itemId) ? itemId : null,
      fileUrl,
      originalName: req.file.originalname || req.file.filename,
      mimeType: req.file.mimetype,
      documentType,
      expiresAt,
      userId: (req as any).user?.id,
    });
    res.status(201).json(doc);
  });

  app.patch("/api/employees/documents/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const body = req.body as { itemId?: number | null | string; documentType?: string | null; expiresAt?: string | null };
    const updates: { itemId?: number | null; documentType?: string | null; expiresAt?: string | null } = {};
    if (body.itemId !== undefined) {
      const raw = body.itemId;
      updates.itemId = raw === null || raw === "" ? null : Number(raw);
      if (updates.itemId !== null && !Number.isFinite(updates.itemId)) return res.status(400).json({ message: "Invalid itemId" });
    }
    if (body.documentType !== undefined) updates.documentType = body.documentType === null || body.documentType === "" ? null : String(body.documentType).trim();
    if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt === null || body.expiresAt === "" ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(body.expiresAt)) ? String(body.expiresAt) : undefined;
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No updates provided" });
    const doc = await storage.updateEmployeeDocument(id, updates);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  });

  app.delete("/api/employees/documents/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const deleted = await storage.deleteEmployeeDocument(id);
    if (!deleted) return res.status(404).json({ message: "Document not found" });

    const filePath = resolveStoredFilePath(documentsPath, deleted.fileUrl);
    if (!filePath) {
      console.error("Refusing to unlink employee document file outside documentsPath", {
        documentId: id,
        fileUrl: deleted.fileUrl,
      });
    } else if (fs.existsSync(filePath)) {
      try {
        const st = fs.statSync(filePath);
        if (st.isFile()) fs.unlinkSync(filePath);
      } catch (err) {
        console.error("Failed to unlink employee document file", { documentId: id, filePath }, err);
      }
    }
    res.status(204).send();
  });

  app.get("/api/inventory/suggest-code", requireAuth, async (req, res) => {
    const category = (req.query.category as string) ?? "";
    const name = (req.query.name as string) ?? "";
    const code = await suggestCode(category || undefined, name || undefined);
    res.json({ code });
  });

  app.get(api.inventory.list.path, requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 50)) : 50;
    const offset = req.query.offset != null ? Math.max(0, parseInt(String(req.query.offset), 10) || 0) : 0;
    const { items, total } = await storage.getItemsPage(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter, limit, offset);
    res.json({ items, total });
  });

  app.get("/api/companies", requireAuth, async (_req, res) => {
    const list = await storage.getCompanies();
    res.json(list);
  });

  app.post("/api/companies", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const name = (req.body as { name?: string })?.name?.trim();
    if (!name) return res.status(400).json({ message: "name is required" });
    const company = await storage.createCompany(name);
    res.status(201).json(company);
  });

  app.patch("/api/companies/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const name = (req.body as { name?: string })?.name?.trim();
    if (!name) return res.status(400).json({ message: "name is required" });
    const company = await storage.updateCompany(id, name);
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  });

  app.delete("/api/companies/:id", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const deleted = await storage.deleteCompany(id);
    if (!deleted) return res.status(404).json({ message: "Company not found" });
    res.status(204).send();
  });

  // Export and import must be before :id to avoid matching "export"/"import" as id
  app.get("/api/inventory/export/template", requireAuth, (_req, res) => {
    const csv = "code,name,serial_number,size,units,condition,purchase_date,responsible,useful_life,category\nINV-001,Sample Item,SN-123,Medium,1,Good,2024-01-15,John Doe,5 years,Electronics";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-template.csv"');
    res.send("\uFEFF" + csv);
  });

  const parseExportIds = (query: Record<string, unknown>): number[] | undefined => {
    const raw = query.ids;
    if (raw == null) return undefined;
    const str = Array.isArray(raw) ? raw[0] : raw;
    if (!str || typeof str !== "string") return undefined;
    const ids = str.split(",").map((s) => parseInt(String(s).trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids : undefined;
  };

  app.get("/api/inventory/export", requireAuth, async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const items = ids ? await storage.getItemsByIds(ids) : await storage.getItems(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const headers = INVENTORY_EXPORT_HEADERS_VIEWER as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => {
        const val = (item as Record<string, unknown>)[rowKey(h)];
        const s = String(val ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.csv"');
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  });

  app.get("/api/inventory/export/xlsx", requireAuth, async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const items = ids ? await storage.getItemsByIds(ids) : await storage.getItems(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const headers = INVENTORY_EXPORT_HEADERS_VIEWER as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => (item as Record<string, unknown>)[rowKey(h)] ?? "")
    );
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Inventory");
    worksheet.addRows([headers, ...rows]);
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.xlsx"');
    res.send(Buffer.from(buf));
  });

  app.get("/api/inventory/export/pdf", requireAuth, async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const items = ids ? await storage.getItemsByIds(ids) : await storage.getItems(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const headers = INVENTORY_EXPORT_PDF_HEADERS_VIEWER as unknown as string[];
    const keyMap = INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER;
    const maxLen = INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER;
    const getVal = (item: Record<string, unknown>, h: string) =>
      String(item[keyMap[h]] ?? "").slice(0, maxLen[h] ?? 35);
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.pdf"');
    doc.pipe(res);
    const logoPath = [path.join(process.cwd(), "public", "logo.jpg"), path.join(process.cwd(), "client", "public", "logo.jpg"), path.join(process.cwd(), "logo.jpg")].find((p) => fs.existsSync(p));
    if (logoPath) {
      const logoWidth = 140;
      const logoX = (842 - logoWidth) / 2;
      doc.image(logoPath, logoX, 25, { width: logoWidth });
      doc.y = 25 + 60 + 15;
    }
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER as unknown as number[];
    const startX = 30;
    let y = doc.y;
    doc.fontSize(7).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
    });
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
    y += 15;
    doc.font("Helvetica");
    for (const item of items) {
      if (y > 540) {
        doc.addPage({ layout: "landscape" });
        y = 30;
        doc.fontSize(7).font("Helvetica-Bold");
        headers.forEach((h, i) => {
          doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
        });
        doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
        y += 15;
        doc.font("Helvetica");
      }
      const row = headers.map((h) => getVal(item as Record<string, unknown>, h));
      let rowHeight = 0;
      row.forEach((cell, i) => {
        const h = doc.heightOfString(cell, { width: colWidths[i] });
        rowHeight = Math.max(rowHeight, h);
      });
      row.forEach((cell, i) => {
        doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 4, { width: colWidths[i], height: rowHeight });
      });
      doc.moveTo(startX, y + rowHeight + 4).lineTo(startX + totalWidth, y + rowHeight + 4).stroke();
      y += rowHeight + 4;
    }
    doc.end();
  });

  // Admin exports include internal notes fields.
  app.get("/api/inventory/export/admin", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const items = ids ? await storage.getItemsByIds(ids) : await storage.getItems(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const headers = INVENTORY_EXPORT_HEADERS_ADMIN as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => {
        const val = (item as Record<string, unknown>)[rowKey(h)];
        const s = String(val ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export-admin.csv"');
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  });

  app.get("/api/inventory/export/admin/xlsx", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const items = ids ? await storage.getItemsByIds(ids) : await storage.getItems(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const headers = INVENTORY_EXPORT_HEADERS_ADMIN as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => (item as Record<string, unknown>)[rowKey(h)] ?? "")
    );
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Inventory");
    worksheet.addRows([headers, ...rows]);
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export-admin.xlsx"');
    res.send(Buffer.from(buf));
  });

  app.get("/api/inventory/export/admin/pdf", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const items = ids ? await storage.getItemsByIds(ids) : await storage.getItems(search, category, responsible, companyId, dateFrom, dateTo, addedAfter, modifiedAfter);
    const headers = INVENTORY_EXPORT_PDF_HEADERS_ADMIN as unknown as string[];
    const keyMap = INVENTORY_EXPORT_PDF_KEY_MAP_ADMIN;
    const maxLen = INVENTORY_EXPORT_PDF_MAX_LEN_ADMIN;
    const getVal = (item: Record<string, unknown>, h: string) =>
      String(item[keyMap[h]] ?? "").slice(0, maxLen[h] ?? 35);
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export-admin.pdf"');
    doc.pipe(res);
    const logoPath = [path.join(process.cwd(), "public", "logo.jpg"), path.join(process.cwd(), "client", "public", "logo.jpg"), path.join(process.cwd(), "logo.jpg")].find((p) => fs.existsSync(p));
    if (logoPath) {
      const logoWidth = 140;
      const logoX = (842 - logoWidth) / 2;
      doc.image(logoPath, logoX, 25, { width: logoWidth });
      doc.y = 25 + 60 + 15;
    }
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_ADMIN as unknown as number[];
    const startX = 30;
    let y = doc.y;
    doc.fontSize(7).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
    });
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
    y += 15;
    doc.font("Helvetica");
    for (const item of items) {
      if (y > 540) {
        doc.addPage({ layout: "landscape" });
        y = 30;
        doc.fontSize(7).font("Helvetica-Bold");
        headers.forEach((h, i) => {
          doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
        });
        doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
        y += 15;
        doc.font("Helvetica");
      }
      const row = headers.map((h) => getVal(item as Record<string, unknown>, h));
      let rowHeight = 0;
      row.forEach((cell, i) => {
        const h = doc.heightOfString(cell, { width: colWidths[i] });
        rowHeight = Math.max(rowHeight, h);
      });
      row.forEach((cell, i) => {
        doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 4, { width: colWidths[i], height: rowHeight });
      });
      doc.moveTo(startX, y + rowHeight + 4).lineTo(startX + totalWidth, y + rowHeight + 4).stroke();
      y += rowHeight + 4;
    }
    doc.end();
  });

  app.post("/api/inventory/import", requireAuth, requireRole("editor", "admin"), csvUpload.single("file"), async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No CSV file provided" });
    }
    try {
      let content = req.file.buffer.toString("utf-8");
      content = content.replace(/^\uFEFF/, ""); // Remove BOM
      const firstLine = content.split(/\r?\n/)[0] ?? "";
      const delim = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
      const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
        delimiter: delim,
      });
      if (parsed.data.length > MAX_CSV_IMPORT_ROWS) {
        return res.status(400).json({
          message: `CSV exceeds maximum ${MAX_CSV_IMPORT_ROWS} rows`,
        });
      }
      const created: number[] = [];
      const errors: { row: number; message: string }[] = [];
      const normalize = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const colAliases: Record<string, string> = {
        code: "code", codigo: "code", código: "code", id: "code",
        name: "name", nombre: "name", descripcion: "name", descripción: "name", articulo: "name", artículo: "name", item: "name",
        "serial number": "serialNumber", serial_number: "serialNumber", serialnumber: "serialNumber",
        "número de serie": "serialNumber", numeroserie: "serialNumber", "no. serie": "serialNumber", serial: "serialNumber",
        size: "size", tamaño: "size", tamano: "size",
        units: "units", unidades: "units", cantidad: "units", qty: "units",
        condition: "condition", estado: "condition", condicion: "condition",
        "purchase date": "purchaseDate", purchase_date: "purchaseDate", "fecha de compra": "purchaseDate",
        fechacompra: "purchaseDate", "fecha compra": "purchaseDate", date: "purchaseDate", fecha: "purchaseDate",
        responsible: "responsible", responsable: "responsible",
        "useful life": "usefulLife", useful_life: "usefulLife", "vida útil": "usefulLife", "vida util": "usefulLife",
        usefullife: "usefulLife", duracion: "usefulLife", duración: "usefulLife",
        category: "category", categoria: "category", categoría: "category",
        company_id: "companyId", companyid: "companyId", empresa: "companyId", company: "companyId",
        notes: "notes", observaciones: "notes", observacion: "notes", comentarios: "notes", comment: "notes",
      };
      const mapHeader = (key: string): string => {
        const n = normalize(key);
        return colAliases[n] ?? colAliases[key] ?? key;
      };
      const parseDate = (val: string): string | null => {
        if (!val || typeof val !== "string") return null;
        const s = val.trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // Already YYYY-MM-DD
        const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // DD/MM/YY or DD/MM/YYYY
        if (dmy) {
          const [, d, m, y] = dmy;
          const year = y!.length === 2 ? (parseInt(y!, 10) >= 50 ? `19${y}` : `20${y}`) : y!;
          return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
        }
        return null;
      };
      for (let i = 0; i < parsed.data.length; i++) {
        const row = parsed.data[i];
        const mapped: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
          if (!key || key.trim() === "") continue;
          const k = mapHeader(key);
          const v = typeof val === "string" ? val.trim() : val;
          if (k === "units") mapped.units = parseInt(String(v || "0"), 10) || 0;
          else if (k === "purchaseDate") mapped.purchaseDate = v ? parseDate(String(v)) || null : null;
          else if (k === "companyId") {
            const n = v ? parseInt(String(v), 10) : NaN;
            mapped.companyId = Number.isFinite(n) ? n : null;
          }
          else mapped[k] = v || null;
        }
        if (!mapped.code && !mapped.name) continue; // Skip empty rows
        // Empty code triggers auto-assignment in createItem
        if (!mapped.code && mapped.name) mapped.code = "";
        const parsedRow = insertInventoryItemSchema.safeParse(mapped);
        if (parsedRow.success) {
          const item = await storage.createItem(parsedRow.data);
          created.push(item.id);
          const userId = (req as any).user?.id;
          storage
            .addHistoryRecord({ productId: item.id, companyId: item.companyId ?? null, transactionType: "IMPORT", quantity: item.units, userId, remarks: item.name })
            .catch((err) => {
              console.error("History log failed (IMPORT)", { productId: item.id, userId }, err);
              void emitOpsEvent({
                eventType: "job.history_write_failure",
                severity: "critical",
                endpoint: req.path,
                method: req.method,
                ip: getClientIp(req),
                userId: Number.isFinite(userId) ? userId : null,
                payload: { action: "IMPORT", productId: item.id, error: err instanceof Error ? err.message : String(err) },
              });
            });
        } else {
          const errMsg = parsedRow.error.errors[0]?.message ?? "Validation failed";
          const field = parsedRow.error.errors[0]?.path?.[0];
          errors.push({ row: i + 2, message: field ? `${field}: ${errMsg}` : errMsg });
        }
      }
      const detectedHeaders = parsed.data[0] ? Object.keys(parsed.data[0]) : [];
      void emitOpsEvent({
        eventType: "job.import_success",
        severity: "info",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: Number.isFinite((req as any).user?.id) ? (req as any).user.id : null,
        payload: { rowCount: created.length, errorCount: errors.length },
      });
      res.json({
        created: created.length,
        errors,
        ...(created.length === 0 && errors.length > 0 && { hint: `Detected columns: ${detectedHeaders.join(", ") || "none"}. Ensure your CSV has headers matching: code, name (or codigo, nombre in Spanish).` }),
      });
    } catch (err) {
      void emitOpsEvent({
        eventType: "job.import_failure",
        severity: "warning",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: Number.isFinite((req as any).user?.id) ? (req as any).user.id : null,
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      res.status(400).json({ message: err instanceof Error ? err.message : "Import failed" });
    }
  });

  app.get(api.inventory.get.path, requireAuth, async (req, res) => {
    const item = await storage.getItem(Number(req.params.id));
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  });

  app.post(api.inventory.create.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    try {
      const input = api.inventory.create.input.parse(req.body);
      const item = await storage.createItem(input);
      const userId = (req as any).user?.id;
      storage
        .addHistoryRecord({ productId: item.id, companyId: item.companyId ?? null, transactionType: "CREATE", quantity: item.units, userId, remarks: item.name })
        .catch((err) => {
          console.error("History log failed (CREATE)", { productId: item.id, userId }, err);
          void emitOpsEvent({
            eventType: "job.history_write_failure",
            severity: "critical",
            endpoint: req.path,
            method: req.method,
            ip: getClientIp(req),
            userId: Number.isFinite(userId) ? userId : null,
            payload: { action: "CREATE", productId: item.id, error: err instanceof Error ? err.message : String(err) },
          });
        });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.inventory.update.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    try {
      const prevItem = await storage.getItem(Number(req.params.id));
      const input = api.inventory.update.input.parse(req.body);
      const item = await storage.updateItem(Number(req.params.id), input);
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      const userId = (req as any).user?.id;
      const qtyDelta = (input.units ?? prevItem?.units ?? item.units) - (prevItem?.units ?? 0);
      storage
        .addHistoryRecord({ productId: item.id, companyId: item.companyId ?? null, transactionType: "ADJUSTMENT", quantity: qtyDelta, userId, remarks: item.name })
        .catch((err) => {
          console.error("History log failed (ADJUSTMENT)", { productId: item.id, userId, qtyDelta }, err);
          void emitOpsEvent({
            eventType: "job.history_write_failure",
            severity: "critical",
            endpoint: req.path,
            method: req.method,
            ip: getClientIp(req),
            userId: Number.isFinite(userId) ? userId : null,
            payload: { action: "ADJUSTMENT", productId: item.id, qtyDelta, error: err instanceof Error ? err.message : String(err) },
          });
        });
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.inventory.delete.path, requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const id = Number(req.params.id);
    const item = await storage.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    const attachments = await storage.getAttachments(id);
    const undoToken = buildUndoToken();
    const undoExpiresAt = new Date(Date.now() + BULK_UNDO_WINDOW_MIN * 60_000);
    const payload = { items: [item], attachments, deletedIds: [id] };
    const itemName = item.name ?? `Item #${id}`;
    const remarks = buildDeleteHistoryRemarks("DELETE", itemName, undoToken);
    const userId = (req as any).user?.id;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into inventory_bulk_undo (token, action_type, payload, expires_at, created_by_user_id)
         values ($1, $2, $3::jsonb, $4, $5)`,
        [undoToken, "single_delete", JSON.stringify(payload), undoExpiresAt.toISOString(), userId ?? null],
      );
      // Keep FK integrity: write DELETE history while the item row still exists.
      await client.query(
        `insert into inventory_history (product_id, company_id, transaction_type, quantity, user_id, remarks)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, item.companyId ?? null, "DELETE", item.units ?? 0, userId ?? null, remarks],
      );
      await client.query("delete from inventory_items where id = $1", [id]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      console.error("History log failed (DELETE)", { productId: id, userId }, err);
      void emitOpsEvent({
        eventType: "job.history_write_failure",
        severity: "critical",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: Number.isFinite(userId) ? userId : null,
        payload: { action: "DELETE", productId: id, error: err instanceof Error ? err.message : String(err) },
      });
      return res.status(500).json({ message: "Delete failed" });
    } finally {
      client.release();
    }
    res.status(200).json({ deleted: 1, undoToken, undoExpiresAt: undoExpiresAt.toISOString() });
  });

  app.post("/api/inventory/bulk/update", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = bulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const ids = uniqueIds(parsed.data.ids);
    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
    const existing = await storage.getItemsByIds(ids);
    const existingById = new Map(existing.map((i) => [i.id, i]));
    const missing = ids.filter((id) => !existingById.has(id));
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.updates.condition !== undefined) updates.condition = parsed.data.updates.condition;
    if (parsed.data.updates.responsible !== undefined) updates.responsible = parsed.data.updates.responsible;

    for (const item of existing) {
      await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, item.id));
      const updatedItem = await storage.getItem(item.id);
      const remarks = `BULK_UPDATE: ${item.name}${parsed.data.reason ? ` (${parsed.data.reason})` : ""}`;
      const qtyDelta = (updatedItem?.units ?? item.units) - item.units;
      storage
        .addHistoryRecord({
          productId: item.id,
          companyId: updatedItem?.companyId ?? item.companyId ?? null,
          transactionType: "ADJUSTMENT",
          quantity: qtyDelta,
          userId,
          remarks,
        })
        .catch((err) => {
          console.error("History log failed (BULK_UPDATE)", { productId: item.id, userId }, err);
        });
    }

    res.json({ updated: existing.length, missing });
  });

  app.post("/api/inventory/bulk/archive", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = bulkArchiveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const deduped = uniqueIds(parsed.data.ids);
    const existing = await storage.getItemsByIds(deduped);
    const existingById = new Map(existing.map((i) => [i.id, i]));
    const missing = deduped.filter((id) => !existingById.has(id));
    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
    for (const item of existing) {
      await db.update(inventoryItems).set({ condition: "Archived", updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
      storage
        .addHistoryRecord({
          productId: item.id,
          companyId: item.companyId ?? null,
          transactionType: "ADJUSTMENT",
          quantity: 0,
          userId,
          remarks: `BULK_ARCHIVE: ${item.name}${parsed.data.reason ? ` (${parsed.data.reason})` : ""}`,
        })
        .catch(() => undefined);
    }
    res.json({ archived: existing.length, missing });
  });

  app.post("/api/inventory/bulk/delete", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const ids = uniqueIds(parsed.data.ids);
    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
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
    const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
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

  app.get("/api/inventory/:id/documents", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const item = await storage.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    const list = await storage.getDocumentsByItemId(id);
    res.json(list);
  });

  app.get("/api/inventory/:id/attachments", requireAuth, async (req, res) => {
    const item = await storage.getItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Item not found" });
    const attachments = await storage.getAttachments(Number(req.params.id));
    res.json(attachments);
  });

  app.delete("/api/inventory/:id/attachments/:attachmentId", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const itemId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);
    const item = await storage.getItem(itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    const deleted = await storage.deleteAttachmentForItem(itemId, attachmentId);
    if (!deleted) return res.status(404).json({ message: "Attachment not found" });
    const imgPath = resolveStoredFilePath(uploadsPath, deleted.imageUrl);
    if (!imgPath) {
      console.error("Refusing to unlink inventory attachment image outside uploadsPath", {
        itemId,
        attachmentId,
        imageUrl: deleted.imageUrl,
      });
    } else if (fs.existsSync(imgPath)) {
      try {
        const st = fs.statSync(imgPath);
        if (st.isFile()) fs.unlinkSync(imgPath);
      } catch (err) {
        console.error("Failed to unlink inventory attachment image", { itemId, attachmentId, imgPath }, err);
      }
    }
    if (item.imageUrl === deleted.imageUrl) {
      const remaining = await storage.getAttachments(itemId);
      const newPrimary = remaining[0]?.imageUrl ?? null;
      await db.update(inventoryItems).set({ imageUrl: newPrimary }).where(eq(inventoryItems.id, itemId));
    }
    res.status(204).send();
  });

  // Private upload serving (A1 + 2B)
  // - Images: any authenticated user (viewer can see inventory)
  // - Documents: editor/admin only
  // - Thumbnails: require auth; generate from existing images on-demand
  app.get("/uploads/documents/:filename", requireAuth, requireRole("editor", "admin"), (req, res) => {
    const requestedFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filePath = resolveSafeFilePath(documentsPath, requestedFilename);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return res.status(404).json({ message: "File not found" });
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(filePath);
  });

  app.get("/uploads/:filename", requireAuth, (req, res) => {
    const requestedFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filePath = resolveSafeFilePath(uploadsPath, requestedFilename);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return res.status(404).json({ message: "File not found" });
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(filePath);
  });

  // On-demand thumbnail: generates a WebP thumb for any existing image upload if it doesn't exist yet.
  app.get("/uploads/thumbs/:filename", requireAuth, async (req, res) => {
    const requestedFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const safeFilename = path.basename(requestedFilename);
    if (!safeFilename.toLowerCase().endsWith(".webp")) return res.status(404).json({ message: "File not found" });

    const thumbFilePath = resolveSafeFilePath(thumbsPath, safeFilename);
    if (!thumbFilePath) return res.status(404).json({ message: "File not found" });

    // Rate-limit thumbnail requests to reduce filesystem/CPU abuse.
    const ip = getClientIp(req);
    const now = Date.now();
    evictOldThumbRates(now);
    const current = thumbRateByIp.get(ip);
    if (!current || now - current.windowStart > THUMB_RATE_LIMIT_WINDOW_MS) {
      thumbRateByIp.set(ip, { windowStart: now, count: 1 });
    } else {
      current.count += 1;
      if (current.count > THUMB_RATE_LIMIT_MAX_REQUESTS) {
        void emitOpsEvent({
          eventType: "auth.rate_limit_hit",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          userId: Number.isFinite((req as any).user?.id) ? (req as any).user.id : null,
          payload: { category: "thumbnail", maxRequests: THUMB_RATE_LIMIT_MAX_REQUESTS },
        });
        return res.status(429).json({ message: "Too many thumbnail requests" });
      }
    }

    if (!fs.existsSync(thumbFilePath)) {
      // Derive original filename: same base name, any image extension
      const base = path.basename(safeFilename, ".webp");
      const uploadsDir = path.join(process.cwd(), "uploads");
      const exts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

      let originalPath: string | null = null;
      for (const ext of exts) {
        const candidate = path.join(uploadsDir, base + ext);
        if (fs.existsSync(candidate)) {
          const candidateStat = fs.statSync(candidate);
          if (candidateStat.isFile()) {
            originalPath = candidate;
            break;
          }
        }
      }

      if (!originalPath) return res.status(404).json({ message: "Original not found" });

      // Extra safety: avoid generating thumbnails from unexpectedly large files.
      // (Upload routes already cap image size, but this protects against manual filesystem tampering.)
      const originalStat = fs.statSync(originalPath);
      if (originalStat.size > MAX_ORIGINAL_BYTES_FOR_THUMB) {
        return res.status(413).json({ message: "Original image too large for thumbnail generation" });
      }

      try {
        const generationKey = thumbFilePath;
        const inFlight = thumbGenerationInFlight.get(generationKey);
        if (inFlight) {
          await inFlight;
        } else {
          const p = ensureThumbnail(originalPath).then(() => {});
          thumbGenerationInFlight.set(generationKey, p);
          await p;
        }
      } catch (err) {
        console.error("Thumbnail generation failed", { base, safeFilename }, err);
        void emitOpsEvent({
          eventType: "job.thumbnail_failure",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          userId: Number.isFinite((req as any).user?.id) ? (req as any).user.id : null,
          payload: { filename: safeFilename, error: err instanceof Error ? err.message : String(err) },
        });
        return res.status(500).json({ message: "Thumbnail generation failed" });
      } finally {
        thumbGenerationInFlight.delete(thumbFilePath);
      }
    }

    if (!fs.existsSync(thumbFilePath)) return res.status(404).json({ message: "Thumbnail not found" });
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(thumbFilePath);
  });

  app.post("/api/inventory/:id/image", requireAuth, requireRole("editor", "admin"), imageUpload.single("image"), async (req, res) => {
    // #region agent log
    fetch('http://127.0.0.1:7810/ingest/124a1cb1-6e13-41d5-98f5-ef3dbb7726dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d2f11e'},body:JSON.stringify({sessionId:'d2f11e',runId:'initial',hypothesisId:'H3',location:'server/routes.ts:1444',message:'inventory image upload route entered',data:{itemId:req.params.id,hasFile:Boolean(req.file),fileMime:req.file?.mimetype ?? null,fileSize:req.file?.size ?? null,userId:Number.isFinite((req as any).user?.id) ? (req as any).user.id : null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!req.file) {
      // #region agent log
      fetch('http://127.0.0.1:7810/ingest/124a1cb1-6e13-41d5-98f5-ef3dbb7726dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d2f11e'},body:JSON.stringify({sessionId:'d2f11e',runId:'post-fix',hypothesisId:'H5',location:'server/routes.ts:1446',message:'image upload skipped due to missing file',data:{itemId:req.params.id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return res.status(400).json({ message: "No valid image file provided" });
    }
    await normalizeHeicToJpeg(req.file);
    const id = Number(req.params.id);
    const item = await storage.getItem(id);
    if (!item) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ message: "Item not found" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    // Pre-generate thumbnail so it's ready immediately on the next page load
    ensureThumbnail(req.file.path).catch((err) => console.error("Thumbnail pre-generation failed", { itemId: id }, err));
    // #region agent log
    fetch('http://127.0.0.1:7810/ingest/124a1cb1-6e13-41d5-98f5-ef3dbb7726dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d2f11e'},body:JSON.stringify({sessionId:'d2f11e',runId:'initial',hypothesisId:'H4',location:'server/routes.ts:1457',message:'about to persist attachment',data:{itemId:id,imageUrl,existingPrimaryImage:Boolean(item.imageUrl)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const attachment = await storage.addAttachment(id, imageUrl);
    const attachments = await storage.getAttachments(id);
    // Keep list thumbnail in sync with the most recent uploaded image.
    await db.update(inventoryItems).set({ imageUrl }).where(eq(inventoryItems.id, id));
    const [updated] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    // #region agent log
    fetch('http://127.0.0.1:7810/ingest/124a1cb1-6e13-41d5-98f5-ef3dbb7726dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d2f11e'},body:JSON.stringify({sessionId:'d2f11e',runId:'initial',hypothesisId:'H4',location:'server/routes.ts:1463',message:'inventory image upload success response',data:{itemId:id,attachmentId:attachment?.id ?? null,attachmentsCount:attachments.length,primaryImageUrl:updated?.imageUrl ?? null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.json({ ...updated, attachments });
  });

  app.get("/api/ops-health/summary", requireAuth, requireRole("editor", "admin"), async (_req, res) => {
    const summary = await storage.getOpsSummary();
    res.json(summary);
  });

  app.get("/api/ops-health/events", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;
    const severityRaw = String(req.query.severity ?? "").trim();
    const severity = severityRaw === "critical" || severityRaw === "warning" || severityRaw === "info" ? severityRaw : undefined;
    const events = await storage.getOpsEventFeed(limit, severity);
    res.json(events);
  });

  return httpServer;
}

// Migrate existing imageUrl to attachments table (one-time for old data)
async function migrateImageUrlToAttachments() {
  const items = await storage.getItems();
  for (const item of items) {
    if (item.imageUrl) {
      const attachments = await storage.getAttachments(item.id);
      if (attachments.length === 0) {
        await storage.addAttachment(item.id, item.imageUrl);
      }
    }
  }
}

// Seed function to add some initial data
async function seedDatabase() {
  await migrateImageUrlToAttachments().catch((err) => console.error("ImageUrl->attachments migration failed", err));
  const existingItems = await storage.getItems();
  if (existingItems.length === 0) {
    await storage.createItem({
      code: "LAP-001",
      name: "Laptop Dell XPS 15",
      serialNumber: "DL123456789",
      size: "15 inch",
      units: 5,
      condition: "Nuevo",
      purchaseDate: "2023-01-15",
      responsible: "Juan Perez",
      usefulLife: "3 years",
      category: "Electronics"
    });
    await storage.createItem({
      code: "MON-202",
      name: "Monitor Samsung 27\"",
      serialNumber: "SN987654321",
      size: "27 inch",
      units: 10,
      condition: "Bueno",
      purchaseDate: "2023-03-20",
      responsible: "Ana Garcia",
      usefulLife: "5 years",
      category: "Electronics"
    });
    await storage.createItem({
      code: "CHR-101",
      name: "Silla Ergonómica",
      serialNumber: "N/A",
      size: "Standard",
      units: 20,
      condition: "Excelente",
      purchaseDate: "2023-06-10",
      responsible: "Oficina Central",
      usefulLife: "10 years",
      category: "Furniture"
    });
  }
}

// Invoke seed on startup.
// This must be opt-in to avoid nondeterminism/data drift in production and container environments.
// (Tests set NODE_ENV="test" and will not seed.)
const shouldAutoSeed =
  process.env.SEED_DB === "true" ||
  process.env.SEED_DB === "1" ||
  process.env.NODE_ENV === "development";

if (shouldAutoSeed && process.env.NODE_ENV !== "test") {
  seedDatabase().catch((err) => console.error("Error seeding database:", err));
}
