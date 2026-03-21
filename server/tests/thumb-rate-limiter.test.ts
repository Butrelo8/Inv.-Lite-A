import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import fs from "fs";
import path from "path";

import { ensureThumbsDir } from "../thumbnails";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function startTestServer(roleMode: RoleMode): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();

  app.use((req, _res, next) => {
    if (roleMode.auth === "unauth") {
      (req as any).isAuthenticated = () => false;
      (req as any).user = undefined;
      return next();
    }

    const role = roleMode.auth;
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: 1, username: "test-user", role };
    return next();
  });

  const httpServer = createServer(app);

  // `routes.ts` imports DB modules that require DATABASE_URL at import-time,
  // so we set safe test env before dynamically importing it.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  ensureThumbsDir();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as any).port as number;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

async function writeDummyThumb(thumbFilePath: string) {
  await fs.promises.mkdir(path.dirname(thumbFilePath), { recursive: true });
  // Content doesn't need to be a valid WebP for these tests; existence controls whether generation runs.
  fs.writeFileSync(thumbFilePath, "dummy-webp");
}

test("thumb rate limiter: allows up to 12 requests then returns 429", async () => {
  // Make sure we evict any previous in-memory entries (shared across tests).
  const realNow = Date.now;
  Date.now = () => realNow() + 120_000;

  const repoRoot = process.cwd();
  const uploadsDir = path.join(repoRoot, "uploads");
  const thumbsDir = path.join(uploadsDir, "thumbs");

  const thumbFileName = `rate-test-${Date.now()}-${Math.random().toString(16).slice(2)}.webp`;
  const thumbFilePath = path.join(thumbsDir, thumbFileName);

  await writeDummyThumb(thumbFilePath);

  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    for (let i = 1; i <= 12; i++) {
      const resp = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbFileName)}`);
      assert.equal(resp.status, 200, `Expected request #${i} to succeed`);
    }

    const resp429 = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbFileName)}`);
    assert.equal(resp429.status, 429);
  } finally {
    httpServer.close();
    Date.now = realNow;
  }
});

test("thumb rate limiter: evicts old entries after 60s window", async () => {
  const THUMB_WINDOW_MS = 60_000;

  const realNow = Date.now;
  // Start far enough in the future to ensure the previous test's in-memory entry is evicted.
  // (First test advanced its fake clock by +120_000ms.)
  let fakeNow = realNow() + THUMB_WINDOW_MS * 3 + 10;
  Date.now = () => fakeNow;

  const repoRoot = process.cwd();
  const uploadsDir = path.join(repoRoot, "uploads");
  const thumbsDir = path.join(uploadsDir, "thumbs");

  const thumbFileName = `rate-evict-${Date.now()}-${Math.random().toString(16).slice(2)}.webp`;
  const thumbFilePath = path.join(thumbsDir, thumbFileName);
  await writeDummyThumb(thumbFilePath);

  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    // Bring the counter to the max (12 allowed).
    for (let i = 1; i <= 12; i++) {
      const resp = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbFileName)}`);
      assert.equal(resp.status, 200, `Expected request #${i} to succeed`);
    }

    // Without eviction, the next request would be 429.
    fakeNow += 1; // still within same "windowStart"
    const respWouldBe429 = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbFileName)}`);
    assert.equal(respWouldBe429.status, 429);

    // Advance beyond window and ensure the next request is allowed again.
    fakeNow += THUMB_WINDOW_MS + 10;
    const respAfterEvict = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbFileName)}`);
    assert.equal(respAfterEvict.status, 200);
  } finally {
    httpServer.close();
    Date.now = realNow;
  }
});

