import { describe, it, expect, beforeAll, afterAll } from "vitest";
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { ensureFrozenRole } from "@/lib/freeze/ensure-frozen-role";
import { enumerateSpaceAdmins } from "@/lib/freeze/enumerate-admins";
import { substituteMembership, restoreMembership } from "@/lib/freeze/substitute";
import { enumerateAdminTeams, detachTeam, reattachTeam } from "@/lib/freeze/team-admins";
import { runTransition, TEAM_KEY_PREFIX } from "@/lib/freeze/run-transition";
import { readConfig } from "@/lib/content-model/governance-config";

// Stress check: drive the same code paths /api/toggle-freeze uses to
// freeze TWO scratch spaces concurrently, then thaw both, verifying
// isolated state per space and clean restoration. Avoids the live HTTP
// surface so we don't need signed-iframe requests — we exercise the
// underlying freeze pipeline directly.
//
// Gated on CF_INTEGRATION=1. Required env:
//   CF_DEV_PAT          — PAT with org admin/owner on CF_TARGET_ORG
//   CF_TARGET_ORG       — defaults to the dev demo org
//   CF_ACTOR_USER_ID    — userId of the "actor" pressing freeze (skipped
//                         during enumerate so they don't get substituted)
//
// Creates two temporary spaces, exercises freeze + thaw on each, then
// deletes both. ~30–60s end-to-end against the live CMA.

const RUN = process.env.CF_INTEGRATION === "1";
const PAT = process.env.CF_DEV_PAT!;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";
const ACTOR = process.env.CF_ACTOR_USER_ID ?? "stress-test-actor";
// Where this test reads the protected team ID from. Either explicit env
// override, or fall back to the live governanceConfig in the console
// space (mirrors what api/toggle-freeze does in production).
const CONSOLE_SPACE = process.env.CF_CONSOLE_SPACE_ID;

