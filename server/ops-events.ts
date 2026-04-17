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
    // Never break request flow if observability recording fails.
    console.error("Failed to emit ops event", input.eventType, err);
  }
}
