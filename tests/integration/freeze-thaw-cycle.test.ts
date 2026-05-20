import { describe, it, expect, beforeAll } from "vitest";
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { ensureFrozenRole } from "@/lib/freeze/ensure-frozen-role";

const RUN = process.env.CF_INTEGRATION === "1";
const PAT = process.env.CF_DEV_PAT!;
const TARGET = process.env.CF_TARGET_SPACE ?? "ubgf1y7ixw5q";

describe.runIf(RUN)("integration — freeze role lifecycle", () => {
  let cma: any;
  beforeAll(() => { cma = createClient({ accessToken: PAT }); });

  it("creates the substitute role and removes it", async () => {
    const space = await cma.getSpace(TARGET);
    const id = await ensureFrozenRole(space as any, "it-frozen-role");
    expect(id).toMatch(/.+/);
    const role = (await space.getRoles()).items.find((r: any) => r.sys.id === id);
    await role.delete();
  }, 120_000);
});
