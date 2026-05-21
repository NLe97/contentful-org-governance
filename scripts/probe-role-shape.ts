// Probe: read Ben Test's built-in roles and dump their permissions shape,
// then try creating a candidate "read-only" role to see which permission
// vocab the CMA accepts in this realm.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;

function reqEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}
const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN", process.env.CF_DEV_PAT);
const TARGET = reqEnv("CF_TARGET_SPACE_ID");
const cma = createClient({ accessToken: PAT });

const space = await cma.getSpace(TARGET);
const roles = await space.getRoles();
for (const r of roles.items) {
  console.log("---", r.name, "---");
  console.log(JSON.stringify(r.permissions, null, 2));
  if (r.policies) console.log("policies:", JSON.stringify(r.policies, null, 2));
}
