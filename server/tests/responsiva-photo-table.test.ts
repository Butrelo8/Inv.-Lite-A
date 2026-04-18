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

test("blipFill uses stretch + fillRect so images fill the inline extent", () => {
  const xml = buildPhotoTableXml([pe("rId100", 1000)]);
  assert.match(xml, /<a:stretch><a:fillRect\/><\/a:stretch>/);
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
