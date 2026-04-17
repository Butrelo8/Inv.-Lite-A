import type PDFDocument from "pdfkit";
import type { ExecutiveSummaryResponse } from "@shared/executive-summary";

type PdfDoc = InstanceType<typeof PDFDocument>;

export function renderExecutiveSummaryPdf(doc: PdfDoc, data: ExecutiveSummaryResponse): void {
  const left = 50;
  let y = 50;
  doc.fontSize(18).text("Informe ejecutivo", left, y);
  y += 28;
  doc.fontSize(10).font("Helvetica");
  doc.text(`Generado: ${data.generatedAt}`, left, y);
  y += 18;
  if (data.inventorySiteId != null) {
    doc.text(`Sitio inventario (filtro): ${data.inventorySiteId}`, left, y);
    y += 16;
  }
  doc.fontSize(9).text(data.complianceScopeNote, left, y, { width: 500 });
  y += Math.max(28, doc.heightOfString(data.complianceScopeNote, { width: 500 }) + 8);

  doc.fontSize(14).font("Helvetica-Bold").text("Salud de activos", left, y);
  y += 22;
  doc.font("Helvetica").fontSize(10);
  const ah = data.assetHealth;
  doc.text(`Total artículos: ${ah.totalItems}`, left, y);
  y += 14;
  doc.text(`Custodia — asignado a persona: ${ah.custody.assignedToPerson}`, left, y);
  y += 14;
  doc.text(`Custodia — equipo / pool compartido: ${ah.custody.sharedPool}`, left, y);
  y += 14;
  doc.text(`Custodia — sin asignar (etiqueta): ${ah.custody.unassignedLabel}`, left, y);
  y += 14;
  doc.text(`Con asignación formal activa: ${ah.itemsWithActiveAssignment}`, left, y);
  y += 20;

  doc.fontSize(11).font("Helvetica-Bold").text("Por categoría", left, y);
  y += 16;
  doc.font("Helvetica").fontSize(9);
  for (const row of ah.byCategory.slice(0, 20)) {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.text(`${row.name}: ${row.count}`, left, y);
    y += 12;
  }
  y += 8;
  if (y > 700) {
    doc.addPage();
    y = 50;
  }
  doc.fontSize(11).font("Helvetica-Bold").text("Por condición", left, y);
  y += 16;
  doc.font("Helvetica").fontSize(9);
  for (const row of ah.byCondition.slice(0, 20)) {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.text(`${row.name}: ${row.count}`, left, y);
    y += 12;
  }

  y += 12;
  if (y > 700) {
    doc.addPage();
    y = 50;
  }
  doc.fontSize(14).font("Helvetica-Bold").text("Cumplimiento (organización)", left, y);
  y += 20;
  doc.font("Helvetica").fontSize(10);
  const c = data.compliance;
  doc.text(
    `Faltante: ${c.counts.missing}  |  Por vencer: ${c.counts.dueSoon}  |  Vencido: ${c.counts.overdue}  |  Crítico: ${c.counts.critical}`,
    left,
    y,
    { width: 500 },
  );
  y += 24;
  doc.fontSize(9).text(
    `Umbrales: por vencer dentro de ${c.thresholds.dueSoonDays} días; crítico más de ${c.thresholds.criticalOverdueDays} días vencido.`,
    left,
    y,
    { width: 500 },
  );
  y += 28;

  if (data.reliability) {
    if (y > 680) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(14).font("Helvetica-Bold").text("Confiabilidad y operaciones", left, y);
    y += 20;
    doc.font("Helvetica").fontSize(10);
    const k = data.reliability.kpis;
    const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
    doc.text(`Éxito backup (7d): ${pct(k.backupSuccessRate7d)}`, left, y);
    y += 14;
    doc.text(
      `Restore-verify (7d): ${pct(k.restoreVerificationSuccessRate7d)} (ok ${k.restoreVerificationPassCount7d} / fallos ${k.restoreVerificationFailCount7d})`,
      left,
      y,
    );
    y += 14;
    doc.text(
      `Integridad (7d): ${pct(k.integrityScanSuccessRate7d)}  |  Problemas último escaneo: ${k.integrityScanIssuesLastRun ?? "—"}`,
      left,
      y,
    );
  }
}
