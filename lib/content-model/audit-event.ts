import { AUDIT_EVENT_TYPE } from "./content-types";

export type AuditEventType =
  | "FREEZE_TOGGLED" | "TEAM_ATTACHED" | "TEAM_REMOVED_DETECTED" | "RECONCILE_RUN"
  | "SUBSTITUTION_APPLIED" | "SUBSTITUTION_REVERTED" | "WEBHOOK_SECRET_ROTATED" | "ERROR";

export type AuditPayload = {
  eventType: AuditEventType;
  spaceId?: string;
  actorUserId?: string;
  details?: Record<string, unknown>;
};

type Env = { createEntry(typeId: string, payload: any): Promise<any> };

export async function appendAudit(env: Env, p: AuditPayload): Promise<any> {
  const fields: Record<string, { "en-US": unknown }> = {
    eventType: { "en-US": p.eventType },
    timestamp: { "en-US": new Date().toISOString() }
  };
  if (p.spaceId) fields.spaceId = { "en-US": p.spaceId };
  if (p.actorUserId) fields.actorUserId = { "en-US": p.actorUserId };
  if (p.details) fields.details = { "en-US": p.details };
  return env.createEntry(AUDIT_EVENT_TYPE, { fields });
}
