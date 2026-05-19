import { describe, it, expect, vi } from "vitest";
import { routeByTopic } from "@/lib/webhook/route-by-topic";

describe("routeByTopic", () => {
  it("routes Space.create", async () => {
    const handlers = { onSpaceCreate: vi.fn(), onTeamSpaceMembershipDelete: vi.fn() };
    await routeByTopic("ContentManagement.Space.create", { sys: { id: "sNew", type: "Space" } }, handlers);
    expect(handlers.onSpaceCreate).toHaveBeenCalledWith({ spaceId: "sNew" });
    expect(handlers.onTeamSpaceMembershipDelete).not.toHaveBeenCalled();
  });

  it("routes TeamSpaceMembership.delete", async () => {
    const handlers = { onSpaceCreate: vi.fn(), onTeamSpaceMembershipDelete: vi.fn() };
    await routeByTopic("ContentManagement.TeamSpaceMembership.delete",
      { sys: { id: "tsm1", team: { sys: { id: "tA" } }, space: { sys: { id: "sX" } } } }, handlers);
    expect(handlers.onTeamSpaceMembershipDelete).toHaveBeenCalledWith({ teamId: "tA", spaceId: "sX", membershipId: "tsm1" });
  });

  it("no-ops for unknown topic", async () => {
    const handlers = { onSpaceCreate: vi.fn(), onTeamSpaceMembershipDelete: vi.fn() };
    await routeByTopic("Other.thing", {}, handlers);
    expect(handlers.onSpaceCreate).not.toHaveBeenCalled();
    expect(handlers.onTeamSpaceMembershipDelete).not.toHaveBeenCalled();
  });
});
