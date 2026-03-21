import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";

import { ensureThumbsDir } from "../thumbnails";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function startTestServer(roleMode: RoleMode): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();

  // Simulate Passport's authenticated user for requireAuth/requireRole middleware.
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

  // Minimal endpoint for CSRF tests.
  app.post("/api/csrf-test", (_req, res) => res.status(204).send());

  ensureThumbsDir();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as any).port as number;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

test("CSRF middleware: Sec-Fetch-Site allows same-origin without Origin/Referer", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/csrf-test`, {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "same-origin",
      },
    });
    assert.equal(resp.status, 204);
  } finally {
    httpServer.close();
  }
});

test("CSRF middleware: missing Origin/Referer/Sec-Fetch-Site is rejected", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/csrf-test`, {
      method: "POST",
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }
});

test("CSRF middleware: Origin host mismatch is rejected", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/csrf-test`, {
      method: "POST",
      headers: {
        Origin: "http://evil.example",
      },
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }
});

