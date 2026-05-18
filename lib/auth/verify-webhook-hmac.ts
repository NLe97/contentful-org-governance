import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookHmac(rawBody: string, signature: string | undefined, secret: string): void {
  if (!signature) throw new Error("Missing webhook HMAC");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Webhook HMAC mismatch");
}
