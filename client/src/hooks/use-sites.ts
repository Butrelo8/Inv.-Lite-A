import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useSites(enabled = true) {
  return useQuery({
    queryKey: [api.sites.list.path],
    queryFn: async () => {
      const res = await fetch(api.sites.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sites");
      return api.sites.list.responses[200].parse(await res.json());
    },
    enabled,
  });
}
