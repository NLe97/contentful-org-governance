import { describe, it, expect, vi } from "vitest";
import { verifyAppSignature } from "@/lib/auth/verify-app-signature";

vi.mock("@contentful/node-apps-toolkit", () => ({
  verifyRequest: vi.fn((_pk: string, req: any) =>
    req.headers["x-contentful-signature"] === "valid"
  )
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
});
