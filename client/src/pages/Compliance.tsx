import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useComplianceQueues, type ComplianceQueueEntry } from "@/hooks/use-compliance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, AlertTriangle, Clock, XCircle, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { EmployeeQuickViewDialog } from "@/components/EmployeeQuickViewDialog";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  Contract: "Contrato",
  Identification: "Identificación",
  Certifications: "Certificaciones",
  Other: "Otro",
};

const ALL_DOC_TYPES = ["Contract", "Identification", "Certifications", "Other"] as const;

type BucketId = "missing" | "dueSoon" | "overdue" | "critical";

const BUCKET_META: Record<
  BucketId,
  { label: string; icon: React.ElementType; cardClass: string; badgeClass: string }
> = {
  missing: {
    label: "Faltante",
    icon: XCircle,
    cardClass: "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  dueSoon: {
    label: "Por vencer",
    icon: Clock,
    cardClass: "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  overdue: {
    label: "Vencido",
    icon: AlertTriangle,
    cardClass: "border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  },
  critical: {
    label: "Crítico",
    icon: AlertTriangle,
    cardClass: "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
};

const BUCKET_ORDER: BucketId[] = ["critical", "overdue", "dueSoon", "missing"];

function BucketBadge({ bucket }: { bucket: BucketId }) {
  const { label, badgeClass } = BUCKET_META[bucket];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
      {label}
    </span>
  );
}

function DaysCell({ days, bucket }: { days: number | null; bucket: BucketId }) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  if (bucket === "missing") return <span className="text-muted-foreground">—</span>;
  if (days >= 0)
    return <span className="text-amber-700 dark:text-amber-400 font-mono">{days}d</span>;
  const abs = Math.abs(days);
  const cls = bucket === "critical" ? "text-red-700 dark:text-red-400" : "text-orange-700 dark:text-orange-400";
  return <span className={`font-mono ${cls}`}>-{abs}d</span>;
}

export default function Compliance() {
  const { user } = useAuth();
  const isEditor = user?.role === "editor" || user?.role === "admin";

  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [quickViewResponsible, setQuickViewResponsible] = useState<string | null>(null);

  const { data, isLoading, isError } = useComplianceQueues(
    docTypeFilter !== "all" ? [docTypeFilter] : undefined
  );

  const entries: ComplianceQueueEntry[] = data?.entries ?? [];

  // Sort by bucket priority then responsible name
  const sorted = [...entries].sort((a, b) => {
    const ai = BUCKET_ORDER.indexOf(a.bucket);
    const bi = BUCKET_ORDER.indexOf(b.bucket);
    if (ai !== bi) return ai - bi;
    return a.responsible.localeCompare(b.responsible);
  });

  const counts = data?.counts ?? { missing: 0, dueSoon: 0, overdue: 0, critical: 0 };
  const thresholds = data?.thresholds ?? { dueSoonDays: 30, criticalOverdueDays: 30 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          Centro de Cumplimiento
        </h2>
        <p className="text-muted-foreground mt-1">
          Estado de documentos por persona responsable.{" "}
          {data && (
            <span className="text-xs">
              Por vencer: dentro de {thresholds.dueSoonDays}d · Crítico: más de {thresholds.criticalOverdueDays}d vencido ·{" "}
              Actualizado: {format(new Date(data.asOf), "dd/MM/yyyy HH:mm")}
            </span>
          )}
        </p>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Error al cargar las colas de cumplimiento. Intenta recargar la página.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["critical", "overdue", "dueSoon", "missing"] as BucketId[]).map((bucket) => {
              const { label, icon: Icon, cardClass } = BUCKET_META[bucket];
              const n = counts[bucket];
              return (
                <Card key={bucket} className={`${cardClass} transition-shadow`}>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Icon className="w-4 h-4" />
                      {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <span className="text-3xl font-bold">{n}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* All-clear state */}
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-lg font-semibold">Todo al día</p>
              <p className="text-muted-foreground text-sm">
                No hay documentos faltantes, por vencer ni vencidos en el período configurado.
              </p>
            </div>
          )}

          {entries.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-3">
                <CardTitle className="text-base">
                  {sorted.length} registro{sorted.length !== 1 ? "s" : ""} en cola
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tipo:</span>
                  <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                    <SelectTrigger className="w-[170px]" id="compliance-doc-type-filter">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      {ALL_DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {DOCUMENT_TYPE_LABELS[t] ?? t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Responsable</TableHead>
                        <TableHead className="min-w-[130px]">Tipo de documento</TableHead>
                        <TableHead className="min-w-[110px]">Estado</TableHead>
                        <TableHead className="min-w-[110px]">Vencimiento</TableHead>
                        <TableHead className="w-[80px] text-right">Días</TableHead>
                        <TableHead className="min-w-[180px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((entry, idx) => (
                        <TableRow key={`${entry.responsible}|${entry.documentType}|${idx}`}>
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              id={`compliance-row-${idx}-responsible`}
                              className="text-left hover:underline hover:text-primary focus:outline-none focus:underline focus:text-primary cursor-pointer"
                              onClick={() => setQuickViewResponsible(entry.responsible)}
                            >
                              {entry.responsible}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {DOCUMENT_TYPE_LABELS[entry.documentType] ?? entry.documentType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <BucketBadge bucket={entry.bucket} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {entry.expiresAt
                              ? format(new Date(entry.expiresAt), "dd/MM/yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <DaysCell days={entry.daysUntilExpiry} bucket={entry.bucket} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                id={`compliance-row-${idx}-detail`}
                                onClick={() => setQuickViewResponsible(entry.responsible)}
                              >
                                Ver detalle
                              </Button>
                              {isEditor && (
                                <Link
                                  href={`/employees?responsible=${encodeURIComponent(entry.responsible)}`}
                                >
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    id={`compliance-row-${idx}-remediate`}
                                    className="gap-1"
                                  >
                                    {entry.bucket === "missing" ? "Subir" : "Actualizar"}
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <EmployeeQuickViewDialog
        open={!!quickViewResponsible}
        onOpenChange={(o) => !o && setQuickViewResponsible(null)}
        responsible={quickViewResponsible}
        onManageDocuments={() => {}}
      />
    </div>
  );
}
