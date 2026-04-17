# Responsiva Document Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate downloadable `.docx` "Responsiva" documents for an inventory item by filling a pre-designed Word template (`src/templates/responsiva_template.docx`) with item data and a dynamically built photo table.

**Architecture:** A per-item route (`GET /api/inventory/:id/responsiva`) loads the template into memory with `JSZip`, replaces text placeholders (`{{FECHA}}`, `{{EQUIPO}}`, `{{SERIE}}`, `{{RESPONSABLE}}`) inside `word/document.xml`, swaps the paragraph containing `{{FOTOS}}` with a generated 3-column OOXML `<w:tbl>` referencing embedded images (per-image EMU extents preserve aspect ratio; no `a:stretch`), appends image bytes under `word/media/`, registers new relationships in `word/_rels/document.xml.rels`, ensures `[Content_Types].xml` declares `jpeg`/`png`, then responds with explicit `Content-Type` + `Content-Disposition: attachment` so the browser downloads the `.docx`. The logic lives in a new `server/doc-gen/responsiva/` module with small pure units (date formatter, photo-table builder, docx-xml helpers, image embedder) behind a single orchestrator service.

**Tech Stack:**
- Backend: Express 5 + TypeScript (tsx), Drizzle ORM (Postgres), JSZip (new dep)
- Frontend: React + Vite + TanStack Query + shadcn/ui (Radix) + lucide-react
- Auth: existing session-cookie middleware (`requireAuth`) + site RBAC (`INVENTORY_READ`)
- Tests: `node:test` via `npm test` (`tsx --test server/tests/*.test.ts`)

**Stack reality vs. spec:**
- Spec said Hono + Bun + SQLite + Astro + Clerk → actual is Express + npm + Postgres + React + session cookies. Plan uses the **actual** stack.
- Spec used `/api/items/:id/responsiva` → plan uses `/api/inventory/:id/responsiva` to match existing route family.
- Spec used `process.env.BACKEND_URL + image_url` for image fetch → plan reads files from disk via `resolveStoredFilePath(uploadsPath, imageUrl)` (no HTTP loopback). **`server/doc-gen/responsiva/image-embedder.ts` must not import `resolveStoredFilePath`:** the service passes `resolvePath: (uploadsDir, imageUrl) => string | null` so tests stay independent of real upload directory layout.
- `item_images` table is actually `inventory_attachments` with columns `id, item_id, image_url`.

**Implementation constraints (Word output + HTTP + tests):**

1. **Photo scaling (no deformation)** — In `photo-table.ts`, avoid fixed `IMG_CX_EMU` / `IMG_CY_EMU` for every image and remove `<a:stretch><a:fillRect/></a:stretch>` under `pic:blipFill` (that stretch forces the bitmap to fill the shape and warps aspect ratio). Use **`image-size`** on each file’s bytes in `image-embedder.ts`, compute a **preserved aspect ratio** fit inside the same max EMU box as today (2 800 000 × 3 800 000 EMU unless you intentionally change the cap), and pass per-image `cxEmu` / `cyEmu` on each `PhotoEntry`. Add a pure helper e.g. `computeImageExtentEmu(natW, natH, maxCx?, maxCy?)` beside the table builder for unit tests. Omit the `a:stretch` block so Word respects the given inline extent.
2. **Path resolution (DI)** — Extend `EmbedAttachmentImagesInput` with `resolvePath: (dir: string, url: string) => string | null`. Implementation uses `const fsPath = input.resolvePath(input.uploadsDir, att.imageUrl)`. **`responsiva.service.ts`** passes the real `resolveStoredFilePath` from `server/path-utils.ts`; **embedder tests** pass a lambda (e.g. `path.join(dir, path.basename(url))`).
3. **HTTP response headers (download, not garbage in browser)** — In `responsiva.routes.ts`, after `generateResponsivaDocx` returns `{ buffer, suggestedFilename }`, set headers exactly as follows so the browser downloads the `.docx`:

```typescript
const filename = out.suggestedFilename;
res.setHeader(
  "Content-Type",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
);
res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
res.send(out.buffer);
```

---

## File Structure

**New files (backend):**

| Path | Responsibility |
|------|---------------|
| `server/doc-gen/responsiva/date-es.ts` | Format a `Date` as Spanish long date (`"8 de Diciembre del 2025"`). Pure. |
| `server/doc-gen/responsiva/docx-xml.ts` | Pure helpers that mutate `word/document.xml` text: escape XML, replace placeholder text, remove a paragraph by inner marker, replace a placeholder paragraph with raw XML. |
| `server/doc-gen/responsiva/photo-table.ts` | Pure builder: given entries `{ rId, docPrId, cxEmu, cyEmu }`, returns `<w:tbl>…</w:tbl>` per 3-col / 9360-DXA; includes `computeImageExtentEmu` for aspect-preserving EMU sizes; **no** `a:stretch` / fillRect. |
| `server/doc-gen/responsiva/image-embedder.ts` | Loads image bytes via **injected** `resolvePath`, infers `jpeg`/`png`, reads dimensions with **`image-size`**, writes `word/media/img_N.ext`, returns metadata including EMU extents for the table. |
| `server/doc-gen/responsiva/rels-xml.ts` | Pure helpers: insert image relationships before `</Relationships>`; insert content-type defaults into `[Content_Types].xml` if missing. |
| `server/doc-gen/responsiva/responsiva.service.ts` | Orchestrator: load template, fetch item + attachments, run all mutations, return `{ buffer, filename }`. |
| `server/doc-gen/responsiva/responsiva.routes.ts` | Register `GET /api/inventory/:id/responsiva` with auth + site RBAC. |
| `server/doc-gen/responsiva/index.ts` | Barrel export: `registerResponsivaRoutes`. |

**New test files:**

| Path | Covers |
|------|--------|
| `server/tests/responsiva-date-es.test.ts` | date formatter |
| `server/tests/responsiva-docx-xml.test.ts` | xml escape, text replace, paragraph remove, paragraph-to-table swap |
| `server/tests/responsiva-photo-table.test.ts` | table XML structure for 0/1/2/3/4/7 images |
| `server/tests/responsiva-rels-xml.test.ts` | rels insertion, content-type idempotency |
| `server/tests/responsiva-image-embedder.test.ts` | loads bytes, content-type detection, zip insertion, **injected `resolvePath`**, dimensions → EMU |
| `server/tests/responsiva-service.test.ts` | end-to-end: generate `.docx` buffer, re-open with JSZip, assert replacements, table, media, rels |
| `server/tests/responsiva-route.test.ts` | 401 unauthenticated, 404 missing item, 200 w/ correct headers |
| `server/tests/responsiva-template-presence.test.ts` | real template carries every placeholder |

**Modified files (backend):**

