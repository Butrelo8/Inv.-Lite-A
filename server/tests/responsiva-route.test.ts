import assert from "node:assert/strict";
import test, { before } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import JSZip from "jszip";
import type { ResponsivaRouteDeps } from "../doc-gen/responsiva/responsiva.routes";

/** Populated in `before` so `DATABASE_URL` exists before `site-rbac-access` → `db` loads. */
let registerResponsivaRoutes: (app: Express, deps: ResponsivaRouteDeps) => void;

before(async () => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/postgres";
  }
  const m = await import("../doc-gen/responsiva/responsiva.routes.js");
  registerResponsivaRoutes = m.registerResponsivaRoutes;
});

async function buildTemplateFile(destDir: string): Promise<string> {
  const z = new JSZip();
  z.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
  );
  z.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
  );
  z.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body>" +
      "<w:p><w:r><w:t>Fecha: {{FECHA}}</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Equipo: {{EQUIPO}}</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Número de serie: {{SERIE}}.</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Responsable: {{RESPONSABLE}}</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>{{FOTOS}}</w:t></w:r></w:p>" +
      "</w:body></w:document>",
  );
  z.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  );
  const file = path.join(destDir, "responsiva_template.docx");
  await fs.promises.writeFile(file, await z.generateAsync({ type: "nodebuffer" }));
  return file;
}

interface AppOpts {
  authed: boolean;
  itemId?: number;
  hasItem?: boolean;
  templatePath: string;
  uploadsDir: string;
}

function makeApp(opts: AppOpts) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => opts.authed;
    next();
  });
  registerResponsivaRoutes(app, {
    getItem: async (id) => {
      if (!opts.hasItem || id !== (opts.itemId ?? 1)) return null;
      return {
        id,
        siteId: 1,
        code: "C001",
        name: "Test",
        serialNumber: null,
        responsible: "Ana",
      };
    },
    getAttachments: async () => [],
    getSiteAccess: async () => ({}),
    canRead: () => true,
    itemSiteAllowed: () => true,
    templatePath: opts.templatePath,
    uploadsDir: opts.uploadsDir,
    now: () => new Date(2025, 11, 8, 12, 0, 0),
  });
  return app;
}

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

test("returns 401 when unauthenticated", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-route-"));
  const templatePath = await buildTemplateFile(tmp);
  const app = makeApp({ authed: false, templatePath, uploadsDir: tmp, hasItem: true });
  const srv = await listen(app);
  try {
    const res = await fetch(`${srv.url}/api/inventory/1/responsiva`);
    assert.equal(res.status, 401);
  } finally {
    await srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("returns 404 when item missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-route-"));
  const templatePath = await buildTemplateFile(tmp);
  const app = makeApp({ authed: true, templatePath, uploadsDir: tmp, hasItem: false });
  const srv = await listen(app);
  try {
    const res = await fetch(`${srv.url}/api/inventory/99/responsiva`);
    assert.equal(res.status, 404);
  } finally {
    await srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("returns 200 with docx headers when item found", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-route-"));
  const templatePath = await buildTemplateFile(tmp);
  const app = makeApp({
    authed: true,
    itemId: 1,
    hasItem: true,
    templatePath,
    uploadsDir: tmp,
  });
  const srv = await listen(app);
  try {
    const res = await fetch(`${srv.url}/api/inventory/1/responsiva`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.match(
      res.headers.get("content-disposition") ?? "",
      /attachment; filename="Responsiva_C001_Ana\.docx"/,
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const z = await JSZip.loadAsync(buf);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.match(docXml, /Responsable: Ana/);
  } finally {
    await srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
