import { useState } from "react";
import { useMaintenanceSchedules, useMaintenanceEvents, useUpdateMaintenanceSchedule } from "@/hooks/use-maintenance";
import { MaintenanceCompleteDialog } from "./MaintenanceCompleteDialog";
import { format, isValid } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, PowerOff, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function MaintenanceTimeline({ itemId, onCompleteSchedule }: { itemId: number, onCompleteSchedule?: (scheduleId: number) => void }) {
  const { data: schedulesData, isLoading: isLoadingSchedules } = useMaintenanceSchedules(itemId);
  const { user } = useAuth();
  const isEditor = user && (user.role === "editor" || user.role === "admin");
  const updateMutation = useUpdateMaintenanceSchedule();
  const [completeScheduleId, setCompleteScheduleId] = useState<number | null>(null);

  if (isLoadingSchedules) {
    return <div className="text-sm text-muted-foreground">Cargando programas...</div>;
  }

  const schedules = schedulesData?.schedules || [];
  
  if (schedules.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border-l-2 pl-4 py-1 border-muted">
        No hay programas de mantenimiento.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {schedules.map((schedule: any) => (
        <ScheduleBlock 
          key={schedule.id} 
          schedule={schedule} 
          isEditor={isEditor}
          onComplete={() => {
            if (onCompleteSchedule) {
              onCompleteSchedule(schedule.id);
            } else {
              setCompleteScheduleId(schedule.id);
            }
          }}
          onDeactivate={() => updateMutation.mutate({ scheduleId: schedule.id, active: false })}
        />
      ))}
      <MaintenanceCompleteDialog
        scheduleId={completeScheduleId}
        open={!!completeScheduleId}
        onOpenChange={(open) => !open && setCompleteScheduleId(null)}
      />
    </div>
  );
}

function ScheduleBlock({ schedule, isEditor, onComplete, onDeactivate }: any) {
  const { data: eventsData, isLoading } = useMaintenanceEvents(schedule.id);
  
  // Date-FNS needs a real date object
  const nextDue = new Date(schedule.nextDueAt);
  const isOverdue = isValid(nextDue) && nextDue < new Date();
  
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-muted px-3 py-2 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          {schedule.scheduleType === "calibration" ? <Activity className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
          <span className="font-medium text-sm">{schedule.title}</span>
          {!schedule.active && <Badge variant="secondary">Inactivo</Badge>}
          {schedule.active && isOverdue && <Badge variant="destructive">Vencido</Badge>}
          {schedule.active && !isOverdue && isValid(nextDue) && <Badge variant="outline">Próximo: {format(nextDue, "dd/MM/yyyy")}</Badge>}
        </div>
        
        {schedule.active && isEditor && (
          <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" onClick={onComplete}>Completar</Button>
             <Button variant="ghost" size="sm" onClick={onDeactivate} title="Desactivar programa">
               <PowerOff className="w-4 h-4" />
             </Button>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-4">
          Cada {schedule.intervalDays} días. Creado el {format(new Date(schedule.createdAt), "dd/MM/yyyy")}.
          {schedule.notes && <p className="mt-1">{schedule.notes}</p>}
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Cargando eventos...</div>
        ) : eventsData?.events.length === 0 ? (
          <div className="text-xs text-muted-foreground italic border-l-2 pl-3 py-1 border-muted">
            Este programa no tiene eventos completados aún.
          </div>
        ) : (
          <div className="space-y-4 pl-1">
            {eventsData?.events.map((ev: any) => (
              <div key={ev.id} className="relative pl-4 border-l border-muted">
                <div className="absolute w-2 h-2 bg-primary rounded-full -left-1 top-1.5" />
                <div className="flex justify-between items-baseline">
                  <div className="text-sm font-medium">
                    {format(new Date(ev.performedAt), "dd/MM/yyyy")}
                    {ev.conditionResult && <Badge variant="secondary" className="ml-2 font-normal text-xs">{ev.conditionResult}</Badge>}
                  </div>
                </div>
                <div className="text-sm mt-1">{ev.notes}</div>
                {ev.completedByUsername && (
                  <div className="text-xs text-muted-foreground mt-1">Registrado por {ev.completedByUsername}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
