// v11 CMA quirk: `getTeamSpaceMemberships` lives on Organization, but
// `createTeamSpaceMembership` lives on Space (probed live in Task 3).
// Callers therefore need to provide BOTH an org handle (for the query)
// and a space handle (for the create).

type Org = {
  getTeamSpaceMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
};
type Space = {
  sys: { id: string };
  createTeamSpaceMembership(teamId: string, payload: { admin: boolean; roles: unknown[] }): Promise<any>;
};

export type FanoutResult = "ATTACHED" | "NO_OP" | "REPAIRED";
export type EnsureArgs = { org: Org; space: Space; teamId: string };

export async function ensureTeamAttached({ org, space, teamId }: EnsureArgs): Promise<FanoutResult> {
  const r = await org.getTeamSpaceMemberships({ teamId, spaceId: space.sys.id });
  if (r.items.some((m: any) => m.admin === true)) return "NO_OP";
  await space.createTeamSpaceMembership(teamId, { admin: true, roles: [] });
  return "ATTACHED";
}
