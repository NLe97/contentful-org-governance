import { describe, it, expect, vi } from "vitest";
import { sweep } from "@/lib/fanout/sweep";

describe("sweep", () => {
  it("calls ensureTeamAttached for each space except the console", async () => {
    const ensure = vi.fn().mockResolvedValueOnce("ATTACHED").mockResolvedValueOnce("NO_OP");
    const spaces = [{ sys: { id: "sA" } }, { sys: { id: "sB" } }, { sys: { id: "console" } }];
    const org = {
      getSpaces: vi.fn().mockResolvedValue({ items: spaces })
    } as any;

    const counts = await sweep(org, "team", "console", ensure);
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenCalledWith(org, "team", "sA");
    expect(ensure).toHaveBeenCalledWith(org, "team", "sB");
    expect(counts).toEqual({ attached: 1, repaired: 0, noop: 1 });
  });
});
