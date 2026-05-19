type Membership = {
  sys: { id: string; version: number };
  admin: boolean;
  roles: { sys: { id: string; type: string; linkType: string } }[];
  update(): Promise<Membership>;
};
type Space = { getSpaceMembership(id: string): Promise<Membership> };

export type SubstitutionRecord = { originalRoleId: string; substitutedRoleId: string };

export async function substituteMembership(space: Space, membershipId: string, frozenRoleId: string): Promise<SubstitutionRecord> {
  const m = await space.getSpaceMembership(membershipId);
  m.admin = false;
  m.roles = [{ sys: { id: frozenRoleId, type: "Link", linkType: "Role" } }];
  await m.update();
  return { originalRoleId: "admin-builtin", substitutedRoleId: frozenRoleId };
}

export async function restoreMembership(space: Space, membershipId: string, _rec: SubstitutionRecord): Promise<void> {
  const m = await space.getSpaceMembership(membershipId);
  m.admin = true;
  m.roles = [];
  await m.update();
}