| Path | Change |
|------|--------|
| `package.json` | Add `jszip`, `@types/jszip`, and `image-size` deps. |
| `server/doc-gen/index.ts` | Import + call `registerResponsivaRoutesDefault(app)`. |
| `server/routes.ts` | `await` the now-async `registerDocGenRoutes(app)`. |

**New + modified files (frontend):**

| Path | Change |
|------|--------|
| `client/src/lib/download-responsiva.ts` | New util: triggers download via blob. |
| `client/src/components/ItemViewDialog.tsx` | Add "Generar Responsiva" button in an action row. |
| `client/src/pages/Dashboard.tsx` | Add icon-only "Generar Responsiva" button next to Edit/Copy/Delete in the actions cell. |

---

## Test fixture setup

A minimal `.docx`-shaped fixture is needed for docx-xml + service tests. Each test file that needs a fake template builds one inline via a local helper that writes a JSZip with the minimum files a real template has: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`. A separate test (Task 9) asserts the real binary template on disk still contains every expected placeholder.

---

## Tasks

### Task 1: Install JSZip + image-size

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime and types deps**

Run:
```bash
npm install jszip image-size
npm install --save-dev @types/jszip
```

Expected: `jszip`, `image-size`, and `@types/jszip` appear in `package.json`. `node_modules/jszip` and `node_modules/image-size` exist.

- [ ] **Step 2: Verify import works**

Run:
```bash
node -e "import('jszip').then(m => console.log(typeof m.default))"
```

Expected: prints `function`.

- [ ] **Step 3: Verify `image-size` import**

Run:
```bash
node -e "import('image-size').then(m => console.log(Object.keys(m).join(',')))"
```

Expected: prints export names (e.g. `imageSize` / `default` depending on version). Adjust the import in `image-embedder.ts` to match.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add jszip and image-size for responsiva docx generation"
```

---

### Task 2: Spanish date formatter

**Files:**
- Create: `server/doc-gen/responsiva/date-es.ts`
- Test: `server/tests/responsiva-date-es.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/responsiva-date-es.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { formatSpanishLongDate } from "../doc-gen/responsiva/date-es";

test("formats a December date in Spanish", () => {
  const d = new Date(2025, 11, 8, 12, 0, 0);
  assert.equal(formatSpanishLongDate(d), "8 de Diciembre del 2025");
});

test("formats a January date in Spanish", () => {
  const d = new Date(2026, 0, 1, 12, 0, 0);
  assert.equal(formatSpanishLongDate(d), "1 de Enero del 2026");
});

test("uses the local day", () => {
  const d = new Date(2026, 3, 16, 12, 0, 0);
  assert.equal(formatSpanishLongDate(d), "16 de Abril del 2026");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/responsiva-date-es.test.ts`

Expected: FAIL — "Cannot find module '../doc-gen/responsiva/date-es'".

- [ ] **Step 3: Implement**

Create `server/doc-gen/responsiva/date-es.ts`:

```typescript
const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Format a Date as "8 de Diciembre del 2025" using the local calendar day. */
export function formatSpanishLongDate(date: Date): string {
  const day = date.getDate();
  const month = SPANISH_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} del ${year}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/responsiva-date-es.test.ts`

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/doc-gen/responsiva/date-es.ts server/tests/responsiva-date-es.test.ts
git commit -m "feat(responsiva): spanish long-date formatter"
```

---

### Task 3: DOCX XML helpers

**Files:**
- Create: `server/doc-gen/responsiva/docx-xml.ts`
- Test: `server/tests/responsiva-docx-xml.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/responsiva-docx-xml.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeXml,
  replacePlaceholderText,
  removeParagraphContaining,
  replaceParagraphContainingWithXml,
} from "../doc-gen/responsiva/docx-xml";

test("escapeXml escapes the five XML entities", () => {
  assert.equal(
    escapeXml(`ampersand & less < greater > quote " apos '`),
    "ampersand &amp; less &lt; greater &gt; quote &quot; apos &apos;",
  );
});

test("replacePlaceholderText replaces all occurrences and escapes the value", () => {
  const xml = "<w:p><w:r><w:t>Hola {{NOMBRE}}</w:t></w:r><w:r><w:t>{{NOMBRE}}!</w:t></w:r></w:p>";
  const out = replacePlaceholderText(xml, "NOMBRE", 'Juan & "Perez"');
  assert.equal(
    out,
    "<w:p><w:r><w:t>Hola Juan &amp; &quot;Perez&quot;</w:t></w:r><w:r><w:t>Juan &amp; &quot;Perez&quot;!</w:t></w:r></w:p>",
  );
});

test("removeParagraphContaining strips the whole <w:p> that holds the marker", () => {
  const xml =
    "<w:body>" +
    "<w:p><w:r><w:t>keep me</w:t></w:r></w:p>" +
    '<w:p w:rsidR="00"><w:r><w:t>Número de serie: {{SERIE}}.</w:t></w:r></w:p>' +
    "<w:p><w:r><w:t>also keep</w:t></w:r></w:p>" +
    "</w:body>";
  const out = removeParagraphContaining(xml, "{{SERIE}}");
  assert.equal(
    out,
    "<w:body><w:p><w:r><w:t>keep me</w:t></w:r></w:p><w:p><w:r><w:t>also keep</w:t></w:r></w:p></w:body>",
  );
});

test("removeParagraphContaining is a no-op when marker absent", () => {
  const xml = "<w:body><w:p><w:r><w:t>no marker</w:t></w:r></w:p></w:body>";
  assert.equal(removeParagraphContaining(xml, "{{SERIE}}"), xml);
});

test("replaceParagraphContainingWithXml swaps the whole paragraph for given XML", () => {
  const xml =
    "<w:body>" +
    "<w:p><w:r><w:t>before</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>{{FOTOS}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>after</w:t></w:r></w:p>" +
    "</w:body>";
  const out = replaceParagraphContainingWithXml(xml, "{{FOTOS}}", "<w:tbl/>");
  assert.equal(
    out,
    "<w:body><w:p><w:r><w:t>before</w:t></w:r></w:p><w:tbl/><w:p><w:r><w:t>after</w:t></w:r></w:p></w:body>",
  );
});

