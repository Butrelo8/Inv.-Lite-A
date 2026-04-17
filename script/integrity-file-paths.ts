/**
 * Shared rules for resolving DB-stored upload paths against the repo root.
 * Used by integrity scan and clear-stale-file-refs.
 */
import fs from "fs";
import path from "path";

export type UploadPathClass = "skip" | "missing" | "ok";

/**
 * Classify whether a stored path points to a file under `repoRoot` and exists on disk.
 * - skip: path escapes repo root (same as integrity scan — do not count or mutate)
 * - missing: under repo but file not found
 * - ok: file exists
 */
export function classifyUploadPath(fileUrl: string, repoRoot: string): UploadPathClass {
  const rel = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
  const full = path.resolve(repoRoot, rel);
  if (!full.startsWith(repoRoot)) return "skip";
  if (!fs.existsSync(full)) return "missing";
  return "ok";
}
