import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import handler from "@/api/webhook";
import spaceCreatePayload from "@/tests/fixtures/webhook-space-create.json";

const GLOBAL = "test-global-secret";
const INSTALLATION = "inst-1";

function fakeRes() {
  const r: any = {}; r.status = vi.fn((c: number) => { r.statusCode = c; return r; }); r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
}

vi.mock("@/lib/fanout/ensure-team-attached", () => ({ ensureTeamAttached: vi.fn().mockResolvedValue("ATTACHED") }));
// NOTE: getEntries dispatches by content_type — the plan's mock returned the
// governanceConfig item for ALL getEntries calls, which made upsertSpaceState()
// hit the patch-existing branch and throw (mock item has no .patch). Returning
// items: [] for non-config types steers upsertSpaceState to createEntry instead.
vi.mock("@/lib/cma/client", () => ({ cmaForSpace: vi.fn().mockResolvedValue({
  getOrganization: vi.fn().mockResolvedValue({ getTeamSpaceMemberships: vi.fn() }),
  getSpace: vi.fn().mockResolvedValue({ getEnvironment: vi.fn().mockResolvedValue({
    getEntries: vi.fn(async (q: any) => q.content_type === "governanceConfig"
      ? { items: [{ fields: { orgAdminsTeamId: { "en-US": "tOrgAdmins" } } }] }
      : { items: [] }),
    createEntry: vi.fn().mockResolvedValue({})
  }) })
}) }));

describe("POST /api/webhook", () => {
  beforeEach(() => { process.env.GLOBAL_WEBHOOK_SECRET = GLOBAL; });
  it("401s missing HMAC", async () => {
    const req = { method: "POST", url: "/api/webhook",
      headers: { "x-contentful-topic": "ContentManagement.Space.create",
                 "x-contentful-installation-id": INSTALLATION, "x-contentful-org-id": "org",
                 "x-contentful-console-space-id": "console" },
      body: spaceCreatePayload, rawBody: JSON.stringify(spaceCreatePayload) } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("200s a valid Space.create event", async () => {
    const raw = JSON.stringify(spaceCreatePayload);
    const sig = createHmac("sha256", createHmac("sha256", GLOBAL).update(`webhook:${INSTALLATION}`).digest("hex")).update(raw).digest("hex");
    const req = { method: "POST", url: "/api/webhook",
      headers: { "x-contentful-topic": "ContentManagement.Space.create",
                 "x-contentful-installation-id": INSTALLATION, "x-contentful-org-id": "org",
                 "x-contentful-console-space-id": "console",
                 "x-contentful-webhook-signature": sig },
      body: spaceCreatePayload, rawBody: raw } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(200);
  });
});
