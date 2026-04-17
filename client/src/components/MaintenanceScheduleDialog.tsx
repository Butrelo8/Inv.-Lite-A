import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCreateMaintenanceSchedule } from "@/hooks/use-maintenance";
import { format } from "date-fns";

const scheduleSchema = z.object({
  scheduleType: z.enum(["maintenance", "calibration"]),
  title: z.string().min(1, "El título es requerido").max(120, "Máximo 120 caracteres"),
  intervalDays: z.coerce.number().min(1, "Debe ser al menos 1 día"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido"),
  notes: z.string().max(2000, "Opcional: máximo 2000 caracteres").optional(),
});

export interface MaintenanceScheduleDialogProps {
  itemId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceScheduleDialog({ itemId, open, onOpenChange }: MaintenanceScheduleDialogProps) {
  const mutation = useCreateMaintenanceSchedule();
  
  const form = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      scheduleType: "maintenance",
      title: "",
      intervalDays: 30,
      startDate: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  const onSubmit = (values: z.infer<typeof scheduleSchema>) => {
    if (!itemId) return;
    mutation.mutate(
      { itemId, ...values },
      {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Programar Mantenimiento / Calibración</DialogTitle>
          <DialogDescription>
            Programa una recurrencia para este artículo. Se te notificará cuando se acerque la fecha de la próxima ejecución.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="scheduleType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de programa</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="maintenance">Mantenimiento preventivo</SelectItem>
                      <SelectItem value="calibration">Calibración</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título / Descripción corta</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Calibración anual" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de inicio</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="intervalDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervalo (días)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas adicionales (opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Instrucciones o detalles de la recurrencia" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Programando..." : "Guardar programa"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
