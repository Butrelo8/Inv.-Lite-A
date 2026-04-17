import { randomBytes } from "crypto";

export const BULK_UNDO_WINDOW_MIN = parseInt(process.env.BULK_UNDO_WINDOW_MIN ?? "10", 10);

export function buildUndoToken(): string {
  return `bulk_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

export function buildDeleteHistoryRemarks(prefix: string, name: string, undoToken: string, reason?: string): string {
  const reasonPart = reason ? ` (${reason})` : "";
  return `${prefix}: ${name}${reasonPart} [undo:${undoToken}]`;
}

export function extractUndoTokenFromRemarks(remarks?: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/\[undo:([A-Za-z0-9_]+)\]/);
  return match?.[1] ?? null;
}
