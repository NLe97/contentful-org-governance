import { describe, it, expect, vi } from "vitest";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";

function fakeOrg(initial: any[]) {
  const items = [...initial];
  return {
    getTeamSpaceMemberships: vi.fn(async (q: any) =>
      ({ items: items.filter((m) => m.team === q["sys.team.sys.id"] && m.space === q["sys.space.sys.id"]) })),
    createTeamSpaceMembership: vi.fn(async (teamId: string, payload: any) => {
      const m = { sys: { id: `tsm${items.length + 1}` }, team: teamId, space: payload.sys.space.sys.id, admin: payload.admin };
      items.push(m); return m;
    })
  } as any;
}

describe("ensureTeamAttached", () => {
  it("creates membership when none exists", async () => {
    const org = fakeOrg([]);
    const r = await ensureTeamAttached(org, "tA", "sX");
    expect(r).toBe("ATTACHED");
    expect(org.createTeamSpaceMembership).toHaveBeenCalledOnce();
  });

  it("no-ops when admin membership exists", async () => {
    const org = fakeOrg([{ team: "tA", space: "sX", admin: true, sys: { id: "tsm0" } }]);
    const r = await ensureTeamAttached(org, "tA", "sX");
    expect(r).toBe("NO_OP");
    expect(org.createTeamSpaceMembership).not.toHaveBeenCalled();
  });
});
