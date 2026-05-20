import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenCache } from "@/lib/cma/token-cache";

describe("TokenCache", () => {
  let mint: ReturnType<typeof vi.fn<[string, string], Promise<{ token: string; expiresAt: number }>>>;
  let cache: TokenCache;
  beforeEach(() => {
    mint = vi.fn<[string, string], Promise<{ token: string; expiresAt: number }>>(async (orgId: string, spaceId: string) => ({
      token: `t-${orgId}-${spaceId}-${Date.now()}`,
      expiresAt: Date.now() + 60_000
    }));
    cache = new TokenCache(mint);
  });

  it("mints a token on first request", async () => {
    const t = await cache.get("org1", "spaceA");
    expect(t).toMatch(/^t-org1-spaceA-/);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("reuses cached token within TTL", async () => {
    const a = await cache.get("org1", "spaceA");
    const b = await cache.get("org1", "spaceA");
    expect(a).toBe(b);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("mints a new token for different space", async () => {
    await cache.get("org1", "spaceA");
    await cache.get("org1", "spaceB");
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("remints after expiry", async () => {
    vi.useFakeTimers();
    await cache.get("org1", "spaceA");
    vi.advanceTimersByTime(61_000);
    await cache.get("org1", "spaceA");
    expect(mint).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
