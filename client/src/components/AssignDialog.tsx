import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useAssignItem } from "@/hooks/use-assignments";
import type { InventoryItem } from "@/hooks/use-inventory";
import { useToast } from "@/hooks/use-toast";

const assignFormSchema = z.object({
  assignee: z.string().trim().min(1, "Indica el responsable").max(120),
  condition: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  transfer: z.boolean().optional(),
});

type AssignFormValues = z.infer<typeof assignFormSchema>;

export interface AssignDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when there is an active assignment (show transfer option). */
  hasActiveAssignment: boolean;
}

export function AssignDialog({ item, open, onOpenChange, hasActiveAssignment }: AssignDialogProps) {
  const assignMutation = useAssignItem();
  const { toast } = useToast();

  const form = useForm<AssignFormValues>({
    resolver: zodResolver(assignFormSchema),
    defaultValues: {
      assignee: "",
      condition: "",
      notes: "",
      transfer: false,
    },
  });

  const onSubmit = async (values: AssignFormValues) => {
    if (!item) return;
    try {
      await assignMutation.mutateAsync({
        id: item.id,
        assignee: values.assignee,
        condition: values.condition || undefined,
        notes: values.notes || undefined,
        transfer: hasActiveAssignment ? values.transfer : undefined,
      });
      toast({ title: "Asignación registrada" });
      onOpenChange(false);
      form.reset({ assignee: "", condition: "", notes: "", transfer: false });
    } catch {
      // useAssignItem shows toast on error
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) form.reset({ assignee: "", condition: "", notes: "", transfer: false });
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar artículo</DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                <span className="font-mono">{item.code}</span> — {item.name}
              </>
            ) : (
              ""
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="assignee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asignar a</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del responsable" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condición del activo (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Estado al entregar" {...field} />
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
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Observaciones de la asignación" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {hasActiveAssignment && (
              <FormField
                control={form.control}
                name="transfer"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Transferir desde la asignación actual</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Cierra la custodia actual y registra una nueva asignación.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={assignMutation.isPending}>
                {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
