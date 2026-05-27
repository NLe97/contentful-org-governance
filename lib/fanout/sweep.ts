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
// Bounded concurrency so we don't burst above Contentful's CMA rate limit
// (currently 7 req/s steady, 78 req/s burst per token). 5 in flight gives
// us comfortable headroom while still cutting sweep time by ~5x for
// realistic org sizes.
const CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

export async function sweep(
  cma: Cma,
  orgId: string,
  teamId: string,
  consoleSpaceId: string,
  ensure: (args: EnsureArgs) => Promise<FanoutResult> = defaultEnsure,
  org?: any
): Promise<SweepCounts> {
  // Caller may pass an already-fetched org handle to save a duplicate
  // getOrganization call (bootstrap.ts has one).
  const orgHandle: any = org ?? (await withRetry(() => cma.getOrganization(orgId), RETRY));
  // CMA list responses cap at limit=1000; well above any realistic org's
  // space count today, but bump if you ever exceed that.
  const spaces: any[] = (await withRetry<any>(() => orgHandle.getSpaces({ limit: 1000 } as any), RETRY)).items
    .filter((s: any) => s.sys.id !== consoleSpaceId);
  const counts: SweepCounts = { attached: 0, repaired: 0, noop: 0, failed: 0 };
  await mapWithConcurrency(spaces, CONCURRENCY, async (s: any) => {
    try {
      const space = await withRetry(() => cma.getSpace(s.sys.id), RETRY);
      const r: FanoutResult = await withRetry(
        () => ensure({ org: orgHandle as any, space: space as any, teamId }),
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
  });
  return counts;
}
