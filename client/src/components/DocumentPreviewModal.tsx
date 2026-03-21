import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  mimeType: string | null;
  originalName: string;
}

const canPreview = (mime: string | null) => {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("image/")) return true;
  return false;
};

export function DocumentPreviewModal({
  open,
  onOpenChange,
  fileUrl,
  mimeType,
  originalName,
}: DocumentPreviewModalProps) {
  const previewable = canPreview(mimeType);
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType?.startsWith("image/");
  const absoluteUrl = fileUrl.startsWith("http") ? fileUrl : `${window.location.origin}${fileUrl}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base truncate">
            <FileText className="w-4 h-4 shrink-0" />
            {originalName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col gap-2 px-4 pb-4">
          {previewable ? (
            <>
              {isPdf && (
                <iframe
                  src={absoluteUrl}
                  title={originalName}
                  sandbox="allow-same-origin"
                  className="w-full flex-1 min-h-[70vh] rounded border border-border bg-muted"
                />
              )}
              {isImage && (
                <img
                  src={absoluteUrl}
                  alt={originalName}
                  className="max-w-full max-h-[80vh] object-contain mx-auto"
                />
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <p className="mb-4">Vista previa no disponible para este tipo de archivo.</p>
              <a href={absoluteUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Descargar
                </Button>
              </a>
            </div>
          )}
          {previewable && (
            <a href={absoluteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Download className="w-4 h-4" />
                Descargar
              </Button>
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
