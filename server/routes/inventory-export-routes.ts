import type { Express } from "express";
import path from "path";
import fs from "fs";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { insertInventoryItemSchema } from "@shared/schema";
import { SITE_CAPABILITIES } from "@shared/site-rbac";
import {
  parseTemplatePresetQuery,
  templateCsvForPreset,
  templateDataRowsForPreset,
  templateFilenameForPreset,
} from "../inventory-template-presets";
import {
  INVENTORY_EXPORT_HEADERS_ADMIN,
  INVENTORY_EXPORT_HEADERS_VIEWER,
  inventoryExportRowKey,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_ADMIN,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER,
  INVENTORY_EXPORT_PDF_HEADERS_ADMIN,
  INVENTORY_EXPORT_PDF_HEADERS_VIEWER,
  INVENTORY_EXPORT_PDF_KEY_MAP_ADMIN,
  INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER,
  INVENTORY_EXPORT_PDF_MAX_LEN_ADMIN,
  INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER,
  INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST,
  INVENTORY_EXPORT_PDF_KEY_MAP_CHECKLIST,
  INVENTORY_EXPORT_PDF_MAX_LEN_CHECKLIST,
  INVENTORY_EXPORT_PDF_COL_WIDTHS_CHECKLIST,
  INVENTORY_EXPORT_PDF_BLANK_COLS_CHECKLIST,
} from "../inventory-export-config";
import { emitOpsEvent } from "../ops-events";
import { parseSiteIdQuery, requireInventoryListContext } from "../inventory-list-context";
import { getAuthUserId, getClientIp, requireAuth, requireRole } from "../route-middleware";
import { getSiteAccess, can, forbidSiteRbac, itemSiteAllowed } from "../site-rbac-access";
import { storage } from "../storage";
import { csvUpload } from "../upload-config";

const MAX_CSV_IMPORT_ROWS = 5000;

