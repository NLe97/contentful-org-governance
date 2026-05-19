import { describe, it, expect, vi } from "vitest";
import { runTransition } from "@/lib/freeze/run-transition";

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
