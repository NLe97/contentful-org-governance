export type SpaceAdminMembership = { membershipId: string; userId: string };

type Space = {
  getSpaceMemberships(): Promise<{ items: any[] }>;
};

export async function enumerateSpaceAdmins(space: Space, excludeUserId: string): Promise<SpaceAdminMembership[]> {
  const r = await space.getSpaceMemberships();
  return r.items
    .filter((m: any) => m.admin === true)
    .filter((m: any) => !m.sys.team)
    .filter((m: any) => m.sys.user?.sys.id !== excludeUserId)
    .map((m: any) => ({ membershipId: m.sys.id, userId: m.sys.user.sys.id }));
}
