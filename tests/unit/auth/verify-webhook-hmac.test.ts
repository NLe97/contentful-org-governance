import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookHmac } from "@/lib/auth/verify-webhook-hmac";

const SECRET = "derived-secret";
const BODY = '{"sys":{"type":"Space","id":"newspace"}}';
const VALID = createHmac("sha256", SECRET).update(BODY).digest("hex");

describe("verifyWebhookHmac", () => {
  it("accepts a valid signature", () => {
    expect(() => verifyWebhookHmac(BODY, VALID, SECRET)).not.toThrow();
  });
  it("rejects mismatched signature", () => {
    expect(() => verifyWebhookHmac(BODY, "0".repeat(64), SECRET)).toThrow(/hmac/i);
  });
  it("rejects missing signature", () => {
    expect(() => verifyWebhookHmac(BODY, undefined, SECRET)).toThrow();
  });
});
