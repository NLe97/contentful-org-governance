export type FreezeStatus = "OFF" | "FROZEN" | "TRANSITIONING_ON" | "TRANSITIONING_OFF" | "DEGRADED";
export type Action = "freeze" | "thaw";

export type Transition =
  | { ok: true; next: FreezeStatus; idempotent?: boolean }
  | { ok: false; reason: string };

export function nextStatus(cur: FreezeStatus, action: Action): Transition {
  if (action === "freeze") {
    if (cur === "OFF") return { ok: true, next: "TRANSITIONING_ON" };
    if (cur === "FROZEN" || cur === "TRANSITIONING_ON") return { ok: true, next: cur, idempotent: true };
    if (cur === "DEGRADED") return { ok: false, reason: "Refusing to re-freeze a DEGRADED space; thaw first" };
    if (cur === "TRANSITIONING_OFF") return { ok: false, reason: "Thaw in progress; cannot freeze" };
    return { ok: false, reason: "Unhandled state" };
  }
  if (cur === "OFF") return { ok: true, next: "OFF", idempotent: true };
  if (cur === "FROZEN" || cur === "DEGRADED" || cur === "TRANSITIONING_ON") return { ok: true, next: "TRANSITIONING_OFF" };
  if (cur === "TRANSITIONING_OFF") return { ok: true, next: "TRANSITIONING_OFF", idempotent: true };
  return { ok: false, reason: "Unhandled state" };
}
