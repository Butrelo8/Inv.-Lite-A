import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, FileText } from "lucide-react";

export interface ViewerDocument {
  id: number;
  fileUrl: string;
  originalName: string;
}

interface ImageViewerProps {
  images: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIndex?: number;
  documents?: ViewerDocument[];
}

export function ImageViewer({ images, open, onOpenChange, initialIndex = 0, documents = [] }: ImageViewerProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex, open]);

  const hasImages = images.length > 0;
  const hasDocuments = documents.length > 0;
  if (!hasImages && !hasDocuments) return null;

  const currentIndex = hasImages ? ((index % images.length) + images.length) % images.length : 0;
  const currentImage = hasImages ? images[currentIndex] : "";

  const goPrev = () => hasImages && setIndex((i) => (i - 1 + images.length) % images.length);
  const goNext = () => hasImages && setIndex((i) => (i + 1) % images.length);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "Escape") onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 overflow-y-auto border-0 bg-black/95"
        onKeyDown={handleKeyDown}
      >
        {hasImages && (
          <>
            <div className="relative flex items-center justify-center min-h-[70vh]">
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
                onClick={goPrev}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>

              <img
                src={currentImage}
                alt={`Image ${currentIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain"
                onClick={goNext}
              />

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
                onClick={goNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 text-white text-sm">
              <span>
                {currentIndex + 1} / {images.length}
              </span>
            </div>
          </>
        )}

        {hasDocuments && (
          <div className="border-t border-white/20 px-4 py-3">
            <p className="text-white/90 text-sm font-medium mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Documentos
            </p>
            <ul className="flex flex-col gap-1.5">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/80 hover:text-white text-sm underline truncate block max-w-full"
                  >
                    {doc.originalName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
