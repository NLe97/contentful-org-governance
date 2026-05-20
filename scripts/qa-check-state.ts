// Read-only: prints the current freeze state + membership for Ben Test.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { readSpaceState } from "../lib/content-model/space-state.js";

const PAT = process.env.CF_DEV_PAT!;
const CONSOLE = "ubgf1y7ixw5q";
const TARGET = "hgnalq3865je";

const cma = createClient({ accessToken: PAT });
const env = await (await cma.getSpace(CONSOLE)).getEnvironment("master");
const s = await readSpaceState(env as any, TARGET);
console.log("Ben Test state:", s?.fields?.freezeStatus?.["en-US"] ?? "(none)");
console.log("subs:", JSON.stringify(s?.fields?.substitutions?.["en-US"] ?? {}));

const target = await cma.getSpace(TARGET);
const ms = await target.getSpaceMemberships();
console.log("memberships:", JSON.stringify(ms.items.map((m: any) => ({
  id: m.sys.id, userId: m.sys.user?.sys.id, admin: m.admin, roles: m.roles?.map((r: any) => r.sys.id) ?? [], fromTeam: !!m.sys.team
})), null, 2));
