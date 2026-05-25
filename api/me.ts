import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "../lib/auth/verify-app-signature.js";
import { cmaForSpace } from "../lib/cma/client.js";
import { checkOrgAdmin } from "../lib/auth/check-org-admin.js";
import { validateConsoleSpace, ConsoleSpaceMismatchError } from "../lib/auth/validate-console-space.js";

// Returns the calling user's identity + whether they are an Org Admin/Owner.
// The frontend gates the entire console on this so non-admins see a clean
// "Restricted" screen rather than the Spaces tab (defense in depth — the
// mutation endpoints already 403 non-admins).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let id;
  try {
    id = verifyAppSignature({
      method: req.method ?? "GET", path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: ""
    });
  } catch (e) { return res.status(401).json({ error: "invalid signature", detail: (e as Error).message }); }

  const orgId = String(req.query.orgId ?? "");
  const consoleSpaceId = String(req.query.consoleSpaceId ?? "");
  if (!orgId || !consoleSpaceId) return res.status(400).json({ error: "missing query: orgId, consoleSpaceId" });
  try { validateConsoleSpace(consoleSpaceId); }
  catch (e) {
    if (e instanceof ConsoleSpaceMismatchError) return res.status(403).json({ error: e.message });
    throw e;
  }

  let isOrgAdmin = false;
  let detail: string | undefined;
  try {
    // NOTE: cmaForSpace() returns a union ClientAPI; getOrganization only
    // exists on the non-plain variant (matches the cast in other endpoints).
    const cma = (await cmaForSpace(orgId, consoleSpaceId)) as any;
    const org = await cma.getOrganization(orgId);
    await checkOrgAdmin(org, id.userId);
    isOrgAdmin = true;
  } catch (e) {
    // Previously this catch was naked and swallowed every failure as
    // "not admin," which made it impossible to tell apart real
    // not-org-admin users from misconfigured deploys (wrong PAT, PAT
    // without access to this org, network errors, etc). Keep the 200
    // response so the frontend gate still works, but surface the
    // underlying message in `detail` so it's visible in DevTools and
    // Vercel logs.
    detail = (e as Error).message;
    console.error("[/api/me] org-admin check failed", { orgId, userId: id.userId, detail });
  }

  return res.status(200).json(
    isOrgAdmin ? { userId: id.userId, isOrgAdmin } : { userId: id.userId, isOrgAdmin, detail }
  );
}
