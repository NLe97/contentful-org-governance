// Verifies that the given user is an Org Admin or Owner on the given org.
// Throws if not. Uses CMA org_memberships endpoint.

type Org = {
  getOrganizationMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
};

// IMPORTANT: the v11 CMA / SDK silently ignores the `sys.user.sys.id` filter
// on /organization_memberships — verified live: passing the filter still
// returns every member of the org. So we cannot use {filter,limit:1} to grab
// the caller's membership. Instead we paginate the full list and find the
// matching user explicitly. Realistic orgs have <200 admins so this is one
// API call in practice; we cap pagination at 5 pages * 100 = 500 just in
// case an org is unusually large.
export async function checkOrgAdmin(org: Org, userId: string): Promise<void> {
  const PAGE_SIZE = 100;
  for (let skip = 0; skip < PAGE_SIZE * 5; skip += PAGE_SIZE) {
    const r = await org.getOrganizationMemberships({ limit: PAGE_SIZE, skip });
    const m = r.items.find((mm: any) => mm.sys.user?.sys?.id === userId);
    if (m) {
      const role = m.role;
      if (role !== "owner" && role !== "admin") {
        throw new Error(`Caller role '${role}' is not authorized; org admin or owner required`);
      }
      return;
    }
    if (r.items.length < PAGE_SIZE) break;
  }
  throw new Error("Caller is not a member of the organization");
}
