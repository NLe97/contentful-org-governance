import { describe, it, expect, vi } from "vitest";
import { substituteMembership, restoreMembership } from "@/lib/freeze/substitute";

function membership(id: string, admin: boolean, roleId?: string) {
  return {
    sys: { id, version: 1 },
    admin,
    roles: roleId ? [{ sys: { id: roleId } }] : [],
    update: vi.fn(async function (this: any) { this.sys.version++; return this; })
  };
}

function spaceWith(m: any) {
  return { getSpaceMembership: vi.fn(async () => m) } as any;
}

describe("substitute / restore membership", () => {
  it("substitute swaps admin→false and assigns the frozen role", async () => {
    const m = membership("m1", true);
    const space = spaceWith(m);
    const rec = await substituteMembership(space, "m1", "rFrozen");
    expect(m.admin).toBe(false);
    expect(m.roles).toEqual([{ sys: { id: "rFrozen", type: "Link", linkType: "Role" } }]);
    expect(m.update).toHaveBeenCalledOnce();
    expect(rec).toEqual({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
  });

  it("restore puts admin back to true and clears roles", async () => {
    const m = membership("m1", false, "rFrozen");
    const space = spaceWith(m);
    await restoreMembership(space, "m1", { originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
    expect(m.admin).toBe(true);
    expect(m.roles).toEqual([]);
    expect(m.update).toHaveBeenCalledOnce();
  });
});
