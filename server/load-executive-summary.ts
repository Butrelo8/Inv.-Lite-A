import type { ExecutiveSummaryResponse } from "@shared/executive-summary";
import { EXECUTIVE_SUMMARY_SCHEMA_VERSION } from "@shared/executive-summary";
import { isSiteScopingEnabled } from "./site-config";
import type { IStorage } from "./storage";

export async function loadExecutiveSummary(
  storage: IStorage,
  options: {
    role: string;
    siteId?: number;
    restrictToSiteIds?: number[];
  },
): Promise<ExecutiveSummaryResponse> {
  const includeOps = options.role === "editor" || options.role === "admin";
  const [assetHealth, cq] = await Promise.all([
    storage.getExecutiveSummaryInventoryMetrics(options.siteId, options.restrictToSiteIds),
    storage.getComplianceQueues(),
  ]);
  const reliability = includeOps ? await storage.getOpsSummary() : null;

  const scoping = isSiteScopingEnabled();
  const inventorySiteId = scoping && options.siteId != null ? options.siteId : null;

  return {
    schemaVersion: EXECUTIVE_SUMMARY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    inventorySiteId,
    complianceScopeNote:
      "Compliance queue counts are organization-wide; they are not filtered by the inventory site selector (employee documents are org-scoped in v1).",
    assetHealth,
    compliance: {
      counts: cq.counts,
      thresholds: cq.thresholds,
      trackedDocumentTypes: cq.trackedDocumentTypes,
      asOf: cq.asOf,
      scope: "organization",
    },
    reliability,
  };
}
