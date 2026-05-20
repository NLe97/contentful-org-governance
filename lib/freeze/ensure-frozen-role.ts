type Space = {
  getRoles(): Promise<{ items: { sys: { id: string }; name: string }[] }>;
  createRole(payload: unknown): Promise<{ sys: { id: string } }>;
};

export async function ensureFrozenRole(space: Space, frozenRoleName: string): Promise<string> {
  const roles = await space.getRoles();
  const existing = roles.items.find((r) => r.name === frozenRoleName);
  if (existing) return existing.sys.id;
  const created = await space.createRole({
    name: frozenRoleName,
    description: "Auto-managed by Org Governance App. Admin minus Settings.manageRoles.",
    permissions: {
      ContentDelivery: "all",
      ContentModel: "all",
      EnvironmentAliases: "all",
      Environments: "all",
      Settings: "all",
      Tags: "all"
    }
  });
  return created.sys.id;
}
