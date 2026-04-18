import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { generateResponsivaDocx } from "../doc-gen/responsiva/responsiva.service";
import { uploadsPath } from "../upload-config";

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

async function buildTemplateFileWithSlotMarkers(destDir: string): Promise<string> {
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
      "<w:tbl><w:tr>" +
      "<w:tc><w:p><w:r><w:t>{{FOTOS1}}</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>{{FOTOS2}}</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>{{FOTOS3}}</w:t></w:r></w:p></w:tc>" +
      "</w:tr><w:tr>" +
      "<w:tc><w:p><w:r><w:t>{{FOTOS4}}</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>{{FOTOS5}}</w:t></w:r></w:p></w:tc>" +
      "</w:tr></w:tbl>" +
      "</w:body></w:document>",
  );
  z.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  );
  const file = path.join(destDir, "responsiva_template_slots.docx");
  await fs.promises.writeFile(file, await z.generateAsync({ type: "nodebuffer" }));
  return file;
}

/** Valid 1×1 PNG bytes so `image-size` resolves dimensions in integration tests. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function stageUploads(files: { name: string; bytes: Buffer }[]): () => void {
  fs.mkdirSync(uploadsPath, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(uploadsPath, f.name), f.bytes);
  }
  return () => {
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(uploadsPath, f.name));
      } catch {
        /* ignore */
      }
    }
  };
}

async function setupWithTemplate(): Promise<{ tmp: string; template: string; cleanup: () => void }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-svc-"));
  const template = await buildTemplateFile(tmp);
  return {
    tmp,
    template,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test("fills placeholders and embeds images", async () => {
  const id = randomBytes(8).toString("hex");
  const a = `resp-svc-${id}-a.jpg`;
  const b = `resp-svc-${id}-b.png`;
  const unstage = stageUploads([
    { name: a, bytes: TINY_PNG },
    { name: b, bytes: TINY_PNG },
  ]);
  const ctx = await setupWithTemplate();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: uploadsPath,
      item: { code: "C001", name: "Laptop Dell", serialNumber: "SN-123", responsible: "Ana" },
      attachments: [{ imageUrl: `/uploads/${a}` }, { imageUrl: `/uploads/${b}` }],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });

    const z = await JSZip.loadAsync(out.buffer);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.match(docXml, /Fecha: 8 de Diciembre del 2025/);
    assert.match(docXml, /Equipo: Laptop Dell/);
    assert.match(docXml, /Número de serie: SN-123\./);
    assert.match(docXml, /Responsable: Ana/);
    assert.doesNotMatch(docXml, /\{\{FOTOS\}\}/);
    assert.match(docXml, /<w:tbl>/);
    assert.match(docXml, /<a:stretch><a:fillRect\/><\/a:stretch>/);
    assert.ok(z.file("word/media/img_0.jpeg"));
    assert.ok(z.file("word/media/img_1.png"));

    const relsXml = await z.file("word/_rels/document.xml.rels")!.async("string");
    assert.match(relsXml, /Id="rId100"/);
    assert.match(relsXml, /Id="rId101"/);

    const ctXml = await z.file("[Content_Types].xml")!.async("string");
    assert.match(ctXml, /Extension="jpeg"/);
    assert.match(ctXml, /Extension="png"/);

    assert.equal(out.suggestedFilename, "Responsiva_C001_Ana.docx");
    assert.equal(
      out.mimeType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  } finally {
    unstage();
    ctx.cleanup();
  }
});

test("removes SERIE paragraph when serial is null", async () => {
  const ctx = await setupWithTemplate();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: uploadsPath,
      item: { code: "C002", name: "Laptop", serialNumber: null, responsible: "Luis" },
      attachments: [],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    const z = await JSZip.loadAsync(out.buffer);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.doesNotMatch(docXml, /Número de serie/);
    assert.doesNotMatch(docXml, /\{\{SERIE\}\}/);
  } finally {
    ctx.cleanup();
  }
});

test("removes FOTOS paragraph when no images", async () => {
  const ctx = await setupWithTemplate();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: uploadsPath,
      item: { code: "C003", name: "Monitor", serialNumber: "SN-1", responsible: "Jose" },
      attachments: [],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    const z = await JSZip.loadAsync(out.buffer);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.doesNotMatch(docXml, /\{\{FOTOS\}\}/);
    assert.doesNotMatch(docXml, /<w:tbl>/);
  } finally {
    ctx.cleanup();
  }
});

test("sanitizes filename segments", async () => {
  const ctx = await setupWithTemplate();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: uploadsPath,
      item: { code: "C 004/x", name: "X", serialNumber: null, responsible: "Juan Pérez" },
      attachments: [],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    assert.ok(out.suggestedFilename.startsWith("Responsiva_C_004_x_"));
    assert.ok(out.suggestedFilename.endsWith(".docx"));
  } finally {
    ctx.cleanup();
  }
});

test("fills numbered photo placeholders into matching slots", async () => {
  const id = randomBytes(8).toString("hex");
  const a = `resp-svc-slot-${id}-a.jpg`;
  const b = `resp-svc-slot-${id}-b.png`;
  const unstage = stageUploads([
    { name: a, bytes: TINY_PNG },
    { name: b, bytes: TINY_PNG },
  ]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-svc-slot-"));
  const template = await buildTemplateFileWithSlotMarkers(tmp);
  try {
    const out = await generateResponsivaDocx({
      templatePath: template,
      uploadsDir: uploadsPath,
      item: { code: "C005", name: "Laptop", serialNumber: "SN-5", responsible: "Ana" },
      attachments: [{ imageUrl: `/uploads/${a}` }, { imageUrl: `/uploads/${b}` }],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    const z = await JSZip.loadAsync(out.buffer);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.doesNotMatch(docXml, /\{\{FOTOS[1-5]\}\}/);
    assert.match(docXml, /r:embed="rId100"/);
    assert.match(docXml, /r:embed="rId101"/);
    assert.doesNotMatch(docXml, /r:embed="rId102"/);
  } finally {
    unstage();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
