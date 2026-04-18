import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "http";

test("GET /health returns ok when database is reachable", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;

  const app = express();
  const httpServer = createServer(app);
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.on("error", reject);
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object");
  const port = (addr as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await res.json()) as { status?: string; database?: string };
    if (res.status === 503) {
      assert.equal(body.status, "unavailable");
      assert.equal(body.database, "error");
      return;
    }
    assert.equal(res.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.database, "ok");
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
