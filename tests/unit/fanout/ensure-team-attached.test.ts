import { describe, it, expect, vi } from "vitest";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";

function fakeOrg(initial: any[]) {
  return {
    getTeamSpaceMemberships: vi.fn(async (q: any) => ({
      items: initial.filter((m) => m.team === q.teamId && m.space === q.spaceId)
    }))
  } as any;
}

function fakeSpace(spaceId: string) {
  return {
    sys: { id: spaceId },
    createTeamSpaceMembership: vi.fn(async (teamId: string) => ({ sys: { id: `tsm-${teamId}-${spaceId}` } }))
  } as any;
}

describe("ensureTeamAttached", () => {
  it("creates membership when none exists", async () => {
    const org = fakeOrg([]);
    const space = fakeSpace("sX");
    const r = await ensureTeamAttached({ org, space, teamId: "tA" });
    expect(r).toBe("ATTACHED");
    expect(space.createTeamSpaceMembership).toHaveBeenCalledOnce();
  });

  it("no-ops when admin membership exists", async () => {
    const org = fakeOrg([{ team: "tA", space: "sX", admin: true }]);
    const space = fakeSpace("sX");
    const r = await ensureTeamAttached({ org, space, teamId: "tA" });
    expect(r).toBe("NO_OP");
    expect(space.createTeamSpaceMembership).not.toHaveBeenCalled();
  });
});
