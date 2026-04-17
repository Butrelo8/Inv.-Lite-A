import type { OpsSummaryResponse } from "./ops-health";

export const EXECUTIVE_SUMMARY_SCHEMA_VERSION = 1 as const;

export interface ExecutiveSummaryAssetHealth {
  totalItems: number;
  byCategory: { name: string; count: number }[];
  byCondition: { name: string; count: number }[];
  custody: {
    /** Matches `isInventoryResponsibleAssigned` in `client/src/lib/inventory-aggregates.ts`. */
    assignedToPerson: number;
    /** Null, empty, or «Equipo de trabajo». */
    sharedPool: number;
    /** Canonical «Sin asignar» label. */
    unassignedLabel: number;
  };
  /** Distinct inventory rows with at least one open (unreturned) assignment. */
  itemsWithActiveAssignment: number;
}

export interface ExecutiveSummaryComplianceSection {
  counts: {
    missing: number;
    dueSoon: number;
    overdue: number;
    critical: number;
  };
  thresholds: { dueSoonDays: number; criticalOverdueDays: number };
  trackedDocumentTypes: string[];
  asOf: string;
  /** Employee-document queues are org-wide in v1 (not filtered by inventory site). */
  scope: "organization";
}

export interface ExecutiveSummaryResponse {
  schemaVersion: typeof EXECUTIVE_SUMMARY_SCHEMA_VERSION;
  generatedAt: string;
  /** Inventory metrics respect site filter when `SITE_SCOPING_ENABLED` and `siteId` query apply; null when aggregating all permitted sites. */
  inventorySiteId: number | null;
  complianceScopeNote: string;
  assetHealth: ExecutiveSummaryAssetHealth;
  compliance: ExecutiveSummaryComplianceSection;
  /** `null` for viewers — same boundary as `/api/ops-health/summary` (editor/admin only). */
  reliability: OpsSummaryResponse | null;
}
