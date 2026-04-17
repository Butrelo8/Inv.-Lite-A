import Handlebars from "handlebars";
import type { DocTemplate, DocTemplateVariable } from "@shared/schema";
import type { ValidationResult } from "../types";
import { registerRenderingHelpers } from "./rendering.helpers";

const handlebars = Handlebars.create();
registerRenderingHelpers(handlebars);

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

type HbNode = { type: string; [key: string]: unknown };

/** Walk Handlebars AST and collect simple path references (e.g. `nombre`, `objeto.serie`). */
function collectPathExpressions(template: string): string[] {
  const out = new Set<string>();
  const ast = Handlebars.parse(template) as unknown as HbNode;

  const visitExpr = (expr: HbNode | undefined): void => {
    if (!expr || typeof expr !== "object") return;
    if (expr.type === "PathExpression" && Array.isArray(expr.parts)) {
      const path = (expr.parts as string[]).join(".");
      if (path) out.add(path);
      return;
    }
    if (expr.type === "SubExpression") {
      visitExpr(expr.path as HbNode);
      for (const p of (expr.params as HbNode[]) || []) visitExpr(p);
      for (const v of Object.values((expr.hash as Record<string, HbNode>) || {})) visitExpr(v);
    }
  };

  const visit = (node: HbNode | undefined): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "Program") {
      for (const s of (node.body as HbNode[]) || []) visit(s);
      return;
    }
    if (node.type === "MustacheStatement") {
      visitExpr(node.path as HbNode);
      for (const p of (node.params as HbNode[]) || []) visitExpr(p);
      for (const v of Object.values((node.hash as Record<string, HbNode>) || {})) visitExpr(v);
      return;
    }
    if (node.type === "BlockStatement") {
      visitExpr(node.path as HbNode);
      for (const p of (node.params as HbNode[]) || []) visitExpr(p);
      for (const v of Object.values((node.hash as Record<string, HbNode>) || {})) visitExpr(v);
      visit(node.program as HbNode);
      if (node.inverse) visit(node.inverse as HbNode);
      return;
    }
    if (node.type === "PartialStatement") {
      for (const p of (node.params as HbNode[]) || []) visitExpr(p);
      for (const v of Object.values((node.hash as Record<string, HbNode>) || {})) visitExpr(v);
    }
  };

  visit(ast);
  return Array.from(out).sort();
}

export class RenderingService {
  render(templateHtml: string, data: Record<string, unknown>): string {
    const compiled = handlebars.compile(templateHtml, { strict: false, noEscape: false });
    return compiled(data);
  }

  renderFull(template: DocTemplate, data: Record<string, unknown>): string {
    const header = template.headerHtml?.trim()
      ? this.render(template.headerHtml, data)
      : "";
    const body = this.render(template.bodyHtml, data);
    const footer = template.footerHtml?.trim()
      ? this.render(template.footerHtml, data)
      : "";
    const css = template.cssStyles?.trim() ?? "";
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(template.name)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; color: #111; }
    .doc-header { margin-bottom: 16px; }
    .doc-footer { margin-top: 24px; font-size: 12px; color: #555; }
    .doc-photo-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .doc-photo-cell img { max-width: 180px; max-height: 180px; object-fit: cover; border: 1px solid #ddd; }
    ${css}
  </style>
</head>
<body>
  ${header ? `<header class="doc-header">${header}</header>` : ""}
  <main>${body}</main>
  ${footer ? `<footer class="doc-footer">${footer}</footer>` : ""}
</body>
</html>`;
  }

  extractVariables(templateHtml: string): string[] {
    return collectPathExpressions(templateHtml);
  }

  validateData(variables: DocTemplateVariable[], data: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    for (const v of variables) {
      if (!v.required) continue;
      const val = getNested(data, v.key);
      if (isEmptyValue(val)) {
        errors.push(`Missing required field: ${v.key} (${v.label})`);
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const renderingService = new RenderingService();
