import { storage } from "./storage";
import type { OpsEventSeverity, OpsEventType, OpsEventPayload } from "@shared/ops-health";

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
