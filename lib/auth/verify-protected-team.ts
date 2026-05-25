// Safety check for the freeze flow. We treat the Org Admins team as the
// untouchable bypass during freeze (it's how org admins keep reach into
// every space). That contract holds *only* if every member of that team
// is actually an org-level admin or owner. Otherwise, freeze leaks:
// any non-admin in the team retains write access to every space they
// reach via the team membership.
//
// This module returns the offending user IDs so the caller can refuse
// the freeze with an actionable message instead of producing a silent
// leak. Discovered via incident: a test user accidentally added to the
// Org Admins team could still publish in a frozen space.

type Org = {
  getOrganizationMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
  getTeamMemberships(opts: { teamId: string; query?: Record<string, unknown> }): Promise<{ items: any[] }>;
};

export type ProtectedTeamPurity =
  | { ok: true }
  | { ok: false; nonAdminUserIds: string[] };

const PAGE_SIZE = 100;
const MAX_PAGES = 10; // 1000 members; orgs much larger than this are unusual

export async function verifyProtectedTeamPurity(org: Org, teamId: string): Promise<ProtectedTeamPurity> {
  // Build orgMembershipId -> { role, userId } map by paginating.
  const orgRoleByMembershipId = new Map<string, { role: string; userId: string | undefined }>();
  for (let skip = 0; skip < PAGE_SIZE * MAX_PAGES; skip += PAGE_SIZE) {
    const r = await org.getOrganizationMemberships({ limit: PAGE_SIZE, skip });
    for (const m of r.items) {
      orgRoleByMembershipId.set(m.sys.id, { role: m.role, userId: m.sys.user?.sys?.id });
    }
    if (r.items.length < PAGE_SIZE) break;
  }

  const offenders: string[] = [];
  for (let skip = 0; skip < PAGE_SIZE * MAX_PAGES; skip += PAGE_SIZE) {
    const r = await org.getTeamMemberships({ teamId, query: { limit: PAGE_SIZE, skip } });
    for (const tm of r.items) {
      const omId = tm.sys.organizationMembership?.sys?.id ?? tm.organizationMembershipId;
      if (!omId) continue;
      const om = orgRoleByMembershipId.get(omId);
      if (!om) continue; // member's org membership disappeared between pages — treat as benign
      if (om.role !== "admin" && om.role !== "owner") {
        if (om.userId) offenders.push(om.userId);
      }
    }
    if (r.items.length < PAGE_SIZE) break;
  }

  return offenders.length === 0 ? { ok: true } : { ok: false, nonAdminUserIds: offenders };
}
