"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";

interface CameraCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

export function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
}: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    setStatus("loading");
    setErrorMessage("");

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        const isInsecure = typeof window !== "undefined" && window.location?.protocol !== "https:";
        setErrorMessage(
          isInsecure
            ? "El acceso a la cámara requiere HTTPS. Usa 'Elegir de galería' o accede a la app vía https://"
            : "Tu navegador no soporta el acceso a la cámara."
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, // Rear camera on mobile
          audio: false,
        });
        streamRef.current = stream;
        setStatus("ready");
      } catch (err) {
        // Try without facingMode for desktop (e.g. Safari on Mac has no "environment")
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          streamRef.current = stream;
          setStatus("ready");
        } catch (fallbackErr) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : "No se pudo acceder a la cámara. Revisa los permisos."
          );
        }
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setStatus("idle");
    };
  }, [open]);

  // Assign stream to video once the element is mounted (Safari needs this after DOM is ready)
  useEffect(() => {
    if (status !== "ready" || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [status]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || video.readyState !== 4) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        onCapture(file);
        onOpenChange(false);
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tomar una foto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              </div>
            )}
            {status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                <Camera className="h-12 w-12 opacity-50" />
                <p>{errorMessage}</p>
              </div>
            )}
            {status === "ready" && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover min-h-0 min-w-0"
                style={{ transform: "translateZ(0)" }}
              />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={handleCapture}
              disabled={status !== "ready"}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              Capturar foto
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
