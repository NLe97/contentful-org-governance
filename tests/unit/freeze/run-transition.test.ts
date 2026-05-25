import { describe, it, expect, vi } from "vitest";
import { runTransition, TEAM_KEY_PREFIX } from "@/lib/freeze/run-transition";

describe("runTransition (freeze)", () => {
  it("substitutes each admin, records in state, marks FROZEN on success", async () => {
    const space = {} as any;
    const enumerate = vi.fn().mockResolvedValue([{ membershipId: "m1", userId: "u1" }, { membershipId: "m2", userId: "u2" }]);
    const ensureRole = vi.fn().mockResolvedValue("rFrozen");
    const substitute = vi.fn().mockResolvedValue({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
    const writeState = vi.fn();
    const audit = vi.fn();

    await runTransition("freeze", {
      spaceId: "sX", actorUserId: "uActor", frozenRoleName: "FR",
      space, enumerate, ensureRole, substitute, restore: vi.fn(), writeState, audit
    });

    expect(ensureRole).toHaveBeenCalledWith(space, "FR");
    expect(substitute).toHaveBeenCalledTimes(2);
    const writes = writeState.mock.calls.map((c) => c[0]);
    const final = writes[writes.length - 1];
    expect(final.freezeStatus).toBe("FROZEN");
    expect(final.substitutions).toEqual({
      u1: { originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" },
      u2: { originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" }
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "SUBSTITUTION_APPLIED" }));
  });

  it("also detaches admin teams (excluding protected) when org helpers wired", async () => {
    const space = {} as any;
    const org = { stub: true } as any;
    const enumerate = vi.fn().mockResolvedValue([{ membershipId: "m1", userId: "u1" }]);
    const ensureRole = vi.fn().mockResolvedValue("rFrozen");
    const substitute = vi.fn().mockResolvedValue({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
    const enumerateAdminTeams = vi.fn().mockResolvedValue([{ teamId: "tEditors", teamMembershipId: "tsm-e" }]);
    const detachTeam = vi.fn().mockResolvedValue(undefined);
    const writeState = vi.fn();
    const audit = vi.fn();

    await runTransition("freeze", {
      spaceId: "sX", actorUserId: "uActor", frozenRoleName: "FR",
      space, enumerate, ensureRole, substitute, restore: vi.fn(),
      org, protectedTeamId: "tOrgAdmins", enumerateAdminTeams, detachTeam, reattachTeam: vi.fn(),
      writeState, audit
    });

    expect(enumerateAdminTeams).toHaveBeenCalledWith(org, "sX", "tOrgAdmins");
    expect(detachTeam).toHaveBeenCalledWith(space, "tsm-e");
    const final = writeState.mock.calls.at(-1)![0];
    expect(final.freezeStatus).toBe("FROZEN");
    expect(final.substitutions[TEAM_KEY_PREFIX + "tEditors"]).toEqual({ kind: "team", teamId: "tEditors" });
    expect(final.substitutions.u1).toEqual({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "SUBSTITUTION_APPLIED",
      details: expect.objectContaining({ applied: 1, teamsDetached: 1 })
    }));
  });

  it("reattaches detached teams on thaw", async () => {
    const space = { getSpaceMemberships: vi.fn(async () => ({ items: [] })) } as any;
    const org = { stub: true } as any;
    const reattachTeam = vi.fn().mockResolvedValue(undefined);
    const writeState = vi.fn();
    const audit = vi.fn();

    await runTransition("thaw", {
      spaceId: "sX", actorUserId: "uActor", frozenRoleName: "FR",
      space,
      enumerate: vi.fn(), ensureRole: vi.fn(), substitute: vi.fn(),
      restore: vi.fn(),
      org, enumerateAdminTeams: vi.fn(), detachTeam: vi.fn(), reattachTeam,
      writeState, audit,
      priorSubstitutions: { [TEAM_KEY_PREFIX + "tEditors"]: { kind: "team", teamId: "tEditors" } } as any
    });

    expect(reattachTeam).toHaveBeenCalledWith(space, "tEditors");
    const final = writeState.mock.calls.at(-1)![0];
    expect(final.freezeStatus).toBe("OFF");
  });

  it("marks DEGRADED if a user fails", async () => {
    const space = {} as any;
    const enumerate = vi.fn().mockResolvedValue([{ membershipId: "m1", userId: "u1" }, { membershipId: "m2", userId: "u2" }]);
    const ensureRole = vi.fn().mockResolvedValue("rFrozen");
    const substitute = vi.fn()
      .mockResolvedValueOnce({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" })
      .mockRejectedValueOnce(new Error("boom"));
    const writeState = vi.fn();
    const audit = vi.fn();

    await runTransition("freeze", {
      spaceId: "sX", actorUserId: "uActor", frozenRoleName: "FR",
      space, enumerate, ensureRole, substitute, restore: vi.fn(), writeState, audit
    });

    const final = writeState.mock.calls.at(-1)![0];
    expect(final.freezeStatus).toBe("DEGRADED");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ERROR" }));
  });
});
