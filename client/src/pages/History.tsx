import { useState, useEffect } from "react";
import { useHistory, useHistoryUsers } from "@/hooks/use-history";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History as HistoryIcon, Loader2, FilterX, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const TRANSACTION_LABELS: Record<string, string> = {
  CREATE: "Creado",
  UPDATE: "Actualizado",
  ADJUSTMENT: "Ajustado",
  DELETE: "Eliminado",
  IMPORT: "Importado",
  IN: "Entrada",
  OUT: "Salida",
};

const TRANSACTION_TYPES = ["CREATE", "UPDATE", "ADJUSTMENT", "DELETE", "IMPORT"] as const;

const HISTORY_PAGE_SIZE = 100;

export default function History() {
  const [transactionType, setTransactionType] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);

  const filters = {
    limit: HISTORY_PAGE_SIZE,
    offset: (page - 1) * HISTORY_PAGE_SIZE,
    transactionType: transactionType || undefined,
    userId: userId ? parseInt(userId, 10) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search.trim() || undefined,
  };
  const hasFilters = !!(
    filters.transactionType ||
    filters.userId != null ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.search
  );

  const { data, isLoading } = useHistory(filters);
  const entries = data?.entries ?? [];
  const totalEntries = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEntries / HISTORY_PAGE_SIZE));
  const fromItem = totalEntries === 0 ? 0 : (page - 1) * HISTORY_PAGE_SIZE + 1;
  const toItem = Math.min(page * HISTORY_PAGE_SIZE, totalEntries);

  const { data: historyUsers = [] } = useHistoryUsers();

  useEffect(() => {
    setPage(1);
  }, [transactionType, userId, dateFrom, dateTo, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Historial completo</h2>
        <p className="text-muted-foreground mt-1">
          Registro de auditoría de todas las transacciones del inventario
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="w-5 h-5" />
            Historial de transacciones
          </CardTitle>
          <CardDescription>
            {totalEntries} registros en total (producto, empresa, tipo, cantidad, usuario, fecha, observaciones)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={transactionType || "all"} onValueChange={(v) => setTransactionType(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRANSACTION_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Usuario</label>
              <Select value={userId || "all"} onValueChange={(v) => setUserId(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {historyUsers.map((u) => (
                    <SelectItem key={u.userId} value={String(u.userId)}>
                      {u.userName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Desde</label>
              <Input
                type="date"
                className="w-[140px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <Input
                type="date"
                className="w-[140px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Código / producto</label>
              <Input
                placeholder="Buscar..."
                className="w-[180px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={() => { setTransactionType(""); setUserId(""); setDateFrom(""); setDateTo(""); setSearch(""); }}>
                <FilterX className="w-4 h-4 mr-1.5" />
                Limpiar filtros
              </Button>
            )}
          </div>

          <div>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {hasFilters
                ? "No hay registros con los filtros aplicados. Prueba otros criterios."
                : "Aún no hay historial. Crea, actualiza o importa artículos para ver el registro de auditoría."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">ID</TableHead>
                    <TableHead className="min-w-[80px]">ID Producto</TableHead>
                    <TableHead className="min-w-[90px]">Código</TableHead>
                    <TableHead className="min-w-[140px]">Producto</TableHead>
                    <TableHead className="min-w-[80px]">Empresa</TableHead>
                    <TableHead className="min-w-[100px]">Tipo</TableHead>
                    <TableHead className="w-[80px] text-right">Cant.</TableHead>
                    <TableHead className="min-w-[90px]">Usuario</TableHead>
                    <TableHead className="min-w-[130px]">Fecha</TableHead>
                    <TableHead>Observaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const date = new Date(entry.createdAt);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{entry.id}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.productId ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.productCode ?? "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={entry.productName ?? ""}>
                          {entry.productName ?? "—"}
                        </TableCell>
                        <TableCell>{entry.companyName ?? "—"}</TableCell>
                        <TableCell>
                          {TRANSACTION_LABELS[entry.transactionType] ?? entry.transactionType}
                        </TableCell>
                        <TableCell className="text-right font-medium">{entry.quantity}</TableCell>
                        <TableCell>{entry.userName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {format(date, "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-muted-foreground" title={entry.remarks ?? ""}>
                          {entry.remarks ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {totalEntries > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border text-sm">
              <span className="text-muted-foreground">
                {fromItem}–{toItem} de {totalEntries}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-muted-foreground min-w-[4rem] text-center">
                  Pág. {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
