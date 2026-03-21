import { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";

export interface ItemLabelInfo {
  id: number;
  code: string | null;
  name: string | null;
}

interface ItemLabelDialogProps {
  item: ItemLabelInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Payload encoded in the QR for scanning (id + code + name for lookup). */
function qrPayload(item: ItemLabelInfo): string {
  return JSON.stringify({
    id: item.id,
    code: item.code ?? "",
    name: (item.name ?? "").slice(0, 80),
  });
}

/** Build HTML for the printable label (single label, print-sized). */
function buildPrintHtml(item: ItemLabelInfo, qrDataUrl: string): string {
  const code = (item.code ?? "").trim() || `ID ${item.id}`;
  const name = (item.name ?? "").trim() || "—";
  const safeName = name.slice(0, 40) + (name.length > 40 ? "…" : "");
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiqueta - ${code}</title>
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; padding: 8px; }
    .label {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 6px;
      width: 70mm;
      min-height: 25mm;
      background: #fff;
    }
    .label img { width: 50px; height: 50px; flex-shrink: 0; }
    .label-text { flex: 1; min-width: 0; }
    .label-code { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
    .label-name { font-size: 11px; color: #333; line-height: 1.2; }
  </style>
</head>
<body>
  <div class="label">
    <img src="${qrDataUrl}" alt="QR" />
    <div class="label-text">
      <div class="label-code">${escapeHtml(code)}</div>
      <div class="label-name">${escapeHtml(safeName)}</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  const el = document.createElement("div");
  el.textContent = s;
  return el.innerHTML;
}

export function ItemLabelDialog({ item, open, onOpenChange }: ItemLabelDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !item) {
      setQrDataUrl(null);
      setLoading(true);
      return;
    }
    const payload = qrPayload(item);
    setLoading(true);
    QRCode.toDataURL(payload, { width: 160, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
      .finally(() => setLoading(false));
  }, [open, item?.id, item?.code, item?.name]);

  const handlePrint = () => {
    if (!item || !qrDataUrl) return;
    const html = buildPrintHtml(item, qrDataUrl);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onload = () => {
      w.print();
      w.afterprint = () => w.close();
    };
    // Fallback if afterprint not supported
    setTimeout(() => {
      try {
        if (w.closed) return;
        w.print();
      } catch {
        // ignore
      }
    }, 250);
  };

  const code = item ? ((item.code ?? "").trim() || `ID ${item.id}`) : "";
  const name = item ? (item.name ?? "").trim() || "—" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Etiqueta / Código QR</DialogTitle>
          <DialogDescription>
            Imprime esta etiqueta para pegar en el equipo y poder escanear o identificar el artículo en el inventario.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : qrDataUrl && item ? (
            <>
              <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30">
                <img src={qrDataUrl} alt="QR del artículo" className="w-24 h-24 shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="font-semibold text-sm">{code}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{name}</div>
                </div>
              </div>
              <Button onClick={handlePrint} className="gap-2 w-full sm:w-auto">
                <Printer className="w-4 h-4" />
                Imprimir etiqueta
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No se pudo generar el código QR.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
