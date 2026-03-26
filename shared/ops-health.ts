export const OPS_EVENT_SEVERITIES = ["critical", "warning", "info"] as const;
export type OpsEventSeverity = (typeof OPS_EVENT_SEVERITIES)[number];

export const OPS_EVENT_TYPES = [
  "auth.login_success",
  "auth.login_failure",
  "auth.rate_limit_hit",
  "auth.session_expired",
  "auth.csrf_blocked",
  "auth.forbidden",
  "api.error_4xx",
  "api.error_5xx",
  "api.slow_request",
  "job.backup_success",
  "job.backup_failure",
  "job.backup_restore_verify_success",
  "job.backup_restore_verify_failure",
  "job.integrity_scan_success",
  "job.integrity_scan_failure",
  "job.import_success",
  "job.import_failure",
  "job.history_write_failure",
  "job.thumbnail_failure",
  "system.db_connection_error",
  "system.startup",
  "system.shutdown",
] as const;

export type OpsEventType = (typeof OPS_EVENT_TYPES)[number];

export interface OpsEventPayload {
  [key: string]: unknown;
}

export interface OpsSummaryResponse {
  windows: {
    last5m: string;
    last1h: string;
    last24h: string;
  };
  kpis: {
    apiSuccessRate24h: number;
    api5xxRate24h: number;
    authFailureRatePerHour: number;
    rateLimitHits24h: number;
    csrfBlocks24h: number;
    backupSuccessRate7d: number | null;
    integrityScanSuccessRate7d: number | null;
    integrityScanIssuesLastRun: number | null;
    historyWriteSuccessRate24h: number;
    p95ApiLatencyMs24h: number | null;
    activeSessions: number | null;
    importRowsPerRun24h: number | null;
    importFailureRate24h: number;
  };
  alerts: {
    critical: number;
    warning: number;
    info: number;
  };
}
