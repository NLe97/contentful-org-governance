import { describe, it, expect } from "vitest";
import { deriveWebhookSecret } from "@/lib/secrets/derive-webhook-secret";

describe("deriveWebhookSecret", () => {
  it("is deterministic for same inputs", () => {
    const a = deriveWebhookSecret("global", "inst-1");
    const b = deriveWebhookSecret("global", "inst-1");
    expect(a).toBe(b);
  });
  it("differs across installations", () => {
    expect(deriveWebhookSecret("global", "inst-1")).not.toBe(deriveWebhookSecret("global", "inst-2"));
  });
  it("differs across global roots", () => {
    expect(deriveWebhookSecret("globalA", "inst-1")).not.toBe(deriveWebhookSecret("globalB", "inst-1"));
  });
});
