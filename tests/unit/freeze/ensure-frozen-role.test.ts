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
  it("returns existing role id when present", async () => {
    const space = fakeSpace([{ sys: { id: "rZ" }, name: FROZEN_NAME }]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("rZ");
    expect(space.createRole).not.toHaveBeenCalled();
  });
  it("creates role with manageRoles omitted when absent", async () => {
    const space = fakeSpace([]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("r1");
    expect(space.createRole).toHaveBeenCalledOnce();
    const payload = space.createRole.mock.calls[0]![0];
    expect(payload.permissions.Settings).not.toContain("manageRoles");
  });
});
