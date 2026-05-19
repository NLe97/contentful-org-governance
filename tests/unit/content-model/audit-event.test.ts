import { describe, it, expect, vi } from "vitest";
import { appendAudit } from "@/lib/content-model/audit-event";

describe("audit append", () => {
  it("creates an audit entry with a timestamp", async () => {
    const create = vi.fn(async (_t: string, payload: any) => ({ sys: { id: "a1" }, fields: payload.fields }));
    const env = { createEntry: create } as any;
    await appendAudit(env, { eventType: "TEAM_ATTACHED", spaceId: "s1", actorUserId: "system", details: { x: 1 } });
    expect(create).toHaveBeenCalledOnce();
    const fields = create.mock.calls[0]![1].fields;
    expect(fields.eventType["en-US"]).toBe("TEAM_ATTACHED");
    expect(typeof fields.timestamp["en-US"]).toBe("string");
  });
});
