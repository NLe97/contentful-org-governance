import { describe, it, expect, vi } from "vitest";
import { enumerateSpaceAdmins } from "@/lib/freeze/enumerate-admins";

describe("enumerateSpaceAdmins", () => {
  it("returns direct admins excluding caller and team-sourced memberships", async () => {
    const space = {
      getSpaceMemberships: vi.fn(async () => ({
        items: [
          { sys: { id: "m1", user: { sys: { id: "userA" } } }, admin: true, roles: [] },
          { sys: { id: "m2", user: { sys: { id: "userB" } } }, admin: true, roles: [] },
          { sys: { id: "m3", user: { sys: { id: "userTeam" } }, team: { sys: { id: "tA" } } }, admin: true, roles: [] },
          { sys: { id: "m4", user: { sys: { id: "userC" } } }, admin: false, roles: [{ sys: { id: "rEditor" } }] }
        ]
      }))
    } as any;
    const out = await enumerateSpaceAdmins(space, "userA");
    expect(out.map((m) => m.userId)).toEqual(["userB"]);
  });
});
