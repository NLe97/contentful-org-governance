import { SPACE_STATE_TYPE } from "./content-types.js";

export type SpaceStateFields = {
  spaceId: string;
  spaceName?: string;
  freezeStatus?: "OFF" | "FROZEN" | "TRANSITIONING_ON" | "TRANSITIONING_OFF" | "DEGRADED";
  frozenAt?: string;
  frozenBy?: string;
  substitutions?: Record<string, { originalRoleId: string; substitutedRoleId: string }>;
  customFrozenRoleId?: string;
  lastReconciledAt?: string;
};

type Env = {
  getEntries(q: Record<string, unknown>): Promise<{ items: any[] }>;
  createEntry(typeId: string, payload: { fields: Record<string, { "en-US": unknown }> }): Promise<any>;
};

function toFields(p: Partial<SpaceStateFields>): Record<string, { "en-US": unknown }> {
  const out: Record<string, { "en-US": unknown }> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = { "en-US": v };
  return out;
}

export async function readSpaceState(env: Env, spaceId: string): Promise<any | undefined> {
  const r = await env.getEntries({ content_type: SPACE_STATE_TYPE, "fields.spaceId": spaceId, limit: 1 });
  return r.items[0];
}

export async function upsertSpaceState(env: Env, fields: Partial<SpaceStateFields> & { spaceId: string }): Promise<any> {
  const existing = await readSpaceState(env, fields.spaceId);
  if (!existing) return env.createEntry(SPACE_STATE_TYPE, { fields: toFields(fields) });
  // Mutate fields on the wrapped entry and .update() — robust against
  // missing fields (JSON Patch "replace" would 404 on a path that doesn't
  // exist yet, e.g. the first time we write `substitutions` or
  // `customFrozenRoleId`).
  existing.fields = existing.fields ?? {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "spaceId" || v === undefined) continue;
    existing.fields[k] = { "en-US": v };
  }
  return existing.update();
}
