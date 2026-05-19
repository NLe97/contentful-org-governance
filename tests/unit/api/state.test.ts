import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "@/api/state";

vi.mock("@/lib/auth/verify-app-signature", () => ({
  verifyAppSignature: vi.fn(() => ({ userId: "u", spaceId: "console", environmentId: "master" }))
}));
vi.mock("@/lib/cma/client", () => ({
  cmaForSpace: vi.fn().mockResolvedValue({
    getSpace: vi.fn().mockResolvedValue({
      getEnvironment: vi.fn().mockResolvedValue({
        getEntries: vi.fn().mockResolvedValue({ items: [{ fields: { spaceId: { "en-US": "sX" }, freezeStatus: { "en-US": "OFF" } } }] })
      })
    })
  })
}));

function fakeRes() {
  const r: any = {}; r.status = vi.fn((c: number) => { r.statusCode = c; return r; }); r.json = vi.fn((b: unknown) => { r.body = b; return r; }); return r;
}

describe("GET /api/state", () => {
  beforeEach(() => { process.env.APP_PRIVATE_KEY = "x"; });
  it("returns current state for a space", async () => {
    const req = { method: "GET", url: "/api/state?spaceId=sX&orgId=org&consoleSpaceId=console",
      headers: { "x-contentful-signature": "valid", "x-contentful-timestamp": String(Date.now()),
                 "x-contentful-user-id": "u", "x-contentful-space-id": "console", "x-contentful-environment-id": "master" },
      query: { spaceId: "sX", orgId: "org", consoleSpaceId: "console" }, body: "" } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.spaceId).toBe("sX");
    expect(res.body.freezeStatus).toBe("OFF");
  });
});
