import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useHistory } from "@/hooks/use-history";
import type { InventoryItem } from "@/hooks/use-inventory";
import { formatHistorySubtitle, historyEntryTitle } from "@/lib/history-display";
import { categoryToDisplay } from "@/lib/category-translate";
import { Loader2 } from "lucide-react";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function itemActivityTime(item: InventoryItem): number {
  const raw = item.createdAt ?? item.updatedAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatRelativeEs(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

type ActivityRow = { key: string | number; title: string; sub: string; when: string };

function inventoryFallbackRows(items: InventoryItem[]): ActivityRow[] {
  return [...items]
    .sort((a, b) => itemActivityTime(b) - itemActivityTime(a))
    .slice(0, 5)
    .map((item) => {
      const t = item.createdAt ?? item.updatedAt;
      const when = t ? formatRelativeEs(new Date(t)) : "—";
      const resp = item.responsible?.trim() || "Equipo de trabajo";
      const cat = categoryToDisplay(item.category);
      return {
        key: item.id,
        title: item.name ?? item.code ?? "—",
        sub: `${cat} · ${resp}`,
        when,
      };
    });
}

export interface RecentActivityFeedProps {
  items: InventoryItem[];
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  const { user } = useAuth();
  const canSeeHistory = user?.role === "editor" || user?.role === "admin";

  const { data: historyData, isLoading: historyLoading, isError: historyError } = useHistory({
    limit: 5,
    offset: 0,
    enabled: canSeeHistory,
  });

  const rows = useMemo((): ActivityRow[] => {
    const fallback = inventoryFallbackRows(items);
    if (!canSeeHistory || historyLoading || historyError) return fallback;
    const entries = historyData?.entries ?? [];
    if (entries.length === 0) return fallback;
    return entries.slice(0, 5).map((e) => ({
      key: e.id,
      title: historyEntryTitle(e),
      sub: formatHistorySubtitle(e.remarks, e.transactionType),
      when: formatRelativeEs(new Date(e.createdAt)),
    }));
  }, [items, canSeeHistory, historyLoading, historyError, historyData?.entries]);

  const showLoader = canSeeHistory && historyLoading;

  return (
    <Card className="rounded-2xl border-border/50 p-5 shadow-sm">
      <CardHeader className="p-0 pb-4 space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Actividad reciente</p>
        <CardTitle className="text-[16px] md:text-lg font-semibold leading-tight">Últimos movimientos</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {showLoader ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {rows.map((a, i) => (
              <div
                key={a.key}
                className="flex items-start gap-3 border-b border-border/40 py-2.5 last:border-0"
              >
                <div
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12px] text-muted-foreground">{a.title}</p>
                  <p className="text-[12px] font-medium text-foreground truncate">{a.sub}</p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-foreground tabular-nums">{a.when}</span>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Sin datos</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
