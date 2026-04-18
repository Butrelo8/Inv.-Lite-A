import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";

/** Same 413 detection as `server/index.ts` global error handler (keep in sync if logic changes). */
function isPayloadTooLargeError(err: unknown): boolean {
  const anyErr = err as { status?: number; statusCode?: number; type?: string };
  const status = anyErr.status || anyErr.statusCode || 0;
  return status === 413 || anyErr.type === "entity.too.large";
}

test("oversized JSON body returns 413 JSON (express.json limit + handler parity with index)", async () => {
  const app = express();
  app.use(
    express.json({
      limit: "80b",
      verify: (req: Request, _res: Response, buf: Buffer, _enc: string) => {
        req.rawBody = buf;
      },
    }),
  );
  app.post("/echo", (req, res) => {
    res.json({ ok: true, len: JSON.stringify(req.body).length });
  });
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (isPayloadTooLargeError(err)) {
      return res.status(413).json({ message: "Payload too large" });
    }
    const e = err as { status?: number; message?: string };
    return res.status(e.status || 500).json({ message: e.message || "Error" });
  });

  const httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.on("error", reject);
  });
  const addr = httpServer.address();
  assert(addr && typeof addr === "object");
  const port = (addr as { port: number }).port;
  try {
    const body = JSON.stringify({ x: "y".repeat(500) });
    const res = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    assert.equal(res.status, 413);
    const json = (await res.json()) as { message?: string };
    assert.equal(json.message, "Payload too large");
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
