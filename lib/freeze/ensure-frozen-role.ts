type Role = {
  sys: { id: string };
  name: string;
  permissions?: any;
  policies?: any;
  update?: () => Promise<Role>;
};
type Space = {
  getRoles(): Promise<{ items: Role[] }>;
  createRole(payload: unknown): Promise<{ sys: { id: string } }>;
};

// Read-only role definition. Live-probed against CMA: the shape that grants
// "can view entries/assets/content model, cannot edit/publish/delete or touch
// settings" is the realm-permissions block below combined with a `policies`
// list allowing only the `read` action on Entry and Asset (mirrors the
// built-in Translator role's structure, but with update removed).
const READ_ONLY_PERMISSIONS = {
  ContentModel: ["read"],
  ContentDelivery: [],
  Settings: [],
  Environments: [],
  EnvironmentAliases: [],
  Tags: []
};

const READ_ONLY_POLICIES = [
  { effect: "allow", actions: ["read"], constraint: { and: [{ equals: [{ doc: "sys.type" }, "Entry"] }] } },
  { effect: "allow", actions: ["read"], constraint: { and: [{ equals: [{ doc: "sys.type" }, "Asset"] }] } }
];

const FROZEN_ROLE_DESCRIPTION =
  "Auto-managed by Org Governance App. Read-only: can view entries/assets/content model; cannot edit, publish, delete, or change settings.";

export async function ensureFrozenRole(space: Space, frozenRoleName: string): Promise<string> {
  const roles = await space.getRoles();
  const existing = roles.items.find((r) => r.name === frozenRoleName);
  if (existing) {
    // Repair drift: an earlier version of this app shipped a role with full
    // edit power. If we find that here, rewrite it to the read-only shape so
    // freezing actually blocks edits.
    if (existing.update && needsRepair(existing.permissions)) {
      existing.permissions = READ_ONLY_PERMISSIONS;
      existing.policies = READ_ONLY_POLICIES;
      const updated = await existing.update();
      return updated.sys.id;
    }
    return existing.sys.id;
  }
  const created = await space.createRole({
    name: frozenRoleName,
    description: FROZEN_ROLE_DESCRIPTION,
    permissions: READ_ONLY_PERMISSIONS,
    policies: READ_ONLY_POLICIES
  });
  return created.sys.id;
}

function needsRepair(perms: any): boolean {
  if (!perms) return true;
  // Old shape had any realm set to "all". Read-only role has every realm as
  // an array (empty, or ["read"] for ContentModel).
  for (const key of ["ContentDelivery", "ContentModel", "Environments", "EnvironmentAliases", "Tags"]) {
    if (perms[key] === "all") return true;
  }
  return false;
}
