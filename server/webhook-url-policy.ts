/**
 * Outbound webhook URL policy (SSRF mitigation).
 * Webhook CRUD is admin-only but treated as a trusted-admin capability; URLs are still
 * validated before persist and again at delivery time.
 */
import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import net from "node:net";

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set(
  ["localhost", "metadata.google.internal", "169.254.169.254", "0.0.0.0"].map((h) => h.toLowerCase()),
);

function readAllowPrivateEnv(): boolean {
  const v = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, literal-IP and DNS-resolved private ranges are allowed (dev / trusted LAN only). */
export function allowPrivateWebhookTargets(): boolean {
  return readAllowPrivateEnv();
}

/** True if this IPv4 string is loopback, RFC1918, link-local, CGNAT, or unspecified. */
export function isPrivateOrReservedIpv4String(ipv4: string): boolean {
  const parts = ipv4.split(".");
  if (parts.length !== 4) return true;
  const o = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });
  if (o.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a, b] = o as [number, number, number, number];
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function ipv6FirstHextet(ip: string): number | null {
  const lower = ip.toLowerCase().trim();
  const head = lower.split(":")[0];
  if (!head || !/^[0-9a-f]{1,4}$/.test(head)) return null;
  return parseInt(head, 16);
}

/**
 * Conservative private / reserved checks for parsed IPv6 host strings (no brackets).
 * Best-effort (not a full IANA special-purpose registry): link-local, ULA, loopback,
 * IPv4-mapped private, documentation (2001:db8::/32), deprecated site-local (fec0::/10),
 * discard (100::/64), and multicast (ff00::/8). Unusual compressions of the same ranges
 * may slip through; hostnames still go through DNS + the same per-address checks.
 */
export function isPrivateOrReservedIpv6String(ipv6: string): boolean {
  const lower = ipv6.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isPrivateOrReservedIpv4String(mapped[1]);
  // RFC 3849 documentation — literal targets are never public unicast.
  if (/^2001:0*db8:/.test(lower)) return true;
  // RFC 6666 discard-only 100::/64 (canonical compressed form).
  if (/^0*100::/.test(lower)) return true;
  const h = ipv6FirstHextet(lower);
  if (h === null) return true;
  if (h >= 0xfe80 && h <= 0xfebf) return true;
  if (h >= 0xfc00 && h <= 0xfdff) return true;
  if (h >= 0xfec0 && h <= 0xfeff) return true;
  if (h >= 0xff00) return true;
  return false;
}

/** Block obvious metadata / loopback hostnames before DNS. */
export function isDisallowedWebhookHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

function addressIsBlocked(addr: string, family: number): boolean {
  if (family === 4 || net.isIPv4(addr)) {
    return isPrivateOrReservedIpv4String(addr);
  }
  if (family === 6 || net.isIPv6(addr)) {
    return isPrivateOrReservedIpv6String(addr);
  }
  return true;
}

type ParsedWebhookUrl = { ok: true; url: URL } | { ok: false; message: string };

function parseWebhookOutboundUrlInput(trimmed: string): ParsedWebhookUrl {
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Invalid webhook URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Webhook URL must use http or https" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, message: "Webhook URL must not include credentials" };
  }

  const hostname = url.hostname;
  if (!hostname) {
    return { ok: false, message: "Webhook URL must include a host" };
  }

  if (isDisallowedWebhookHostname(hostname)) {
    return { ok: false, message: "Webhook host is not allowed for outbound webhooks" };
  }

  return { ok: true, url };
}

async function assertWebhookOutboundHostPolicy(url: URL): Promise<{ ok: true } | { ok: false; message: string }> {
  const hostname = url.hostname;
  const allowPrivate = allowPrivateWebhookTargets();

  if (net.isIPv4(hostname)) {
    if (!allowPrivate && isPrivateOrReservedIpv4String(hostname)) {
      return { ok: false, message: "Webhook URL must not target a private or reserved IPv4 address" };
    }
    return { ok: true };
  }

  if (net.isIPv6(hostname)) {
    if (!allowPrivate && isPrivateOrReservedIpv6String(hostname)) {
      return { ok: false, message: "Webhook URL must not target a private or reserved IPv6 address" };
    }
    return { ok: true };
  }

  if (!allowPrivate) {
    let records: LookupAddress[];
    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      return { ok: false, message: "Webhook host could not be resolved" };
    }
    if (records.length === 0) {
      return { ok: false, message: "Webhook host could not be resolved" };
    }
    for (const rec of records) {
      if (addressIsBlocked(rec.address, rec.family)) {
        return { ok: false, message: "Webhook URL must not resolve to a private or reserved address" };
      }
    }
  }

  return { ok: true };
}

