import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type UserRole = "admin" | "editor" | "viewer";

export interface User {
  id: number;
  username: string;
  role: UserRole;
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
      const u = json.user;
      return u ? { id: u.id, username: u.username, role: u.role ?? "viewer" } as User : null;
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
    onSuccess: (data: { user: { id: number; username: string; role?: string } }) => {
      const u = data.user;
      queryClient.setQueryData(["/api/auth/me"], u ? { id: u.id, username: u.username, role: (u.role ?? "viewer") as UserRole } : null);
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
