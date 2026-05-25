// Team-sourced space admins. A user can be a Space Admin via a Team's
// space membership (admin=true on the team_space_membership). The per-user
// substitution path in `substitute.ts` cannot touch these — substituting an
// individual user's space_membership doesn't override their team-granted
// admin. To actually block writes during freeze, we have to detach the
// entire team's admin role from the space and re-attach it on thaw.
//
// The Org Admins team (`governanceConfig.orgAdminsTeamId`) is exempt: it
// exists precisely so org admins can reach the space, and removing it
// would defeat the purpose of fan-out.

type Org = {
  getTeamSpaceMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
};

type SpaceMembershipHandle = {
  delete(): Promise<void>;
};

type Space = {
  getTeamSpaceMembership(id: string): Promise<SpaceMembershipHandle>;
  createTeamSpaceMembership(teamId: string, payload: { admin: boolean; roles: unknown[] }): Promise<any>;
};

export type TeamAdminMembership = { teamId: string; teamMembershipId: string };

export async function enumerateAdminTeams(
  org: Org,
  spaceId: string,
  protectedTeamId: string | undefined
): Promise<TeamAdminMembership[]> {
  const r = await org.getTeamSpaceMemberships({ spaceId, limit: 100 });
  return r.items
    .filter((m: any) => m.admin === true)
    .filter((m: any) => m.sys.team?.sys?.id && m.sys.team.sys.id !== protectedTeamId)
    .map((m: any) => ({ teamId: m.sys.team.sys.id as string, teamMembershipId: m.sys.id as string }));
}

export async function detachTeam(space: Space, teamMembershipId: string): Promise<void> {
  const m = await space.getTeamSpaceMembership(teamMembershipId);
  await m.delete();
}

export async function reattachTeam(space: Space, teamId: string): Promise<void> {
  await space.createTeamSpaceMembership(teamId, { admin: true, roles: [] });
}
