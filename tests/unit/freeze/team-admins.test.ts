import { describe, it, expect, vi } from "vitest";
import { enumerateAdminTeams, detachTeam, reattachTeam } from "@/lib/freeze/team-admins";

describe("enumerateAdminTeams", () => {
  it("returns admin team memberships, excluding the protected Org Admins team", async () => {
    const org = {
      getTeamSpaceMemberships: vi.fn(async () => ({
        items: [
          { sys: { id: "tsm1", team: { sys: { id: "tProtected" } } }, admin: true, roles: [] },
          { sys: { id: "tsm2", team: { sys: { id: "tOther" } } }, admin: true, roles: [] },
          { sys: { id: "tsm3", team: { sys: { id: "tEditor" } } }, admin: false, roles: [{ sys: { id: "rEditor" } }] }
        ]
      }))
    } as any;
    const out = await enumerateAdminTeams(org, "sX", "tProtected");
    expect(out).toEqual([{ teamId: "tOther", teamMembershipId: "tsm2" }]);
  });

  it("returns all admin teams when no protected team is provided", async () => {
    const org = {
      getTeamSpaceMemberships: vi.fn(async () => ({
        items: [
          { sys: { id: "tsm1", team: { sys: { id: "tA" } } }, admin: true, roles: [] },
          { sys: { id: "tsm2", team: { sys: { id: "tB" } } }, admin: true, roles: [] }
        ]
      }))
    } as any;
    const out = await enumerateAdminTeams(org, "sX", undefined);
    expect(out.map((t) => t.teamId)).toEqual(["tA", "tB"]);
  });
});

describe("detachTeam", () => {
  it("deletes the team_space_membership", async () => {
    const del = vi.fn(async () => {});
    const space = { getTeamSpaceMembership: vi.fn(async () => ({ delete: del })) } as any;
    await detachTeam(space, "tsm-xyz");
    expect(space.getTeamSpaceMembership).toHaveBeenCalledWith("tsm-xyz");
    expect(del).toHaveBeenCalled();
  });
});

describe("reattachTeam", () => {
  it("recreates the team_space_membership as admin with empty roles", async () => {
    const create = vi.fn(async () => ({}));
    const space = { createTeamSpaceMembership: create } as any;
    await reattachTeam(space, "tA");
    expect(create).toHaveBeenCalledWith("tA", { admin: true, roles: [] });
  });
});
