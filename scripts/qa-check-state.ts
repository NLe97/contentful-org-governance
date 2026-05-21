// Read-only: prints the current freeze state + membership for a target space.
// Env: CONTENTFUL_MANAGEMENT_TOKEN, CF_CONSOLE_SPACE_ID, CF_TARGET_SPACE_ID.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { readSpaceState } from "../lib/content-model/space-state.js";

function reqEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}
const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN", process.env.CF_DEV_PAT);
const CONSOLE = reqEnv("CF_CONSOLE_SPACE_ID");
const TARGET = reqEnv("CF_TARGET_SPACE_ID");

const cma = createClient({ accessToken: PAT });
const env = await (await cma.getSpace(CONSOLE)).getEnvironment("master");
const s = await readSpaceState(env as any, TARGET);
console.log(`${TARGET} state:`, s?.fields?.freezeStatus?.["en-US"] ?? "(none)");
console.log("subs:", JSON.stringify(s?.fields?.substitutions?.["en-US"] ?? {}));

const target = await cma.getSpace(TARGET);
const ms = await target.getSpaceMemberships();
console.log("memberships:", JSON.stringify(ms.items.map((m: any) => ({
  id: m.sys.id, userId: m.sys.user?.sys.id, admin: m.admin, roles: m.roles?.map((r: any) => r.sys.id) ?? [], fromTeam: !!m.sys.team
})), null, 2));
