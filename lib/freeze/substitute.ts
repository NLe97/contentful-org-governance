type Membership = {
  sys: { id: string; version: number };
  admin: boolean;
  roles: { sys: { id: string; type: string; linkType: string } }[];
  user?: unknown;
  update(): Promise<Membership>;
};
type Space = { getSpaceMembership(id: string): Promise<Membership> };

export type SubstitutionRecord = { originalRoleId: string; substitutedRoleId: string };

// Strip the deprecated root-level `user` field. The CMA's PUT
// /spaces/{id}/space_memberships/{id} rejects bodies containing it
// ("The body you sent contains an unknown key. errors:[{keys:['user']}]"),
// but the v11 SDK still mirrors `sys.user` to a root `user` for back-compat,
// so the auto-serialised PUT body includes it unless we delete it.
function stripDeprecatedUserField(m: Membership) {
  delete (m as any).user;
}

export async function substituteMembership(space: Space, membershipId: string, frozenRoleId: string): Promise<SubstitutionRecord> {
  const m = await space.getSpaceMembership(membershipId);
  stripDeprecatedUserField(m);
  m.admin = false;
  m.roles = [{ sys: { id: frozenRoleId, type: "Link", linkType: "Role" } }];
  await m.update();
  return { originalRoleId: "admin-builtin", substitutedRoleId: frozenRoleId };
}

export async function restoreMembership(space: Space, membershipId: string, _rec: SubstitutionRecord): Promise<void> {
  const m = await space.getSpaceMembership(membershipId);
  stripDeprecatedUserField(m);
  m.admin = true;
  m.roles = [];
  await m.update();
}
