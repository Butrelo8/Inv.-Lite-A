import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useExecutiveSummary } from "@/hooks/use-executive-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, FileDown, Package, ShieldCheck, Activity } from "lucide-react";
import { Link } from "wouter";

const INVENTORY_SITE_ID_STORAGE_KEY = "inventory-site-id";

export default function ExecutiveSummary() {
  const { user } = useAuth();
  const siteScopingEnabled = Boolean(user?.siteScopingEnabled);
  const isViewer = (user?.role ?? "viewer") === "viewer";

  const [inventorySiteId, setInventorySiteId] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!siteScopingEnabled) {
      setInventorySiteId(undefined);
      return;
    }
    try {
      const raw = localStorage.getItem(INVENTORY_SITE_ID_STORAGE_KEY);
      if (!raw) {
        setInventorySiteId(undefined);
        return;
      }
      const n = parseInt(raw, 10);
      setInventorySiteId(Number.isFinite(n) && n > 0 ? n : undefined);
    } catch {
      setInventorySiteId(undefined);
    }
  }, [siteScopingEnabled]);

  const { data, isLoading, isError, error } = useExecutiveSummary(inventorySiteId);

  const pdfHref = useMemo(() => {
    const u = new URL("/api/reports/executive-summary/pdf", window.location.origin);
    if (inventorySiteId != null) u.searchParams.set("siteId", String(inventorySiteId));
    return u.pathname + u.search;
  }, [inventorySiteId]);

  return (
    <div className="space-y-8 max-w-5xl mx-auto print:max-w-none">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Informe ejecutivo</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Salud de activos y cumplimiento
            {!isViewer && " · Confiabilidad operativa"}
            {siteScopingEnabled && inventorySiteId != null && (
              <span className="block mt-1 text-xs">Inventario filtrado por sitio (selector del Dashboard).</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={pdfHref}>
              <FileDown className="w-4 h-4 mr-2" />
              PDF
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/inventory">Inventario</Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/compliance">Cumplimiento</Link>
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando informe…
        </div>
      )}

      {isError && (
        <p className="text-destructive text-sm">
          {(error as Error)?.message ?? "No se pudo cargar el informe."}
        </p>
      )}

      {data && (
        <div className="space-y-6 print:space-y-4">
          <p className="text-xs text-muted-foreground print:text-foreground">
            Generado: {new Date(data.generatedAt).toLocaleString()}
            {data.inventorySiteId != null && ` · Sitio inventario: ${data.inventorySiteId}`}
          </p>

          <Card className="print:break-inside-avoid print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" />
                Salud de activos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-2xl font-semibold tabular-nums">{data.assetHealth.totalItems}</p>
              <p className="text-muted-foreground text-xs -mt-2">Total de artículos</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Asignado a persona</p>
                  <p className="text-lg font-medium tabular-nums">{data.assetHealth.custody.assignedToPerson}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Equipo / pool</p>
                  <p className="text-lg font-medium tabular-nums">{data.assetHealth.custody.sharedPool}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Sin asignar</p>
                  <p className="text-lg font-medium tabular-nums">{data.assetHealth.custody.unassignedLabel}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Asignación formal activa</p>
                  <p className="text-lg font-medium tabular-nums">{data.assetHealth.itemsWithActiveAssignment}</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="font-medium mb-2">Por categoría</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {data.assetHealth.byCategory.slice(0, 12).map((r) => (
                      <li key={r.name} className="flex justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className="tabular-nums shrink-0">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-2">Por condición</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {data.assetHealth.byCondition.slice(0, 12).map((r) => (
                      <li key={r.name} className="flex justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className="tabular-nums shrink-0">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:break-inside-avoid print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Cumplimiento (organización)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{data.complianceScopeNote}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Faltante</p>
                  <p className="text-lg font-medium tabular-nums">{data.compliance.counts.missing}</p>
                </div>
                <div className="rounded-lg border border-amber-200/60 dark:border-amber-900/40 p-3">
                  <p className="text-xs text-muted-foreground">Por vencer</p>
                  <p className="text-lg font-medium tabular-nums">{data.compliance.counts.dueSoon}</p>
                </div>
                <div className="rounded-lg border border-orange-200/60 dark:border-orange-900/40 p-3">
                  <p className="text-xs text-muted-foreground">Vencido</p>
                  <p className="text-lg font-medium tabular-nums">{data.compliance.counts.overdue}</p>
                </div>
                <div className="rounded-lg border border-red-200/60 dark:border-red-900/40 p-3">
                  <p className="text-xs text-muted-foreground">Crítico</p>
                  <p className="text-lg font-medium tabular-nums">{data.compliance.counts.critical}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Umbrales (alineados con Cumplimiento): por vencer dentro de {data.compliance.thresholds.dueSoonDays}{" "}
                días; crítico más de {data.compliance.thresholds.criticalOverdueDays} días vencido.
              </p>
            </CardContent>
          </Card>

          {!isViewer && data.reliability && (
            <Card className="print:break-inside-avoid print:shadow-none print:border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Confiabilidad y operaciones
                </CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Backup exitoso (7d)</p>
                  <p className="text-lg font-medium">
                    {data.reliability.kpis.backupSuccessRate7d == null
                      ? "—"
                      : `${Math.round(data.reliability.kpis.backupSuccessRate7d * 100)}%`}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Restore-verify (7d)</p>
                  <p className="text-lg font-medium">
                    {data.reliability.kpis.restoreVerificationSuccessRate7d == null
                      ? "—"
                      : `${Math.round(data.reliability.kpis.restoreVerificationSuccessRate7d * 100)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ok {data.reliability.kpis.restoreVerificationPassCount7d} · Fallos{" "}
                    {data.reliability.kpis.restoreVerificationFailCount7d}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Integridad (7d)</p>
                  <p className="text-lg font-medium">
                    {data.reliability.kpis.integrityScanSuccessRate7d == null
                      ? "—"
                      : `${Math.round(data.reliability.kpis.integrityScanSuccessRate7d * 100)}%`}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      Último escaneo: problemas {data.reliability.kpis.integrityScanIssuesLastRun ?? "—"}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {isViewer && (
            <p className="text-xs text-muted-foreground print:hidden">
              Los indicadores de backup, restore-verify e integridad están disponibles para editores y administradores
              (misma política que Ops Health).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
