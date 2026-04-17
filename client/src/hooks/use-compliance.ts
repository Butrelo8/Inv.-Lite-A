import { useQuery } from "@tanstack/react-query";

export interface ComplianceQueueEntry {
  responsible: string;
  documentType: string;
  bucket: "missing" | "dueSoon" | "overdue" | "critical";
  documentId: number | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
}

export interface ComplianceQueuesResponse {
  entries: ComplianceQueueEntry[];
  counts: { missing: number; dueSoon: number; overdue: number; critical: number };
  thresholds: { dueSoonDays: number; criticalOverdueDays: number };
  trackedDocumentTypes: string[];
  asOf: string;
}

export function useComplianceQueues(documentTypes?: string[]) {
  return useQuery({
    queryKey: ["/api/compliance/queues", documentTypes],
    queryFn: async (): Promise<ComplianceQueuesResponse> => {
      const url = new URL("/api/compliance/queues", window.location.origin);
      if (documentTypes?.length) {
        url.searchParams.set("documentTypes", documentTypes.join(","));
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch compliance queues");
      return res.json() as Promise<ComplianceQueuesResponse>;
    },
  });
}
