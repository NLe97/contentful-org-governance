import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "../lib/auth/verify-app-signature";
import { checkOrgAdmin } from "../lib/auth/check-org-admin";
import { nextStatus, type Action } from "../lib/freeze/state-machine";
import { cmaForSpace } from "../lib/cma/client";
import { readSpaceState, upsertSpaceState } from "../lib/content-model/space-state";
import { readConfig } from "../lib/content-model/governance-config";
import { appendAudit } from "../lib/content-model/audit-event";
import { runTransition } from "../lib/freeze/run-transition";
import { ensureFrozenRole } from "../lib/freeze/ensure-frozen-role";
import { enumerateSpaceAdmins } from "../lib/freeze/enumerate-admins";
import { substituteMembership, restoreMembership } from "../lib/freeze/substitute";

async function consoleEnvFor(orgId: string, consoleSpaceId: string) {
  // NOTE: cmaForSpace() returns a union `ClientAPI` where `getSpace` only
  // exists on the non-plain variant; we always construct the non-plain client,
  // so cast to `any` here (matches the pattern used in scripts/probe-*.ts).
  const cma = (await cmaForSpace(orgId, consoleSpaceId)) as any;
  const space = await cma.getSpace(consoleSpaceId);
  return space.getEnvironment("master");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  let id;
  try {
    id = verifyAppSignature({
      method: req.method,
      path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})
    }, process.env.APP_PRIVATE_KEY!);
  } catch { return res.status(401).json({ error: "invalid signature" }); }

  const body = req.body as { spaceId?: string; action?: Action; orgId?: string; consoleSpaceId?: string };
  if (!body.spaceId || !body.action || !body.orgId || !body.consoleSpaceId) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (body.spaceId === body.consoleSpaceId) {
    return res.status(422).json({ error: "cannot freeze console space" });
  }

  // Authorization: require caller to be an Org Admin or Owner (spec 5.2).
  // NOTE: see consoleEnvFor() below re: ClientAPI union cast.
  const adminCma = (await cmaForSpace(body.orgId, body.consoleSpaceId)) as any;
  const adminOrg = await adminCma.getOrganization(body.orgId);
  try {
    await checkOrgAdmin(adminOrg, id.userId);
  } catch (e) {
    return res.status(403).json({ error: (e as Error).message });
  }

  const env = await consoleEnvFor(body.orgId, body.consoleSpaceId);
  const config = await readConfig(env);
  const stateEntry = await readSpaceState(env, body.spaceId);
  const curStatus = stateEntry?.fields.freezeStatus?.["en-US"] ?? "OFF";

  const t = nextStatus(curStatus, body.action);
  if (!t.ok) return res.status(409).json({ error: t.reason });
  const jobId = `freeze-${Date.now()}-${body.spaceId.slice(0, 4)}`;
  await upsertSpaceState(env, {
    spaceId: body.spaceId,
    freezeStatus: t.next as any,
    frozenBy: id.userId,
    frozenAt: new Date().toISOString()
  });
  await appendAudit(env, { eventType: "FREEZE_TOGGLED", spaceId: body.spaceId, actorUserId: id.userId, details: { action: body.action, jobId } });

  if (t.idempotent) return res.status(200).json({ ok: true, jobId, currentStatus: t.next, previousStatus: curStatus });

  // NOTE: see consoleEnvFor() above re: ClientAPI union cast.
  const targetCma = (await cmaForSpace(body.orgId, body.spaceId)) as any;
  const targetSpace = await targetCma.getSpace(body.spaceId);

  // NOTE: globalThis.Vercel?.waitUntil?.(...) is a Vercel-runtime-only API. Locally
  // and in unit tests this is a no-op (the substitution loop won't execute). The
  // real-runtime path is exercised by integration tests.
  (globalThis as any).Vercel?.waitUntil?.(runTransition(body.action, {
    spaceId: body.spaceId,
    actorUserId: id.userId,
    frozenRoleName: config?.fields.frozenRoleName?.["en-US"] ?? "Space Admin (frozen)",
    space: targetSpace,
    enumerate: enumerateSpaceAdmins,
    ensureRole: ensureFrozenRole,
    substitute: substituteMembership,
    restore: restoreMembership,
    writeState: async (patch) => { await upsertSpaceState(env, { spaceId: body.spaceId!, ...patch } as any); },
    audit: async (ev) => { await appendAudit(env, { eventType: ev.eventType as any, spaceId: body.spaceId!, actorUserId: "system", details: ev.details }); },
    priorSubstitutions: stateEntry?.fields.substitutions?.["en-US"] ?? {}
  }));

  return res.status(200).json({ ok: true, jobId, currentStatus: t.next, previousStatus: curStatus });
}
