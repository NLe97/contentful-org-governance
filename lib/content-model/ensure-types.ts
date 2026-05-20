import {
  GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE,
  GOVERNANCE_CONFIG_SCHEMA, SPACE_STATE_SCHEMA, AUDIT_EVENT_SCHEMA
} from "./content-types.js";

type Env = {
  getContentTypes(): Promise<{ items: { sys: { id: string } }[] }>;
  createContentTypeWithId(id: string, payload: unknown): Promise<{
    sys: { id: string; version: number };
    publish(): Promise<{ sys: { id: string; version: number } }>;
  }>;
};

const PLAN: Array<[string, unknown]> = [
  [GOVERNANCE_CONFIG_TYPE, GOVERNANCE_CONFIG_SCHEMA],
  [SPACE_STATE_TYPE, SPACE_STATE_SCHEMA],
  [AUDIT_EVENT_TYPE, AUDIT_EVENT_SCHEMA]
];

export async function ensureContentTypes(env: Env): Promise<void> {
  const existing = new Set((await env.getContentTypes()).items.map((c) => c.sys.id));
  for (const [id, schema] of PLAN) {
    if (existing.has(id)) continue;
    const created = await env.createContentTypeWithId(id, schema);
    await created.publish();
  }
}
