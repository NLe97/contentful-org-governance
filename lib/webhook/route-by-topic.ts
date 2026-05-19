export type WebhookHandlers = {
  onSpaceCreate(ev: { spaceId: string }): Promise<void> | void;
  onTeamSpaceMembershipDelete(ev: { teamId: string; spaceId: string; membershipId: string }): Promise<void> | void;
};

export async function routeByTopic(topic: string, payload: any, handlers: WebhookHandlers): Promise<void> {
  if (topic.endsWith(".Space.create")) {
    await handlers.onSpaceCreate({ spaceId: payload.sys.id });
    return;
  }
  if (topic.endsWith(".TeamSpaceMembership.delete")) {
    await handlers.onTeamSpaceMembershipDelete({
      teamId: payload.sys.team.sys.id,
      spaceId: payload.sys.space.sys.id,
      membershipId: payload.sys.id
    });
    return;
  }
}
