// Probe: runs the same checkOrgAdmin logic that /api/me uses, against the
// real org, for a set of known user IDs. Confirms the gate would correctly
// allow Org Admins and deny Space Admins.
// Env: CONTENTFUL_MANAGEMENT_TOKEN, CF_ORG_ID, optional CF_USER_IDS (comma-
// separated). Defaults to checking the two known users in Ben's demo org.

import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;
import { checkOrgAdmin } from "../lib/auth/check-org-admin.js";

function reqEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}
const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN", process.env.CF_DEV_PAT);
const ORG = reqEnv("CF_ORG_ID");
const USERS = (process.env.CF_USER_IDS ?? "79NtAR8RbesjN1TmF2dOa2,3Zq7UAewC2yDy33prQXEEX").split(",");

const cma = createClient({ accessToken: PAT });
const org = await cma.getOrganization(ORG);

// Also dump the full org membership for each so we can see their actual role.
const allMemberships = await (org as any).getOrganizationMemberships({ limit: 200 });

for (const userId of USERS) {
  console.log(`\n=== user ${userId} ===`);
  const m = allMemberships.items.find((mm: any) => mm.sys.user?.sys?.id === userId);
  console.log("org role:", m?.role ?? "(not a member)");

  try {
    await checkOrgAdmin(org as any, userId);
    console.log("checkOrgAdmin: ALLOW (would return isOrgAdmin: true → PageConsole renders)");
  } catch (e: any) {
    console.log("checkOrgAdmin: DENY (would return isOrgAdmin: false → Restricted renders)");
    console.log("  reason:", e.message);
  }
}
