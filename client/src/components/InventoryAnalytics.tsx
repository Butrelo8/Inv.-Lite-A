import { useMemo, type ReactNode } from "react";
import { useInventory } from "@/hooks/use-inventory";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Pie, PieChart, Cell } from "recharts";
import { Loader2 } from "lucide-react";
import { categoryToDisplay, conditionToDisplay } from "@/lib/category-translate";
import {
  aggregateByCategory,
  aggregateByCondition,
  aggregateByResponsible,
  isInventoryResponsibleAssigned,
} from "@/lib/inventory-aggregates";
import { RecentActivityFeed } from "@/components/RecentActivityFeed";
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(220, 70%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(340, 75%, 55%)",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type PanelCardProps = {
  title: string;
  sub?: string;
  badge?: string;
  children: ReactNode;
};

function PanelCard({ title, sub, badge, children }: PanelCardProps) {
  return (
    <Card className="rounded-2xl border-border/50 p-5 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 p-0 pb-4">
        <div>
          <CardTitle className="text-[14px] font-medium">{title}</CardTitle>
          {sub && <CardDescription className="text-[11px] mt-0.5">{sub}</CardDescription>}
        </div>
        {badge && (
          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
            {badge}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0 pt-0">{children}</CardContent>
    </Card>
  );
}

function CategoryBars({
  rows,
  colors,
}: {
  rows: { name: string; count: number }[];
  colors: string[];
}) {
  const max = Math.max(1, ...rows.map((c) => c.count));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((c, i) => (
        <div key={c.name} className="flex items-center gap-2.5">
          <span className="w-[110px] shrink-0 text-right text-[11px] text-muted-foreground truncate" title={c.name}>
            {c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name}
          </span>
          <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(c.count / max) * 100}%`, background: colors[i % colors.length] }}
            />
          </div>
          <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{c.count}</span>
        </div>
      ))}
    </div>
  );
}

function PersonList({
  persons,
  colors,
}: {
  persons: { name: string; count: number }[];
  colors: string[];
}) {
  const max = persons[0]?.count ?? 1;
  return (
    <div className="flex flex-col gap-2">
      {persons.map((p, i) => (
        <div key={p.name} className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: `${colors[i % colors.length]}22`, color: colors[i % colors.length] }}
          >
            {initials(p.name)}
          </div>
          <span className="w-24 shrink-0 text-[12px] text-muted-foreground truncate" title={p.name}>
            {p.name}
          </span>
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(p.count / max) * 100}%`, background: `${colors[i % colors.length]}88` }}
            />
          </div>
          <span className="w-5 text-right font-mono text-[11px] text-muted-foreground">{p.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function InventoryAnalytics({ siteId }: { siteId?: number }) {
  const isMobile = useIsMobile();
  const { data, isLoading } = useInventory({ limit: 5000, siteId });

  const items = data?.items ?? [];
  const totalCount = data?.total ?? items.length;

  const { byCategoryDisplay, byResponsibleDisplay, byConditionDisplay, kpis, categoriesCount } =
    useMemo(() => {
      const byCategory = aggregateByCategory(items);
      const byCategoryDisplay = byCategory.map((c) => ({
        name: categoryToDisplay(c.name),
        count: c.count,
      }));
      const byResponsible = aggregateByResponsible(items);
      const byResponsibleDisplay = byResponsible.map((r) => ({
        name: r.name,
        count: r.count,
      }));
      const byCondition = aggregateByCondition(items);
      const byConditionDisplay = byCondition.map((c) => ({
        name: conditionToDisplay(c.name),
        count: c.count,
      }));
      const categoriesCount = new Set(items.map((i) => i.category?.trim() || "Uncategorized")).size;

      const assignedCount = items.filter(
        (i) => (i.responsible?.trim() ?? "") !== "" && (i.responsible?.trim() ?? "") !== "Equipo de trabajo",
      ).length;
      const notAssignedCount = items.filter(
        (i) => !i.responsible?.trim() || i.responsible?.trim() === "Equipo de trabajo",
      ).length;
      const newCount = items.filter((i) => (i.condition?.trim() ?? "") === "New").length;
      const newPct = totalCount > 0 ? Math.round((newCount / totalCount) * 100) : 0;

      return {
        byCategoryDisplay,
        byResponsibleDisplay,
        byConditionDisplay,
        kpis: {
          assignedCount,
          notAssignedCount,
          newPct,
          newCount,
        },
        categoriesCount,
      };
    }, [items, totalCount]);

  const categoryChartConfig = useMemo(
    () => Object.fromEntries(byCategoryDisplay.map((c) => [c.name, { label: c.name }])),
    [byCategoryDisplay],
  );
  const conditionChartConfig = useMemo(
    () => Object.fromEntries(byConditionDisplay.map((c) => [c.name, { label: c.name }])),
    [byConditionDisplay],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] rounded-2xl border border-border/50 bg-card shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card/30 p-1 space-y-5 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total activos"
          value={String(totalCount)}
          sub="Todos los equipos"
          color="hsl(var(--chart-3))"
        />
        <KpiCard
          label="Asignados"
          value={String(kpis.assignedCount)}
          sub={
            totalCount > 0 ? `${Math.round((kpis.assignedCount / totalCount) * 100)}% del inventario` : "—"
          }
          color="hsl(var(--chart-2))"
        />
        <KpiCard
          label="Sin asignar"
          value={String(kpis.notAssignedCount)}
          sub="Disponibles / equipo general"
          color="hsl(var(--chart-4))"
        />
        <KpiCard
          label="Condición nueva"
          value={`${kpis.newPct}%`}
          sub={kpis.newCount > 0 ? `${kpis.newCount} en estado Nuevo` : "Sin artículos Nuevo"}
          color="hsl(var(--chart-1))"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelCard
          title="Distribución por categoría"
          sub="Cantidad de artículos por tipo"
          badge={categoriesCount > 0 ? `${categoriesCount} categorías` : undefined}
        >
          {byCategoryDisplay.length > 0 ? (
            <CategoryBars rows={byCategoryDisplay} colors={CHART_COLORS} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          )}
        </PanelCard>
        <PanelCard title="Artículos por categoría" sub="Participación porcentual">
          {byCategoryDisplay.length > 0 ? (
            <>
              <ChartContainer config={categoryChartConfig} className={isMobile ? "h-[200px]" : "h-[220px]"}>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={byCategoryDisplay}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    strokeWidth={0}
                  >
                    {byCategoryDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="mt-3 flex flex-col gap-2 max-h-[140px] overflow-y-auto">
                {byCategoryDisplay.slice(0, 8).map((c, i) => {
                  const pct = totalCount > 0 ? Math.round((c.count / totalCount) * 100) : 0;
                  return (
                    <div key={c.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-2 w-2 rounded-[2px] shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-[11px] text-muted-foreground truncate">{c.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          )}
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-1">
        <PanelCard title="Top responsables" sub="Artículos asignados por persona">
          {byResponsibleDisplay.length > 0 ? (
            <PersonList persons={byResponsibleDisplay} colors={CHART_COLORS} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          )}
        </PanelCard>
        <PanelCard title="Condición del equipo" sub="Estado general del inventario">
          {byConditionDisplay.length > 0 ? (
            <>
              <ChartContainer config={conditionChartConfig} className={isMobile ? "h-[160px]" : "h-[180px]"}>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={byConditionDisplay}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={60}
                    strokeWidth={0}
                  >
                    {byConditionDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="mt-2 flex flex-col gap-2.5">
                {byConditionDisplay.map((c, i) => {
                  const pct = totalCount > 0 ? Math.round((c.count / totalCount) * 100) : 0;
                  const color = CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <div key={c.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold shrink-0 bg-muted"
                          style={{ color }}
                        >
                          {c.name[0] ?? "?"}
                        </div>
                        <span className="text-[12px] text-muted-foreground truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[13px] font-semibold" style={{ color }}>
                          {pct}%
                        </span>
                        <div className="h-[5px] w-14 overflow-hidden rounded-full bg-muted/40">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          )}
        </PanelCard>
        <RecentActivityFeed items={items} />
      </div>
    </div>
  );
}