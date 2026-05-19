import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "@/api/bootstrap";

vi.mock("@/lib/auth/verify-app-signature", () => ({
  verifyAppSignature: vi.fn(() => ({ userId: "uOwner", spaceId: "console", environmentId: "master" }))
}));

function fakeRes() {
  const r: any = {}; r.status = vi.fn((c: number) => { r.statusCode = c; return r; }); r.json = vi.fn((b: unknown) => { r.body = b; return r; }); return r;
}

describe("POST /api/bootstrap", () => {
  beforeEach(() => { process.env.APP_PRIVATE_KEY = "x"; });
  it("400 when required fields missing", async () => {
    const req = { method: "POST", url: "/api/bootstrap",
      headers: { "x-contentful-signature": "valid", "x-contentful-timestamp": String(Date.now()),
                 "x-contentful-user-id": "u", "x-contentful-space-id": "console", "x-contentful-environment-id": "master" },
      body: {} } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
