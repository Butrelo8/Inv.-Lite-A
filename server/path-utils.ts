import path from "path";

/**
 * Resolve a requested filename under a base directory, blocking traversal.
 * Used for routes like `GET /uploads/:filename`.
 */
export function resolveSafeFilePath(baseDir: string, requestedFilename: string): string | null {
  const baseResolved = path.resolve(baseDir);
  const safeName = path.basename(requestedFilename);
  const resolved = path.resolve(baseResolved, safeName);

  // Reject resolving to the base directory itself (e.g. requested '.' or empty).
  if (resolved === baseResolved) return null;

  const baseResolvedWithSep = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  if (!resolved.startsWith(baseResolvedWithSep)) return null;
  return resolved;
}

/**
 * Resolve a stored `/uploads/...` (or `uploads/...`) path under `baseDir`, blocking traversal.
 *
 * Important: this is for *stored* fileUrl/imageUrl values that should already be filenames,
 * but we still defend against malformed/legacy DB rows.
 */
export function resolveStoredFilePath(baseDir: string, fileUrl: string): string | null {
  if (typeof fileUrl !== "string") return null;
  if (fileUrl.length === 0) return null;
  if (fileUrl.includes("\0")) return null;

  // Normalize to POSIX slashes and drop a leading "/" so we can treat it as a relative path.
  const clean = fileUrl.replace(/\\/g, "/").replace(/^\//, "");
  const baseResolved = path.resolve(baseDir);
  const resolved = path.resolve(process.cwd(), clean);

  if (resolved === baseResolved) return null;
  const baseResolvedWithSep = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  if (!resolved.startsWith(baseResolvedWithSep)) return null;
  return resolved;
}

