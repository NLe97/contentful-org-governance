import { timingSafeEqual } from "node:crypto";

export function verifyCronToken(header: string | undefined): void {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = (header ?? "").replace(/^Bearer\s+/i, "");
  if (!expected) throw new Error("CRON_SECRET not configured");
  if (provided.length !== expected.length) throw new Error("Cron auth mismatch");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) throw new Error("Cron auth mismatch");
}
