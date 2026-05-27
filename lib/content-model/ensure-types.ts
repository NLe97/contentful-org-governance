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
  const missing = PLAN.filter(([id]) => !existing.has(id));
  if (missing.length === 0) return;
  // Each content type's create + publish is independent — parallelize.
  await Promise.all(missing.map(async ([id, schema]) => {
    const created = await env.createContentTypeWithId(id, schema);
    await created.publish();
  }));
}
