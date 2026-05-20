import { GOVERNANCE_CONFIG_TYPE } from "./content-types.js";

export type GovernanceConfigFields = {
  orgAdminsTeamId?: string;
  frozenRoleName: string;
  enforcementEnabled: boolean;
};

type Env = {
  getEntries(q: Record<string, unknown>): Promise<{ items: any[] }>;
  createEntry(typeId: string, payload: { fields: Record<string, { "en-US": unknown }> }): Promise<any>;
};

function toFields(p: Partial<GovernanceConfigFields>) {
  const out: Record<string, { "en-US": unknown }> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = { "en-US": v };
  return out;
}

export async function readConfig(env: Env): Promise<any | undefined> {
  const r = await env.getEntries({ content_type: GOVERNANCE_CONFIG_TYPE, limit: 1 });
  return r.items[0];
}

export async function writeConfig(env: Env, fields: Partial<GovernanceConfigFields>): Promise<any> {
  const existing = await readConfig(env);
  if (!existing) return env.createEntry(GOVERNANCE_CONFIG_TYPE, { fields: toFields(fields) });
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) existing.fields[k] = { "en-US": v };
  }
  return existing.update();
}
