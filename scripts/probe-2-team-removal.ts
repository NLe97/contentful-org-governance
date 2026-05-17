// NOTE: contentful-management@11 ships a webpack-bundled CJS `main` that
// Node's ESM static-export detection can't introspect, so the named-export
// form `import { createClient } from "contentful-management"` fails at
// resolve time under Node ESM. The default-import + destructure shape below
// is functionally identical and is what Node accepts.
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;

const PAT = process.env.CF_DEV_PAT;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";
const SPACE = "ubgf1y7ixw5q";
const TEAM_NAME = "probe-2-admins";

if (!PAT) { console.error("CF_DEV_PAT not set"); process.exit(2); }

const cma = createClient({ accessToken: PAT });

async function setup() {
  const org = await cma.getOrganization(ORG);

  const existingTeam = (await org.getTeams()).items.find((t) => t.name === TEAM_NAME);
  const team = existingTeam ?? (await org.createTeam({ name: TEAM_NAME, description: "Probe 2" }));
  console.log("teamId:", team.sys.id);

  // NOTE: Plan said `org.getTeamSpaceMemberships({ "sys.team.sys.id": team.sys.id })`,
  // but in contentful-management@11 the Organization method signature is
  // `getTeamSpaceMemberships({ teamId?, query? })`. Using `teamId` filter here.
  const memberships = await org.getTeamSpaceMemberships({ teamId: team.sys.id });
  const existingForSpace = memberships.items.find((m) => m.sys.space?.sys.id === SPACE);

  if (!existingForSpace) {
    // NOTE: Plan said `org.createTeamSpaceMembership(...)`, but in
    // contentful-management@11 that method lives on `Space`, not
    // `Organization`. The data shape is `Omit<TeamSpaceMembershipProps, 'sys'>`,
    // so we drop the `sys.space` link the plan included — the space is
    // implicit in the Space instance we call this on.
    const space = await cma.getSpace(SPACE);
    const tsm = await space.createTeamSpaceMembership(team.sys.id, {
      admin: true,
      roles: []
    });
    console.log("teamSpaceMembershipId:", tsm.sys.id);
  } else {
    console.log("teamSpaceMembershipId:", existingForSpace.sys.id, "(already existed)");
  }

  console.log("\nMANUAL STEP:");
  console.log(" 1. Invite probe2+admin@<your-domain> to space", SPACE, "as direct Space Admin.");
  console.log(" 2. Log in as that user, attempt to remove the Team membership above via UI and via DELETE on the CMA.");
  console.log(" 3. Record outcome in docs/manual-probes.md.");
  console.log("Cleanup: pnpm tsx scripts/probe-2-team-removal.ts cleanup");
}

async function cleanup() {
  const org = await cma.getOrganization(ORG);
  const team = (await org.getTeams()).items.find((t) => t.name === TEAM_NAME);
  if (!team) { console.log("no team"); return; }
  // Same teamId-filter fix as in setup().
  const memberships = await org.getTeamSpaceMemberships({ teamId: team.sys.id });
  for (const m of memberships.items) await m.delete();
  await team.delete();
  console.log("cleaned up");
}

(process.argv.includes("cleanup") ? cleanup() : setup()).catch((e) => { console.error(e); process.exit(1); });
