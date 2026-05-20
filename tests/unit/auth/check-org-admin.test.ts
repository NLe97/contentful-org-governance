import { describe, it, expect, vi } from "vitest";
import { checkOrgAdmin } from "@/lib/auth/check-org-admin";

function fakeOrg(items: any[]) {
  return { getOrganizationMemberships: vi.fn().mockResolvedValue({ items }) } as any;
}

describe("checkOrgAdmin", () => {
  it("allows owner", async () => {
    await expect(checkOrgAdmin(fakeOrg([{ role: "owner" }]), "u1")).resolves.toBeUndefined();
  });
  it("allows admin", async () => {
    await expect(checkOrgAdmin(fakeOrg([{ role: "admin" }]), "u1")).resolves.toBeUndefined();
  });
  it("rejects member", async () => {
    await expect(checkOrgAdmin(fakeOrg([{ role: "member" }]), "u1")).rejects.toThrow(/authorized/);
  });
  it("rejects non-member", async () => {
    await expect(checkOrgAdmin(fakeOrg([]), "u1")).rejects.toThrow(/not a member/);
  });
});