function pickConnectAddress(records: LookupAddress[], allowPrivate: boolean): LookupAddress | null {
  const usable = records.filter((r) => allowPrivate || !addressIsBlocked(r.address, r.family));
  if (usable.length === 0) return null;
  const v4 = usable.find((r) => r.family === 4);
  return v4 ?? usable[0];
}

/** Host header value for the original URL (bracket IPv6 when default port). */
export function buildWebhookHostHeader(url: URL): string {
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const portNum = url.port ? parseInt(url.port, 10) : defaultPort;
  const host = url.hostname;
  const isV6 = net.isIPv6(host);
  if (portNum === defaultPort) {
    return isV6 ? `[${host}]` : host;
  }
  return isV6 ? `[${host}]:${portNum}` : `${host}:${portNum}`;
}

export type WebhookUrlValidation =
  | { ok: true; href: string }
  | { ok: false; message: string };

/**
 * Validates a webhook target URL for scheme, credentials, host policy, and (unless
 * WEBHOOK_ALLOW_PRIVATE_TARGETS) DNS resolution to non-private addresses.
 */
export async function validateWebhookOutboundUrl(rawUrl: string): Promise<WebhookUrlValidation> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, message: "Webhook URL is required" };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, message: `Webhook URL must be at most ${MAX_URL_LENGTH} characters` };
  }

  const parsed = parseWebhookOutboundUrlInput(trimmed);
  if (!parsed.ok) {
    return parsed;
  }

  const hostOk = await assertWebhookOutboundHostPolicy(parsed.url);
  if (!hostOk.ok) {
    return hostOk;
  }

  return { ok: true, href: parsed.url.href };
}

/** Parameters for `http`/`https` request: socket connects to `connectAddress`, TLS SNI uses `tlsServerName`. */
export type WebhookOutboundConnect = {
  protocol: "http" | "https";
  connectAddress: string;
  port: number;
  pathAndQuery: string;
  hostHeader: string;
  tlsServerName: string;
};

export type WebhookOutboundConnectResult =
  | { ok: true; connect: WebhookOutboundConnect; href: string }
  | { ok: false; message: string };

/**
 * Parse + host policy (same as validate) and return a pinned connect target using a fresh DNS lookup
 * for hostnames so delivery does not rely on a separate `fetch(url)` resolution (TOCTOU mitigation).
 */
export async function resolveWebhookOutboundConnect(rawUrl: string): Promise<WebhookOutboundConnectResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, message: "Webhook URL is required" };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, message: `Webhook URL must be at most ${MAX_URL_LENGTH} characters` };
  }

  const parsed = parseWebhookOutboundUrlInput(trimmed);
  if (!parsed.ok) {
    return parsed;
  }

  const hostOk = await assertWebhookOutboundHostPolicy(parsed.url);
  if (!hostOk.ok) {
    return hostOk;
  }

  const { url } = parsed;
  const hostname = url.hostname;
  const allowPrivate = allowPrivateWebhookTargets();

  let connectAddress: string;
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    connectAddress = hostname;
  } else {
    let records: LookupAddress[];
    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      return { ok: false, message: "Webhook host could not be resolved" };
    }
    if (records.length === 0) {
      return { ok: false, message: "Webhook host could not be resolved" };
    }
    const picked = pickConnectAddress(records, allowPrivate);
    if (!picked) {
      return { ok: false, message: "Webhook URL must not resolve to a private or reserved address" };
    }
    connectAddress = picked.address;
  }

  const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
  const protocol = url.protocol === "https:" ? "https" : "http";
  const pathAndQuery = `${url.pathname}${url.search}`;

  return {
    ok: true,
    href: url.href,
    connect: {
      protocol,
      connectAddress,
      port,
      pathAndQuery,
      hostHeader: buildWebhookHostHeader(url),
      tlsServerName: hostname,
    },
  };
}
