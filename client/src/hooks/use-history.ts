import { useQuery } from "@tanstack/react-query";

export interface HistoryEntry {
  id: number;
  productId: number | null;
  companyId: number | null;
  transactionType: string;
  quantity: number;
  userId: number | null;
  createdAt: string;
  remarks: string | null;
  productCode?: string | null;
  productName?: string | null;
  userName?: string | null;
  companyName?: string | null;
  undoToken?: string | null;
  undoExpiresAt?: string | null;
  canRevert?: boolean;
  revertKind?: "single_delete" | "bulk_delete" | null;
}

export interface HistoryFilters {
  productId?: number;
  limit?: number;
  offset?: number;
  transactionType?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** When false, the query does not run (e.g. viewer role). */
  enabled?: boolean;
}

export interface HistoryListResponse {
  entries: HistoryEntry[];
  total: number;
}

export function useHistory(filters?: HistoryFilters | number, limit = 100) {
  const params: HistoryFilters =
    typeof filters === "number" ? { productId: filters, limit } : { ...filters, limit: filters?.limit ?? limit };
  const offset = params.offset ?? 0;
  const queryEnabled = typeof filters === "number" ? true : params.enabled !== false;
  return useQuery({
    queryKey: ["/api/history", params.productId, params.limit, offset, params.transactionType, params.userId, params.dateFrom, params.dateTo, params.search],
    queryFn: async () => {
      const url = new URL("/api/history", window.location.origin);
      url.searchParams.set("limit", String(params.limit ?? 100));
      url.searchParams.set("offset", String(offset));
      if (params.productId != null) url.searchParams.set("productId", String(params.productId));
      if (params.transactionType) url.searchParams.set("transactionType", params.transactionType);
      if (params.userId != null) url.searchParams.set("userId", String(params.userId));
      if (params.dateFrom) url.searchParams.set("dateFrom", params.dateFrom);
      if (params.dateTo) url.searchParams.set("dateTo", params.dateTo);
      if (params.search) url.searchParams.set("search", params.search);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json() as Promise<HistoryListResponse>;
    },
    enabled: queryEnabled,
  });
}

export function useHistoryUsers() {
  return useQuery({
    queryKey: ["/api/history/users"],
    queryFn: async () => {
      const res = await fetch("/api/history/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history users");
      return res.json() as Promise<{ userId: number; userName: string }[]>;
    },
  });
}
