// QA script — runs the freeze + thaw transition end-to-end against the live
// CMA, using the same lib code that the Vercel backend uses. Bypasses the
// signed-request layer so we can verify the actual freeze logic in isolation.

import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { runTransition } from "../lib/freeze/run-transition.js";
import { ensureFrozenRole } from "../lib/freeze/ensure-frozen-role.js";
import { enumerateSpaceAdmins } from "../lib/freeze/enumerate-admins.js";
import { substituteMembership, restoreMembership } from "../lib/freeze/substitute.js";
import { upsertSpaceState, readSpaceState } from "../lib/content-model/space-state.js";
import { appendAudit } from "../lib/content-model/audit-event.js";

const PAT = process.env.CF_DEV_PAT!;
const ORG = "30SScScam27l3EU95xxctv";
const CONSOLE = "ubgf1y7ixw5q";   // Jobs
const TARGET = "hgnalq3865je";    // Ben Test
const ACTOR = "79NtAR8RbesjN1TmF2dOa2";

const cma = createClient({ accessToken: PAT });

async function readBenTestRoles() {
  const space = await cma.getSpace(TARGET);
  const roles = await space.getRoles();
  return roles.items.map((r) => ({ id: r.sys.id, name: r.name }));
}

async function readBenTestMemberships() {
  const space = await cma.getSpace(TARGET);
  const ms = await space.getSpaceMemberships();
  return ms.items.map((m: any) => ({
    membershipId: m.sys.id,
    userId: m.sys.user?.sys.id,
    fromTeam: !!m.sys.team,
    admin: m.admin,
    roles: m.roles?.map((r: any) => r.sys.id) ?? []
  }));
}

async function run(action: "freeze" | "thaw") {
  console.log(`\n=== ${action.toUpperCase()} on Ben Test ===`);

  const consoleSpace = await cma.getSpace(CONSOLE);
  const env = await consoleSpace.getEnvironment("master");
  const targetSpace = await cma.getSpace(TARGET);

  const prior = await readSpaceState(env as any, TARGET);
  const priorStatus = prior?.fields?.freezeStatus?.["en-US"] ?? "OFF";
  const priorSubs = prior?.fields?.substitutions?.["en-US"] ?? {};
  console.log("prior state:", priorStatus, "subs:", JSON.stringify(priorSubs));

  await upsertSpaceState(env as any, {
    spaceId: TARGET,
    freezeStatus: action === "freeze" ? "TRANSITIONING_ON" : "TRANSITIONING_OFF",
    frozenBy: ACTOR
  });
  console.log("wrote TRANSITIONING_*");

  await appendAudit(env as any, { eventType: "FREEZE_TOGGLED", spaceId: TARGET, actorUserId: ACTOR, details: { action } });

  try {
    await runTransition(action, {
      spaceId: TARGET,
      actorUserId: ACTOR,
      frozenRoleName: "Space Admin (frozen)",
      space: targetSpace as any,
      enumerate: enumerateSpaceAdmins as any,
      ensureRole: ensureFrozenRole as any,
      substitute: substituteMembership as any,
      restore: restoreMembership as any,
      writeState: async (patch) => { await upsertSpaceState(env as any, { spaceId: TARGET, ...patch } as any); },
      audit: async (ev) => { await appendAudit(env as any, { eventType: ev.eventType as any, spaceId: TARGET, actorUserId: "system", details: ev.details }); },
      priorSubstitutions: priorSubs
    });
  } catch (e: any) {
    console.log("runTransition THREW:", e.message);
  }

  const after = await readSpaceState(env as any, TARGET);
  console.log("final state:", after?.fields?.freezeStatus?.["en-US"]);
  console.log("final subs:", JSON.stringify(after?.fields?.substitutions?.["en-US"] ?? {}));
}

async function main() {
  console.log("=== Ben Test roles ===");
  console.log(await readBenTestRoles());
  console.log("\n=== Ben Test memberships ===");
  console.log(await readBenTestMemberships());

  await run("freeze");

  console.log("\n=== Ben Test memberships after freeze ===");
  console.log(await readBenTestMemberships());

  await run("thaw");

  console.log("\n=== Ben Test memberships after thaw ===");
  console.log(await readBenTestMemberships());

  console.log("\n=== Ben Test roles after thaw ===");
  console.log(await readBenTestRoles());
}

main().catch((e) => { console.error(e); process.exit(1); });
