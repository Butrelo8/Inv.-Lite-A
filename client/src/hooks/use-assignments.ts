import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { toast } from "@/hooks/use-toast";

export function useAssignments(itemId: number | null | undefined) {
  return useQuery({
    queryKey: [api.inventory.assignmentsList.path, itemId],
    queryFn: async () => {
      if (itemId == null || itemId <= 0) throw new Error("No item");
      const url = buildUrl(api.inventory.assignmentsList.path, { id: itemId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assignments");
      return api.inventory.assignmentsList.responses[200].parse(await res.json());
    },
    enabled: itemId != null && itemId > 0,
  });
}

export function useAssignItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      assignee: string;
      condition?: string;
      notes?: string;
      transfer?: boolean;
    }) => {
      const url = buildUrl(api.inventory.assign.path, { id: payload.id });
      const { id: _id, ...body } = payload;
      const res = await fetch(url, {
        method: api.inventory.assign.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "No se pudo asignar");
      }
      return api.inventory.assign.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
      queryClient.invalidateQueries({ queryKey: [api.inventory.assignmentsList.path] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}

export function useReturnItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: number; condition?: string; notes?: string }) => {
      const returnRoute = api.inventory["return"];
      const url = buildUrl(returnRoute.path, { id: payload.id });
      const { id: _id, ...body } = payload;
      const res = await fetch(url, {
        method: returnRoute.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "No se pudo registrar la devolución");
      }
      return api.inventory["return"].responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
      queryClient.invalidateQueries({ queryKey: [api.inventory.assignmentsList.path] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}
