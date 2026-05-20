// Verifies that the given user is an Org Admin or Owner on the given org.
// Throws if not. Uses CMA org_memberships endpoint.

type Org = {
  getOrganizationMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
};

export async function checkOrgAdmin(org: Org, userId: string): Promise<void> {
  const r = await org.getOrganizationMemberships({ "sys.user.sys.id": userId, limit: 1 });
  const membership = r.items[0];
  if (!membership) throw new Error("Caller is not a member of the organization");
  const role = membership.role;
  if (role !== "owner" && role !== "admin") {
    throw new Error(`Caller role '${role}' is not authorized; org admin or owner required`);
  }
}
