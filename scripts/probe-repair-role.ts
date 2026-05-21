// Force-repair the "Space Admin (frozen)" role in Ben Test to the read-only
// shape, by calling ensureFrozenRole. Prints permissions before + after.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { ensureFrozenRole } from "../lib/freeze/ensure-frozen-role.js";

const PAT = process.env.CF_DEV_PAT!;
const TARGET = "hgnalq3865je";
const cma = createClient({ accessToken: PAT });

const space = await cma.getSpace(TARGET);
const before = await space.getRoles();
const stale = before.items.find((r) => r.name === "Space Admin (frozen)");
console.log("BEFORE:", JSON.stringify(stale?.permissions, null, 2));
console.log("BEFORE policies count:", stale?.policies?.length ?? 0);

const id = await ensureFrozenRole(space as any, "Space Admin (frozen)");
console.log("ensureFrozenRole returned:", id);

const after = await space.getRoles();
const fresh = after.items.find((r) => r.sys.id === id);
console.log("AFTER:", JSON.stringify(fresh?.permissions, null, 2));
console.log("AFTER policies:", JSON.stringify(fresh?.policies, null, 2));
