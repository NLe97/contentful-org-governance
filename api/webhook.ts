import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyWebhookHmac } from "@/lib/auth/verify-webhook-hmac";
import { deriveWebhookSecret } from "@/lib/secrets/derive-webhook-secret";
import { routeByTopic } from "@/lib/webhook/route-by-topic";
import { cmaForSpace } from "@/lib/cma/client";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";
import { appendAudit } from "@/lib/content-model/audit-event";
import { upsertSpaceState } from "@/lib/content-model/space-state";
import { readConfig } from "@/lib/content-model/governance-config";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const installationId = req.headers["x-contentful-installation-id"] as string | undefined;
  const orgId = req.headers["x-contentful-org-id"] as string | undefined;
  const consoleSpaceId = req.headers["x-contentful-console-space-id"] as string | undefined;
  const topic = req.headers["x-contentful-topic"] as string | undefined;
  const sig = req.headers["x-contentful-webhook-signature"] as string | undefined;
  if (!installationId || !orgId || !consoleSpaceId || !topic) return res.status(400).json({ error: "missing routing headers" });

  const raw = (req as any).rawBody ?? JSON.stringify(req.body);
  try {
    const secret = deriveWebhookSecret(process.env.GLOBAL_WEBHOOK_SECRET!, installationId);
    verifyWebhookHmac(raw, sig, secret);
  } catch { return res.status(401).json({ error: "invalid hmac" }); }

  // NOTE: cmaForSpace() returns a union `ClientAPI` where getSpace/getOrganization
  // only exist on the non-plain variant; we always construct the non-plain client,
  // so cast to `any` here (matches scripts/probe-*.ts and api/toggle-freeze.ts).
  const cma = (await cmaForSpace(orgId, consoleSpaceId)) as any;
  const consoleEnv = await (await cma.getSpace(consoleSpaceId)).getEnvironment("master");
  const config = await readConfig(consoleEnv);
  const teamId = config?.fields.orgAdminsTeamId?.["en-US"] as string | undefined;
  if (!teamId) return res.status(409).json({ error: "missing teamId in governanceConfig" });

  const org = await cma.getOrganization(orgId);

  try {
    await routeByTopic(topic, req.body, {
      onSpaceCreate: async ({ spaceId }) => {
        await ensureTeamAttached(org as any, teamId, spaceId);
        await upsertSpaceState(consoleEnv, { spaceId, freezeStatus: "OFF" });
        await appendAudit(consoleEnv, { eventType: "TEAM_ATTACHED", spaceId, actorUserId: "system", details: { trigger: "webhook" } });
      },
      onTeamSpaceMembershipDelete: async ({ teamId: t, spaceId }) => {
        if (t !== teamId) return;
        await ensureTeamAttached(org as any, teamId, spaceId);
        await appendAudit(consoleEnv, { eventType: "TEAM_REMOVED_DETECTED", spaceId, actorUserId: "system", details: { reattached: true } });
      }
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e as Error).message) });
  }
}
