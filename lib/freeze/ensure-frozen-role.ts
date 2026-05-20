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
      // NOTE: Settings MUST be an empty array, NOT "all". Live-probed against
      // CMA: the API rejects every individual Settings value string we tried
      // ("manageRoles", "configureSpace", "manageEnvironments", "editLocales",
      // etc.) with 400 UnknownKey, so the granular forms claimed by older
      // docs do not exist in this realm anymore. Only `"all"` or `[]` are
      // accepted, and `"all"` includes manageRoles — which would defeat the
      // freeze. An empty array grants no Settings-realm permissions while
      // preserving the role's content-realm power (other realms remain
      // "all"). This is the correct shape for an "admin minus manageRoles"
      // substitute role.
      Settings: [],
      Tags: "all"
    }
  });
  return created.sys.id;
}
