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
