import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getCachedOpsSummary,
  clearOpsSummaryCache,
  OPS_SUMMARY_CACHE_TTL_MS,
} from "../ops-summary-cache";

describe("ops-summary-cache", () => {
  test("caches result within TTL", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { calls };
    };
    const nowMs = 1_000_000;
    const a = await getCachedOpsSummary(loader, nowMs);
    const b = await getCachedOpsSummary(loader, nowMs + 100);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
  });

  test("re-loads after TTL expiry", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => ({ n: ++calls });
    const t0 = 2_000_000;
    await getCachedOpsSummary(loader, t0);
    await getCachedOpsSummary(loader, t0 + OPS_SUMMARY_CACHE_TTL_MS + 1);
    assert.equal(calls, 2);
  });

  test("dedupes concurrent callers", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    let resolveInner: (v: { n: number }) => void = () => {};
    const loader = () => {
      calls += 1;
      return new Promise<{ n: number }>((r) => {
        resolveInner = r;
      });
    };
    const nowMs = 3_000_000;
    const p1 = getCachedOpsSummary(loader, nowMs);
    const p2 = getCachedOpsSummary(loader, nowMs);
    resolveInner({ n: 1 });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(calls, 1);
    assert.deepEqual(r1, r2);
  });

  test("clearOpsSummaryCache forces reload", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => ({ n: ++calls });
    const nowMs = 4_000_000;
    await getCachedOpsSummary(loader, nowMs);
    clearOpsSummaryCache();
    await getCachedOpsSummary(loader, nowMs);
    assert.equal(calls, 2);
  });

  test("failed loader does not poison cache", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return { ok: true };
    };
    const nowMs = 5_000_000;
    await assert.rejects(() => getCachedOpsSummary(loader, nowMs));
    const ok = await getCachedOpsSummary(loader, nowMs + 10);
    assert.deepEqual(ok, { ok: true });
    assert.equal(calls, 2);
  });
});
