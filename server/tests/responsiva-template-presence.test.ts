import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

test("real responsiva_template.docx contains every required placeholder", async () => {
  const p = path.join(process.cwd(), "src", "templates", "responsiva_template.docx");
  const bytes = await fs.readFile(p);
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("word/document.xml");
  assert.ok(entry, "word/document.xml missing from template");
  const xml = await entry!.async("string");

  for (const ph of ["{{FECHA}}", "{{EQUIPO}}", "{{SERIE}}", "{{RESPONSABLE}}", "{{FOTOS}}"]) {
    assert.ok(xml.includes(ph), `template missing placeholder ${ph}`);
  }
});
