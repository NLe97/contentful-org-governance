// One-off: forcibly restore the substituted membership 033k3wX2ogMs2jbwSeFxBy
// in Ben Test back to admin:true / roles:[].
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { restoreMembership } from "../lib/freeze/substitute.js";

const PAT = process.env.CF_DEV_PAT!;
const cma = createClient({ accessToken: PAT });
const space = await cma.getSpace("hgnalq3865je");
await restoreMembership(space as any, "033k3wX2ogMs2jbwSeFxBy", { originalRoleId: "admin-builtin", substitutedRoleId: "033k3uu9UHLErhDNIxHg0R" });
console.log("restored");
