// Read-only org-wide scan for users left stuck on a frozen role despite
// spaceState reporting freezeStatus != FROZEN. Symptom of the
// findMembershipByUser filter bug — thaw "succeeded" against the wrong
// membership and left the real target on the frozen role.
//
// Env: CONTENTFUL_MANAGEMENT_TOKEN, CF_ORG_ID, CF_CONSOLE_SPACE_ID.
//
// Output per stuck user (one per line):
//   STUCK spaceId=<id> spaceName=<name> membershipId=<id> userId=<id>
//     frozenRoleId=<id> frozenRoleName=<name>
// Exit code 0 = clean. >0 = number of stuck users found.

import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { readSpaceState } from "../lib/content-model/space-state.js";

function reqEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}

const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN", process.env.CF_DEV_PAT);
const ORG = reqEnv("CF_ORG_ID");
const CONSOLE = reqEnv("CF_CONSOLE_SPACE_ID");

const cma = createClient({ accessToken: PAT });
const org = await (cma as any).getOrganization(ORG);
const consoleEnv = await (await (cma as any).getSpace(CONSOLE)).getEnvironment("master");

const spaces = (await org.getSpaces({ limit: 1000 } as any)).items
  .filter((s: any) => s.sys.id !== CONSOLE);

let stuckCount = 0;
for (const s of spaces) {
  const spaceId = s.sys.id;
  const spaceName = s.name;
  const state = await readSpaceState(consoleEnv as any, spaceId);
  const freezeStatus = state?.fields?.freezeStatus?.["en-US"] ?? "(no-state)";
  const space = await (cma as any).getSpace(spaceId);
  // Find every role that has "frozen" in its name (case-insensitive) — the
  // app creates these per space as "Space Admin (frozen)" or whatever was
  // configured in governanceConfig.frozenRoleName.
  const roles = (await space.getRoles()).items;
  const frozenRoles = roles.filter((r: any) => /frozen/i.test(r.name));
  if (frozenRoles.length === 0) continue;
  const frozenRoleIds = new Set(frozenRoles.map((r: any) => r.sys.id));

  // Walk all space_memberships (no filter — the CMA filter is silently
  // ignored in v11) and find any directly-assigned (non-team) membership
  // on a frozen role.
  const ms = await space.getSpaceMemberships();
  for (const m of ms.items) {
    if (m.sys.team) continue;
    const userId = m.sys.user?.sys?.id;
    const roleIds: string[] = (m.roles ?? []).map((r: any) => r.sys.id);
    const onFrozen = roleIds.find((rid) => frozenRoleIds.has(rid));
    if (!onFrozen) continue;
    if (freezeStatus === "FROZEN" || freezeStatus === "TRANSITIONING_ON") {
      // Expected — the space is currently frozen, user is supposed to be substituted.
      continue;
    }
    const frozenRole = frozenRoles.find((r: any) => r.sys.id === onFrozen);
    console.log(
      `STUCK spaceId=${spaceId} spaceName="${spaceName}" status=${freezeStatus} ` +
      `membershipId=${m.sys.id} userId=${userId} ` +
      `frozenRoleId=${onFrozen} frozenRoleName="${frozenRole?.name}"`
    );
    stuckCount++;
  }
}

console.log(`---\nScan complete. Stuck users: ${stuckCount}.`);
process.exit(stuckCount);
