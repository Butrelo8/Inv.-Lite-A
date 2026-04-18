export const OPS_SUMMARY_CACHE_TTL_MS = 30_000;

type Entry = {
  expiresAtMs: number;
  promise: Promise<unknown>;
};

let entry: Entry | null = null;

export function clearOpsSummaryCache(): void {
  entry = null;
}

export async function getCachedOpsSummary<T>(
  loader: () => Promise<T>,
  nowMs: number = Date.now(),
): Promise<T> {
  if (entry && entry.expiresAtMs > nowMs) {
    return entry.promise as Promise<T>;
  }
  const pending = loader();
  const tracked = pending.catch((err) => {
    if (entry && entry.promise === tracked) {
      entry = null;
    }
    throw err;
  });
  entry = {
    expiresAtMs: nowMs + OPS_SUMMARY_CACHE_TTL_MS,
    promise: tracked,
  };
  return tracked as Promise<T>;
}
