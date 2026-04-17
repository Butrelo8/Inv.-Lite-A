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
