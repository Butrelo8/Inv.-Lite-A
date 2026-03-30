/**
 * Shared aggregation helpers for inventory analytics (Overview, Dashboard analytics panel).
 */

export function aggregateByCategory(items: { category?: string | null }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const cat = item.category?.trim() || "Uncategorized";
    map.set(cat, (map.get(cat) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
}

export function aggregateByResponsible(items: { responsible?: string | null }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const r = item.responsible?.trim() || "Equipo de trabajo";
    map.set(r, (map.get(r) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function aggregateByCondition(items: { condition?: string | null }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const c = item.condition?.trim() || "Unknown";
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
}
