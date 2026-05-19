import type { FanoutResult } from "./ensure-team-attached";
import { ensureTeamAttached as defaultEnsure } from "./ensure-team-attached";

export type SweepCounts = { attached: number; repaired: number; noop: number };

export async function sweep(
  org: { getSpaces(): Promise<{ items: { sys: { id: string } }[] }> } & Parameters<typeof defaultEnsure>[0],
  teamId: string,
  consoleSpaceId: string,
  ensure: typeof defaultEnsure = defaultEnsure
): Promise<SweepCounts> {
  const spaces = (await org.getSpaces()).items;
  const counts: SweepCounts = { attached: 0, repaired: 0, noop: 0 };
  for (const s of spaces) {
    if (s.sys.id === consoleSpaceId) continue;
    const r: FanoutResult = await ensure(org as any, teamId, s.sys.id);
    if (r === "ATTACHED") counts.attached++;
    else if (r === "REPAIRED") counts.repaired++;
    else counts.noop++;
  }
  return counts;
}
