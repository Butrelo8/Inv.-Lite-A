import { useState } from "react";

function thumbUrl(imageUrl: string | null | undefined): string | undefined {
  if (!imageUrl) return undefined;
  const base = imageUrl.replace(/\.[^.]+$/, "");
  const filename = base.split("/").pop();
  return `/uploads/thumbs/${filename}.webp`;
}
import { Link } from "wouter";
import { useEmployeeDocuments, useInventory } from "@/hooks/use-inventory";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, List, User, Loader2, ImageIcon, Eye } from "lucide-react";
import { format } from "date-fns";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  Contract: "Contrato",
  Identification: "Identificación",
  Certifications: "Certificaciones",
  Other: "Otro",
};
const canPreview = (mime: string | null) => mime === "application/pdf" || (mime != null && mime.startsWith("image/"));

export interface EmployeeQuickViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responsible: string | null;
  /** When provided (e.g. on Employees page), "Gestionar documentos" runs this. Otherwise show link to /employees. */
  onManageDocuments?: (responsible: string) => void;
}

export function EmployeeQuickViewDialog({
  open,
  onOpenChange,
  responsible,
  onManageDocuments,
}: EmployeeQuickViewDialogProps) {
  const [previewDoc, setPreviewDoc] = useState<{ fileUrl: string; mimeType: string | null; originalName: string } | null>(null);
  const { data: quickViewDocs = [], isLoading: quickViewDocsLoading } = useEmployeeDocuments(
    responsible ?? undefined,
    !!responsible && open
  );
  const { data: quickViewInventory } = useInventory(
    responsible ? { responsible, limit: 500 } : undefined,
    { enabled: !!responsible && open }
  );
  const quickViewItems = quickViewInventory?.items ?? [];

  return (
    <Dialog open={!!responsible && open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Resumen — {responsible}
          </DialogTitle>
          <DialogDescription>
            Documentos e ítems del inventario asignados a esta persona responsable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{quickViewItems.length}</span> artículos
            <span className="font-medium text-foreground tabular-nums">{quickViewDocs.length}</span> documentos
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Documentos
            </h4>
            {quickViewDocsLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando…
              </div>
            ) : quickViewDocs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2">Sin documentos.</p>
            ) : (
              <ul className="border rounded-md divide-y text-sm">
                {quickViewDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{doc.originalName}</span>
                      {doc.documentType && (
                        <Badge variant="secondary" className="w-fit mt-0.5 text-xs font-normal">{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0">{format(new Date(doc.createdAt), "dd/MM/yyyy")}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {canPreview(doc.mimeType) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => setPreviewDoc({ fileUrl: doc.fileUrl, mimeType: doc.mimeType, originalName: doc.originalName })}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Vista previa
                        </Button>
                      )}
                      <a
                        href={doc.fileUrl.startsWith("http") ? doc.fileUrl : `${window.location.origin}${doc.fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Descargar
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <List className="w-4 h-4" />
              Artículos del inventario
            </h4>
            {quickViewItems.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2">Sin artículos asignados.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[280px] overflow-y-auto pr-1">
                {quickViewItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col rounded-lg border bg-muted/30 overflow-hidden shrink-0"
                    title={`${item.code} — ${item.name}`}
                  >
                    <div className="aspect-square w-full bg-muted/50 relative overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={thumbUrl(item.imageUrl) ?? item.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = item.imageUrl ?? ""; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="px-1.5 py-1 text-center min-h-0">
                      <span className="font-mono text-xs text-muted-foreground block truncate" title={item.code}>
                        {item.code}
                      </span>
                      <span className="text-xs text-foreground truncate block" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Link href={responsible ? `/inventory?responsible=${encodeURIComponent(responsible)}` : "#"}>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)}>
                <List className="w-3.5 h-3.5" />
                Ver artículos en inventario
              </Button>
            </Link>
            {onManageDocuments ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  onOpenChange(false);
                  if (responsible) onManageDocuments(responsible);
                }}
              >
                <FileText className="w-3.5 h-3.5" />
                Gestionar documentos
              </Button>
            ) : (
              <Link href="/employees">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)}>
                  <FileText className="w-3.5 h-3.5" />
                  Ir a Personal
                </Button>
              </Link>
            )}
          </div>
        </div>
      </DialogContent>

      <DocumentPreviewModal
        open={!!previewDoc}
        onOpenChange={(o) => !o && setPreviewDoc(null)}
        fileUrl={previewDoc?.fileUrl ?? ""}
        mimeType={previewDoc?.mimeType ?? null}
        originalName={previewDoc?.originalName ?? ""}
      />
    </Dialog>
  );
}
