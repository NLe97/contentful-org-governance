import { describe, it, expect, vi } from "vitest";
import { verifyAppSignature } from "@/lib/auth/verify-app-signature";

// Capture the secret each call sees so we can assert colon-stripping.
const capturedSecrets: string[] = [];
vi.mock("@contentful/node-apps-toolkit", () => ({
  verifyRequest: vi.fn((secret: string, req: any) => {
    capturedSecrets.push(secret);
    return req.headers["x-contentful-signature"] === "valid";
  })
}));

describe("verifyAppSignature", () => {
  const baseReq = {
    method: "POST",
    path: "/api/toggle-freeze",
    headers: {
      "x-contentful-signature": "valid",
      "x-contentful-signed-headers": "x-contentful-timestamp",
      "x-contentful-timestamp": String(Date.now()),
      "x-contentful-user-id": "user-abc",
      "x-contentful-space-id": "ubgf1y7ixw5q",
      "x-contentful-environment-id": "master"
    },
    body: '{"spaceId":"ubgf1y7ixw5q","action":"freeze"}'
  };

  it("returns identity claims on valid signature", () => {
    const id = verifyAppSignature(baseReq, "private-key-pem");
    expect(id).toEqual({
      userId: "user-abc",
      spaceId: "ubgf1y7ixw5q",
      environmentId: "master"
    });
  });

  it("throws on invalid signature", () => {
    const bad = { ...baseReq, headers: { ...baseReq.headers, "x-contentful-signature": "bad" } };
    expect(() => verifyAppSignature(bad, "private-key-pem")).toThrow(/signature/i);
  });

  it("throws on stale timestamp (> 30s old)", () => {
    const stale = { ...baseReq, headers: { ...baseReq.headers, "x-contentful-timestamp": String(Date.now() - 60_000) } };
    expect(() => verifyAppSignature(stale, "private-key-pem")).toThrow(/timestamp/i);
  });

  it("strips colons from a UI-formatted secret before HMAC", () => {
    capturedSecrets.length = 0;
    const withColons = "38:7e:86:a7:36:7c:6b:26";
    verifyAppSignature(baseReq, withColons);
    expect(capturedSecrets[capturedSecrets.length - 1]).toBe("387e86a7367c6b26");
  });

  it("throws an actionable message when secret missing", () => {
    const old = process.env.APP_SIGNING_SECRET;
    delete process.env.APP_SIGNING_SECRET;
    try {
      expect(() => verifyAppSignature(baseReq)).toThrow(/APP_SIGNING_SECRET not configured/);
    } finally {
      if (old !== undefined) process.env.APP_SIGNING_SECRET = old;
    }
  });
});
