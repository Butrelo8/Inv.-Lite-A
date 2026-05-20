import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ChecklistExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseUrl: string;
}

export function ChecklistExportDialog({ open, onOpenChange, baseUrl }: ChecklistExportDialogProps) {
  const { toast } = useToast();
  const [eventName, setEventName] = useState("");
  const [dateRange, setDateRange] = useState("");

  const handleExport = () => {
    const trimmedEventName = eventName.trim();
    if (!trimmedEventName) {
      toast({ title: "Error", description: "El nombre del evento es obligatorio.", variant: "destructive" });
      return;
    }
    const params = new URLSearchParams();
    params.set("eventName", trimmedEventName);
    if (dateRange.trim()) params.set("dateRange", dateRange.trim());
    const separator = baseUrl.includes("?") ? "&" : "?";
    toast({ title: "Exportando", description: "Preparando checklist PDF..." });
    window.location.href = `${baseUrl}${separator}${params.toString()}`;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Checklist de salida</DialogTitle>
          <DialogDescription>Completa los datos del evento para generar el PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="checklist-event-name">Nombre del evento</Label>
            <Input
              id="checklist-event-name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Ej. Salida de campo mayo 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checklist-date-range">Rango de fechas</Label>
            <Input
              id="checklist-date-range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              placeholder="Ej. 20/05/2026 - 25/05/2026"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleExport}>Descargar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
