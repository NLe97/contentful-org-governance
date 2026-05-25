import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCronToken } from "@/lib/auth/verify-cron-token";

const ORIG = process.env.CRON_SECRET;

function req(headers: Record<string, string | undefined>) {
  return { headers };
}

describe("verifyCronToken", () => {
  beforeEach(() => { process.env.CRON_SECRET = "secret-value"; });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIG;
  });

  it("accepts Vercel-set x-vercel-cron header with no shared secret", () => {
    delete process.env.CRON_SECRET;
    expect(() => verifyCronToken(req({ "x-vercel-cron": "1" }))).not.toThrow();
  });

  it("accepts Authorization: Bearer <CRON_SECRET>", () => {
    expect(() => verifyCronToken(req({ authorization: "Bearer secret-value" }))).not.toThrow();
  });

  it("accepts bare CRON_SECRET (no Bearer prefix)", () => {
    expect(() => verifyCronToken(req({ authorization: "secret-value" }))).not.toThrow();
  });

  it("rejects mismatched Authorization", () => {
    expect(() => verifyCronToken(req({ authorization: "Bearer wrong" }))).toThrow(/mismatch/i);
  });

  it("rejects request with no x-vercel-cron and no CRON_SECRET configured", () => {
    delete process.env.CRON_SECRET;
    expect(() => verifyCronToken(req({}))).toThrow(/x-vercel-cron|CRON_SECRET/i);
  });

  it("rejects request with neither header when CRON_SECRET is configured", () => {
    expect(() => verifyCronToken(req({}))).toThrow(/mismatch/i);
  });
});
