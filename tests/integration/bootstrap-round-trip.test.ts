import { describe, it, expect, beforeAll } from "vitest";
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;

const RUN = process.env.CF_INTEGRATION === "1";
const PAT = process.env.CF_DEV_PAT!;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";

describe.runIf(RUN)("integration — bootstrap round-trip", () => {
  let cma: any, consoleSpaceId: string;
  beforeAll(() => { cma = createClient({ accessToken: PAT }); });

  it("creates a console space, content types, then cleans up", async () => {
    const created = await cma.createSpace({ name: "gov-it-" + Date.now(), defaultLocale: "en-US" }, ORG);
    consoleSpaceId = created.sys.id;
    try {
      const env = await (await cma.getSpace(consoleSpaceId)).getEnvironment("master");
      const { ensureContentTypes } = await import("@/lib/content-model/ensure-types");
      await ensureContentTypes(env as any);
      const types = (await env.getContentTypes()).items.map((c: any) => c.sys.id);
      expect(types).toEqual(expect.arrayContaining(["governanceConfig", "spaceState", "auditEvent"]));
    } finally {
      const s = await cma.getSpace(consoleSpaceId);
      await s.delete();
    }
  }, 120_000);
});
