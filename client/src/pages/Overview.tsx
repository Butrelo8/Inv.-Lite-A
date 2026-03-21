import { useState } from "react";
import { useLocation } from "wouter";
import { useInventory } from "@/hooks/use-inventory";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Bar, BarChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from "recharts";
import { Package, FolderOpen, Users, Loader2, List, User, UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeQuickViewDialog } from "@/components/EmployeeQuickViewDialog";
import { categoryToDisplay, conditionToDisplay } from "@/lib/category-translate";

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(220, 70%, 50%)", "hsl(280, 65%, 60%)", "hsl(340, 75%, 55%)"];

function aggregateByCategory(items: { category?: string | null }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const cat = item.category?.trim() || "Uncategorized";
    map.set(cat, (map.get(cat) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
}

function aggregateByResponsible(items: { responsible?: string | null }[]) {
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

function aggregateByCondition(items: { condition?: string | null }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const c = item.condition?.trim() || "Unknown";
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
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

  return (
    <div className="space-y-4 md:space-y-8 pb-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setLocation("/inventory")} className="touch-manipulation">
          <List className="w-4 h-4 mr-2" />
          Ver inventario completo
        </Button>
      </div>
      {/* Summary Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="md:p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Total de artículos</CardTitle>
            <Package className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">En inventario</p>
          </CardContent>
        </Card>
        <Card className="md:p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Activos asignados</CardTitle>
            <UserCheck className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{assignedCount}</div>
            <p className="text-xs text-muted-foreground">Con responsable asignado</p>
          </CardContent>
        </Card>
        <Card className="md:p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Activos sin asignar</CardTitle>
            <UserMinus className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{notAssignedCount}</div>
            <p className="text-xs text-muted-foreground">Equipo de trabajo / sin asignar</p>
          </CardContent>
        </Card>
        <Card className="md:p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Categorías</CardTitle>
            <FolderOpen className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{categoriesCount}</div>
            <p className="text-xs text-muted-foreground">Categorías activas</p>
          </CardContent>
        </Card>
        <Card className="md:p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Personas responsables</CardTitle>
            <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">
              {new Set(items.map((i) => i.responsible?.trim() || "Equipo de trabajo")).size}
            </div>
            <p className="text-xs text-muted-foreground">Con artículos asignados</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg md:text-2xl">Artículos por categoría</CardTitle>
            <CardDescription className="text-sm">Distribución por categorías</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
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
                    cy={isMobile ? "40%" : "50%"}
                    outerRadius={isMobile ? 65 : 90}
                    label={!isMobile ? ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%` : false}
                  >
                    {byCategoryDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  {isMobile && (
                    <ChartLegend
                      content={(props) => (
                        <ChartLegendContent {...props} className="text-sm flex-wrap justify-start gap-x-3 gap-y-2" />
                      )}
                      wrapperStyle={{ paddingTop: 10 }}
                    />
                  )}
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] md:h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg md:text-2xl">Artículos por categoría</CardTitle>
            <CardDescription className="text-sm">Vista de barras por cantidad</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            {byCategoryDisplay.length > 0 ? (
              <ChartContainer
                config={Object.fromEntries(byCategoryDisplay.map((c) => [c.name, { label: c.name }]))}
                className={isMobile ? "h-[240px] min-h-[200px]" : "h-[280px]"}
              >
                <BarChart data={[...byCategoryDisplay].sort((a, b) => b.count - a.count)} layout="vertical" margin={isMobile ? { left: 4, right: 12 } : { left: 20, right: 20 }}>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: isMobile ? 11 : 12 }} />
                  <YAxis dataKey="name" type="category" width={isMobile ? 90 : 100} tick={{ fontSize: isMobile ? 11 : 12 }} />
                  <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[180px] md:h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-lg md:text-2xl">Artículos por persona responsable</CardTitle>
              <CardDescription className="text-sm">Top 10 asignados. Clic en una barra para ver el resumen.</CardDescription>
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
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            {byResponsible.length > 0 ? (
              <ChartContainer
                config={Object.fromEntries(byResponsible.map((r) => [r.name, { label: r.name }]))}
                className={isMobile ? "h-[240px] min-h-[200px]" : "h-[280px]"}
              >
                <BarChart data={byResponsible} layout="vertical" margin={isMobile ? { left: 4, right: 12 } : { left: 20, right: 20 }}>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: isMobile ? 11 : 12 }} />
                  <YAxis dataKey="name" type="category" width={isMobile ? 90 : 100} tick={{ fontSize: isMobile ? 11 : 12 }} />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--chart-1))"
                    radius={[0, 4, 4, 0]}
                    onClick={(data: { name?: string }) => data?.name && setQuickViewResponsible(data.name)}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[180px] md:h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        {/* Condition Chart */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg md:text-2xl">Artículos por condición</CardTitle>
            <CardDescription className="text-sm">Distribución por estado</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
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
                    cy={isMobile ? "40%" : "50%"}
                    outerRadius={isMobile ? 55 : 75}
                    label={!isMobile ? ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%` : false}
                  >
                    {byConditionDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  {isMobile && (
                    <ChartLegend
                      content={(props) => (
                        <ChartLegendContent {...props} className="text-sm flex-wrap justify-start gap-x-3 gap-y-2" />
                      )}
                      wrapperStyle={{ paddingTop: 8 }}
                    />
                  )}
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

      <EmployeeQuickViewDialog
        open={!!quickViewResponsible}
        onOpenChange={(o) => !o && setQuickViewResponsible(null)}
        responsible={quickViewResponsible}
      />
    </div>
  );
}
