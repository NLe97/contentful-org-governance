import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "../lib/auth/verify-app-signature.js";
import { checkOrgAdmin } from "../lib/auth/check-org-admin.js";
import { cmaForSpace } from "../lib/cma/client.js";
import { ensureContentTypes } from "../lib/content-model/ensure-types.js";
import { writeConfig } from "../lib/content-model/governance-config.js";
import { appendAudit } from "../lib/content-model/audit-event.js";
import { sweep } from "../lib/fanout/sweep.js";
import { ensureTeamAttached } from "../lib/fanout/ensure-team-attached.js";
import { deriveWebhookSecret } from "../lib/secrets/derive-webhook-secret.js";

type BootstrapBody = {
  orgId: string;
  installationId: string;
  consoleSpaceId: string;
  orgAdminsTeamName?: string;
  initialTeamMemberUserIds?: string[];
};

async function ensureTeam(org: any, name: string, members: string[]): Promise<string> {
  const existing = (await org.getTeams()).items.find((t: any) => t.name === name);
  const team = existing ?? await org.createTeam({ name, description: "Auto-managed by Org Governance App" } as any);
  for (const userId of members) {
    const existingMembers = (await team.getTeamMemberships?.() ?? { items: [] }).items;
    if (!existingMembers.find((m: any) => m.sys.user?.sys.id === userId)) {
      await org.createTeamMembership(team.sys.id, { admin: false, sys: { user: { sys: { id: userId, type: "Link", linkType: "User" } } } } as any);
    }
  }
  return team.sys.id;
}

async function ensureWebhook(org: any, name: string, topic: string, url: string, secret: string): Promise<string> {
  const existing = (await org.getWebhooks?.() ?? { items: [] }).items.find((w: any) => w.name === name);
  if (existing) return existing.sys.id;
  const wh = await org.createWebhook({
    name, url, topics: [topic],
    httpBasicUsername: undefined,
    headers: [{ key: "X-Contentful-Webhook-Signature", value: "{{ payload | hmac_sha256: '" + secret + "' }}", secret: true }]
  } as any);
  return wh.sys.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  let identity;
  try {
    identity = verifyAppSignature({
      method: req.method, path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})
    }, process.env.APP_PRIVATE_KEY!);
  } catch { return res.status(401).json({ error: "invalid signature" }); }

  const b = req.body as BootstrapBody;
  if (!b?.orgId || !b?.installationId || !b?.consoleSpaceId) return res.status(400).json({ error: "missing fields" });

  const teamName = b.orgAdminsTeamName ?? "Org Admins";
  // NOTE: cmaForSpace() returns a union `ClientAPI` where `getSpace`/`getOrganization`
  // only exist on the non-plain variant; we always construct the non-plain client,
  // so cast to `any` here (matches scripts/probe-*.ts and api/toggle-freeze.ts).
  const cma = (await cmaForSpace(b.orgId, b.consoleSpaceId)) as any;
  const space = await cma.getSpace(b.consoleSpaceId);
  const env = await space.getEnvironment("master");
  const org = await cma.getOrganization(b.orgId);

  try {
    await checkOrgAdmin(org as any, identity.userId);
  } catch (e) {
    return res.status(403).json({ error: (e as Error).message });
  }

  await ensureContentTypes(env as any);

  const teamId = await ensureTeam(org as any, teamName, b.initialTeamMemberUserIds ?? []);

  await writeConfig(env, { orgAdminsTeamId: teamId, frozenRoleName: "Space Admin (frozen)", enforcementEnabled: true });

  const vercelBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.PUBLIC_BASE_URL ?? "");
  const secret = deriveWebhookSecret(process.env.GLOBAL_WEBHOOK_SECRET!, b.installationId);
  const wh1 = await ensureWebhook(org as any, `org-gov-space-create-${b.installationId}`, "ContentManagement.Space.create",
    `${vercelBase}/api/webhook`, secret);
  const wh2 = await ensureWebhook(org as any, `org-gov-team-remove-${b.installationId}`, "ContentManagement.TeamSpaceMembership.delete",
    `${vercelBase}/api/webhook`, secret);

  const swept = await sweep(org as any, teamId, b.consoleSpaceId, ensureTeamAttached as any);
  await appendAudit(env, { eventType: "RECONCILE_RUN", actorUserId: "system", details: { phase: "bootstrap", swept } });

  return res.status(200).json({ ok: true, orgAdminsTeamId: teamId, swept, webhookIds: [wh1, wh2] });
}
