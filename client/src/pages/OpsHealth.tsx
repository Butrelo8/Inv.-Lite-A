import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, TriangleAlert, ShieldAlert, Info } from "lucide-react";
import type { OpsSummaryResponse } from "@shared/ops-health";

type OpsEvent = {
  id: number;
  eventType: string;
  severity: "critical" | "warning" | "info";
  source: string;
  payload: Record<string, unknown> | null;
  endpoint: string | null;
  method: string | null;
  ip: string | null;
  createdAt: string;
};

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString();
}

export default function OpsHealth() {
  const [severity, setSeverity] = useState<"all" | "critical" | "warning" | "info">("all");

  const { data: summary, isLoading: summaryLoading } = useQuery<OpsSummaryResponse>({
    queryKey: ["/api/ops-health/summary"],
    refetchInterval: 30_000,
  });

  const eventUrl = useMemo(() => {
    const p = new URLSearchParams({ limit: "100" });
    if (severity !== "all") p.set("severity", severity);
    return `/api/ops-health/events?${p.toString()}`;
  }, [severity]);

  const { data: events = [], isLoading: eventsLoading } = useQuery<OpsEvent[]>({
    queryKey: [eventUrl],
    refetchInterval: 15_000,
  });

  const isLoading = summaryLoading || eventsLoading;
  const kpis = summary?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Operations Health Dashboard</h2>
          <p className="text-sm text-muted-foreground">KPIs, operational events, and severity monitoring.</p>
        </div>
        <div className="w-44">
          <Select value={severity} onValueChange={(v: "all" | "critical" | "warning" | "info") => setSeverity(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Severity filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading operations telemetry...
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">API Success Rate (24h)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{pct(kpis?.apiSuccessRate24h)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">5xx Rate (24h)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{pct(kpis?.api5xxRate24h)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">P95 API Latency (24h)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{num(kpis?.p95ApiLatencyMs24h)} ms</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Auth Failures / hour</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{num(kpis?.authFailureRatePerHour)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Backup Success Rate (7d)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{pct(kpis?.backupSuccessRate7d)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Restore Verify Success (7d)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{pct(kpis?.restoreVerificationSuccessRate7d)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Pass: {num(kpis?.restoreVerificationPassCount7d ?? 0)} · Fail: {num(kpis?.restoreVerificationFailCount7d ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Integrity Scan Success (7d)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{pct(kpis?.integrityScanSuccessRate7d)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Active Sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{num(kpis?.activeSessions)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Integrity Issues (last run)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{num(kpis?.integrityScanIssuesLastRun)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-red-500" />Critical alerts (24h)</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{num(summary?.alerts.critical)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-amber-500" />Warning alerts (24h)</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{num(summary?.alerts.warning)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4 text-blue-500" />Info events (24h)</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{num(summary?.alerts.info)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Ops Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events found for selected filter.</p>
          ) : (
            events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{evt.eventType}</div>
                  <div className="text-muted-foreground truncate">
                    {(evt.method || "-")} {(evt.endpoint || "-")} {evt.ip ? `| ip:${evt.ip}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={evt.severity === "critical" ? "destructive" : "secondary"}>{evt.severity}</Badge>
                  <span className="text-muted-foreground">{new Date(evt.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
