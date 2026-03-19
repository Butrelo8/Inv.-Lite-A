import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SharedNote {
  id: number;
  title: string;
  content: string;
  itemId: number;
  authorId: number | null;
  authorUsername: string | null;
  createdAt: string;
  updatedAt: string | null;
}

const API = "/api/shared-notes";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || res.statusText || "Request failed");
  }
  return (await res.json()) as T;
}

export function useSharedNotes(itemId?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [API, itemId],
    queryFn: () => {
      const url = itemId != null ? `${API}?itemId=${encodeURIComponent(String(itemId))}` : API;
      return fetchJson<SharedNote[]>(url);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCreateSharedNote(itemId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string; content: string }) =>
      {
        if (itemId == null) throw new Error("Missing itemId for shared note creation");
        return fetchJson<SharedNote>(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, itemId }),
        });
      },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
    },
  });
}

export function useUpdateSharedNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; title?: string; content?: string }) =>
      fetchJson<SharedNote>(`${API}/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: payload.title, content: payload.content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
    },
  });
}

export function useDeleteSharedNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || res.statusText || "Delete failed");
      }
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
    },
  });
}

