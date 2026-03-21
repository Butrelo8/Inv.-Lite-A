import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Company {
  id: number;
  name: string;
}

const API = "/api/companies";

function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, { ...init, credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error(r.statusText || "Request failed");
    return r.json();
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: [API],
    queryFn: () => fetchJson<Company[]>(API),
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchJson<Company>(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      fetchJson<Company>(`${API}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(r.statusText || "Delete failed");
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
  });
}
