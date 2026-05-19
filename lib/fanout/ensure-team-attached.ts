type Org = {
  getTeamSpaceMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
  createTeamSpaceMembership(teamId: string, payload: any): Promise<any>;
};

export type FanoutResult = "ATTACHED" | "NO_OP" | "REPAIRED";

export async function ensureTeamAttached(org: Org, teamId: string, spaceId: string): Promise<FanoutResult> {
  const r = await org.getTeamSpaceMemberships({ "sys.team.sys.id": teamId, "sys.space.sys.id": spaceId });
  const adminMembership = r.items.find((m: any) => m.admin === true);
  if (adminMembership) return "NO_OP";
  await org.createTeamSpaceMembership(teamId, {
    admin: true,
    roles: [],
    sys: { space: { sys: { id: spaceId, type: "Link", linkType: "Space" } } }
  });
  return "ATTACHED";
}
