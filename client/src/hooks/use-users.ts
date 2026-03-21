import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "./use-auth";

export interface AppUser {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

const API = "/api/users";

function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, { ...init, credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error(r.statusText || "Request failed");
    return r.json();
  });
}

export function useUsers() {
  return useQuery({
    queryKey: [API],
    queryFn: () => fetchJson<AppUser[]>(API),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: UserRole }) =>
      fetchJson<AppUser>(`${API}/${id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
    },
  });
}
