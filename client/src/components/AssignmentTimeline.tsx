import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useAssignments } from "@/hooks/use-assignments";

export interface AssignmentTimelineProps {
  itemId: number;
}

export function AssignmentTimeline({ itemId }: AssignmentTimelineProps) {
  const { data, isLoading, isError } = useAssignments(itemId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando historial de asignaciones…
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive">No se pudo cargar el historial de asignaciones.</p>;
  }

  const rows = data?.assignments ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay registros de asignación formal para este artículo.</p>;
  }

  return (
    <ul className="space-y-4 border-l-2 border-muted pl-4 ml-1">
      {rows.map((row) => {
        const isActive = row.returnedAt == null;
        return (
          <li key={row.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary/80 ring-2 ring-background" />
            <div className="text-sm font-medium">
              {row.assignee}
              {isActive ? (
                <span className="ml-2 text-xs font-normal text-primary">(activo)</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  devuelto{" "}
                  {row.returnedAt ? format(new Date(row.returnedAt), "dd/MM/yyyy HH:mm") : ""}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Asignado: {format(new Date(row.assignedAt), "dd/MM/yyyy HH:mm")}
              {row.assignedByUsername ? ` · por ${row.assignedByUsername}` : ""}
            </div>
            {row.conditionAtAssign ? (
              <div className="text-xs mt-1">Condición al asignar: {row.conditionAtAssign}</div>
            ) : null}
            {row.notes ? <div className="text-xs mt-1 text-muted-foreground">Notas: {row.notes}</div> : null}
            {!isActive && row.returnedAt && (
              <>
                {row.returnCondition ? (
                  <div className="text-xs mt-1">Condición al devolver: {row.returnCondition}</div>
                ) : null}
                {row.returnNotes ? (
                  <div className="text-xs mt-1 text-muted-foreground">Notas devolución: {row.returnNotes}</div>
                ) : null}
                {row.returnedByUsername ? (
                  <div className="text-xs text-muted-foreground">Devuelto por: {row.returnedByUsername}</div>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
