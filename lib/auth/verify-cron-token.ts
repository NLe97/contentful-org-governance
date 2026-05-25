import { timingSafeEqual } from "node:crypto";

// Authenticate a cron request. Two accepted signals, in order:
//   1. `x-vercel-cron` header — Vercel sets this on every Cron Job
//      invocation. Per Vercel docs, the header cannot be set by external
//      callers reaching the function; only the Vercel cron scheduler can
//      attach it. This is the default and works with zero customer setup.
//   2. Legacy `Authorization: Bearer <CRON_SECRET>` header — used by
//      pre-Vercel-cron deployments and manual `curl` invocations. Only
//      enforced if CRON_SECRET is configured.
//
// The function throws on auth failure so the caller can return 401.
export function verifyCronToken(req: { headers: Record<string, string | string[] | undefined> }): void {
  const vercelCron = pickHeader(req.headers["x-vercel-cron"]);
  if (vercelCron) return; // trusted Vercel-set header

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new Error(
      "Cron request rejected: no x-vercel-cron header and CRON_SECRET not configured. " +
      "If you're invoking /api/cron/reconcile manually for testing, set CRON_SECRET in Vercel env."
    );
  }
  const auth = pickHeader(req.headers.authorization);
  const provided = (auth ?? "").replace(/^Bearer\s+/i, "");
  if (provided.length !== expected.length) throw new Error("Cron auth mismatch");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) throw new Error("Cron auth mismatch");
}

function pickHeader(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