describe.runIf(RUN)("integration — multi-space freeze stress", () => {
  let cma: any;
  let protectedTeamId: string | undefined;
  const created: { id: string }[] = [];

  beforeAll(async () => {
    cma = createClient({ accessToken: PAT });
    protectedTeamId = process.env.CF_PROTECTED_TEAM_ID;
    if (!protectedTeamId && CONSOLE_SPACE) {
      try {
        const env = await (await cma.getSpace(CONSOLE_SPACE)).getEnvironment("master");
        const cfg = await readConfig(env as any);
        protectedTeamId = cfg?.fields?.orgAdminsTeamId?.["en-US"];
      } catch { /* fall through — test will surface a useful error if the team isn't actually protected */ }
    }
  });

  afterAll(async () => {
    for (const s of created) {
      try { await (await cma.getSpace(s.id)).delete(); } catch { /* best-effort cleanup */ }
    }
  });

  it("freezes two spaces in parallel, each tracks state independently, both thaw cleanly", async () => {
    // Create two scratch spaces. Done sequentially because space creation
    // through CMA briefly contends on org-level concurrency.
    const stamp = Date.now();
    const a = await cma.createSpace({ name: `gov-stress-a-${stamp}`, defaultLocale: "en-US" }, ORG);
    created.push({ id: a.sys.id });
    const b = await cma.createSpace({ name: `gov-stress-b-${stamp}`, defaultLocale: "en-US" }, ORG);
    created.push({ id: b.sys.id });

    const org = await cma.getOrganization(ORG);
    const spaceA = await cma.getSpace(a.sys.id);
    const spaceB = await cma.getSpace(b.sys.id);

    // Capture per-space transition state via tiny in-memory store so we
    // can inspect substitutions/audits after the run.
    function makeStore() {
      const state: Record<string, unknown> = {};
      const audits: { eventType: string; details?: unknown }[] = [];
      return {
        state,
        audits,
        writeState: async (patch: Record<string, unknown>) => { Object.assign(state, patch); },
        audit: async (ev: { eventType: string; details?: unknown }) => { audits.push(ev); }
      };
    }
    const stA = makeStore();
    const stB = makeStore();

    // FREEZE: run both transitions in parallel.
    await Promise.all([
      runTransition("freeze", {
        spaceId: a.sys.id, actorUserId: ACTOR, frozenRoleName: "Stress Frozen Role",
        space: spaceA, org,
        enumerate: enumerateSpaceAdmins, ensureRole: ensureFrozenRole,
        substitute: substituteMembership, restore: restoreMembership,
        enumerateAdminTeams, detachTeam, reattachTeam, protectedTeamId,
        writeState: stA.writeState, audit: stA.audit
      }),
      runTransition("freeze", {
        spaceId: b.sys.id, actorUserId: ACTOR, frozenRoleName: "Stress Frozen Role",
        space: spaceB, org,
        enumerate: enumerateSpaceAdmins, ensureRole: ensureFrozenRole,
        substitute: substituteMembership, restore: restoreMembership,
        enumerateAdminTeams, detachTeam, reattachTeam, protectedTeamId,
        writeState: stB.writeState, audit: stB.audit
      })
    ]);

    if (stA.state.freezeStatus !== "FROZEN" || stB.state.freezeStatus !== "FROZEN") {
      console.error("FREEZE A:", JSON.stringify({ state: stA.state, audits: stA.audits }, null, 2));
      console.error("FREEZE B:", JSON.stringify({ state: stB.state, audits: stB.audits }, null, 2));
    }
    expect(stA.state.freezeStatus).toBe("FROZEN");
    expect(stB.state.freezeStatus).toBe("FROZEN");
    expect(stA.state.customFrozenRoleId).toBeTruthy();
    expect(stB.state.customFrozenRoleId).toBeTruthy();
    // Each space gets its own frozen role — IDs must differ.
    expect(stA.state.customFrozenRoleId).not.toBe(stB.state.customFrozenRoleId);

    // Both should record SUBSTITUTION_APPLIED (even with zero admins, the
    // loop completes successfully — applied/teamsDetached can be 0).
    expect(stA.audits.some((a) => a.eventType === "SUBSTITUTION_APPLIED")).toBe(true);
    expect(stB.audits.some((a) => a.eventType === "SUBSTITUTION_APPLIED")).toBe(true);

    // THAW: prior substitutions are passed through to the thaw transition.
    const stAThaw = makeStore();
    const stBThaw = makeStore();
    await Promise.all([
      runTransition("thaw", {
        spaceId: a.sys.id, actorUserId: ACTOR, frozenRoleName: "Stress Frozen Role",
        space: spaceA, org,
        enumerate: enumerateSpaceAdmins, ensureRole: ensureFrozenRole,
        substitute: substituteMembership, restore: restoreMembership,
        enumerateAdminTeams, detachTeam, reattachTeam,
        writeState: stAThaw.writeState, audit: stAThaw.audit,
        priorSubstitutions: (stA.state.substitutions as any) ?? {}
      }),
      runTransition("thaw", {
        spaceId: b.sys.id, actorUserId: ACTOR, frozenRoleName: "Stress Frozen Role",
        space: spaceB, org,
        enumerate: enumerateSpaceAdmins, ensureRole: ensureFrozenRole,
        substitute: substituteMembership, restore: restoreMembership,
        enumerateAdminTeams, detachTeam, reattachTeam,
        writeState: stBThaw.writeState, audit: stBThaw.audit,
        priorSubstitutions: (stB.state.substitutions as any) ?? {}
      })
    ]);

    expect(stAThaw.state.freezeStatus).toBe("OFF");
    expect(stBThaw.state.freezeStatus).toBe("OFF");
    expect(stAThaw.audits.some((a) => a.eventType === "SUBSTITUTION_REVERTED")).toBe(true);
    expect(stBThaw.audits.some((a) => a.eventType === "SUBSTITUTION_REVERTED")).toBe(true);

    // Sanity: thaw should have removed all entries (including any
    // team:<id> keys) from each space's substitutions map.
    const subsA = (stAThaw.state.substitutions ?? {}) as Record<string, unknown>;
    const subsB = (stBThaw.state.substitutions ?? {}) as Record<string, unknown>;
    expect(Object.keys(subsA).filter((k) => k.startsWith(TEAM_KEY_PREFIX))).toHaveLength(0);
    expect(Object.keys(subsB).filter((k) => k.startsWith(TEAM_KEY_PREFIX))).toHaveLength(0);
  }, 180_000);
});
