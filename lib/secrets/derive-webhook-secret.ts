import { createHmac } from "node:crypto";

export function deriveWebhookSecret(globalSecret: string, installationId: string): string {
  return createHmac("sha256", globalSecret).update(`webhook:${installationId}`).digest("hex");
}