export function registerInventoryExportRoutes(app: Express): void {
  // Export and import must be before :id to avoid matching "export"/"import" as id
  app.get("/api/inventory/export/template", requireAuth, async (req, res) => {
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const parsed = parseTemplatePresetQuery(req.query.preset);
    if (!parsed.ok) return res.status(400).json({ message: parsed.error });
    const preset = parsed.value;
    const csv = templateCsvForPreset(preset);
    const filename = templateFilenameForPreset(preset, "csv");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  });

  app.get("/api/inventory/export/template/xlsx", requireAuth, async (req, res) => {
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_READ)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_READ });
      return;
    }
    const parsed = parseTemplatePresetQuery(req.query.preset);
    if (!parsed.ok) return res.status(400).json({ message: parsed.error });
    const preset = parsed.value;
    const rows = templateDataRowsForPreset(preset);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Plantilla");
    worksheet.addRows(rows);
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${templateFilenameForPreset(preset, "xlsx")}"`);
    res.send(Buffer.from(buf));
  });

  const parseExportIds = (query: Record<string, unknown>): number[] | undefined => {
    const raw = query.ids;
    if (raw == null) return undefined;
    const str = Array.isArray(raw) ? raw[0] : raw;
    if (!str || typeof str !== "string") return undefined;
    const ids = str.split(",").map((s) => parseInt(String(s).trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids : undefined;
  };

  app.get("/api/inventory/export", requireAuth, async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(
          search,
          category,
          responsible,
          companyId,
          ctx.siteId,
          dateFrom,
          dateTo,
          addedAfter,
          modifiedAfter,
          ctx.restrictToSiteIds,
        );
    const headers = INVENTORY_EXPORT_HEADERS_VIEWER as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => {
        const val = (item as Record<string, unknown>)[rowKey(h)];
        const s = String(val ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.csv"');
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  });

  app.get("/api/inventory/export/xlsx", requireAuth, async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(
          search,
          category,
          responsible,
          companyId,
          ctx.siteId,
          dateFrom,
          dateTo,
          addedAfter,
          modifiedAfter,
          ctx.restrictToSiteIds,
        );
    const headers = INVENTORY_EXPORT_HEADERS_VIEWER as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => (item as Record<string, unknown>)[rowKey(h)] ?? "")
    );
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Inventory");
    worksheet.addRows([headers, ...rows]);
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.xlsx"');
    res.send(Buffer.from(buf));
  });

  app.get("/api/inventory/export/pdf", requireAuth, async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(
          search,
          category,
          responsible,
          companyId,
          ctx.siteId,
          dateFrom,
          dateTo,
          addedAfter,
          modifiedAfter,
          ctx.restrictToSiteIds,
        );
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
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.pdf"');
    doc.pipe(res);
    const logoPath = [path.join(process.cwd(), "public", "logo.jpg"), path.join(process.cwd(), "client", "public", "logo.jpg"), path.join(process.cwd(), "logo.jpg")].find((p) => fs.existsSync(p));
    const pageW = 842;
    const startX = 30;
    if (logoPath) {
      const logoHeight = 55;
      const logoWidth = logoHeight * (3 / 2);
      const logoX = (pageW - logoWidth) / 2;
      doc.image(logoPath, logoX, 20, { height: logoHeight });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a2e")
        .text("Reporte de Inventario", startX, 20, { width: pageW - startX * 2, align: "center" });
      const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
      doc.fontSize(8).font("Helvetica").fillColor("#555555")
        .text(dateStr, startX, 42, { width: pageW - startX * 2, align: "center" });
      doc.moveTo(startX, 82).lineTo(pageW - startX, 82).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.fillColor("#000000").lineWidth(1);
      doc.y = 90;
    }
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER as unknown as number[];
    let y = doc.y;
    doc.fontSize(7).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
    });
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
    y += 15;
    doc.font("Helvetica");
    for (const item of items) {
      if (y > 540) {
        doc.addPage({ layout: "landscape" });
        y = 30;
        doc.fontSize(7).font("Helvetica-Bold");
        headers.forEach((h, i) => {
          doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
        });
        doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
        y += 15;
        doc.font("Helvetica");
      }
      const row = headers.map((h) => getVal(item as Record<string, unknown>, h));
      let rowHeight = 0;
      row.forEach((cell, i) => {
        const h = doc.heightOfString(cell, { width: colWidths[i] });
        rowHeight = Math.max(rowHeight, h);
      });
      row.forEach((cell, i) => {
        doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 4, { width: colWidths[i], height: rowHeight });
      });
      doc.moveTo(startX, y + rowHeight + 4).lineTo(startX + totalWidth, y + rowHeight + 4).stroke();
      y += rowHeight + 4;
    }
    doc.end();
  });

  app.get("/api/inventory/export/checklist", requireAuth, async (req, res) => {
    const eventName = String(req.query.eventName ?? "").trim();
    if (!eventName) return res.status(400).json({ message: "Nombre del evento requerido" });
    const dateRange = String(req.query.dateRange ?? "").trim();
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(search, category, responsible, companyId, ctx.siteId, dateFrom, dateTo, addedAfter, modifiedAfter, ctx.restrictToSiteIds);

    const headers = INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST as unknown as string[];
    const keyMap = INVENTORY_EXPORT_PDF_KEY_MAP_CHECKLIST;
    const maxLen = INVENTORY_EXPORT_PDF_MAX_LEN_CHECKLIST;
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_CHECKLIST as unknown as number[];

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="lista-salida-equipo.pdf"');
    doc.pipe(res);

    const logoPath = [path.join(process.cwd(), "public", "logo.jpg"), path.join(process.cwd(), "client", "public", "logo.jpg"), path.join(process.cwd(), "logo.jpg")].find((p) => fs.existsSync(p));
    const pageW = 842;
    const startX = 30;
    if (logoPath) {
      const logoHeight = 55;
      const logoWidth = logoHeight * (3 / 2);
      const logoX = (pageW - logoWidth) / 2;
      doc.image(logoPath, logoX, 20, { height: logoHeight });
    }
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a2e").text("Checklist de salida de equipo", startX, 20, { width: pageW - startX * 2, align: "center" });
    doc.fontSize(9).font("Helvetica").fillColor("#333333").text(`Evento: ${eventName}`, startX, 78, { width: pageW - startX * 2 });
    if (dateRange) doc.text(`Rango de fechas: ${dateRange}`, startX, 92, { width: pageW - startX * 2 });
    doc.text(`Generado: ${new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}`, startX, dateRange ? 106 : 92, { width: pageW - startX * 2 });
    doc.moveTo(startX, 122).lineTo(pageW - startX, 122).strokeColor("#cccccc").lineWidth(0.5).stroke();
    doc.fillColor("#000000").lineWidth(1);

    let y = 130;
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const xForCol = (i: number) => startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    const drawHeader = () => {
      doc.fontSize(7).font("Helvetica-Bold");
      headers.forEach((h, i) => doc.text(h, xForCol(i), y + 3, { width: colWidths[i] }));
      doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
      y += 15;
      doc.font("Helvetica");
    };
    drawHeader();

    for (let idx = 0; idx < items.length; idx++) {
      if (y > 520) {
        doc.addPage({ layout: "landscape", margin: 30 });
        y = 30;
        drawHeader();
      }
      const item = items[idx] as Record<string, unknown>;
      const row = headers.map((h) => {
        if (INVENTORY_EXPORT_PDF_BLANK_COLS_CHECKLIST.has(h)) return "";
        const key = keyMap[h];
        const raw = key === "_rowIndex" ? idx + 1 : item[key];
        return String(raw ?? "").slice(0, maxLen[h] ?? 40);
      });
      let rowHeight = 16;
      row.forEach((cell, i) => {
        if (!INVENTORY_EXPORT_PDF_BLANK_COLS_CHECKLIST.has(headers[i])) {
          rowHeight = Math.max(rowHeight, doc.heightOfString(cell, { width: colWidths[i] }) + 6);
        }
      });
      row.forEach((cell, i) => {
        doc.text(cell, xForCol(i), y + 4, { width: colWidths[i], height: rowHeight });
      });
      doc.moveTo(startX, y + rowHeight).lineTo(startX + totalWidth, y + rowHeight).stroke();
      y += rowHeight;
    }

    const footerStartY = Math.max(y + 20, 540);
    doc.fontSize(10).font("Helvetica").text("Autorizado por: _______________________     Fecha: ___________", startX, footerStartY);
    doc.text("Recibió: _____________________________     Fecha: ___________", startX, footerStartY + 28);
    doc.end();
  });

  // Admin exports include internal notes fields.
  app.get("/api/inventory/export/admin", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    if (!can(ctx.access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(
          search,
          category,
          responsible,
          companyId,
          ctx.siteId,
          dateFrom,
          dateTo,
          addedAfter,
          modifiedAfter,
          ctx.restrictToSiteIds,
        );
    const headers = INVENTORY_EXPORT_HEADERS_ADMIN as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => {
        const val = (item as Record<string, unknown>)[rowKey(h)];
        const s = String(val ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export-admin.csv"');
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  });

  app.get("/api/inventory/export/admin/xlsx", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    if (!can(ctx.access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(
          search,
          category,
          responsible,
          companyId,
          ctx.siteId,
          dateFrom,
          dateTo,
          addedAfter,
          modifiedAfter,
          ctx.restrictToSiteIds,
        );
    const headers = INVENTORY_EXPORT_HEADERS_ADMIN as unknown as string[];
    const rowKey = inventoryExportRowKey;
    const rows = items.map((item) =>
      headers.map((h) => (item as Record<string, unknown>)[rowKey(h)] ?? "")
    );
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Inventory");
    worksheet.addRows([headers, ...rows]);
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export-admin.xlsx"');
    res.send(Buffer.from(buf));
  });

  app.get("/api/inventory/export/admin/pdf", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const ids = parseExportIds(req.query);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const responsible = req.query.responsible as string | undefined;
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const addedAfter = req.query.addedAfter as string | undefined;
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const ctx = await requireInventoryListContext(req, res, parseSiteIdQuery(req));
    if (!ctx) return;
    if (!can(ctx.access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const items = ids
      ? await storage.getItemsByIds(ids, ctx.restrictToSiteIds)
      : await storage.getItems(
          search,
          category,
          responsible,
          companyId,
          ctx.siteId,
          dateFrom,
          dateTo,
          addedAfter,
          modifiedAfter,
          ctx.restrictToSiteIds,
        );
    const [companies, sites] = await Promise.all([storage.getCompanies(), storage.getSites()]);
    const companyNameMap = new Map(companies.map((c) => [c.id, c.name]));
    const siteNameMap = new Map(sites.map((s) => [s.id, s.name]));
    const headers = INVENTORY_EXPORT_PDF_HEADERS_ADMIN as unknown as string[];
    const keyMap = INVENTORY_EXPORT_PDF_KEY_MAP_ADMIN;
    const maxLen = INVENTORY_EXPORT_PDF_MAX_LEN_ADMIN;
    const getVal = (item: Record<string, unknown>, h: string) => {
      const key = keyMap[h];
      const raw = item[key];
      if (key === "companyId" && typeof raw === "number") return (companyNameMap.get(raw) ?? String(raw)).slice(0, maxLen[h] ?? 35);
      if (key === "siteId" && typeof raw === "number") return (siteNameMap.get(raw) ?? String(raw)).slice(0, maxLen[h] ?? 35);
      return String(raw ?? "").slice(0, maxLen[h] ?? 35);
    };
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export-admin.pdf"');
    doc.pipe(res);
    const logoPath = [path.join(process.cwd(), "public", "logo.jpg"), path.join(process.cwd(), "client", "public", "logo.jpg"), path.join(process.cwd(), "logo.jpg")].find((p) => fs.existsSync(p));
    const pageW = 842;
    const startX = 30;
    if (logoPath) {
      const logoHeight = 55;
      const logoWidth = logoHeight * (3 / 2);
      const logoX = (pageW - logoWidth) / 2;
      doc.image(logoPath, logoX, 20, { height: logoHeight });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a2e")
        .text("Reporte de Inventario", startX, 20, { width: pageW - startX * 2, align: "center" });
      const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
      doc.fontSize(8).font("Helvetica").fillColor("#555555")
        .text(dateStr, startX, 42, { width: pageW - startX * 2, align: "center" });
      doc.moveTo(startX, 82).lineTo(pageW - startX, 82).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.fillColor("#000000").lineWidth(1);
      doc.y = 90;
    }
    const colWidths = INVENTORY_EXPORT_PDF_COL_WIDTHS_ADMIN as unknown as number[];
    let y = doc.y;
    doc.fontSize(7).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
    });
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
    y += 15;
    doc.font("Helvetica");
    for (const item of items) {
      if (y > 540) {
        doc.addPage({ layout: "landscape" });
        y = 30;
        doc.fontSize(7).font("Helvetica-Bold");
        headers.forEach((h, i) => {
          doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 3, { width: colWidths[i] });
        });
        doc.moveTo(startX, y + 15).lineTo(startX + totalWidth, y + 15).stroke();
        y += 15;
        doc.font("Helvetica");
      }
      const row = headers.map((h) => getVal(item as Record<string, unknown>, h));
      let rowHeight = 0;
      row.forEach((cell, i) => {
        const h = doc.heightOfString(cell, { width: colWidths[i] });
        rowHeight = Math.max(rowHeight, h);
      });
      row.forEach((cell, i) => {
        doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 4, { width: colWidths[i], height: rowHeight });
      });
      doc.moveTo(startX, y + rowHeight + 4).lineTo(startX + totalWidth, y + rowHeight + 4).stroke();
      y += rowHeight + 4;
    }
    doc.end();
  });

  app.post("/api/inventory/import", requireAuth, requireRole("editor", "admin"), csvUpload.single("file"), async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No CSV file provided" });
    }
    const access = await getSiteAccess(req);
    if (!can(access, SITE_CAPABILITIES.INVENTORY_WRITE)) {
      forbidSiteRbac(req, res, { reason: "missing_capability", capability: SITE_CAPABILITIES.INVENTORY_WRITE });
      return;
    }
    const importUserId = getAuthUserId(req);
    try {
      let content = req.file.buffer.toString("utf-8");
      content = content.replace(/^\uFEFF/, ""); // Remove BOM
      const firstLine = content.split(/\r?\n/)[0] ?? "";
      const delim = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
      const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
        delimiter: delim,
      });
      if (parsed.data.length > MAX_CSV_IMPORT_ROWS) {
        return res.status(400).json({
          message: `CSV exceeds maximum ${MAX_CSV_IMPORT_ROWS} rows`,
        });
      }
      const created: number[] = [];
      const errors: { row: number; message: string }[] = [];
      const normalize = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const colAliases: Record<string, string> = {
        code: "code", codigo: "code", c\u00f3digo: "code", id: "code",
        name: "name", nombre: "name", descripcion: "name", descripci\u00f3n: "name", articulo: "name", art\u00edculo: "name", item: "name",
        "serial number": "serialNumber", serial_number: "serialNumber", serialnumber: "serialNumber",
        "n\u00famero de serie": "serialNumber", numeroserie: "serialNumber", "no. serie": "serialNumber", serial: "serialNumber",
        size: "size", tama\u00f1o: "size", tamano: "size",
        units: "units", unidades: "units", cantidad: "units", qty: "units",
        condition: "condition", estado: "condition", condicion: "condition",
        "purchase date": "purchaseDate", purchase_date: "purchaseDate", "fecha de compra": "purchaseDate",
        fechacompra: "purchaseDate", "fecha compra": "purchaseDate", date: "purchaseDate", fecha: "purchaseDate",
        responsible: "responsible", responsable: "responsible",
        "useful life": "usefulLife", useful_life: "usefulLife", "vida \u00fatil": "usefulLife", "vida util": "usefulLife",
        usefullife: "usefulLife", duracion: "usefulLife", duraci\u00f3n: "usefulLife",
        category: "category", categoria: "category", categor\u00eda: "category",
        company_id: "companyId", companyid: "companyId", empresa: "companyId", company: "companyId",
        site_id: "siteId", siteid: "siteId", sitio: "siteId",
        notes: "notes", observaciones: "notes", observacion: "notes", comentarios: "notes", comment: "notes",
      };
      const mapHeader = (key: string): string => {
        const n = normalize(key);
        return colAliases[n] ?? colAliases[key] ?? key;
      };
      const parseDate = (val: string): string | null => {
        if (!val || typeof val !== "string") return null;
        const s = val.trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // Already YYYY-MM-DD
        const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // DD/MM/YY or DD/MM/YYYY
        if (dmy) {
          const [, d, m, y] = dmy;
          const year = y!.length === 2 ? (parseInt(y!, 10) >= 50 ? `19${y}` : `20${y}`) : y!;
          return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
        }
        return null;
      };
      for (let i = 0; i < parsed.data.length; i++) {
        const row = parsed.data[i];
        const mapped: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
          if (!key || key.trim() === "") continue;
          const k = mapHeader(key);
          const v = typeof val === "string" ? val.trim() : val;
          if (k === "units") mapped.units = parseInt(String(v || "0"), 10) || 0;
          else if (k === "purchaseDate") mapped.purchaseDate = v ? parseDate(String(v)) || null : null;
          else if (k === "companyId") {
            const n = v ? parseInt(String(v), 10) : NaN;
            mapped.companyId = Number.isFinite(n) ? n : null;
          }
          else if (k === "siteId") {
            const n = v ? parseInt(String(v), 10) : NaN;
            mapped.siteId = Number.isFinite(n) ? n : undefined;
          }
          else mapped[k] = v || null;
        }
        if (!mapped.code && !mapped.name) continue; // Skip empty rows
        // Empty code triggers auto-assignment in createItem
        if (!mapped.code && mapped.name) mapped.code = "";
        const parsedRow = insertInventoryItemSchema.safeParse(mapped);
        if (parsedRow.success) {
          const targetSite = await storage.resolveTargetSiteIdForCreate(parsedRow.data);
          if (!itemSiteAllowed(access, targetSite)) {
            errors.push({ row: i + 2, message: "siteId: not permitted for this user" });
            continue;
          }
          const item = await storage.createItem(parsedRow.data);
          created.push(item.id);
          storage
            .addHistoryRecord({ productId: item.id, companyId: item.companyId ?? null, transactionType: "IMPORT", quantity: item.units, userId: importUserId, remarks: item.name })
            .catch((err) => {
              console.error("History log failed (IMPORT)", { productId: item.id, userId: importUserId }, err);
              void emitOpsEvent({
                eventType: "job.history_write_failure",
                severity: "critical",
                endpoint: req.path,
                method: req.method,
                ip: getClientIp(req),
                userId: importUserId,
                payload: { action: "IMPORT", productId: item.id, error: err instanceof Error ? err.message : String(err) },
              });
            });
        } else {
          const errMsg = parsedRow.error.errors[0]?.message ?? "Validation failed";
          const field = parsedRow.error.errors[0]?.path?.[0];
          errors.push({ row: i + 2, message: field ? `${field}: ${errMsg}` : errMsg });
        }
      }
      const detectedHeaders = parsed.data[0] ? Object.keys(parsed.data[0]) : [];
      void emitOpsEvent({
        eventType: "job.import_success",
        severity: "info",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: importUserId,
        payload: { rowCount: created.length, errorCount: errors.length },
      });
      res.json({
        created: created.length,
        errors,
        ...(created.length === 0 && errors.length > 0 && { hint: `Detected columns: ${detectedHeaders.join(", ") || "none"}. Ensure your CSV has headers matching: code, name (or codigo, nombre in Spanish).` }),
      });
    } catch (err) {
      void emitOpsEvent({
        eventType: "job.import_failure",
        severity: "warning",
        endpoint: req.path,
        method: req.method,
        ip: getClientIp(req),
        userId: importUserId,
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      res.status(400).json({ message: err instanceof Error ? err.message : "Import failed" });
    }
  });
}
