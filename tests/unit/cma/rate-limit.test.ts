import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/cma/rate-limit";

describe("withRetry", () => {
  it("returns on first success", async () => {
    const fn = vi.fn().mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 until success", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { maxAttempts: 5, baseMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on 5xx but stops on 4xx", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 422 });
    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 1 })).rejects.toMatchObject({ status: 422 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 1 })).rejects.toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
