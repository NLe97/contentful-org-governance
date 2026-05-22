import { describe, it, expect, vi } from "vitest";
import { checkOrgAdmin } from "@/lib/auth/check-org-admin";

function memb(userId: string, role: string, membershipId = `m-${userId}`) {
  return { sys: { id: membershipId, user: { sys: { id: userId } } }, role };
}

function fakeOrg(items: any[]) {
  return { getOrganizationMemberships: vi.fn(async () => ({ items })) } as any;
}

describe("checkOrgAdmin", () => {
  it("allows owner when caller is found in the membership list", async () => {
    const org = fakeOrg([memb("other", "member"), memb("u1", "owner")]);
    await expect(checkOrgAdmin(org, "u1")).resolves.toBeUndefined();
  });

  it("allows admin", async () => {
    await expect(checkOrgAdmin(fakeOrg([memb("u1", "admin")]), "u1")).resolves.toBeUndefined();
  });

  it("rejects member", async () => {
    await expect(checkOrgAdmin(fakeOrg([memb("u1", "member")]), "u1")).rejects.toThrow(/authorized/);
  });

  it("rejects when caller is not in the org at all", async () => {
    await expect(checkOrgAdmin(fakeOrg([memb("someone-else", "owner")]), "u1")).rejects.toThrow(/not a member/);
  });

  it("does NOT trust filtering — ignores items[0] and looks up by user id (regression test)", async () => {
    // Live-probed bug: the v11 CMA returns ALL memberships regardless of
    // the `sys.user.sys.id` filter. If checkOrgAdmin took items[0]
    // blindly, it would deny the actual owner because items[0] happens
    // to be a different user with role 'member'.
    const org = fakeOrg([memb("first-user", "member"), memb("caller", "owner")]);
    await expect(checkOrgAdmin(org, "caller")).resolves.toBeUndefined();
  });
});
