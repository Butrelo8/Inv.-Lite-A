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

export interface RoleTemplateRow {
  id: number;
  key: string;
  displayName: string;
  capabilities: unknown;
}

export interface UserSiteGrantRow {
  siteId: number;
  siteName: string;
  templateId: number;
  templateKey: string;
  templateDisplayName: string;
}

const siteRolesKey = (userId: number) => [API, userId, "site-roles"] as const;

export function useRoleTemplates(enabled: boolean) {
  return useQuery({
    queryKey: ["/api/role-templates"],
    queryFn: () => fetchJson<RoleTemplateRow[]>("/api/role-templates"),
    enabled,
  });
}

export function useUserSiteRoles(userId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: userId != null ? siteRolesKey(userId) : [API, "site-roles", "none"],
    queryFn: () => fetchJson<{ grants: UserSiteGrantRow[] }>(`${API}/${userId}/site-roles`),
    enabled: enabled && userId != null && userId > 0,
  });
}

export function useUpsertUserSiteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, siteId, templateId }: { userId: number; siteId: number; templateId: number }) => {
      const res = await fetch(`${API}/${userId}/site-roles/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || res.statusText);
      }
    },
    onSuccess: (_void, { userId }) => {
      qc.invalidateQueries({ queryKey: siteRolesKey(userId) });
    },
  });
}

export function useDeleteUserSiteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, siteId }: { userId: number; siteId: number }) => {
      const res = await fetch(`${API}/${userId}/site-roles/${siteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || res.statusText);
      }
    },
    onSuccess: (_void, { userId }) => {
      qc.invalidateQueries({ queryKey: siteRolesKey(userId) });
    },
  });
}
