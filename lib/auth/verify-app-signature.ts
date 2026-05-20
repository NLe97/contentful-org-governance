import { verifyRequest } from "@contentful/node-apps-toolkit";

export type AppIdentity = { userId: string; spaceId: string; environmentId: string };
export type IncomingReq = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
};

const MAX_SKEW_MS = 30_000;

// `secret` should be the App Definition's signing secret (registered via
// PUT /organizations/{org}/app_definitions/{def}/signing_secret). The old
// signature accepted the App private key — that was wrong; the private key is
// for App Identity (getManagementToken), not for verifying signed requests.
export function verifyAppSignature(req: IncomingReq, secret?: string): AppIdentity {
  const signingSecret = secret ?? process.env.APP_SIGNING_SECRET;
  if (!signingSecret) throw new Error("APP_SIGNING_SECRET not configured");
  const ts = Number(req.headers["x-contentful-timestamp"]);
  if (!ts || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    throw new Error("Stale or missing timestamp");
  }
  const ok = verifyRequest(signingSecret, {
    method: req.method as "GET" | "PATCH" | "HEAD" | "POST" | "DELETE" | "OPTIONS" | "PUT",
    path: req.path,
    headers: req.headers as Record<string, string>,
    body: req.body
  });
  if (!ok) throw new Error("Invalid signature");
  const userId = req.headers["x-contentful-user-id"];
  const spaceId = req.headers["x-contentful-space-id"];
  const environmentId = req.headers["x-contentful-environment-id"];
  if (!userId || !spaceId || !environmentId) throw new Error("Missing identity headers");
  return { userId, spaceId, environmentId };
}
