// Isolate: does upsertSpaceState({ substitutions: {...} }) actually persist?
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { upsertSpaceState, readSpaceState } from "../lib/content-model/space-state.js";

const PAT = process.env.CF_DEV_PAT!;
const CONSOLE = "ubgf1y7ixw5q";
const TARGET = "hgnalq3865je";

const cma = createClient({ accessToken: PAT });
const env = await (await cma.getSpace(CONSOLE)).getEnvironment("master");

console.log("STEP 1: write substitutions");
await upsertSpaceState(env as any, { spaceId: TARGET, substitutions: { "test-user": { originalRoleId: "admin-builtin", substitutedRoleId: "role-xyz" } } });
let s = await readSpaceState(env as any, TARGET);
console.log("after step 1, subs:", JSON.stringify(s?.fields?.substitutions?.["en-US"] ?? {}));

console.log("\nSTEP 2: write freezeStatus");
await upsertSpaceState(env as any, { spaceId: TARGET, freezeStatus: "FROZEN" });
s = await readSpaceState(env as any, TARGET);
console.log("after step 2, status:", s?.fields?.freezeStatus?.["en-US"]);
console.log("after step 2, subs:", JSON.stringify(s?.fields?.substitutions?.["en-US"] ?? {}));

console.log("\nSTEP 3: clear subs + write OFF");
await upsertSpaceState(env as any, { spaceId: TARGET, substitutions: {}, freezeStatus: "OFF" });
s = await readSpaceState(env as any, TARGET);
console.log("after step 3, status:", s?.fields?.freezeStatus?.["en-US"]);
console.log("after step 3, subs:", JSON.stringify(s?.fields?.substitutions?.["en-US"] ?? {}));
