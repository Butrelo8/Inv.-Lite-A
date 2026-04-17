/**
 * Outbound webhook POST using a pre-resolved connect address (mitigates DNS TOCTOU vs fetch(hostname)).
 */
import http from "node:http";
import https from "node:https";
import type { WebhookOutboundConnect } from "./webhook-url-policy";

export type WebhookDeliveryHttpResult =
  | { ok: true; status: number; statusText: string }
  | { ok: false; error: string; status?: number; statusText?: string };

export type WebhookDeliveryHttpOptions = {
  connect: WebhookOutboundConnect;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

async function sendWebhookHttpRequestImpl(opts: WebhookDeliveryHttpOptions): Promise<WebhookDeliveryHttpResult> {
  const { connect, headers, body, timeoutMs } = opts;
  const lib = connect.protocol === "https" ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: connect.connectAddress,
        port: connect.port,
        path: connect.pathAndQuery,
        method: "POST",
        ...(connect.protocol === "https" ? { servername: connect.tlsServerName } : {}),
        headers: {
          Host: connect.hostHeader,
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        const code = res.statusCode ?? 0;
        const text = res.statusMessage ?? "";
        if (code >= 200 && code < 300) {
          resolve({ ok: true, status: code, statusText: text });
        } else {
          resolve({
            ok: false,
            error: `HTTP Error: ${code} ${text}`,
            status: code,
            statusText: text,
          });
        }
      },
    );

    req.on("error", (err: unknown) => {
      const message = err instanceof Error ? err.message : "Network error";
      resolve({ ok: false, error: message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Network timeout" });
    });

    req.write(body);
    req.end();
  });
}

/** Mutable `.send` so tests can `mock.method(webhookHttpDelivery, "send", ...)` (ESM namespace exports are not mockable). */
export const webhookHttpDelivery = {
  send: sendWebhookHttpRequestImpl,
};
