import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCompleteMaintenanceSchedule } from "@/hooks/use-maintenance";
import { format } from "date-fns";

const completeSchema = z.object({
  performedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido"),
  conditionResult: z.string().max(80, "Máximo 80 caracteres").optional(),
  notes: z.string().min(1, "Las notas son requeridas").max(2000, "Máximo 2000 caracteres"),
  evidenceUrl: z.string().optional(),
});

export interface MaintenanceCompleteDialogProps {
  scheduleId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceCompleteDialog({ scheduleId, open, onOpenChange }: MaintenanceCompleteDialogProps) {
  const mutation = useCompleteMaintenanceSchedule();
  
  const form = useForm<z.infer<typeof completeSchema>>({
    resolver: zodResolver(completeSchema),
    defaultValues: {
      performedAt: format(new Date(), "yyyy-MM-dd"),
      conditionResult: "",
      notes: "",
      evidenceUrl: "",
    },
  });

  const onSubmit = (values: z.infer<typeof completeSchema>) => {
    if (!scheduleId) return;
    mutation.mutate(
      { scheduleId, ...values },
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
          <DialogTitle>Completar Mantenimiento</DialogTitle>
          <DialogDescription>
            Registra la ejecución del mantenimiento. Esto actualizará automáticamente la próxima fecha de vencimiento.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="performedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de ejecución</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conditionResult"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condición / Resultado corto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. OK, Calibrado, Requiere reparación" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas / Descripción detallada</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Qué trabajos o pruebas se realizaron..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Completar mantenimiento"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
