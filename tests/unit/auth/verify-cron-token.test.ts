import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCronToken } from "@/lib/auth/verify-cron-token";

const ORIG = process.env.CRON_SECRET;

describe("verifyCronToken", () => {
  beforeEach(() => { process.env.CRON_SECRET = "secret-value"; });
  afterEach(() => { process.env.CRON_SECRET = ORIG; });

  it("accepts exact match without Bearer prefix", () => {
    expect(() => verifyCronToken("secret-value")).not.toThrow();
  });

  it("accepts match with Bearer prefix", () => {
    expect(() => verifyCronToken("Bearer secret-value")).not.toThrow();
  });

  it("rejects mismatched value", () => {
    expect(() => verifyCronToken("Bearer wrong-value")).toThrow(/mismatch/i);
  });

  it("rejects undefined header", () => {
    expect(() => verifyCronToken(undefined)).toThrow();
  });

  it("rejects when CRON_SECRET env is missing", () => {
    delete process.env.CRON_SECRET;
    expect(() => verifyCronToken("Bearer anything")).toThrow(/configured|mismatch/i);
  });
});
