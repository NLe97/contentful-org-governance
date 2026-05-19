import { describe, it, expect, vi } from "vitest";
import { ensureContentTypes } from "@/lib/content-model/ensure-types";
import { GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE } from "@/lib/content-model/content-types";

function fakeEnv(existing: string[]) {
  return {
    getContentTypes: vi.fn().mockResolvedValue({ items: existing.map((id) => ({ sys: { id } })) }),
    createContentTypeWithId: vi.fn(async (id: string) => ({
      sys: { id, version: 1 },
      publish: vi.fn(async () => ({ sys: { id, version: 2 } }))
    }))
  } as any;
}

describe("ensureContentTypes", () => {
  it("creates all three when none exist", async () => {
    const env = fakeEnv([]);
    await ensureContentTypes(env);
    expect(env.createContentTypeWithId).toHaveBeenCalledTimes(3);
    const ids = env.createContentTypeWithId.mock.calls.map((c: any[]) => c[0]);
    expect(ids).toEqual(expect.arrayContaining([GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE]));
  });

  it("skips ones that already exist", async () => {
    const env = fakeEnv([GOVERNANCE_CONFIG_TYPE]);
    await ensureContentTypes(env);
    expect(env.createContentTypeWithId).toHaveBeenCalledTimes(2);
  });

  it("is idempotent", async () => {
    const env = fakeEnv([GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE]);
    await ensureContentTypes(env);
    expect(env.createContentTypeWithId).not.toHaveBeenCalled();
  });
});
