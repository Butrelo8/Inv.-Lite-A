import { createHash } from "node:crypto";

const PATH_FINGERPRINT_HEX_LEN = 16;

function opsWebhookPortForUrl(u: URL): number | null {
  const raw = u.port;
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  const proto = u.protocol;
  if ((proto === "https:" && n === 443) || (proto === "http:" && n === 80)) {
    return null;
  }
  return n;
}

/**
 * Summarizes a webhook URL for `ops_events` rows: exposes hostname (and optional
 * non-default port) for operators but not raw path, query, fragment, or credentials
 * (SHA-256 prefix of pathname + search).
 */
export function summarizeWebhookTargetForOps(urlString: string): {
  hostname: string;
  port: number | null;
  pathFingerprint: string;
} {
  try {
    const u = new URL(urlString);
    const pathAndQuery = `${u.pathname}${u.search}`;
    const pathFingerprint = createHash("sha256")
      .update(pathAndQuery, "utf8")
      .digest("hex")
      .slice(0, PATH_FINGERPRINT_HEX_LEN);
    return {
      hostname: u.hostname,
      port: opsWebhookPortForUrl(u),
      pathFingerprint,
    };
  } catch {
    return { hostname: "(invalid-url)", port: null, pathFingerprint: "" };
  }
}
