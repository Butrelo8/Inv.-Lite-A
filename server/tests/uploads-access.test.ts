import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { ensureThumbsDir } from "../thumbnails";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

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

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as any).port as number;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

async function writeTestImage(absolutePath: string) {
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toFile(absolutePath);
}

test("uploads access boundary: viewer/editor/admin (images, documents, thumbs)", async (t) => {
  const repoRoot = process.cwd();
  const uploadsDir = path.join(repoRoot, "uploads");
  const docsDir = path.join(uploadsDir, "documents");

  ensureDir(uploadsDir);
  ensureDir(docsDir);
  ensureThumbsDir();

  const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const imageFile = `inv-${id}.jpg`;
  const imagePath = path.join(uploadsDir, imageFile);
  const docFile = `doc-${id}.pdf`;
  const docPath = path.join(docsDir, docFile);
  const thumbUrlFile = `inv-${id}.webp`; // derived from original name base
  const thumbPath = path.join(uploadsDir, "thumbs", thumbUrlFile);

  // Cleanup any leftovers if the test is re-run quickly.
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  await writeTestImage(imagePath);
  fs.writeFileSync(docPath, "%PDF-1.4\n%test\n", "utf8");

  await t.test("unauthenticated: images + docs + thumbs => 401", async () => {
    const { baseUrl, httpServer } = await startTestServer({ auth: "unauth" });
    try {
      const imgResp = await fetch(`${baseUrl}/uploads/${encodeURIComponent(imageFile)}`);
      assert.equal(imgResp.status, 401);

      const docResp = await fetch(`${baseUrl}/uploads/documents/${encodeURIComponent(docFile)}`);
      assert.equal(docResp.status, 401);

      const thumbResp = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbUrlFile)}`);
      assert.equal(thumbResp.status, 401);
    } finally {
      httpServer.close();
    }
  });

  await t.test("viewer: images + thumbs => 200, documents => 403", async () => {
    const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
    try {
      const imgResp = await fetch(`${baseUrl}/uploads/${encodeURIComponent(imageFile)}`);
      assert.equal(imgResp.status, 200);

      const docResp = await fetch(`${baseUrl}/uploads/documents/${encodeURIComponent(docFile)}`);
      assert.equal(docResp.status, 403);

      const thumbResp = await fetch(`${baseUrl}/uploads/thumbs/${encodeURIComponent(thumbUrlFile)}`);
      assert.equal(thumbResp.status, 200);
      assert.equal(thumbResp.headers.get("content-type"), "image/webp");
      assert.equal(fs.existsSync(thumbPath), true, "Expected thumbnail to be generated");
    } finally {
      httpServer.close();
    }
  });

  await t.test("editor: documents => 200", async () => {
    const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
    try {
      const docResp = await fetch(`${baseUrl}/uploads/documents/${encodeURIComponent(docFile)}`);
      assert.equal(docResp.status, 200);
    } finally {
      httpServer.close();
    }
  });
});

