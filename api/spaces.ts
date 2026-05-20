import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "../lib/auth/verify-app-signature.js";
import { cmaForSpace } from "../lib/cma/client.js";

// List spaces in the caller's org. App-SDK `sdk.cma.space.getMany` is
// not available from within an app installation, so the console UI calls
// this signed endpoint instead. Backend uses the dev PAT (or App Identity
// in prod) to do the org-level read.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    verifyAppSignature({
      method: req.method ?? "GET", path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: ""
    });
  } catch (e) { return res.status(401).json({ error: "invalid signature", detail: (e as Error).message }); }

  const orgId = String(req.query.orgId ?? "");
  const consoleSpaceId = String(req.query.consoleSpaceId ?? "");
  if (!orgId || !consoleSpaceId) return res.status(400).json({ error: "missing query" });

  // cmaForSpace returns the ClientAPI union; cast for chaining.
  const cma = (await cmaForSpace(orgId, consoleSpaceId)) as any;
  const r = await cma.getOrganization(orgId).then((o: any) => o.getSpaces({ limit: 200 }));
  return res.status(200).json({
    items: r.items.map((s: any) => ({ id: s.sys.id, name: s.name }))
  });
}
