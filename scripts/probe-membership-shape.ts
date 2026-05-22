// Dump the full membership list for the org so we can see what the filter
// is actually returning vs what's really there.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}
const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN");
const ORG = reqEnv("CF_ORG_ID");
const USER = reqEnv("CF_USER_ID");

const cma = createClient({ accessToken: PAT });
const org = await cma.getOrganization(ORG);

console.log("=== ALL memberships in org (limit 200) ===");
const all = await (org as any).getOrganizationMemberships({ limit: 200 });
for (const m of all.items) {
  console.log(`  id=${m.sys.id} role=${m.role} userId=${m.sys.user?.sys?.id ?? "(no user)"}`);
}

console.log(`\n=== FILTERED by sys.user.sys.id=${USER} (limit 10) ===`);
const filtered = await (org as any).getOrganizationMemberships({ "sys.user.sys.id": USER, limit: 10 });
console.log(`returned ${filtered.items.length} items`);
for (const m of filtered.items) {
  console.log(`  id=${m.sys.id} role=${m.role} userId=${m.sys.user?.sys?.id ?? "(no user)"}`);
}
