import { describe, it, expect, vi } from "vitest";
import { upsertSpaceState, readSpaceState } from "@/lib/content-model/space-state";

function fakeEnv(initial: any[] = []) {
  const items = [...initial];
  return {
    getEntries: vi.fn(async ({ content_type, "fields.spaceId": id }: any) => ({
      items: items.filter((i) => i.sys.contentType.sys.id === content_type && i.fields.spaceId["en-US"] === id)
    })),
    createEntry: vi.fn(async (_t: string, payload: any) => {
      const entry = {
        sys: { id: `e${items.length + 1}`, version: 1, contentType: { sys: { id: _t } } },
        fields: payload.fields,
        update: vi.fn(async function (this: any) { this.sys.version++; return this; }),
        patch: vi.fn(async function (this: any, ops: any[]) {
          for (const op of ops) {
            if (op.op === "replace") {
              const path = op.path.split("/").filter(Boolean);
              this.fields[path[0]] = { "en-US": op.value };
            }
          }
          this.sys.version++; return this;
        })
      };
      items.push(entry);
      return entry;
    })
  } as any;
}

describe("space-state repository", () => {
  it("creates on first upsert", async () => {
    const env = fakeEnv();
    const e = await upsertSpaceState(env, { spaceId: "spc1", spaceName: "Jobs", freezeStatus: "OFF" });
    expect(e.sys.id).toBe("e1");
    expect(env.createEntry).toHaveBeenCalledTimes(1);
  });

  it("patches on subsequent upsert", async () => {
    const env = fakeEnv();
    await upsertSpaceState(env, { spaceId: "spc1", spaceName: "Jobs", freezeStatus: "OFF" });
    const updated = await upsertSpaceState(env, { spaceId: "spc1", freezeStatus: "FROZEN" });
    expect(env.createEntry).toHaveBeenCalledTimes(1);
    expect(updated.fields.freezeStatus["en-US"]).toBe("FROZEN");
  });

  it("readSpaceState returns undefined when missing", async () => {
    const env = fakeEnv();
    expect(await readSpaceState(env, "missing")).toBeUndefined();
  });
});
