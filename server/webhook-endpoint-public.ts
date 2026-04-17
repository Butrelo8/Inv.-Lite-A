import type { WebhookEndpoint, WebhookEndpointPublic } from "@shared/schema";

/** Strip signing secret for admin webhook CRUD JSON responses. */
export function redactWebhookEndpointSecret(row: WebhookEndpoint): WebhookEndpointPublic {
  const { secret, ...rest } = row;
  void secret;
  return rest;
}

export function redactWebhookEndpointSecrets(rows: WebhookEndpoint[]): WebhookEndpointPublic[] {
  return rows.map(redactWebhookEndpointSecret);
}
