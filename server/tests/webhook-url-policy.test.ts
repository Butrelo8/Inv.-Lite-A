import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  allowPrivateWebhookTargets,
  buildWebhookHostHeader,
  isDisallowedWebhookHostname,
  isPrivateOrReservedIpv4String,
  isPrivateOrReservedIpv6String,
  resolveWebhookOutboundConnect,
  validateWebhookOutboundUrl,
} from "../webhook-url-policy";

test("isPrivateOrReservedIpv4String classifies RFC1918 and loopback", () => {
  assert.equal(isPrivateOrReservedIpv4String("10.0.0.1"), true);
  assert.equal(isPrivateOrReservedIpv4String("192.168.1.1"), true);
  assert.equal(isPrivateOrReservedIpv4String("127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIpv4String("169.254.1.1"), true);
  assert.equal(isPrivateOrReservedIpv4String("8.8.8.8"), false);
});

test("isPrivateOrReservedIpv6String classifies loopback, ULA, documentation, site-local, multicast, discard", () => {
  assert.equal(isPrivateOrReservedIpv6String("::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("fe80::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("fd00::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("::ffff:192.168.1.1"), true);
  assert.equal(isPrivateOrReservedIpv6String("2001:db8::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("2001:0db8::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("fec0::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("ff02::1"), true);
  assert.equal(isPrivateOrReservedIpv6String("100::"), true);
  assert.equal(isPrivateOrReservedIpv6String("::ffff:8.8.8.8"), false);
  assert.equal(isPrivateOrReservedIpv6String("2001:4860:4860::8888"), false);
});

test("isDisallowedWebhookHostname blocks localhost and metadata-style names", () => {
  assert.equal(isDisallowedWebhookHostname("localhost"), true);
  assert.equal(isDisallowedWebhookHostname("foo.localhost"), true);
  assert.equal(isDisallowedWebhookHostname("metadata.google.internal"), true);
  assert.equal(isDisallowedWebhookHostname("169.254.169.254"), true);
  assert.equal(isDisallowedWebhookHostname("example.com"), false);
});

test("validateWebhookOutboundUrl rejects non-http(s) schemes", async () => {
  const r = await validateWebhookOutboundUrl("ftp://example.com/hook");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /http or https/i);
});

test("validateWebhookOutboundUrl rejects credentials in URL", async () => {
  const r = await validateWebhookOutboundUrl("https://user:pass@example.com/hook");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /credentials/i);
});

test("validateWebhookOutboundUrl rejects loopback IPv4 by default", async () => {
  const r = await validateWebhookOutboundUrl("http://127.0.0.1/webhook");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /private|reserved/i);
});

test("validateWebhookOutboundUrl rejects documentation IPv6 literal by default", async () => {
  const r = await validateWebhookOutboundUrl("http://[2001:db8::1]/webhook");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /private|reserved/i);
});

test("validateWebhookOutboundUrl allows loopback when WEBHOOK_ALLOW_PRIVATE_TARGETS is set", async (t) => {
  const prev = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  t.after(() => {
    if (prev === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    else process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = prev;
  });
  process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = "true";
  assert.equal(allowPrivateWebhookTargets(), true);
  const r = await validateWebhookOutboundUrl("http://127.0.0.1/webhook");
  assert.equal(r.ok, true);
});

test("validateWebhookOutboundUrl resolves public hostnames to non-private addresses", async () => {
  const r = await validateWebhookOutboundUrl("https://example.com/webhook");
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.href, /^https:\/\/example\.com\//);
});

test("resolveWebhookOutboundConnect returns pinned address and path for public hostname", async () => {
  const r = await resolveWebhookOutboundConnect("https://example.com/webhook?q=1");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(net.isIP(r.connect.connectAddress));
  assert.equal(r.connect.protocol, "https");
  assert.equal(r.connect.port, 443);
  assert.equal(r.connect.pathAndQuery, "/webhook?q=1");
  assert.equal(r.connect.hostHeader, "example.com");
  assert.equal(r.connect.tlsServerName, "example.com");
});

test("resolveWebhookOutboundConnect pins literal IPv4", async () => {
  const r = await resolveWebhookOutboundConnect("http://8.8.8.8/hook");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.connect.connectAddress, "8.8.8.8");
  assert.equal(r.connect.port, 80);
  assert.equal(r.connect.hostHeader, "8.8.8.8");
});

test("buildWebhookHostHeader uses bracket IPv6 and non-default port", () => {
  assert.equal(buildWebhookHostHeader(new URL("http://[::1]:8080/h")), "[::1]:8080");
  assert.equal(buildWebhookHostHeader(new URL("https://[2001:db8::1]/h")), "[2001:db8::1]");
});
