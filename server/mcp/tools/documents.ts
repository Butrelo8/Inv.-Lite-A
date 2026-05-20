import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import {
  INVENTORY_EXPORT_PDF_BLANK_COLS_CHECKLIST,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_CHECKLIST,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER,
  INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST,
  INVENTORY_EXPORT_PDF_HEADERS_VIEWER,
  INVENTORY_EXPORT_PDF_KEY_MAP_CHECKLIST,
  INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER,
  INVENTORY_EXPORT_PDF_MAX_LEN_CHECKLIST,
  INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER,
} from "../../inventory-export-config";
import { storage } from "../../storage";
import { generateResponsivaDocx } from "../../doc-gen/responsiva/responsiva.service";
import { uploadsPath } from "../../upload-config";

function mcpJson(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function registerDocumentsTools(server: any) {
  server.tool("generate_responsiva", "Generar responsiva DOCX", z.object({ id: z.number().int().positive() }), async (input: any) => {
    const item = await storage.getItem(input.id);
    if (!item) return mcpJson({ error: "not_found" });
    const attachments = await storage.getAttachments(input.id);
    const templatePath = (process.env.RESPONSIVA_TEMPLATE_PATH?.trim() || path.join(process.cwd(), "src", "templates", "responsiva_template.docx"));
    const out = await generateResponsivaDocx({ templatePath, uploadsDir: uploadsPath, item, attachments });
    return mcpJson({ filename: out.suggestedFilename, mimeType: out.mimeType, base64: out.buffer.toString("base64") });
  });

  server.tool("export_inventory_pdf", "Exportar inventario PDF", z.object({ category: z.string().optional(), responsible: z.string().optional(), companyId: z.number().int().positive().optional(), search: z.string().optional() }), async (input: any) => {
    const items = await storage.getItems(input.search, input.category, input.responsible, input.companyId);
    const [companies, sites] = await Promise.all([storage.getCompanies(), storage.getSites()]);
    const companyNameMap = new Map(companies.map((c) => [c.id, c.name]));
    const siteNameMap = new Map(sites.map((s) => [s.id, s.name]));
    const headers = INVENTORY_EXPORT_PDF_HEADERS_VIEWER as unknown as string[];
    const keyMap = INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER;
    const maxLen = INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER;
    const getVal = (item: Record<string, unknown>, h: string) => {
      const key = keyMap[h];
      const raw = item[key];
      if (key === "companyId" && typeof raw === "number") return (companyNameMap.get(raw) ?? String(raw)).slice(0, maxLen[h] ?? 35);
      if (key === "siteId" && typeof raw === "number") return (siteNameMap.get(raw) ?? String(raw)).slice(0, maxLen[h] ?? 35);
      return String(raw ?? "").slice(0, maxLen[h] ?? 35);
    };
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    const logoPath = [path.join(process.cwd(), "public", "logo.jpg"), path.join(process.cwd(), "client", "public", "logo.jpg"), path.join(process.cwd(), "logo.jpg")].find((p) => fs.existsSync(p));
    const pageW = 842; const startX = 30;
    if (logoPath) doc.image(logoPath, (pageW - 82.5) / 2, 20, { height: 55 });
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a2e").text("Reporte de Inventario", startX, 20, { width: pageW - startX * 2, align: "center" });
    doc.y = 90;
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER as unknown as number[];
    let y = doc.y;
    doc.fontSize(7).font("Helvetica-Bold");
    headers.forEach((h, i) => doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] }));
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke(); y += 15; doc.font("Helvetica");
    for (const item of items) { const row = headers.map((h) => getVal(item as Record<string, unknown>, h)); let rowHeight = 0; row.forEach((cell, i) => { rowHeight = Math.max(rowHeight, doc.heightOfString(cell, { width: colWidths[i] })); }); row.forEach((cell, i) => doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 4, { width: colWidths[i], height: rowHeight })); doc.moveTo(startX, y + rowHeight + 4).lineTo(startX + totalWidth, y + rowHeight + 4).stroke(); y += rowHeight + 4; }
    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    return mcpJson({ filename: "inventory-export.pdf", mimeType: "application/pdf", base64: buffer.toString("base64") });
  });

  server.tool("export_checklist_pdf", "Exportar checklist PDF", z.object({ eventName: z.string().min(1), dateRange: z.string().optional(), category: z.string().optional(), responsible: z.string().optional(), ids: z.array(z.number().int().positive()).optional() }), async (input: any) => {
    const items = input.ids?.length ? await storage.getItemsByIds(input.ids) : await storage.getItems(undefined, input.category, input.responsible);
    const headers = INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST as unknown as string[];
    const keyMap = INVENTORY_EXPORT_PDF_KEY_MAP_CHECKLIST;
    const maxLen = INVENTORY_EXPORT_PDF_MAX_LEN_CHECKLIST;
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_CHECKLIST as unknown as number[];
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    const pageW = 842; const startX = 30;
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a2e").text("Checklist de salida de equipo", startX, 20, { width: pageW - startX * 2, align: "center" });
    doc.fontSize(9).font("Helvetica").fillColor("#333333").text(`Evento: ${input.eventName}`, startX, 78, { width: pageW - startX * 2 });
    if (input.dateRange) doc.text(`Rango de fechas: ${input.dateRange}`, startX, 92, { width: pageW - startX * 2 });
    let y = 130; const totalWidth = colWidths.reduce((a, b) => a + b, 0); const xForCol = (i: number) => startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.fontSize(7).font("Helvetica-Bold"); headers.forEach((h, i) => doc.text(h, xForCol(i), y + 3, { width: colWidths[i] })); doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke(); y += 15; doc.font("Helvetica");
    for (let idx = 0; idx < items.length; idx++) { const item = items[idx] as Record<string, unknown>; const row = headers.map((h) => INVENTORY_EXPORT_PDF_BLANK_COLS_CHECKLIST.has(h) ? "" : String((keyMap[h] === "_rowIndex" ? idx + 1 : item[keyMap[h]]) ?? "").slice(0, maxLen[h] ?? 40)); row.forEach((cell, i) => doc.text(cell, xForCol(i), y + 4, { width: colWidths[i], height: 16 })); doc.moveTo(startX, y + 16).lineTo(startX + totalWidth, y + 16).stroke(); y += 16; }
    doc.fontSize(10).text("Autorizado por: _______________________     Fecha: ___________", startX, Math.max(y + 20, 540));
    doc.text("Recibió: _____________________________     Fecha: ___________", startX, Math.max(y + 48, 568));
    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    return mcpJson({ filename: "lista-salida-equipo.pdf", mimeType: "application/pdf", base64: buffer.toString("base64") });
  });
}
