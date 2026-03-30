import { useState } from "react";
import { useLocation } from "wouter";
import { useInventory } from "@/hooks/use-inventory";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Pie, PieChart, Cell } from "recharts";
import { Loader2, List, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeQuickViewDialog } from "@/components/EmployeeQuickViewDialog";
import { categoryToDisplay, conditionToDisplay } from "@/lib/category-translate";
import { aggregateByCategory, aggregateByCondition, aggregateByResponsible } from "@/lib/inventory-aggregates";
import { RecentActivityFeed } from "@/components/RecentActivityFeed";

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(220, 70%, 50%)", "hsl(280, 65%, 60%)", "hsl(340, 75%, 55%)"];

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Overview() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [quickViewResponsible, setQuickViewResponsible] = useState<string | null>(null);
  const { data, isLoading } = useInventory({ limit: 5000 });
  const items = data?.items ?? [];
  const totalCount = data?.total ?? items.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const byCategory = aggregateByCategory(items);
  const byCategoryDisplay = byCategory.map((c) => ({ name: categoryToDisplay(c.name), count: c.count }));
  const byResponsible = aggregateByResponsible(items);
  const byCondition = aggregateByCondition(items);
  const byConditionDisplay = byCondition.map((c) => ({ name: conditionToDisplay(c.name), count: c.count }));
  const categoriesCount = new Set(items.map((i) => i.category?.trim() || "Uncategorized")).size;

  const assignedCount = items.filter(
    (i) => (i.responsible?.trim() ?? "") !== "" && (i.responsible?.trim() ?? "") !== "Equipo de trabajo"
  ).length;
  const notAssignedCount = items.filter(
    (i) => !i.responsible?.trim() || i.responsible?.trim() === "Equipo de trabajo"
  ).length;

  const uniquePersonsCount = new Set(items.map((i) => i.responsible?.trim() || "Equipo de trabajo")).size;

  const byCategorySorted = [...byCategoryDisplay].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6 md:space-y-8 pb-6 rounded-xl bg-muted/20 p-4 md:p-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setLocation("/inventory")} className="touch-manipulation rounded-xl">
          <List className="w-4 h-4 mr-2" />
          Ver inventario completo
        </Button>
      </div>
      {/* Summary Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Total de artículos"
          value={String(totalCount)}
          sub="En inventario"
          color="hsl(var(--chart-3))"
        />
        <KpiCard
          label="Activos asignados"
          value={String(assignedCount)}
          sub="Con responsable asignado"
          color="hsl(var(--chart-2))"
        />
        <KpiCard
          label="Activos sin asignar"
          value={String(notAssignedCount)}
          sub="Equipo de trabajo / sin asignar"
          color="hsl(var(--chart-4))"
        />
        <KpiCard
          label="Categorías"
          value={String(categoriesCount)}
          sub="Categorías activas"
          color="hsl(var(--chart-1))"
        />
        <KpiCard
          label="Personas responsables"
          value={String(uniquePersonsCount)}
          sub="Con artículos asignados"
          color="hsl(var(--chart-5))"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="p-5 md:p-6">
            <CardTitle className="text-lg md:text-2xl">Artículos por categoría</CardTitle>
            <CardDescription className="text-sm">Distribución por categorías</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 md:p-6 md:pt-0">
            {byCategoryDisplay.length > 0 ? (
              <ChartContainer
                config={Object.fromEntries(byCategoryDisplay.map((c) => [c.name, { label: c.name }]))}
                className={isMobile ? "h-[260px] min-h-[220px]" : "h-[280px]"}
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={byCategoryDisplay}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy={isMobile ? "42%" : "48%"}
                    innerRadius={isMobile ? 40 : 52}
                    outerRadius={isMobile ? 58 : 72}
                    strokeWidth={0}
                  >
                    {byCategoryDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartLegend
                    content={(props) => (
                      <ChartLegendContent {...props} className="text-sm flex-wrap justify-start gap-x-3 gap-y-2" />
                    )}
                    wrapperStyle={{ paddingTop: 10 }}
                  />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] md:h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="p-5 md:p-6 flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-lg md:text-xl font-medium text-muted-foreground">
                Distribución por categoría
              </CardTitle>
              <CardDescription className="text-sm mt-1">Cantidad de artículos por tipo</CardDescription>
            </div>
            {categoriesCount > 0 && (
              <span className="shrink-0 rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                {categoriesCount} categorías
              </span>
            )}
          </CardHeader>
          <CardContent className="p-5 pt-0 md:p-6 md:pt-0">
            {byCategorySorted.length > 0 ? (
              <ul className="flex flex-col gap-0">
                {byCategorySorted.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between gap-2 py-2.5 border-b border-border/40 last:border-0 text-sm"
                  >
                    <span className="min-w-0 truncate text-muted-foreground" title={row.name}>
                      {row.name}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-foreground font-medium">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-12 flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-lg md:text-xl font-medium text-muted-foreground">Top responsables</CardTitle>
              <CardDescription className="text-sm text-foreground/80 mt-0.5">
                Artículos asignados por persona
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setLocation("/employees")}
            >
              <User className="w-4 h-4" />
              Ver listado completo
            </Button>
          </CardHeader>
          <CardContent className="p-5 pt-0 md:p-6 md:pt-0">
            {byResponsible.length > 0 ? (
              <ul className="flex flex-col gap-0">
                {byResponsible.map((p, i) => {
                  const color = CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <li key={p.name}>
                      <button
                        type="button"
                        onClick={() => setQuickViewResponsible(p.name)}
                        className="flex w-full items-center gap-3 py-2.5 text-left border-b border-border/30 last:border-0 rounded-sm hover:bg-muted/40 transition-colors"
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{ background: `${color}22`, color }}
                        >
                          {initials(p.name)}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" title={p.name}>
                          {p.name}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-[13px] text-muted-foreground font-medium">
                          {p.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-12 flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        {/* Condition Chart */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="p-5 md:p-6">
            <CardTitle className="text-lg md:text-2xl">Artículos por condición</CardTitle>
            <CardDescription className="text-sm">Distribución por estado</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 md:p-6 md:pt-0">
            {byConditionDisplay.length > 0 ? (
              <ChartContainer
                config={Object.fromEntries(byConditionDisplay.map((c) => [c.name, { label: c.name }]))}
                className={isMobile ? "h-[240px] min-h-[200px]" : "h-[280px]"}
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={byConditionDisplay}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy={isMobile ? "42%" : "48%"}
                    innerRadius={isMobile ? 40 : 52}
                    outerRadius={isMobile ? 58 : 72}
                    strokeWidth={0}
                  >
                    {byConditionDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartLegend
                    content={(props) => (
                      <ChartLegendContent {...props} className="text-sm flex-wrap justify-start gap-x-3 gap-y-2" />
                    )}
                    wrapperStyle={{ paddingTop: 8 }}
                  />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[180px] md:h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RecentActivityFeed items={items} />

      <EmployeeQuickViewDialog
        open={!!quickViewResponsible}
        onOpenChange={(o) => !o && setQuickViewResponsible(null)}
        responsible={quickViewResponsible}
      />
    </div>
  );
}
