import type { SubstitutionRecord } from "./substitute.js";
import type { Action } from "./state-machine.js";

export type RunDeps = {
  spaceId: string;
  actorUserId: string;
  frozenRoleName: string;
  space: any;
  enumerate(space: any, exclude: string): Promise<{ membershipId: string; userId: string }[]>;
  ensureRole(space: any, name: string): Promise<string>;
  substitute(space: any, membershipId: string, roleId: string): Promise<SubstitutionRecord>;
  restore(space: any, membershipId: string, rec: SubstitutionRecord): Promise<void>;
  writeState(patch: { freezeStatus?: string; substitutions?: Record<string, SubstitutionRecord>; customFrozenRoleId?: string; lastReconciledAt?: string }): Promise<void>;
  audit(event: { eventType: string; details?: Record<string, unknown> }): Promise<void>;
  priorSubstitutions?: Record<string, SubstitutionRecord>;
};

export async function runTransition(action: Action, d: RunDeps): Promise<void> {
  if (action === "freeze") {
    const roleId = await d.ensureRole(d.space, d.frozenRoleName);
    await d.writeState({ customFrozenRoleId: roleId });
    const admins = await d.enumerate(d.space, d.actorUserId);
    const substitutions: Record<string, SubstitutionRecord> = { ...(d.priorSubstitutions ?? {}) };
    const failed: string[] = [];
    for (const a of admins) {
      if (substitutions[a.userId]) continue;
      try {
        substitutions[a.userId] = await d.substitute(d.space, a.membershipId, roleId);
        await d.writeState({ substitutions });
      } catch (e) { failed.push(a.userId); }
    }
    if (failed.length === 0) {
      await d.writeState({ freezeStatus: "FROZEN", substitutions });
      await d.audit({ eventType: "SUBSTITUTION_APPLIED", details: { applied: Object.keys(substitutions).length } });
    } else {
      await d.writeState({ freezeStatus: "DEGRADED" });
      await d.audit({ eventType: "ERROR", details: { phase: "freeze", failedUserIds: failed } });
    }
    return;
  }
  const remaining: Record<string, SubstitutionRecord> = { ...(d.priorSubstitutions ?? {}) };
  for (const [userId, rec] of Object.entries(remaining)) {
    const membershipId = await findMembershipByUser(d.space, userId);
    if (!membershipId) { delete remaining[userId]; await d.writeState({ substitutions: remaining }); continue; }
    try {
      await d.restore(d.space, membershipId, rec);
      delete remaining[userId];
      await d.writeState({ substitutions: remaining });
    } catch (e) {
      await d.audit({ eventType: "ERROR", details: { phase: "thaw", userId } });
    }
  }
  if (Object.keys(remaining).length === 0) {
    await d.writeState({ freezeStatus: "OFF" });
    await d.audit({ eventType: "SUBSTITUTION_REVERTED" });
  } else {
    await d.writeState({ freezeStatus: "DEGRADED" });
  }
}

async function findMembershipByUser(space: any, userId: string): Promise<string | undefined> {
  if (!space.getSpaceMemberships) return undefined;
  const r = await space.getSpaceMemberships({ "sys.user.sys.id": userId });
  return r.items[0]?.sys.id;
}
