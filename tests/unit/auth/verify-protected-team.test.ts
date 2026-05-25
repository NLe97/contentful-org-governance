import { describe, it, expect, vi } from "vitest";
import { verifyProtectedTeamPurity } from "@/lib/auth/verify-protected-team";

function org(orgMembers: any[], teamMembers: any[]) {
  return {
    getOrganizationMemberships: vi.fn(async (_q: any) => ({ items: orgMembers })),
    getTeamMemberships: vi.fn(async (_opts: any) => ({ items: teamMembers }))
  } as any;
}

describe("verifyProtectedTeamPurity", () => {
  it("returns ok when every team member is an org admin or owner", async () => {
    const r = await verifyProtectedTeamPurity(org(
      [
        { sys: { id: "om-1", user: { sys: { id: "u1" } } }, role: "admin" },
        { sys: { id: "om-2", user: { sys: { id: "u2" } } }, role: "owner" }
      ],
      [
        { sys: { id: "tm-1", organizationMembership: { sys: { id: "om-1" } } }, admin: false },
        { sys: { id: "tm-2", organizationMembership: { sys: { id: "om-2" } } }, admin: false }
      ]
    ), "tProtected");
    expect(r).toEqual({ ok: true });
  });

  it("reports the userIds of team members who are not org admins/owners", async () => {
    const r = await verifyProtectedTeamPurity(org(
      [
        { sys: { id: "om-1", user: { sys: { id: "u1" } } }, role: "admin" },
        { sys: { id: "om-2", user: { sys: { id: "u2" } } }, role: "member" },
        { sys: { id: "om-3", user: { sys: { id: "u3" } } }, role: "developer" }
      ],
      [
        { sys: { id: "tm-1", organizationMembership: { sys: { id: "om-1" } } }, admin: false },
        { sys: { id: "tm-2", organizationMembership: { sys: { id: "om-2" } } }, admin: false },
        { sys: { id: "tm-3", organizationMembership: { sys: { id: "om-3" } } }, admin: false }
      ]
    ), "tProtected");
    expect(r).toEqual({ ok: false, nonAdminUserIds: ["u2", "u3"] });
  });

  it("falls back to the denormalized organizationMembershipId when sys link is absent", async () => {
    const r = await verifyProtectedTeamPurity(org(
      [{ sys: { id: "om-1", user: { sys: { id: "u1" } } }, role: "member" }],
      [{ sys: { id: "tm-1" }, organizationMembershipId: "om-1", admin: false }]
    ), "tProtected");
    expect(r).toEqual({ ok: false, nonAdminUserIds: ["u1"] });
  });

  it("ignores team members whose org membership cannot be resolved", async () => {
    const r = await verifyProtectedTeamPurity(org(
      [{ sys: { id: "om-1", user: { sys: { id: "u1" } } }, role: "admin" }],
      [
        { sys: { id: "tm-1", organizationMembership: { sys: { id: "om-1" } } }, admin: false },
        { sys: { id: "tm-2", organizationMembership: { sys: { id: "om-ghost" } } }, admin: false }
      ]
    ), "tProtected");
    expect(r).toEqual({ ok: true });
  });
});
