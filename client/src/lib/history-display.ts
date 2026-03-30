/**
 * Human-readable subtitle for history rows (matches Historial page logic).
 */

export function formatHistorySubtitle(remarks: string | null, transactionType: string): string {
  if (!remarks) return "—";
  if (!["ASSIGN", "RETURN", "TRANSFER"].includes(transactionType)) return remarks;
  try {
    const j = JSON.parse(remarks) as Record<string, unknown>;
    if (j.kind === "ASSIGN") {
      const a = String(j.assignee ?? "");
      const c = j.condition != null && String(j.condition).trim() !== "" ? `, condición: ${j.condition}` : "";
      const n = j.notes != null && String(j.notes).trim() !== "" ? ` — ${j.notes}` : "";
      return `Asignado a ${a}${c}${n}`;
    }
    if (j.kind === "RETURN") {
      const c = j.returnCondition != null && String(j.returnCondition).trim() !== "" ? `Condición al devolver: ${j.returnCondition}. ` : "";
      const n = j.notes != null && String(j.notes).trim() !== "" ? String(j.notes) : "";
      return `Devolución. ${c}${n}`.trim();
    }
    if (j.kind === "TRANSFER") {
      return `Transferencia: ${j.fromAssignee} → ${j.toAssignee}`;
    }
  } catch {
    return remarks;
  }
  return remarks;
}

export function historyEntryTitle(entry: {
  productName?: string | null;
  productCode?: string | null;
  productId: number | null;
}): string {
  if (entry.productName?.trim()) return entry.productName.trim();
  if (entry.productCode?.trim()) return entry.productCode.trim();
  if (entry.productId != null) return `Artículo #${entry.productId}`;
  return "—";
}
