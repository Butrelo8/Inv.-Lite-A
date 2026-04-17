import { useQuery } from "@tanstack/react-query";
import type { ExecutiveSummaryResponse } from "@shared/executive-summary";

export function useExecutiveSummary(siteId?: number) {
  return useQuery({
    queryKey: ["/api/reports/executive-summary", siteId ?? "all"],
    queryFn: async (): Promise<ExecutiveSummaryResponse> => {
      const u = new URL("/api/reports/executive-summary", window.location.origin);
      if (siteId != null) u.searchParams.set("siteId", String(siteId));
      const res = await fetch(u.toString(), { credentials: "include" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      return res.json();
    },
  });
}
