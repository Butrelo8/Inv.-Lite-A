import assert from "node:assert/strict";
import test from "node:test";
import { renderingService } from "../doc-gen/rendering/rendering.service";

test("extractVariables collects paths from mustaches", () => {
  const html = "<p>{{nombre}} — {{objeto.serie}} {{formatDate fecha}}</p>";
  const vars = renderingService.extractVariables(html);
  assert.ok(vars.includes("nombre"));
  assert.ok(vars.includes("objeto.serie"));
  assert.ok(vars.includes("fecha"));
});

test("validateData flags missing required keys", () => {
  const variables = [
    { key: "nombre", label: "Nombre", type: "text" as const, required: true },
    { key: "serie", label: "Serie", type: "text" as const, required: false },
  ];
  const bad = renderingService.validateData(variables, {});
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((e) => e.includes("nombre")));

  const ok = renderingService.validateData(variables, { nombre: "Ana" });
  assert.equal(ok.valid, true);
});

test("render applies Handlebars and helpers", () => {
  const out = renderingService.render("<span>{{nombre}}</span>", { nombre: "Test" });
  assert.equal(out, "<span>Test</span>");
});
