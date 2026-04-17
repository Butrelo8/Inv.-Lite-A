"use client";

import { useState, useCallback } from "react";

export interface UploadProgressState {
  progress: number;
  currentFile: number;
  totalFiles: number;
  message: string;
  isUploading: boolean;
}

export function useUploadProgress() {
  const [state, setState] = useState<UploadProgressState>({
    progress: 0,
    currentFile: 0,
    totalFiles: 0,
    message: "",
    isUploading: false,
  });

  const start = useCallback((totalSteps: number, initialMessage: string) => {
    setState({
      progress: 0,
      currentFile: 0,
      totalFiles: totalSteps,
      message: initialMessage,
      isUploading: true,
    });
  }, []);

  const setStep = useCallback((completed: number, total: number, message: string) => {
    const progress = total > 0 ? (completed / total) * 100 : 0;
    setState((prev) => ({
      ...prev,
      progress,
      currentFile: completed,
      totalFiles: total,
      message,
    }));
  }, []);

  const finish = useCallback(() => {
    setState((prev) => ({
      ...prev,
      progress: 100,
      isUploading: false,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      progress: 0,
      currentFile: 0,
      totalFiles: 0,
      message: "",
      isUploading: false,
    });
  }, []);

  return { ...state, start, setStep, finish, reset };
}
