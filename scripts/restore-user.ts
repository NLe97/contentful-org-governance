// One-off: forcibly restore a substituted membership back to admin:true / roles:[].
// Env: CONTENTFUL_MANAGEMENT_TOKEN, CF_TARGET_SPACE_ID, CF_MEMBERSHIP_ID,
//      CF_FROZEN_ROLE_ID (the role we substituted them with, for the record).
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { restoreMembership } from "../lib/freeze/substitute.js";

function reqEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}
const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN", process.env.CF_DEV_PAT);
const TARGET = reqEnv("CF_TARGET_SPACE_ID");
const MEMBERSHIP = reqEnv("CF_MEMBERSHIP_ID");
const FROZEN_ROLE = reqEnv("CF_FROZEN_ROLE_ID");

const cma = createClient({ accessToken: PAT });
const space = await cma.getSpace(TARGET);
await restoreMembership(space as any, MEMBERSHIP, { originalRoleId: "admin-builtin", substitutedRoleId: FROZEN_ROLE });
console.log("restored");
