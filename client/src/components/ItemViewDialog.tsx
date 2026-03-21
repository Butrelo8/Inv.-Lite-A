import type { InventoryItem } from "@/hooks/use-inventory";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

export interface ItemViewDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeText(v: unknown) {
  if (v == null) return "—";
  const s = typeof v === "string" ? v.trim() : String(v);
  return s ? s : "—";
}

export function ItemViewDialog({ item, open, onOpenChange }: ItemViewDialogProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista del artículo</DialogTitle>
          <DialogDescription>Lectura solo para el rol `viewer` (sin historial ni edición).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground font-medium">Código</div>
              <div className="text-sm font-medium">{safeText(item.code)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Nombre</div>
              <div className="text-sm font-medium">{safeText(item.name)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Categoría</div>
              <div className="text-sm">{safeText(item.category)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Responsable</div>
              <div className="text-sm">{safeText(item.responsible)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Unidades</div>
              <div className="text-sm">{item.units ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Condición</div>
              <div className="text-sm">{safeText(item.condition)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Fecha de compra</div>
              <div className="text-sm">
                {item.purchaseDate ? format(new Date(item.purchaseDate), "dd/MM/yyyy") : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Vida útil</div>
              <div className="text-sm">{safeText(item.usefulLife)}</div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <div className="text-sm font-medium">Descripción (Notas internas)</div>
            <div className="text-sm whitespace-pre-wrap text-foreground">{item.notes ? item.notes : "—"}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

