import type { FanoutResult, EnsureArgs } from "./ensure-team-attached.js";
import { ensureTeamAttached as defaultEnsure } from "./ensure-team-attached.js";

export type SweepCounts = { attached: number; repaired: number; noop: number };

type Cma = {
  getOrganization(id: string): Promise<{
    getSpaces(q?: any): Promise<{ items: { sys: { id: string } }[] }>;
    getTeamSpaceMemberships(q: any): Promise<{ items: any[] }>;
  }>;
  getSpace(id: string): Promise<{
    sys: { id: string };
    createTeamSpaceMembership(teamId: string, p: any): Promise<any>;
  }>;
};

export async function sweep(
  cma: Cma,
  orgId: string,
  teamId: string,
  consoleSpaceId: string,
  ensure: (args: EnsureArgs) => Promise<FanoutResult> = defaultEnsure
): Promise<SweepCounts> {
  const org = await cma.getOrganization(orgId);
  const spaces = (await org.getSpaces()).items;
  const counts: SweepCounts = { attached: 0, repaired: 0, noop: 0 };
  for (const s of spaces) {
    if (s.sys.id === consoleSpaceId) continue;
    const space = await cma.getSpace(s.sys.id);
    const r: FanoutResult = await ensure({ org: org as any, space: space as any, teamId });
    if (r === "ATTACHED") counts.attached++;
    else if (r === "REPAIRED") counts.repaired++;
    else counts.noop++;
  }
  return counts;
}
