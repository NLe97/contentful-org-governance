import { describe, it, expect, vi } from "vitest";
import { sweep } from "@/lib/fanout/sweep";

describe("sweep", () => {
  it("calls ensure for each space except the console", async () => {
    const ensure = vi.fn().mockResolvedValueOnce("ATTACHED").mockResolvedValueOnce("NO_OP");
    const spaces = [{ sys: { id: "sA" } }, { sys: { id: "sB" } }, { sys: { id: "console" } }];
    const cma = {
      getOrganization: vi.fn().mockResolvedValue({ getSpaces: vi.fn().mockResolvedValue({ items: spaces }) }),
      getSpace: vi.fn(async (id: string) => ({ sys: { id }, createTeamSpaceMembership: vi.fn() }))
    } as any;

    const counts = await sweep(cma, "org1", "team", "console", ensure);
    expect(ensure).toHaveBeenCalledTimes(2);
    const calls = ensure.mock.calls.map((c: any[]) => c[0].space.sys.id);
    expect(calls).toEqual(["sA", "sB"]);
    expect(counts).toEqual({ attached: 1, repaired: 0, noop: 1, failed: 0 });
  });
});