test("replaceParagraphContainingWithXml throws when marker absent", () => {
  assert.throws(
    () => replaceParagraphContainingWithXml("<w:body/>", "{{FOTOS}}", "<w:tbl/>"),
    /paragraph containing "\{\{FOTOS\}\}" not found/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/responsiva-docx-xml.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/doc-gen/responsiva/docx-xml.ts`:

```typescript
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replacePlaceholderText(xml: string, placeholderName: string, value: string): string {
  const pattern = new RegExp(escapeRegex(`{{${placeholderName}}}`), "g");
  return xml.replace(pattern, escapeXml(value));
}

function findParagraphRange(xml: string, marker: string): { start: number; end: number } | null {
  const markerIdx = xml.indexOf(marker);
  if (markerIdx < 0) return null;

  const openTag = "<w:p";
  let searchFrom = markerIdx;
  let openIdx = -1;
  while (searchFrom >= 0) {
    const candidate = xml.lastIndexOf(openTag, searchFrom);
    if (candidate < 0) return null;
    const next = xml.charAt(candidate + openTag.length);
    if (next === ">" || next === " " || next === "/") {
      openIdx = candidate;
      break;
    }
    searchFrom = candidate - 1;
  }
  if (openIdx < 0) return null;

  const closeTag = "</w:p>";
  const closeIdx = xml.indexOf(closeTag, markerIdx);
  if (closeIdx < 0) return null;
  return { start: openIdx, end: closeIdx + closeTag.length };
}

export function removeParagraphContaining(xml: string, marker: string): string {
  const range = findParagraphRange(xml, marker);
  if (!range) return xml;
  return xml.slice(0, range.start) + xml.slice(range.end);
}

export function replaceParagraphContainingWithXml(
  xml: string,
  marker: string,
  replacementXml: string,
): string {
  const range = findParagraphRange(xml, marker);
  if (!range) {
    throw new Error(`paragraph containing "${marker}" not found`);
  }
  return xml.slice(0, range.start) + replacementXml + xml.slice(range.end);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/responsiva-docx-xml.test.ts`

Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/doc-gen/responsiva/docx-xml.ts server/tests/responsiva-docx-xml.test.ts
git commit -m "feat(responsiva): docx xml text helpers"
```

---

### Task 4: Photo-table OOXML builder

**Files:**
- Create: `server/doc-gen/responsiva/photo-table.ts`
- Test: `server/tests/responsiva-photo-table.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/responsiva-photo-table.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPhotoTableXml,
  computeImageExtentEmu,
  MAX_PHOTO_CX_EMU,
  MAX_PHOTO_CY_EMU,
} from "../doc-gen/responsiva/photo-table";

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

/** Shorthand photo row for tests (defaults = former fixed portrait box). */
function pe(rId: string, docPrId: number, cxEmu = MAX_PHOTO_CX_EMU, cyEmu = MAX_PHOTO_CY_EMU) {
  return { rId, docPrId, cxEmu, cyEmu };
}

test("returns empty string for zero images", () => {
  assert.equal(buildPhotoTableXml([]), "");
});

test("single image yields 1 row with 2 padding cells", () => {
  const xml = buildPhotoTableXml([pe("rId100", 1000)]);
  assert.equal(countMatches(xml, /<w:tr\b/g), 1);
  assert.equal(countMatches(xml, /<w:tc\b/g), 3);
  assert.equal(countMatches(xml, /<a:blip\b/g), 1);
  assert.match(xml, /r:embed="rId100"/);
  assert.match(xml, /<w:tblW w:w="9360" w:type="dxa"\/>/);
  assert.equal(countMatches(xml, /<w:gridCol w:w="3120"\/>/g), 3);
});

test("three images yield 1 row with no padding cells", () => {
  const xml = buildPhotoTableXml([
    pe("rId100", 1000),
    pe("rId101", 1001),
    pe("rId102", 1002),
  ]);
  assert.equal(countMatches(xml, /<w:tr\b/g), 1);
  assert.equal(countMatches(xml, /<w:tc\b/g), 3);
  assert.equal(countMatches(xml, /<a:blip\b/g), 3);
});

test("four images yield 2 rows with 2 padding cells in row 2", () => {
  const xml = buildPhotoTableXml([
    pe("rId100", 1000),
    pe("rId101", 1001),
    pe("rId102", 1002),
    pe("rId103", 1003),
  ]);
  assert.equal(countMatches(xml, /<w:tr\b/g), 2);
  assert.equal(countMatches(xml, /<w:tc\b/g), 6);
  assert.equal(countMatches(xml, /<a:blip\b/g), 4);
});

test("seven images → 3 rows, 9 cells, 7 blips", () => {
  const entries = Array.from({ length: 7 }, (_, i) => pe(`rId${100 + i}`, 1000 + i));
  const xml = buildPhotoTableXml(entries);
  assert.equal(countMatches(xml, /<w:tr\b/g), 3);
  assert.equal(countMatches(xml, /<w:tc\b/g), 9);
  assert.equal(countMatches(xml, /<a:blip\b/g), 7);
});

test("each image uses cxEmu and cyEmu from the entry with center alignment", () => {
  const xml = buildPhotoTableXml([pe("rId200", 2000, 1111111, 2222222)]);
  assert.match(xml, /cx="1111111"/);
  assert.match(xml, /cy="2222222"/);
  assert.match(xml, /<w:jc w:val="center"\/>/);
});

test("blipFill does not use a:stretch (avoid forced distortion)", () => {
  const xml = buildPhotoTableXml([pe("rId100", 1000)]);
  assert.doesNotMatch(xml, /<a:stretch>/);
});

test("computeImageExtentEmu preserves aspect ratio inside max EMU box", () => {
  const wide = computeImageExtentEmu(2000, 1000);
  assert.equal(wide.cx, MAX_PHOTO_CX_EMU);
  assert.ok(wide.cy < MAX_PHOTO_CY_EMU);

  const tall = computeImageExtentEmu(1000, 2000);
  assert.equal(tall.cy, MAX_PHOTO_CY_EMU);
  assert.ok(tall.cx < MAX_PHOTO_CX_EMU);
});

test("all borders are nil", () => {
  const xml = buildPhotoTableXml([pe("rId100", 1000)]);
  assert.match(xml, /<w:tblBorders>[\s\S]*<w:top w:val="nil"\/>[\s\S]*<\/w:tblBorders>/);
  assert.ok(countMatches(xml, /<w:tcBorders>/g) >= 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/responsiva-photo-table.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/doc-gen/responsiva/photo-table.ts`:

```typescript
export interface PhotoEntry {
  rId: string;
  docPrId: number;
  /** Drawing extent EMU (horizontal). From `computeImageExtentEmu` + `image-size` in the embedder. */
  cxEmu: number;
  /** Drawing extent EMU (vertical). */
  cyEmu: number;
}

/** Default max inline image box (same numeric caps as the old fixed portrait size). */
export const MAX_PHOTO_CX_EMU = 2_800_000;
export const MAX_PHOTO_CY_EMU = 3_800_000;

/**
 * Fit natural pixel dimensions into a max EMU rectangle; preserves aspect ratio.
 * If dimensions are missing or invalid, returns the full max box (legacy behavior).
 */
export function computeImageExtentEmu(
  pixelWidth: number,
  pixelHeight: number,
  maxCx = MAX_PHOTO_CX_EMU,
  maxCy = MAX_PHOTO_CY_EMU,
): { cx: number; cy: number } {
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0
  ) {
    return { cx: maxCx, cy: maxCy };
  }
  const ratio = pixelWidth / pixelHeight;
  let cx = maxCx;
  let cy = Math.round(maxCx / ratio);
  if (cy > maxCy) {
    cy = maxCy;
    cx = Math.round(maxCy * ratio);
  }
  return { cx, cy };
}

const COLS_PER_ROW = 3;
const TABLE_WIDTH_DXA = 9360;
const CELL_WIDTH_DXA = 3120;

const TABLE_OPEN =
  "<w:tbl>" +
  "<w:tblPr>" +
  `<w:tblW w:w="${TABLE_WIDTH_DXA}" w:type="dxa"/>` +
  "<w:tblBorders>" +
  '<w:top w:val="nil"/>' +
  '<w:left w:val="nil"/>' +
  '<w:bottom w:val="nil"/>' +
  '<w:right w:val="nil"/>' +
  '<w:insideH w:val="nil"/>' +
  '<w:insideV w:val="nil"/>' +
  "</w:tblBorders>" +
  '<w:tblLayout w:type="fixed"/>' +
  "</w:tblPr>" +
  "<w:tblGrid>" +
  `<w:gridCol w:w="${CELL_WIDTH_DXA}"/>`.repeat(COLS_PER_ROW) +
  "</w:tblGrid>";

const TABLE_CLOSE = "</w:tbl>";

const CELL_BORDERS =
  "<w:tcBorders>" +
  '<w:top w:val="nil"/>' +
  '<w:left w:val="nil"/>' +
  '<w:bottom w:val="nil"/>' +
  '<w:right w:val="nil"/>' +
  "</w:tcBorders>";

function imageCell(entry: PhotoEntry): string {
  const { cxEmu, cyEmu } = entry;
  return (
    "<w:tc>" +
    "<w:tcPr>" +
    `<w:tcW w:w="${CELL_WIDTH_DXA}" w:type="dxa"/>` +
    CELL_BORDERS +
    "</w:tcPr>" +
    "<w:p>" +
    '<w:pPr><w:jc w:val="center"/></w:pPr>' +
    "<w:r>" +
    "<w:drawing>" +
    '<wp:inline distT="0" distB="0" distL="0" distR="0" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    `<wp:extent cx="${cxEmu}" cy="${cyEmu}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${entry.docPrId}" name="Picture ${entry.docPrId}"/>` +
    "<wp:cNvGraphicFramePr/>" +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    "<pic:nvPicPr>" +
    `<pic:cNvPr id="${entry.docPrId}" name="Picture ${entry.docPrId}"/>` +
    "<pic:cNvPicPr/>" +
    "</pic:nvPicPr>" +
    "<pic:blipFill>" +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${entry.rId}"/>` +
    "</pic:blipFill>" +
    "<pic:spPr>" +
    "<a:xfrm>" +
    '<a:off x="0" y="0"/>' +
    `<a:ext cx="${cxEmu}" cy="${cyEmu}"/>` +
    "</a:xfrm>" +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    "</pic:spPr>" +
    "</pic:pic>" +
    "</a:graphicData>" +
    "</a:graphic>" +
    "</wp:inline>" +
    "</w:drawing>" +
    "</w:r>" +
    "</w:p>" +
    "</w:tc>"
  );
}

function emptyCell(): string {
  return (
    "<w:tc>" +
    "<w:tcPr>" +
    `<w:tcW w:w="${CELL_WIDTH_DXA}" w:type="dxa"/>` +
    CELL_BORDERS +
    "</w:tcPr>" +
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>' +
    "</w:tc>"
  );
}

/** Build the OOXML `<w:tbl>` for a photo grid. Empty input → empty string. */
export function buildPhotoTableXml(photos: readonly PhotoEntry[]): string {
  if (photos.length === 0) return "";
  const rowCount = Math.ceil(photos.length / COLS_PER_ROW);
  let rows = "";
  for (let r = 0; r < rowCount; r++) {
    let cells = "";
    for (let c = 0; c < COLS_PER_ROW; c++) {
      const idx = r * COLS_PER_ROW + c;
      cells += idx < photos.length ? imageCell(photos[idx]!) : emptyCell();
    }
    rows += `<w:tr>${cells}</w:tr>`;
  }
  return `${TABLE_OPEN}${rows}${TABLE_CLOSE}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/responsiva-photo-table.test.ts`

Expected: PASS — 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/doc-gen/responsiva/photo-table.ts server/tests/responsiva-photo-table.test.ts
git commit -m "feat(responsiva): photo table ooxml builder with aspect-preserving extents"
```

---

### Task 5: Relationships + content-types helpers

**Files:**
- Create: `server/doc-gen/responsiva/rels-xml.ts`
- Test: `server/tests/responsiva-rels-xml.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/responsiva-rels-xml.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  insertImageRelationships,
  ensureImageContentTypes,
} from "../doc-gen/responsiva/rels-xml";

const RELS_HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';

test("insertImageRelationships appends before </Relationships>", () => {
  const base = RELS_HEADER + '<Relationship Id="rId1" Type="foo" Target="bar"/></Relationships>';
  const out = insertImageRelationships(base, [
    { rId: "rId100", target: "media/img_0.jpeg" },
    { rId: "rId101", target: "media/img_1.png" },
  ]);
  assert.match(
    out,
    /<Relationship Id="rId100" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/image" Target="media\/img_0\.jpeg"\/>/,
  );
  assert.match(
    out,
    /<Relationship Id="rId101" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/image" Target="media\/img_1\.png"\/>/,
  );
  assert.ok(out.endsWith("</Relationships>"));
});

test("insertImageRelationships throws when closing tag missing", () => {
  assert.throws(
    () => insertImageRelationships("<Relationships/>", [{ rId: "rId100", target: "media/img_0.jpeg" }]),
    /closing <\/Relationships> not found/,
  );
});

const CT_BASE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  "</Types>";

test("ensureImageContentTypes adds jpeg and png defaults when missing", () => {
  const out = ensureImageContentTypes(CT_BASE, ["jpeg", "png"]);
  assert.match(out, /<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
  assert.match(out, /<Default Extension="png" ContentType="image\/png"\/>/);
});

test("ensureImageContentTypes is idempotent", () => {
  const withJpeg = CT_BASE.replace(
    "</Types>",
    '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>',
  );
  const out = ensureImageContentTypes(withJpeg, ["jpeg", "png"]);
  const jpegHits = (out.match(/Extension="jpeg"/g) ?? []).length;
  assert.equal(jpegHits, 1);
  assert.match(out, /Extension="png"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/responsiva-rels-xml.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/doc-gen/responsiva/rels-xml.ts`:

```typescript
export interface RelEntry {
  rId: string;
  target: string;
}

const IMAGE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

export function insertImageRelationships(relsXml: string, entries: readonly RelEntry[]): string {
  if (entries.length === 0) return relsXml;
  const closing = "</Relationships>";
  const idx = relsXml.lastIndexOf(closing);
  if (idx < 0) throw new Error("closing </Relationships> not found");
  const added = entries
    .map((e) => `<Relationship Id="${e.rId}" Type="${IMAGE_REL_TYPE}" Target="${e.target}"/>`)
    .join("");
  return relsXml.slice(0, idx) + added + relsXml.slice(idx);
}

export function ensureImageContentTypes(
  contentTypesXml: string,
  extensions: readonly ("jpeg" | "png")[],
): string {
  const closing = "</Types>";
  const idx = contentTypesXml.lastIndexOf(closing);
  if (idx < 0) throw new Error("closing </Types> not found");

  const toAdd: string[] = [];
  for (const ext of extensions) {
    const present = new RegExp(`Extension="${ext}"`).test(contentTypesXml);
    if (!present) {
      const mime = ext === "jpeg" ? "image/jpeg" : "image/png";
      toAdd.push(`<Default Extension="${ext}" ContentType="${mime}"/>`);
    }
  }
  if (toAdd.length === 0) return contentTypesXml;
  return contentTypesXml.slice(0, idx) + toAdd.join("") + contentTypesXml.slice(idx);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/responsiva-rels-xml.test.ts`

Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/doc-gen/responsiva/rels-xml.ts server/tests/responsiva-rels-xml.test.ts
git commit -m "feat(responsiva): relationships + content-types helpers"
```

---

### Task 6: Image embedder

**Files:**
- Create: `server/doc-gen/responsiva/image-embedder.ts`
- Test: `server/tests/responsiva-image-embedder.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/responsiva-image-embedder.test.ts`:

```typescript
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
```

Note: `a.jpg` is written with PNG bytes so `image-size` still parses dimensions (1×1); extension detection stays `jpeg`. For production JPEGs, dimensions come from the real file. If you prefer stricter fixtures, commit tiny real `.jpg` / `.png` under `server/tests/fixtures/` and `readFileSync` them here.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/responsiva-image-embedder.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/doc-gen/responsiva/image-embedder.ts`:

```typescript
import fs from "node:fs/promises";
import type JSZip from "jszip";
import { imageSize } from "image-size";
import { computeImageExtentEmu } from "./photo-table";

export type ImageExt = "jpeg" | "png";

export interface EmbeddedImageEntry {
  rId: string;
  docPrId: number;
  ext: ImageExt;
  mediaTarget: string;
  sourceImageUrl: string;
  cxEmu: number;
  cyEmu: number;
}

export interface EmbedAttachmentImagesInput {
  zip: JSZip;
  uploadsDir: string;
  attachments: readonly { imageUrl: string }[];
  startingRId: number;
  startingDocPrId: number;
  /** Resolve public `imageUrl` to an absolute filesystem path, or `null` if not allowed / not found. */
  resolvePath: (dir: string, url: string) => string | null;
}

export interface EmbedAttachmentImagesResult {
  entries: EmbeddedImageEntry[];
  extensions: Set<ImageExt>;
}

export function detectImageExtension(imageUrl: string): ImageExt | null {
  const dot = imageUrl.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = imageUrl.slice(dot + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  return null;
}

function extentFromImageBytes(bytes: Buffer): { cx: number; cy: number } {
  try {
    const dim = imageSize(new Uint8Array(bytes));
    const w = dim.width ?? 0;
    const h = dim.height ?? 0;
    return computeImageExtentEmu(w, h);
  } catch {
    return computeImageExtentEmu(0, 0);
  }
}

export async function embedAttachmentImages(
  input: EmbedAttachmentImagesInput,
): Promise<EmbedAttachmentImagesResult> {
  const entries: EmbeddedImageEntry[] = [];
  const extensions = new Set<ImageExt>();
  let nextRId = input.startingRId;
  let nextDocPr = input.startingDocPrId;
  let mediaIdx = 0;

  for (const att of input.attachments) {
    const ext = detectImageExtension(att.imageUrl);
    if (!ext) continue;

    const fsPath = input.resolvePath(input.uploadsDir, att.imageUrl);
    if (!fsPath) continue;

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(fsPath);
    } catch {
      continue;
    }

    const { cx, cy } = extentFromImageBytes(bytes);

    const mediaTarget = `media/img_${mediaIdx}.${ext}`;
    input.zip.file(`word/${mediaTarget}`, bytes);

    entries.push({
      rId: `rId${nextRId}`,
      docPrId: nextDocPr,
      ext,
      mediaTarget,
      sourceImageUrl: att.imageUrl,
      cxEmu: cx,
      cyEmu: cy,
    });
    extensions.add(ext);

    nextRId += 1;
    nextDocPr += 1;
    mediaIdx += 1;
  }

  return { entries, extensions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/responsiva-image-embedder.test.ts`

Expected: PASS — 5 tests green.

Implementation note: match your installed `image-size` API (named `imageSize` vs default export); buffer typing may be `Buffer` directly.

- [ ] **Step 5: Commit**

```bash
git add server/doc-gen/responsiva/image-embedder.ts server/tests/responsiva-image-embedder.test.ts
git commit -m "feat(responsiva): filesystem image embedder with DI and dimensions"
```

---

### Task 7: Responsiva service (orchestrator)

**Files:**
- Create: `server/doc-gen/responsiva/responsiva.service.ts`
- Test: `server/tests/responsiva-service.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/responsiva-service.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { generateResponsivaDocx } from "../doc-gen/responsiva/responsiva.service";

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

/** Valid 1×1 PNG bytes so `image-size` resolves dimensions in integration tests. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "responsiva-svc-"));
  const uploads = path.join(tmp, "uploads");
  fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(uploads, "a.jpg"), TINY_PNG);
  fs.writeFileSync(path.join(uploads, "b.png"), TINY_PNG);
  const template = await buildTemplateFile(tmp);
  return { tmp, uploads, template };
}

test("fills placeholders and embeds images", async () => {
  const ctx = await setup();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: ctx.uploads,
      item: { code: "C001", name: "Laptop Dell", serialNumber: "SN-123", responsible: "Ana" },
      attachments: [{ imageUrl: "/uploads/a.jpg" }, { imageUrl: "/uploads/b.png" }],
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
    assert.doesNotMatch(docXml, /<a:stretch>/);
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
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});

test("removes SERIE paragraph when serial is null", async () => {
  const ctx = await setup();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: ctx.uploads,
      item: { code: "C002", name: "Laptop", serialNumber: null, responsible: "Luis" },
      attachments: [],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    const z = await JSZip.loadAsync(out.buffer);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.doesNotMatch(docXml, /Número de serie/);
    assert.doesNotMatch(docXml, /\{\{SERIE\}\}/);
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});

test("removes FOTOS paragraph when no images", async () => {
  const ctx = await setup();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: ctx.uploads,
      item: { code: "C003", name: "Monitor", serialNumber: "SN-1", responsible: "Jose" },
      attachments: [],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    const z = await JSZip.loadAsync(out.buffer);
    const docXml = await z.file("word/document.xml")!.async("string");
    assert.doesNotMatch(docXml, /\{\{FOTOS\}\}/);
    assert.doesNotMatch(docXml, /<w:tbl>/);
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});

test("sanitizes filename segments", async () => {
  const ctx = await setup();
  try {
    const out = await generateResponsivaDocx({
      templatePath: ctx.template,
      uploadsDir: ctx.uploads,
      item: { code: "C 004/x", name: "X", serialNumber: null, responsible: "Juan Pérez" },
      attachments: [],
      now: new Date(2025, 11, 8, 12, 0, 0),
    });
    assert.ok(out.suggestedFilename.startsWith("Responsiva_C_004_x_"));
    assert.ok(out.suggestedFilename.endsWith(".docx"));
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/responsiva-service.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/doc-gen/responsiva/responsiva.service.ts`:

```typescript
import fs from "node:fs/promises";
import JSZip from "jszip";
import { resolveStoredFilePath } from "../../path-utils";
import { formatSpanishLongDate } from "./date-es";
import {
  removeParagraphContaining,
  replaceParagraphContainingWithXml,
  replacePlaceholderText,
} from "./docx-xml";
import { buildPhotoTableXml } from "./photo-table";
import { embedAttachmentImages } from "./image-embedder";
import { ensureImageContentTypes, insertImageRelationships } from "./rels-xml";

export interface ResponsivaItem {
  code: string;
  name: string;
  serialNumber: string | null | undefined;
  responsible: string | null | undefined;
}

export interface ResponsivaAttachment {
  imageUrl: string;
}

export interface GenerateResponsivaInput {
  templatePath: string;
  uploadsDir: string;
  item: ResponsivaItem;
  attachments: readonly ResponsivaAttachment[];
  now?: Date;
}

export interface GeneratedResponsiva {
  buffer: Buffer;
  mimeType: string;
  suggestedFilename: string;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_XML_PATH = "word/document.xml";
const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";

function sanitizeFilenameSegment(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "x";
}

export async function generateResponsivaDocx(
  input: GenerateResponsivaInput,
): Promise<GeneratedResponsiva> {
  const templateBytes = await fs.readFile(input.templatePath);
  const zip = await JSZip.loadAsync(templateBytes);

  const docEntry = zip.file(DOCUMENT_XML_PATH);
  if (!docEntry) throw new Error(`template missing ${DOCUMENT_XML_PATH}`);
  let docXml = await docEntry.async("string");

  const now = input.now ?? new Date();
  docXml = replacePlaceholderText(docXml, "FECHA", formatSpanishLongDate(now));
  docXml = replacePlaceholderText(docXml, "EQUIPO", input.item.name ?? "");
  docXml = replacePlaceholderText(docXml, "RESPONSABLE", input.item.responsible ?? "");

  const serial = (input.item.serialNumber ?? "").trim();
  if (serial.length === 0) {
    docXml = removeParagraphContaining(docXml, "{{SERIE}}");
  } else {
    docXml = replacePlaceholderText(docXml, "SERIE", serial);
  }

  const embedded = await embedAttachmentImages({
    zip,
    uploadsDir: input.uploadsDir,
    attachments: input.attachments,
    startingRId: 100,
    startingDocPrId: 1000,
    resolvePath: resolveStoredFilePath,
  });

  if (embedded.entries.length === 0) {
    docXml = removeParagraphContaining(docXml, "{{FOTOS}}");
  } else {
    const tableXml = buildPhotoTableXml(
      embedded.entries.map((e) => ({
        rId: e.rId,
        docPrId: e.docPrId,
        cxEmu: e.cxEmu,
        cyEmu: e.cyEmu,
      })),
    );
    docXml = replaceParagraphContainingWithXml(docXml, "{{FOTOS}}", tableXml);

    const relsEntry = zip.file(DOCUMENT_RELS_PATH);
    if (!relsEntry) throw new Error(`template missing ${DOCUMENT_RELS_PATH}`);
    const relsXml = await relsEntry.async("string");
    const nextRels = insertImageRelationships(
      relsXml,
      embedded.entries.map((e) => ({ rId: e.rId, target: e.mediaTarget })),
    );
    zip.file(DOCUMENT_RELS_PATH, nextRels);

    const ctEntry = zip.file(CONTENT_TYPES_PATH);
    if (!ctEntry) throw new Error(`template missing ${CONTENT_TYPES_PATH}`);
    const ctXml = await ctEntry.async("string");
    const nextCt = ensureImageContentTypes(
      ctXml,
      Array.from(embedded.extensions) as ("jpeg" | "png")[],
    );
    zip.file(CONTENT_TYPES_PATH, nextCt);
  }

  zip.file(DOCUMENT_XML_PATH, docXml);

  const buffer = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

  const code = sanitizeFilenameSegment(input.item.code);
  const resp = sanitizeFilenameSegment(input.item.responsible ?? "responsable");
  return {
    buffer,
    mimeType: DOCX_MIME,
    suggestedFilename: `Responsiva_${code}_${resp}.docx`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/responsiva-service.test.ts`

Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/doc-gen/responsiva/responsiva.service.ts server/tests/responsiva-service.test.ts
git commit -m "feat(responsiva): orchestration service"
```

---

### Task 8: Route + index

**Files:**
- Create: `server/doc-gen/responsiva/responsiva.routes.ts`
- Create: `server/doc-gen/responsiva/index.ts`
- Modify: `server/doc-gen/index.ts`
- Modify: `server/routes.ts`
- Test: `server/tests/responsiva-route.test.ts`

- [ ] **Step 1: Implement the route with injection seam**

Create `server/doc-gen/responsiva/responsiva.routes.ts`:

```typescript
import path from "node:path";
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../route-middleware";
import { generateResponsivaDocx } from "./responsiva.service";
import type { ResponsivaAttachment, ResponsivaItem } from "./responsiva.service";

export interface ResponsivaRouteDeps {
  getItem: (
    id: number,
  ) => Promise<(ResponsivaItem & { id: number; siteId: number }) | null | undefined>;
  getAttachments: (itemId: number) => Promise<ResponsivaAttachment[]>;
  getSiteAccess: (req: Request) => Promise<unknown>;
  canRead: (access: unknown) => boolean;
  itemSiteAllowed: (access: unknown, siteId: number) => boolean;
  templatePath: string;
  uploadsDir: string;
  now?: () => Date;
}

export function registerResponsivaRoutes(app: Express, deps: ResponsivaRouteDeps): void {
  app.get("/api/inventory/:id/responsiva", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const access = await deps.getSiteAccess(req);
    if (!deps.canRead(access)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const item = await deps.getItem(id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (!deps.itemSiteAllowed(access, item.siteId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const attachments = await deps.getAttachments(id);

    try {
      const out = await generateResponsivaDocx({
        templatePath: deps.templatePath,
        uploadsDir: deps.uploadsDir,
        item,
        attachments,
        now: deps.now ? deps.now() : undefined,
      });
      const filename = out.suggestedFilename;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(out.buffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("[responsiva] generation failed", { id, message });
      res.status(500).json({ error: "Error generating document" });
    }
  });
}

export interface RegisterResponsivaDefaultsInput {
  templatePath?: string;
  uploadsDir?: string;
}

export async function registerResponsivaRoutesDefault(
  app: Express,
  input: RegisterResponsivaDefaultsInput = {},
): Promise<void> {
  const { storage } = await import("../../storage");
  const { getSiteAccess, can, itemSiteAllowed } = await import("../../site-rbac-access");
  const { SITE_CAPABILITIES } = await import("@shared/site-rbac");
  const { uploadsPath } = await import("../../upload-config");

  const templatePath =
    input.templatePath ??
    path.join(process.cwd(), "src", "templates", "responsiva_template.docx");
  const uploadsDir = input.uploadsDir ?? uploadsPath;

  registerResponsivaRoutes(app, {
    getItem: async (id) => {
      const item = await storage.getItem(id);
      if (!item) return null;
      return {
        id: item.id,
        siteId: item.siteId,
        code: item.code,
        name: item.name,
        serialNumber: item.serialNumber,
        responsible: item.responsible,
      };
    },
    getAttachments: async (id) => await storage.getAttachments(id),
    getSiteAccess: async (req) => await getSiteAccess(req),
    canRead: (access) => can(access as never, SITE_CAPABILITIES.INVENTORY_READ),
    itemSiteAllowed: (access, siteId) => itemSiteAllowed(access as never, siteId),
    templatePath,
    uploadsDir,
  });
}
```

Create `server/doc-gen/responsiva/index.ts`:

```typescript
export {
  registerResponsivaRoutes,
  registerResponsivaRoutesDefault,
} from "./responsiva.routes";
export type { ResponsivaRouteDeps } from "./responsiva.routes";
export { generateResponsivaDocx } from "./responsiva.service";
export type {
  GenerateResponsivaInput,
  GeneratedResponsiva,
  ResponsivaAttachment,
  ResponsivaItem,
} from "./responsiva.service";
```

- [ ] **Step 2: Write the route test**

Create `server/tests/responsiva-route.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import express from "express";
import JSZip from "jszip";
import type { NextFunction, Request, Response } from "express";
import { registerResponsivaRoutes } from "../doc-gen/responsiva";

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
    (req as Request & { isAuthenticated: () => boolean }).isAuthenticated = () => opts.authed;
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
```

- [ ] **Step 3: Run route tests**

Run: `npx tsx --test server/tests/responsiva-route.test.ts`

Expected: PASS — 3 tests green.

- [ ] **Step 4: Register in the doc-gen barrel**

Replace `server/doc-gen/index.ts` with:

```typescript
import type { Express } from "express";
import { registerDocGenDocumentRoutes } from "./documents/documents.routes";
import { registerDocGenTemplateRoutes } from "./templates/templates.routes";
import { registerResponsivaRoutesDefault } from "./responsiva";

export { shutdownPdfService } from "./pdf/pdf.service";
export { templateService } from "./templates/templates.service";
export { renderingService } from "./rendering/rendering.service";
export { documentGenerationService } from "./documents/documents.service";
export { generateResponsivaDocx } from "./responsiva";

export async function registerDocGenRoutes(app: Express): Promise<void> {
  registerDocGenTemplateRoutes(app);
  registerDocGenDocumentRoutes(app);
  await registerResponsivaRoutesDefault(app);
}
```

- [ ] **Step 5: Update the caller in `server/routes.ts`**

Open `server/routes.ts`. Find the line near line 117:

```typescript
registerDocGenRoutes(app);
```

Change it to:

```typescript
await registerDocGenRoutes(app);
```

Confirm the enclosing function is already `async` (grep for its `function` declaration — `registerRoutes` / `setupRoutes` etc.). If not, mark it `async`.

Run:
```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/doc-gen/responsiva/responsiva.routes.ts server/doc-gen/responsiva/index.ts server/doc-gen/index.ts server/routes.ts server/tests/responsiva-route.test.ts
git commit -m "feat(responsiva): route + dependency wiring"
```

---

### Task 9: Integration check with the real template

**Files:**
- Create: `server/tests/responsiva-template-presence.test.ts`

- [ ] **Step 1: Write the assertion**

Create `server/tests/responsiva-template-presence.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it**

Run: `npx tsx --test server/tests/responsiva-template-presence.test.ts`

Expected: PASS. If a placeholder fails, Word has split it across text runs — open the `.docx`, delete each missing placeholder, retype it as one continuous word (no intra-placeholder formatting changes), save. Re-run until green.

- [ ] **Step 3: Commit**

```bash
git add server/tests/responsiva-template-presence.test.ts
git commit -m "test(responsiva): verify real template carries every placeholder"
```

---

### Task 10: Full test suite + type check

- [ ] **Step 1: Run everything**

Run:
```bash
npm test
```

Expected: all existing tests still pass; new responsiva tests pass (6 files).

- [ ] **Step 2: Type check**

Run:
```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 3: Boot the dev server as a final smoke test**

Run:
```bash
npm run dev
```

In another shell, grab a session cookie by logging in through the UI, then:
```bash
curl -i "http://localhost:3000/api/inventory/1/responsiva" \
  -b "connect.sid=<session-cookie-from-browser>" \
  --output /tmp/test.docx
```

Expected: `HTTP/1.1 200`, `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, file opens in Word. Without the cookie: `401`.

Kill the dev server with Ctrl+C.

- [ ] **Step 4: Commit any cleanup (only if needed)**

```bash
git status
```

If nothing to commit, skip. Otherwise:
```bash
git add <files>
git commit -m "fix(responsiva): <what>"
```

---

### Task 11: Frontend download helper

**Files:**
- Create: `client/src/lib/download-responsiva.ts`

- [ ] **Step 1: Implement**

Create `client/src/lib/download-responsiva.ts`:

```typescript
function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}

export async function downloadResponsiva(input: {
  itemId: number;
  itemCode: string;
  responsible: string | null | undefined;
}): Promise<void> {
  const res = await fetch(`/api/inventory/${input.itemId}/responsiva`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = "Error al generar el documento";
    try {
      const json = (await res.json()) as { error?: string; message?: string };
      message = json.error ?? json.message ?? message;
    } catch {
      // response had no JSON body; keep default
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Responsiva_${sanitizeSegment(input.itemCode)}_${sanitizeSegment(
    input.responsible ?? "responsable",
  )}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Type check**

Run:
```bash
npm run check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/download-responsiva.ts
git commit -m "feat(responsiva): client download helper"
```

---

### Task 12: Inventory row icon button

**Files:**
- Modify: `client/src/pages/Dashboard.tsx` (around line 62 imports, around line 1974–2005 action buttons)

- [ ] **Step 1: Add imports**

Open `client/src/pages/Dashboard.tsx`. In the `lucide-react` import on line 62, add `FileDown`:

```typescript
import { Plus, Edit2, Trash2, Copy, Package, FilterX, Loader2, Download, Upload, ImageIcon, ChevronDown, ChevronUp, ChevronsUpDown, FileSpreadsheet, FileText, Columns3, QrCode, ChevronLeft, ChevronRight, X, Eye, UserPlus, Undo2, BarChart3, Wrench, MapPin, FileDown } from "lucide-react";
```

Near the other `@/lib/*` imports, add:

```typescript
import { downloadResponsiva } from "@/lib/download-responsiva";
```

Verify `useToast` is already imported and `const { toast } = useToast();` is present in the component body. If not, add:

```typescript
import { useToast } from "@/hooks/use-toast";
// and inside the component:
const { toast } = useToast();
```

- [ ] **Step 2: Add the button inside the editors' action block**

Inside the `{canEdit && (<>…</>)}` block (lines 1973–2006), between the `Edit2` button and the `Copy` button, insert:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 hover:text-primary hover:bg-primary/10"
  onClick={async () => {
    try {
      await downloadResponsiva({
        itemId: item.id,
        itemCode: item.code,
        responsible: item.responsible,
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "No se pudo generar la responsiva",
        variant: "destructive",
      });
    }
  }}
  title="Generar Responsiva"
>
  <FileDown className="w-4 h-4" />
</Button>
```

- [ ] **Step 3: Manual smoke**

Run:
```bash
npm run dev
```

Open the dashboard, log in as an editor/admin, click the new icon on an item with photos. A `.docx` should download. Open it in Word; confirm placeholders filled and photos appear.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat(responsiva): generate-responsiva icon in inventory row"
```

---

### Task 13: Item view dialog button

**Files:**
- Modify: `client/src/components/ItemViewDialog.tsx`

- [ ] **Step 1: Replace the file**

Overwrite `client/src/components/ItemViewDialog.tsx` with:

```tsx
import { useState } from "react";
import type { InventoryItem } from "@/hooks/use-inventory";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AssignmentTimeline } from "@/components/AssignmentTimeline";
import { MaintenanceTimeline } from "@/components/MaintenanceTimeline";
import { format } from "date-fns";
import { FileText, Loader2 } from "lucide-react";
import { downloadResponsiva } from "@/lib/download-responsiva";
import { useToast } from "@/hooks/use-toast";

export interface ItemViewDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeText(v: unknown) {
  if (v == null) return "—";
  const s = typeof v === "string" ? v.trim() : String(v);
  return s ? s : "—";
}

export function ItemViewDialog({ item, open, onOpenChange }: ItemViewDialogProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  if (!item) return null;

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      await downloadResponsiva({
        itemId: item.id,
        itemCode: item.code,
        responsible: item.responsible,
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "No se pudo generar la responsiva",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista del artículo</DialogTitle>
          <DialogDescription>Lectura solo para el rol `viewer` (sin historial ni edición).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground font-medium">Código</div>
              <div className="text-sm font-medium">{safeText(item.code)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Nombre</div>
              <div className="text-sm font-medium">{safeText(item.name)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Categoría</div>
              <div className="text-sm">{safeText(item.category)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Responsable</div>
              <div className="text-sm">{safeText(item.responsible)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Unidades</div>
              <div className="text-sm">{item.units ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Condición</div>
              <div className="text-sm">{safeText(item.condition)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Fecha de compra</div>
              <div className="text-sm">
                {item.purchaseDate ? format(new Date(item.purchaseDate), "dd/MM/yyyy") : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Vida útil</div>
              <div className="text-sm">{safeText(item.usefulLife)}</div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <div className="text-sm font-medium">Descripción (Notas internas)</div>
            <div className="text-sm whitespace-pre-wrap text-foreground">{item.notes ? item.notes : "—"}</div>
          </div>

          <div className="border-t pt-4">
            <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Generar Responsiva
            </Button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-medium">Historial de asignaciones</div>
            <AssignmentTimeline itemId={item.id} />
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-medium">Historial de mantenimiento</div>
            <MaintenanceTimeline itemId={item.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Manual smoke**

Run:
```bash
npm run dev
```

As a `viewer` role, open an item's view dialog. Click "Generar Responsiva". Confirm the `.docx` downloads and opens correctly in Word.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ItemViewDialog.tsx
git commit -m "feat(responsiva): generate button in item view dialog"
```

---

### Task 14: Manual verification checklist

- [ ] Open the generated `.docx` in Microsoft Word (not just LibreOffice) and confirm:
  - All 4 text placeholders are replaced
  - The "Número de serie" bullet is absent when the item has no serial
  - Photo table renders with exactly 3 columns per row
  - Table has no borders
  - Cell widths match the template's content area (full width, no overflow)
  - Missing trailing cells are present but empty (last row stays full width)
  - Images keep aspect ratio (extent EMU per file via `image-size` + `computeImageExtentEmu`; no stretched / squashed look)
- [ ] Verify file download name format: `Responsiva_<code>_<responsible>.docx`
- [ ] Generate for an item with zero photos — no table appears, no `{{FOTOS}}` string remains
- [ ] Generate for an item with 7 photos — 3 rows (3 + 3 + 1 image + 2 empty cells)
- [ ] Generate while logged out → 401
- [ ] Generate for an item the user can't see (site RBAC) → 403

---

## Self-Review Notes

- **Spec coverage:** every item in the spec (placeholders, SERIE removal, 3-col table, empty cells, image embedding, rels update, content types, frontend utility, two UI entry points) is covered by Tasks 2–13.
- **Placeholders:** no "TBD" or "handle edge cases" stubs — every step shows the code or command.
- **Type consistency:** `ResponsivaItem`, `ResponsivaAttachment`, `PhotoEntry` (includes `cxEmu`/`cyEmu`), `EmbeddedImageEntry` (includes `cxEmu`/`cyEmu`), `EmbedAttachmentImagesInput` (includes `resolvePath`), `ResponsivaRouteDeps`, and `GenerateResponsivaInput` are all introduced once and reused consistently across tasks.
- **Stack adjustments:** documented up-front so the implementer isn't surprised that Hono/Clerk/Bun references in the spec map to Express/session/npm in code.
- **Known follow-up (out of scope):** if the real `.docx` template has placeholders split across text runs (common when editing fonts mid-placeholder), Task 9 will fail. Fix by retyping the placeholder cleanly in Word. A future enhancement could merge `<w:t>` runs before text replacement; YAGNI for now.
