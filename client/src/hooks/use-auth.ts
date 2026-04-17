import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@shared/schema";
import { normalizeUserRoleFromApi } from "@shared/auth-role";

export type { UserRole };

/** Mirrors `SiteAccessGrant` from the server when site RBAC is enforcing. */
export interface SiteGrantSummary {
  siteId: number;
  siteName: string;
  templateId: number;
  templateKey: string;
  templateDisplayName: string;
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
  /** Present when `/api/auth/me` includes feature flags (default false if absent). */
  siteScopingEnabled?: boolean;
  siteRbacEnabled?: boolean;
  /** Effective capabilities when `siteScopingEnabled && siteRbacEnabled`; otherwise often empty. */
  capabilities?: string[];
  allowedSites?: { id: number; name: string }[];
  siteGrants?: SiteGrantSummary[];
}

/** Login and `/api/auth/me` share this JSON shape (flags + optional site RBAC fields). */
export type AuthMeResponse = {
  user?: { id: number; username: string; role?: string };
  siteScopingEnabled?: boolean;
  siteRbacEnabled?: boolean;
  capabilities?: unknown;
  allowedSites?: unknown;
  siteGrants?: unknown;
};

function mapAuthPayload(json: AuthMeResponse): User | null {
  const u = json.user;
  if (!u || typeof u.id !== "number") return null;
  const caps = Array.isArray(json.capabilities) ? (json.capabilities as string[]) : [];
  const allowedSites = Array.isArray(json.allowedSites)
    ? (json.allowedSites as { id: number; name: string }[])
    : undefined;
  const siteGrants = Array.isArray(json.siteGrants) ? (json.siteGrants as SiteGrantSummary[]) : undefined;
  return {
    id: u.id,
    username: u.username,
    role: normalizeUserRoleFromApi(u.role),
    siteScopingEnabled: Boolean(json.siteScopingEnabled),
    siteRbacEnabled: Boolean(json.siteRbacEnabled),
    capabilities: caps,
    allowedSites,
    siteGrants,
  };
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch auth");
      const json = await res.json();
      return mapAuthPayload(json);
    },
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (data: AuthMeResponse) => {
      queryClient.setQueryData(["/api/auth/me"], mapAuthPayload(data));
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
    },
  });

  return {
    user: data ?? null,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
