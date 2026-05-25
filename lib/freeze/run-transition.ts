import type { SubstitutionRecord } from "./substitute.js";
import type { Action } from "./state-machine.js";
import type { TeamAdminMembership } from "./team-admins.js";

// `substitutions` is a polymorphic map persisted on spaceState.fields.substitutions
// (typed Object). Two kinds of entries live here:
//   - User substitution: key = userId, value = { originalRoleId, substitutedRoleId }
//   - Team detachment:   key = `team:${teamId}`, value = { kind: "team", teamId }
// The discriminator is the key prefix; the `kind` field is informational.
// Older spaceState entries from before this change only contain user records,
// none of which have a `team:` prefix — so backward-compat is automatic.
export const TEAM_KEY_PREFIX = "team:";
export type TeamDetachmentRecord = { kind: "team"; teamId: string };
export type SubstitutionMap = Record<string, SubstitutionRecord | TeamDetachmentRecord>;

export type RunDeps = {
  spaceId: string;
  actorUserId: string;
  frozenRoleName: string;
  space: any;
  enumerate(space: any, exclude: string): Promise<{ membershipId: string; userId: string }[]>;
  ensureRole(space: any, name: string): Promise<string>;
  substitute(space: any, membershipId: string, roleId: string): Promise<SubstitutionRecord>;
  restore(space: any, membershipId: string, rec: SubstitutionRecord): Promise<void>;
  writeState(patch: { freezeStatus?: string; substitutions?: SubstitutionMap; customFrozenRoleId?: string; lastReconciledAt?: string }): Promise<void>;
  audit(event: { eventType: string; details?: Record<string, unknown> }): Promise<void>;
  priorSubstitutions?: SubstitutionMap;
  // Team-admin phase (optional for callers that don't have an org handle yet
  // — keeps existing tests + thaw-from-old-state working).
  org?: any;
  protectedTeamId?: string;
  enumerateAdminTeams?(org: any, spaceId: string, protectedTeamId: string | undefined): Promise<TeamAdminMembership[]>;
  detachTeam?(space: any, teamMembershipId: string): Promise<void>;
  reattachTeam?(space: any, teamId: string): Promise<void>;
};

function isTeamRecord(rec: unknown): rec is TeamDetachmentRecord {
  return typeof rec === "object" && rec !== null && (rec as any).kind === "team";
}

export async function runTransition(action: Action, d: RunDeps): Promise<void> {
  if (action === "freeze") {
    const roleId = await d.ensureRole(d.space, d.frozenRoleName);
    await d.writeState({ customFrozenRoleId: roleId });
    const admins = await d.enumerate(d.space, d.actorUserId);
    const substitutions: SubstitutionMap = { ...(d.priorSubstitutions ?? {}) };
    const failed: string[] = [];
    for (const a of admins) {
      if (substitutions[a.userId]) continue;
      try {
        substitutions[a.userId] = await d.substitute(d.space, a.membershipId, roleId);
        await d.writeState({ substitutions });
      } catch (e) { failed.push(a.userId); }
    }
    // Team-detach phase. Skipped if the caller didn't wire the helpers
    // (e.g., unit tests that pre-date this feature).
    const failedTeams: string[] = [];
    if (d.org && d.enumerateAdminTeams && d.detachTeam) {
      const teams = await d.enumerateAdminTeams(d.org, d.spaceId, d.protectedTeamId);
      for (const t of teams) {
        const key = TEAM_KEY_PREFIX + t.teamId;
        if (substitutions[key]) continue;
        try {
          await d.detachTeam(d.space, t.teamMembershipId);
          substitutions[key] = { kind: "team", teamId: t.teamId };
          await d.writeState({ substitutions });
        } catch (e) { failedTeams.push(t.teamId); }
      }
    }
    if (failed.length === 0 && failedTeams.length === 0) {
      await d.writeState({ freezeStatus: "FROZEN", substitutions });
      await d.audit({
        eventType: "SUBSTITUTION_APPLIED",
        details: {
          applied: Object.keys(substitutions).filter((k) => !k.startsWith(TEAM_KEY_PREFIX)).length,
          teamsDetached: Object.keys(substitutions).filter((k) => k.startsWith(TEAM_KEY_PREFIX)).length
        }
      });
    } else {
      await d.writeState({ freezeStatus: "DEGRADED" });
      await d.audit({ eventType: "ERROR", details: { phase: "freeze", failedUserIds: failed, failedTeamIds: failedTeams } });
    }
    return;
  }
  // Thaw phase: user restore loop, then team reattach loop.
  const remaining: SubstitutionMap = { ...(d.priorSubstitutions ?? {}) };
  for (const [key, rec] of Object.entries(remaining)) {
    if (key.startsWith(TEAM_KEY_PREFIX)) continue;
    const userId = key;
    const membershipId = await findMembershipByUser(d.space, userId);
    if (!membershipId) { delete remaining[key]; await d.writeState({ substitutions: remaining }); continue; }
    try {
      await d.restore(d.space, membershipId, rec as SubstitutionRecord);
      delete remaining[key];
      await d.writeState({ substitutions: remaining });
    } catch (e) {
      await d.audit({ eventType: "ERROR", details: { phase: "thaw", userId } });
    }
  }
  if (d.reattachTeam) {
    for (const [key, rec] of Object.entries(remaining)) {
      if (!key.startsWith(TEAM_KEY_PREFIX)) continue;
      if (!isTeamRecord(rec)) { delete remaining[key]; await d.writeState({ substitutions: remaining }); continue; }
      try {
        await d.reattachTeam(d.space, rec.teamId);
        delete remaining[key];
        await d.writeState({ substitutions: remaining });
      } catch (e) {
        await d.audit({ eventType: "ERROR", details: { phase: "thaw", teamId: rec.teamId } });
      }
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
