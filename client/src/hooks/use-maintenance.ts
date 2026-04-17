import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { toast } from "@/hooks/use-toast";

export function useMaintenanceSchedules(itemId: number | null | undefined) {
  return useQuery({
    queryKey: [api.maintenance.schedulesList.path, itemId],
    queryFn: async () => {
      if (!itemId) throw new Error("No item ID");
      const url = buildUrl(api.maintenance.schedulesList.path, { id: itemId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load schedules");
      return api.maintenance.schedulesList.responses[200].parse(await res.json());
    },
    enabled: !!itemId,
  });
}

export function useDueMaintenanceSchedules(overdue?: boolean, siteId?: number) {
  return useQuery({
    queryKey: [api.maintenance.dueList.path, overdue, siteId],
    queryFn: async () => {
      const url = new URL(api.maintenance.dueList.path, window.location.origin);
      if (overdue) url.searchParams.set("overdue", "true");
      if (siteId != null) url.searchParams.set("siteId", String(siteId));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load due schedules");
      return api.maintenance.dueList.responses[200].parse(await res.json());
    },
  });
}

export function useMaintenanceEvents(scheduleId: number | null | undefined) {
  return useQuery({
    queryKey: [api.maintenance.eventsList.path, scheduleId],
    queryFn: async () => {
      if (!scheduleId) throw new Error("No schedule ID");
      const url = buildUrl(api.maintenance.eventsList.path, { scheduleId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load maintenance events");
      return api.maintenance.eventsList.responses[200].parse(await res.json());
    },
    enabled: !!scheduleId,
  });
}

export function useCreateMaintenanceSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      itemId: number;
      scheduleType: "maintenance" | "calibration";
      title: string;
      intervalDays: number;
      startDate: string;
      notes?: string;
    }) => {
      const url = buildUrl(api.maintenance.scheduleCreate.path, { id: payload.itemId });
      const { itemId: _id, ...body } = payload;
      const res = await fetch(url, {
        method: api.maintenance.scheduleCreate.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Failed to create schedule");
      }
      return api.maintenance.scheduleCreate.responses[201].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.maintenance.schedulesList.path, variables.itemId] });
      queryClient.invalidateQueries({ queryKey: [api.maintenance.dueList.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      toast({ title: "Éxito", description: "Programación de mantenimiento creada." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}

export function useUpdateMaintenanceSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      scheduleId: number;
      active?: boolean;
      title?: string;
      intervalDays?: number;
      notes?: string;
    }) => {
      const url = buildUrl(api.maintenance.scheduleUpdate.path, { scheduleId: payload.scheduleId });
      const { scheduleId: _id, ...body } = payload;
      const res = await fetch(url, {
        method: api.maintenance.scheduleUpdate.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Failed to update schedule");
      }
      return api.maintenance.scheduleUpdate.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.maintenance.schedulesList.path] });
      queryClient.invalidateQueries({ queryKey: [api.maintenance.dueList.path] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}

export function useCompleteMaintenanceSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      scheduleId: number;
      performedAt: string;
      conditionResult?: string;
      notes: string;
      evidenceUrl?: string;
    }) => {
      const url = buildUrl(api.maintenance.scheduleComplete.path, { scheduleId: payload.scheduleId });
      const { scheduleId: _id, ...body } = payload;
      const res = await fetch(url, {
        method: api.maintenance.scheduleComplete.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Failed to complete schedule");
      }
      return api.maintenance.scheduleComplete.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.maintenance.schedulesList.path] });
      queryClient.invalidateQueries({ queryKey: [api.maintenance.dueList.path] });
      queryClient.invalidateQueries({ queryKey: [api.maintenance.eventsList.path, variables.scheduleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      toast({ title: "Éxito", description: "Mantenimiento marcado como completado." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}
