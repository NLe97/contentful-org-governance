import { describe, it, expect, vi } from "vitest";
import { readConfig, writeConfig } from "@/lib/content-model/governance-config";

function fakeEnv(initial?: any) {
  const store: any = { entry: initial };
  return {
    getEntries: vi.fn(async () => ({ items: store.entry ? [store.entry] : [] })),
    createEntry: vi.fn(async (_t: string, payload: any) => {
      store.entry = { sys: { id: "cfg", version: 1 }, fields: payload.fields, update: vi.fn(async function (this: any) { return this; }) };
      return store.entry;
    })
  } as any;
}

describe("governance config repo", () => {
  it("creates the singleton on first write", async () => {
    const env = fakeEnv();
    const r = await writeConfig(env, { orgAdminsTeamId: "team-1", frozenRoleName: "Space Admin (frozen)", enforcementEnabled: true });
    expect(r.sys.id).toBe("cfg");
    expect(env.createEntry).toHaveBeenCalledTimes(1);
  });
  it("read returns undefined when none", async () => {
    const env = fakeEnv();
    expect(await readConfig(env)).toBeUndefined();
  });
});
