import { describe, it, expect, vi } from "vitest";
import { ensureFrozenRole } from "@/lib/freeze/ensure-frozen-role";

const FROZEN_NAME = "Space Admin (frozen)";

function fakeSpace(roles: any[]) {
  const list = [...roles];
  return {
    getRoles: vi.fn(async () => ({ items: list })),
    createRole: vi.fn(async (payload: any) => {
      const role = { sys: { id: `r${list.length + 1}` }, name: payload.name, permissions: payload.permissions };
      list.push(role); return role;
    })
  } as any;
}

describe("ensureFrozenRole", () => {
  it("returns existing role id when permissions already read-only", async () => {
    const update = vi.fn();
    const space = fakeSpace([{
      sys: { id: "rZ" },
      name: FROZEN_NAME,
      permissions: { ContentModel: ["read"], ContentDelivery: [], Settings: [], Environments: [], EnvironmentAliases: [], Tags: [] },
      update
    }]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("rZ");
    expect(space.createRole).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("repairs an existing role that has the old 'all' permissions", async () => {
    const update = vi.fn(async function (this: any) { return this; });
    const stale = {
      sys: { id: "rOld" },
      name: FROZEN_NAME,
      permissions: { ContentModel: "all", ContentDelivery: "all", Settings: [], Environments: "all", EnvironmentAliases: "all", Tags: "all" },
      policies: [],
      update
    };
    const space = fakeSpace([stale]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("rOld");
    expect(update).toHaveBeenCalledOnce();
    expect(stale.permissions).toEqual({ ContentModel: ["read"], ContentDelivery: [], Settings: [], Environments: [], EnvironmentAliases: [], Tags: [] });
    expect(stale.policies.length).toBe(2);
    expect((stale.policies as any[]).every((p) => p.actions.includes("read"))).toBe(true);
  });

  it("creates a read-only role when absent", async () => {
    const space = fakeSpace([]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("r1");
    expect(space.createRole).toHaveBeenCalledOnce();
    const payload = space.createRole.mock.calls[0]![0];
    expect(payload.permissions).toEqual({ ContentModel: ["read"], ContentDelivery: [], Settings: [], Environments: [], EnvironmentAliases: [], Tags: [] });
    expect(payload.policies.length).toBe(2);
    // Read-only: no actions other than "read" on Entry/Asset.
    for (const p of payload.policies) expect(p.actions).toEqual(["read"]);
  });
});
