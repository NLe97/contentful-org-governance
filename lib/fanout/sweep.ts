import type { FanoutResult, EnsureArgs } from "./ensure-team-attached.js";
import { ensureTeamAttached as defaultEnsure } from "./ensure-team-attached.js";
import { withRetry } from "../cma/rate-limit.js";

export type SweepCounts = { attached: number; repaired: number; noop: number; failed: number };

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

const RETRY = { maxAttempts: 5, baseMs: 300 };

export async function sweep(
  cma: Cma,
  orgId: string,
  teamId: string,
  consoleSpaceId: string,
  ensure: (args: EnsureArgs) => Promise<FanoutResult> = defaultEnsure
): Promise<SweepCounts> {
  const org = await withRetry(() => cma.getOrganization(orgId), RETRY);
  // CMA list responses cap at limit=1000; well above any realistic org's
  // space count today, but bump if you ever exceed that.
  const spaces = (await withRetry(() => org.getSpaces({ limit: 1000 } as any), RETRY)).items;
  const counts: SweepCounts = { attached: 0, repaired: 0, noop: 0, failed: 0 };
  for (const s of spaces) {
    if (s.sys.id === consoleSpaceId) continue;
    try {
      const space = await withRetry(() => cma.getSpace(s.sys.id), RETRY);
      const r: FanoutResult = await withRetry(
        () => ensure({ org: org as any, space: space as any, teamId }),
        RETRY
      );
      if (r === "ATTACHED") counts.attached++;
      else if (r === "REPAIRED") counts.repaired++;
      else counts.noop++;
    } catch {
      // One bad space (deleted mid-sweep, permission gap, etc.) should not
      // abort the whole sweep — count + continue.
      counts.failed++;
    }
  }
  return counts;
}
