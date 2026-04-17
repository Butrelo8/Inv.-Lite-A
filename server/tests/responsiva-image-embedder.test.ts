import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import {
  detectImageExtension,
  embedAttachmentImages,
} from "../doc-gen/responsiva/image-embedder";

/** Test-only resolver: `/uploads/foo.jpg` → `<uploadsDir>/foo.jpg` (no dependency on real app paths). */
function testResolvePath(uploadsDir: string, imageUrl: string): string | null {
  const base = path.basename(imageUrl);
  if (!base || base === "." || base === "..") return null;
  return path.join(uploadsDir, base);
}

/** Minimal valid 1×1 PNG so `image-size` returns width/height. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("detectImageExtension maps common extensions", () => {
  assert.equal(detectImageExtension("/uploads/88-1.jpg"), "jpeg");
  assert.equal(detectImageExtension("/uploads/88-2.JPEG"), "jpeg");
  assert.equal(detectImageExtension("a.png"), "png");
  assert.equal(detectImageExtension("a.PNG"), "png");
});

test("detectImageExtension returns null for unsupported", () => {
  assert.equal(detectImageExtension("file.gif"), null);
  assert.equal(detectImageExtension("nodot"), null);
});

test("embedAttachmentImages writes bytes into word/media and returns entries", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-"));
  const uploadsDir = path.join(tmpRoot, "uploads");
  fs.mkdirSync(uploadsDir);
  fs.writeFileSync(path.join(uploadsDir, "a.jpg"), TINY_PNG);
  fs.writeFileSync(path.join(uploadsDir, "b.png"), TINY_PNG);

  const zip = new JSZip();
  const result = await embedAttachmentImages({
    zip,
    uploadsDir,
    attachments: [{ imageUrl: "/uploads/a.jpg" }, { imageUrl: "/uploads/b.png" }],
    startingRId: 100,
    startingDocPrId: 1000,
    resolvePath: testResolvePath,
  });

  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0]!.rId, "rId100");
  assert.equal(result.entries[0]!.docPrId, 1000);
  assert.equal(result.entries[0]!.ext, "jpeg");
  assert.equal(result.entries[0]!.mediaTarget, "media/img_0.jpeg");
  assert.equal(result.entries[0]!.cxEmu, 2800000);
  assert.equal(result.entries[0]!.cyEmu, 2800000);
  assert.equal(result.entries[1]!.rId, "rId101");
  assert.equal(result.entries[1]!.ext, "png");
  assert.deepEqual(Array.from(result.extensions).sort(), ["jpeg", "png"]);

  assert.ok(zip.file("word/media/img_0.jpeg"));
  assert.ok(zip.file("word/media/img_1.png"));

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("embedAttachmentImages skips unsupported extensions", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-"));
  const uploadsDir = path.join(tmpRoot, "uploads");
  fs.mkdirSync(uploadsDir);
  fs.writeFileSync(path.join(uploadsDir, "a.jpg"), TINY_PNG);
  fs.writeFileSync(path.join(uploadsDir, "b.gif"), Buffer.from([0x00]));

  const zip = new JSZip();
  const result = await embedAttachmentImages({
    zip,
    uploadsDir,
    attachments: [{ imageUrl: "/uploads/a.jpg" }, { imageUrl: "/uploads/b.gif" }],
    startingRId: 100,
    startingDocPrId: 1000,
    resolvePath: testResolvePath,
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]!.ext, "jpeg");
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("embedAttachmentImages skips missing files", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-"));
  const uploadsDir = path.join(tmpRoot, "uploads");
  fs.mkdirSync(uploadsDir);
  const zip = new JSZip();
  const result = await embedAttachmentImages({
    zip,
    uploadsDir,
    attachments: [{ imageUrl: "/uploads/missing.jpg" }],
    startingRId: 100,
    startingDocPrId: 1000,
    resolvePath: testResolvePath,
  });
  assert.equal(result.entries.length, 0);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
