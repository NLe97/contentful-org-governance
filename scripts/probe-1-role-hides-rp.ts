// NOTE: contentful-management@11 ships a webpack-bundled CJS `main` that
// Node's ESM static-export detection can't introspect, so the named-export
// form `import { createClient } from "contentful-management"` fails at
// resolve time under Node ESM. The default-import + destructure shape below
// is functionally identical and is what Node accepts.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;

const PAT = process.env.CF_DEV_PAT;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";
// Ignore the literal "cleanup" sub-command when reading the space arg;
// otherwise `pnpm tsx <script> cleanup` would treat "cleanup" as a space ID.
const SPACE = (process.argv[2] && process.argv[2] !== "cleanup")
  ? process.argv[2]
  : "ubgf1y7ixw5q";
const ROLE_NAME = "probe-1-frozen-admin";

if (!PAT) { console.error("CF_DEV_PAT not set"); process.exit(2); }

const cma = createClient({ accessToken: PAT });

async function main() {
  const space = await cma.getSpace(SPACE);
  // NOTE: Roles are space-scoped in CMA, so we list via space.getRoles().
  // (Plan said `env.getRoles()` but that method does not exist on
  // Environment in contentful-management@11; using `space.getRoles()`
  // matches the cleanup() helper below.)
  const existing = (await space.getRoles()).items.find((r) => r.name === ROLE_NAME);
  if (existing) { await existing.delete(); console.log("deleted stale probe role"); }

  const role = await space.createRole({
    name: ROLE_NAME,
    description: "Probe-1: built-in Admin minus manageRoles",
    permissions: {
      ContentDelivery: "all",
      ContentModel: ["read"],
      EnvironmentAliases: "all",
      Environments: "all",
      Settings: "all",
      Tags: "all"
    },
    policies: [{ effect: "allow", actions: "all", constraint: { and: [] } }]
  } as any);

  console.log("Created role id:", role.sys.id);
  console.log("permissions echo:", JSON.stringify(role.permissions, null, 2));
  console.log(
    "\nMANUAL STEP: invite a throwaway Contentful user to space",
    SPACE,
    "with this role and confirm Settings → Roles & Permissions is hidden in the UI."
  );
  console.log("Clean up with: pnpm tsx scripts/probe-1-role-hides-rp.ts cleanup");
}

async function cleanup() {
  const space = await cma.getSpace(SPACE);
  const role = (await space.getRoles()).items.find((r) => r.name === ROLE_NAME);
  if (role) { await role.delete(); console.log("cleaned up"); } else { console.log("nothing to clean"); }
}

(process.argv.includes("cleanup") ? cleanup() : main()).catch((e) => { console.error(e); process.exit(1); });
