import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyCronToken } from "../../lib/auth/verify-cron-token.js";
import { cmaForSpace } from "../../lib/cma/client.js";
import { sweep } from "../../lib/fanout/sweep.js";
import { ensureTeamAttached } from "../../lib/fanout/ensure-team-attached.js";
import { readConfig } from "../../lib/content-model/governance-config.js";
import { appendAudit } from "../../lib/content-model/audit-event.js";

type Installation = { orgId: string; consoleSpaceId: string; installationId: string };

async function loadInstallations(): Promise<Installation[]> {
  const raw = process.env.INSTALLATIONS_JSON;
  if (!raw) return [];
  return JSON.parse(raw);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { verifyCronToken(req); }
  catch (e) { return res.status(401).json({ error: (e as Error).message }); }

  const installations = await loadInstallations();
  const out: any[] = [];
  for (const inst of installations) {
    try {
      // NOTE: cmaForSpace() returns a union `ClientAPI` where getSpace/getOrganization
      // only exist on the non-plain variant; cast to `any` (matches the pattern used
      // in scripts/probe-*.ts and api/toggle-freeze.ts).
      const cma = (await cmaForSpace(inst.orgId, inst.consoleSpaceId)) as any;
      const env = await (await cma.getSpace(inst.consoleSpaceId)).getEnvironment("master");
      const config = await readConfig(env);
      const teamId = config?.fields.orgAdminsTeamId?.["en-US"];
      if (!teamId) { out.push({ installationId: inst.installationId, skipped: "no teamId" }); continue; }
      const swept = await sweep(cma as any, inst.orgId, teamId, inst.consoleSpaceId);
      await appendAudit(env, { eventType: "RECONCILE_RUN", actorUserId: "system", details: { phase: "cron", swept } });
      out.push({ installationId: inst.installationId, swept });
    } catch (e) {
      out.push({ installationId: inst.installationId, error: String((e as Error).message) });
    }
  }
  return res.status(200).json({ ok: true, results: out });
}
