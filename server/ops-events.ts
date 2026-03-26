import { storage } from "./storage";
import type { OpsEventSeverity, OpsEventType, OpsEventPayload } from "@shared/ops-health";
import { pool } from "./db";

export type EmitOpsEventInput = {
  eventType: OpsEventType;
  severity: OpsEventSeverity;
  source?: string;
  environment?: string;
  payload?: OpsEventPayload;
  userId?: number | null;
  ip?: string | null;
  requestId?: string | null;
  endpoint?: string | null;
  method?: string | null;
};

export async function ensureOpsEventsTable(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ops_events (
      id serial PRIMARY KEY,
      event_type text NOT NULL,
      severity text NOT NULL,
      source text NOT NULL DEFAULT 'api',
      environment text NOT NULL DEFAULT 'development',
      payload jsonb,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      ip text,
      request_id text,
      endpoint text,
      method text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ops_events_event_type_created_at_idx
      ON ops_events (event_type, created_at);
    CREATE INDEX IF NOT EXISTS ops_events_created_at_idx
      ON ops_events (created_at);
    CREATE INDEX IF NOT EXISTS ops_events_severity_created_at_idx
      ON ops_events (severity, created_at);
  `);
}

export async function emitOpsEvent(input: EmitOpsEventInput): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    // #region agent log
    fetch('http://127.0.0.1:7810/ingest/124a1cb1-6e13-41d5-98f5-ef3dbb7726dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d2f11e'},body:JSON.stringify({sessionId:'d2f11e',runId:'initial',hypothesisId:'H1',location:'server/ops-events.ts:20',message:'emitOpsEvent called',data:{eventType:input.eventType,severity:input.severity,source:input.source ?? "api"},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    await storage.addOpsEvent({
      eventType: input.eventType,
      severity: input.severity,
      source: input.source ?? "api",
      environment: input.environment ?? (process.env.NODE_ENV || "development"),
      payload: input.payload ?? {},
      userId: input.userId ?? null,
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
      endpoint: input.endpoint ?? null,
      method: input.method ?? null,
    });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7810/ingest/124a1cb1-6e13-41d5-98f5-ef3dbb7726dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d2f11e'},body:JSON.stringify({sessionId:'d2f11e',runId:'initial',hypothesisId:'H1',location:'server/ops-events.ts:34',message:'emitOpsEvent failed',data:{eventType:input.eventType,error:err instanceof Error ? err.message : String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // Never break request flow if observability recording fails.
    console.error("Failed to emit ops event", input.eventType, err);
  }
}
