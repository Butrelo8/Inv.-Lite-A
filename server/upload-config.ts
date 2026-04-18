import path from "path";
import fsPromises from "fs/promises";
import type { Express } from "express";
import multer from "multer";

export const uploadsPath = path.join(process.cwd(), "uploads");
export const documentsPath = path.join(process.cwd(), "uploads", "documents");

/** Ensures employee document uploads directory exists (call before `documentUpload` multer). */
export async function ensureDocumentsDir(): Promise<void> {
  await fsPromises.mkdir(documentsPath, { recursive: true });
}

// Thumbnail hardening: avoid CPU/disk exhaustion from repeated on-demand generation.
export const THUMB_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const THUMB_RATE_LIMIT_MAX_REQUESTS = 12; // per IP per window
export const MAX_ORIGINAL_BYTES_FOR_THUMB = 8 * 1024 * 1024; // 8MB

type ThumbRate = { windowStart: number; count: number };
export const thumbRateByIp = new Map<string, ThumbRate>();

/** Coalesce concurrent generation for the same thumb so only one `sharp()` runs. */
export const thumbGenerationInFlight = new Map<string, Promise<void>>();

export function evictOldThumbRates(now: number) {
  const toDelete: string[] = [];
  thumbRateByIp.forEach((rate, ip) => {
    if (now - rate.windowStart > THUMB_RATE_LIMIT_WINDOW_MS) toDelete.push(ip);
  });
  for (const ip of toDelete) thumbRateByIp.delete(ip);
}

export function isHeicUpload(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  return ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif";
}

export async function normalizeHeicToJpeg(file: Express.Multer.File): Promise<Express.Multer.File> {
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

/** Multer for inventory item image upload (5MB, images + HEIC). */
export const imageUpload = multer({
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

/** Multer for CSV inventory import (5MB). */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /text\/csv|application\/csv/i.test(file.mimetype) || file.originalname.toLowerCase().endsWith(".csv");
    cb(null, ok);
  },
});

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
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

/** Multer middleware for employee document uploads (15MB, PDF/Office/text). */
export const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_DOC_MIMES.some((m) => file.mimetype === m) ||
      file.originalname?.toLowerCase().match(/\.(pdf|doc|docx|xls|xlsx|txt|odt)$/);
    cb(null, !!ok);
  },
});
