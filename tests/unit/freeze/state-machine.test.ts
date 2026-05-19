import { describe, it, expect } from "vitest";
import { nextStatus, type FreezeStatus } from "@/lib/freeze/state-machine";

describe("freeze state machine", () => {
  it("OFF + freeze → TRANSITIONING_ON", () => {
    expect(nextStatus("OFF", "freeze")).toEqual({ ok: true, next: "TRANSITIONING_ON" });
  });
  it("FROZEN + freeze → idempotent", () => {
    expect(nextStatus("FROZEN", "freeze")).toEqual({ ok: true, idempotent: true, next: "FROZEN" });
  });
  it("TRANSITIONING_ON + freeze → idempotent", () => {
    expect(nextStatus("TRANSITIONING_ON", "freeze")).toEqual({ ok: true, idempotent: true, next: "TRANSITIONING_ON" });
  });
  it("DEGRADED + freeze → rejected", () => {
    expect(nextStatus("DEGRADED", "freeze").ok).toBe(false);
  });
  it("FROZEN + thaw → TRANSITIONING_OFF", () => {
    expect(nextStatus("FROZEN", "thaw")).toEqual({ ok: true, next: "TRANSITIONING_OFF" });
  });
  it("OFF + thaw → idempotent", () => {
    expect(nextStatus("OFF", "thaw")).toEqual({ ok: true, idempotent: true, next: "OFF" });
  });
  it("DEGRADED + thaw → TRANSITIONING_OFF (force allowed)", () => {
    expect(nextStatus("DEGRADED", "thaw")).toEqual({ ok: true, next: "TRANSITIONING_OFF" });
  });
});
