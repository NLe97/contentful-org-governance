import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "../lib/auth/verify-app-signature.js";
import { cmaForSpace } from "../lib/cma/client.js";
import { readSpaceState } from "../lib/content-model/space-state.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    verifyAppSignature({
      method: req.method ?? "GET", path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: ""
    });
  } catch (e) { return res.status(401).json({ error: "invalid signature", detail: (e as Error).message }); }

  const spaceId = String(req.query.spaceId ?? "");
  const orgId = String(req.query.orgId ?? "");
  const consoleSpaceId = String(req.query.consoleSpaceId ?? "");
  if (!spaceId || !orgId || !consoleSpaceId) return res.status(400).json({ error: "missing query" });

  // NOTE: cmaForSpace() returns a union `ClientAPI` where `getSpace` only exists
  // on the non-plain variant; we always construct the non-plain client, so cast
  // to `any` (matches scripts/probe-*.ts and api/toggle-freeze.ts).
  const cma = (await cmaForSpace(orgId, consoleSpaceId)) as any;
  const env = await (await cma.getSpace(consoleSpaceId)).getEnvironment("master");
  const entry = await readSpaceState(env as any, spaceId);
  if (!entry) return res.status(200).json({ spaceId, freezeStatus: "OFF" });
  return res.status(200).json({
    spaceId,
    freezeStatus: entry.fields.freezeStatus?.["en-US"] ?? "OFF",
    frozenAt: entry.fields.frozenAt?.["en-US"],
    frozenBy: entry.fields.frozenBy?.["en-US"]
  });
}
