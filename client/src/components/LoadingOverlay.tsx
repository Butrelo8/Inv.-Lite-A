"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface LoadingOverlayProps {
  open: boolean;
  title: string;
  message: string;
  progress?: number;
  className?: string;
}

export function LoadingOverlay({ open, title, message, progress, className }: LoadingOverlayProps) {
  if (!open) return null;

  const overlay = (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm",
        className
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
          <div className="text-center space-y-1">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          {progress != null && (
            <div className="w-full space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{Math.round(progress)}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
