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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useReturnItem } from "@/hooks/use-assignments";
import type { InventoryItem } from "@/hooks/use-inventory";
import { useToast } from "@/hooks/use-toast";

const returnFormSchema = z.object({
  condition: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type ReturnFormValues = z.infer<typeof returnFormSchema>;

export interface ReturnDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReturnDialog({ item, open, onOpenChange }: ReturnDialogProps) {
  const returnMutation = useReturnItem();
  const { toast } = useToast();

  const form = useForm<ReturnFormValues>({
    resolver: zodResolver(returnFormSchema),
    defaultValues: { condition: "", notes: "" },
  });

  const onSubmit = async (values: ReturnFormValues) => {
    if (!item) return;
    try {
      await returnMutation.mutateAsync({
        id: item.id,
        condition: values.condition || undefined,
        notes: values.notes || undefined,
      });
      toast({ title: "Devolución registrada", description: "El responsable quedó como «Sin asignar»." });
      onOpenChange(false);
      form.reset({ condition: "", notes: "" });
    } catch {
      // useReturnItem shows toast on error
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) form.reset({ condition: "", notes: "" });
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver artículo</DialogTitle>
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
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condición al devolver (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Estado del activo" {...field} />
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
                    <Textarea rows={3} placeholder="Observaciones de la devolución" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={returnMutation.isPending}>
                {returnMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar devolución
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
