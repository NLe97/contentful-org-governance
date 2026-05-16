# Contentful Org Governance App — Design

- **Status:** Draft (design complete, pending user review before plan)
- **Author:** ben.le@contentful.com
- **Last updated:** 2026-05-16
- **Working directory:** `/Users/benle/Desktop/test app`

---

## 1. Context

A TELUS-style customer wants:
- **MVP 1 — Protected org-admin access** across all current and future spaces. Central admins should see, report on, and intervene in any space without being removed by local admins.
- **MVP 2 — Lightweight delegated admin / org policy controls.** Stop using full Space Admin as the only way to manage users and guardrails. Specifically: be able to freeze the Roles & Permissions surface during sensitive periods without inflating Space Admin counts.

Native Contentful covers ~half of MVP 1 today via Teams. MVP 2 has no native answer. This app ships both as one installable Contentful App.

## 2. Goals / non-goals

**Goals**
- One installable app delivering MVP 1 + MVP 2.
- Real enforcement (not just visible deterrents).
- Production-ready: App Identity auth, idempotent operations, self-healing via cron.
- Multi-tenant from day 1 (distributable to other orgs; no Marketplace listing yet).
- Customer-credible demo against a small live org (`30SScScam27l3EU95xxctv` / "Ben Simple Projects").

**Non-goals (YAGNI)**
- Marketplace listing — distribution is via shared install URL.
- Per-content-type permission deny rules (would be a native product ask, not a workable extensibility build).
- Load handling beyond ~100 spaces per tenant.
- Browser-extension-style UI overrides of native screens.
- Native deny-rule policy engine — Dinesh's framing is "monitoring + enforcement workflow on top of existing capabilities", which is what we ship.

## 3. Architectural decisions

| Decision | Choice |
|---|---|
| Surface | Single Contentful App, two UI surfaces (console + frozen-page), selected at runtime by space ID. |
| Where org admin controls everything | Approach A — a dedicated `governance-console` space per tenant. |
| Freeze mechanism | Mechanism A — role substitution. While ON, Space Admins are temporarily moved to a `Space Admin (frozen)` custom role with `permissions.manageRoles="none"`. |
| Backend host | Vercel (Node serverless + cron). |
| Persistence | Inside Contentful — three content types in the console space. No external DB. Secrets in Vercel env. |
| Auth (CMA) | App Identity for production. PAT for local dev against own org only. |
| Tenancy | Multi-tenant from day 1, distribution starts private. |

## 4. System overview

```
                        ┌──────────────────────────────────────┐
                        │ Contentful org (tenant)               │
                        │                                       │
   ┌─── governance-console space ───┐    ┌──── any space ─────┐ │
   │  Apps → Org Governance        │    │  Apps → Org Gov     │ │
   │   • Freeze toggles per space  │    │   • "Frozen" page   │ │
   │   • Org Admins team manager   │    │     (only when ON)  │ │
   │   • Audit log viewer          │    │  Org Admins team    │ │
   │   • Reconcile Now button      │    │   attached as Admin │ │
   │  Content types:               │    │                     │ │
   │   • governanceConfig (1)      │    │                     │ │
   │   • spaceState (1/space)      │    │                     │ │
   │   • auditEvent (N)            │    │                     │ │
   └───────────────────────────────┘    └─────────────────────┘ │
                  │                              │              │
                  └────────────┬─────────────────┘              │
                               │ CMA via App Identity           │
                               ▼                                │
                  ┌──────────────────────────────────┐          │
                  │ Vercel — 4 functions             │          │
                  │  POST /api/bootstrap              │          │
                  │  POST /api/toggle-freeze          │          │
                  │  POST /api/webhook                │          │
                  │  GET  /api/cron/reconcile         │          │
                  └──────────────────────────────────┘          │
                                                                │
   Two webhooks registered per tenant during bootstrap:         │
     Space.create                — fan-out trigger              │
     TeamSpaceMembership.delete  — re-attach defense            │
   └────────────────────────────────────────────────────────────┘
```

Same code bundle decides at runtime which UI surface to render based on the current space ID compared to `governanceConfig.consoleSpaceId`. The console surface is hidden in non-console spaces; the frozen surface is hidden in the console space.

## 5. Content model

Three content types in the `governance-console` space.

### 5.1 `governanceConfig` (singleton)

| Field | Type | Notes |
|---|---|---|
| `orgAdminsTeamId` | Symbol | Protected team ID |
| `frozenRoleName` | Symbol | Display name for the substitute role; default `"Space Admin (frozen)"` |
| `enforcementEnabled` | Boolean | Global kill switch |

Secrets (App private key, `globalWebhookSecret` from which per-installation HMAC keys are derived, Vercel cron token) live in Vercel env vars only, never in this entry.

### 5.2 `spaceState` (one per space in the tenant)

| Field | Type | Notes |
|---|---|---|
| `spaceId` | Symbol | Application-level unique key. Contentful does not enforce uniqueness on Symbol fields, so reads use a filter (`fields.spaceId=<id>`) and writes use upsert semantics in the application layer. |
| `spaceName` | Symbol | Cached label |
| `freezeStatus` | Symbol enum | `OFF` · `FROZEN` · `TRANSITIONING_ON` · `TRANSITIONING_OFF` · `DEGRADED` |
| `frozenAt` | Date | Set on transition completion |
| `frozenBy` | Symbol | Org-admin user ID who toggled |
| `substitutions` | Object | `{ [userId]: { originalRoleId, substitutedRoleId } }` |
| `customFrozenRoleId` | Symbol | Per-space substitute role ID, lazily created |
| `lastReconciledAt` | Date | Cron timestamp |

### 5.3 `auditEvent` (append-only)

| Field | Type | Notes |
|---|---|---|
| `eventType` | Symbol enum | `FREEZE_TOGGLED` · `TEAM_ATTACHED` · `TEAM_REMOVED_DETECTED` · `RECONCILE_RUN` · `SUBSTITUTION_APPLIED` · `SUBSTITUTION_REVERTED` · `WEBHOOK_SECRET_ROTATED` · `ERROR` |
| `spaceId` | Symbol | Optional |
| `actorUserId` | Symbol | Org admin user ID, or literal `"system"` |
| `details` | Object | Event-specific |
| `timestamp` | Date | |

The "which spaces exist" registry is the live CMA — `GET /organizations/{org}/spaces`. We don't maintain a separate registry content type.

## 6. Freeze flow (MVP 2)

### 6.1 State machine

```
                            ┌─────────┐
                            │   OFF   │ ◄────────┐
                            └────┬────┘          │
                        "Freeze" │                │
                                 ▼               │
                  ┌─────────────────────────┐    │
                  │  TRANSITIONING_ON       │    │
                  │  substitute admins one  │    │
                  │  at a time              │    │
                  └────┬────────────┬───────┘    │
                       │            │             │
                  all succeed   any fail          │
                       ▼            ▼             │
                  ┌─────────┐  ┌──────────┐      │
                  │ FROZEN  │  │ DEGRADED │      │
                  └────┬────┘  └────┬─────┘      │
                       │            │             │
                  "Thaw"      cron retries        │
                       ▼            │             │
                  ┌─────────────────────────┐    │
                  │  TRANSITIONING_OFF       │   │
                  └────┬─────────────────────┘   │
                       │                          │
                  all restored ──────────────────┘
```

### 6.2 Freeze ON walk-through

1. **Iframe → Vercel** `POST /api/toggle-freeze { spaceId, action: "freeze" }`, App-Identity signed.
2. **Pre-check** `spaceState.freezeStatus`. If `FROZEN` / `TRANSITIONING_ON`: idempotent OK. If `DEGRADED`: `409`.
3. **Write `TRANSITIONING_ON`** with `frozenAt`, `frozenBy`. Append `FREEZE_TOGGLED` audit. Return `200 { jobId, currentStatus: "TRANSITIONING_ON" }`. *Crash here = next cron resumes from step 4.*
4. **Ensure substitute role exists** in target space. Name `frozenRoleName`. If absent, create with full Admin capability set minus `permissions.manageRoles = "none"`. Cache ID in `spaceState.customFrozenRoleId`.
5. **Enumerate Admin-role space memberships** via `GET /spaces/{id}/space_memberships?role=admin`. Exclude:
   - Memberships sourced from the protected `Org Admins` team.
   - The toggling org admin themselves.
6. **For each remaining user:** PATCH membership to substitute role; record entry in `substitutions`. *Crash mid-loop = next cron resumes from missing users.*
7. On loop completion, write `FROZEN`. Append `SUBSTITUTION_APPLIED` audit summary.
8. On per-user PATCH failure exceeding retry budget, mark `DEGRADED` with failed userIds in audit detail.

Steps 4–8 run inside `waitUntil(...)` so the HTTP response in step 3 returns immediately.

### 6.3 Freeze OFF walk-through

Mirror of ON: read `substitutions`, PATCH each user back to their `originalRoleId`, delete the map entry on each success. When map is empty, write `OFF`.

### 6.4 Constraints

- **Self-protection:** the toggle endpoint refuses to freeze the console space itself (`422`).
- **Concurrency:** optimistic concurrency on the `spaceState` entry version. Second concurrent writer gets `409` and treats it as "lost the race", returns idempotent OK.
- **Bound on per-user retries:** 3 attempts with exponential backoff + jitter before marking the user as failed.

### 6.5 Load-bearing assumption — to verify live

Setting `permissions.manageRoles = "none"` on a custom role hides Settings → Roles & Permissions for assigned users and 403s the equivalent CMA endpoint. Verified by Probe 1 (Section 9.1). If false, redesign required.

## 7. Fan-out flow (MVP 1)

### 7.1 Operation (idempotent)

```text
ensure_team_attached(orgId, spaceId, teamId):
    existing = GET /organizations/{orgId}/team_space_memberships?team=teamId&space=spaceId
    if any existing with role == Admin: return NO_OP
    if any existing with role != Admin:
        PATCH to Admin
        audit TEAM_ROLE_REPAIRED
        return REPAIRED
    POST team_space_memberships { team, space, admin: true }
    audit TEAM_ATTACHED
    return ATTACHED
```

### 7.2 Three triggers

1. **Retroactive sweep** at bootstrap and on the "Reconcile Now" button. Iterates `GET /organizations/{org}/spaces`, calls `ensure_team_attached` for each (skipping the console space).
2. **Webhook on `Space.create`** — same operation, called per event, target space ID from the payload.
3. **Nightly cron `0 5 * * *` UTC** — full sweep per installation. Also resumes `TRANSITIONING_*` freezes older than 5 min and repairs `DEGRADED` states.

### 7.3 Removal defense

- Native: per existing testing, a Space Admin cannot remove a Team-attached membership via the UI.
- Backup: webhook subscribed to `TeamSpaceMembership.delete`. If the affected team is `orgAdminsTeamId`, re-attach immediately; audit `TEAM_REMOVED_DETECTED`. Optional notify hooks (Slack/email) deferred.

### 7.4 Load-bearing assumption — to verify live

A non-Org-Admin user cannot delete a `TeamSpaceMembership` via UI or via API. Verified by Probe 2 (Section 9.1). If only the UI blocks, the webhook-based re-attach becomes the real defense.

## 8. Vercel function contracts

All four endpoints use one of three auth flavors:

| Caller | Mechanism | Header(s) |
|---|---|---|
| App iframe | Contentful App Identity signed request | `X-Contentful-Signature`, `X-Contentful-Signed-Headers`, `X-Contentful-Timestamp` |
| Contentful webhook | HMAC-SHA256 of raw body via per-installation derived secret (see 8.1 step 5) | `X-Contentful-Webhook-Signature`, `X-Contentful-Topic` |
| Vercel cron | Shared bearer token from `CRON_SECRET` env | `Authorization: Bearer …` |

Outbound CMA calls from Vercel are made via App-Identity-minted tokens scoped to the target `(orgId, spaceId)`. Cached in-memory for the token lifetime.

### 8.1 `POST /api/bootstrap`

Called by the wizard at install completion.

**Request**
```json
{
  "orgId": "<org id>",
  "installationId": "<app installation id>",
  "consoleSpaceId": "<space id chosen or just-created>",
  "orgAdminsTeamName": "Org Admins",
  "initialTeamMemberUserIds": ["<user id>"]
}
```

**Server actions (idempotent, ordered)**
1. Create content types (`governanceConfig`, `spaceState`, `auditEvent`) in the console space if absent.
2. Create the `governanceConfig` singleton; persist `orgAdminsTeamId = null` initially.
3. Create or reuse the Team named `orgAdminsTeamName`. Persist team ID.
4. Add initial members to the team.
5. Register webhooks for `Space.create` and `TeamSpaceMembership.delete`. Configure each webhook's HMAC secret as a per-installation derived value `HMAC-SHA256(globalWebhookSecret, installationId)` — `globalWebhookSecret` lives in Vercel env, derived secrets do not need separate storage. Rotation is performed by changing `globalWebhookSecret` and re-registering all webhooks.
6. Run the first retroactive sweep.
7. Append `RECONCILE_RUN` audit event.

**Response** — JSON summary including `orgAdminsTeamId`, sweep counts, webhook IDs.

**Errors**
- `401` invalid signature
- `403` caller is not Org Admin
- `409` already bootstrapped — return existing state
- `5xx` partial failure → client retries (idempotent)

### 8.2 `POST /api/toggle-freeze`

**Request** — `{ spaceId, action: "freeze" | "thaw" }`.

**Server actions** — Section 6 state machine. HTTP response returns at the `TRANSITIONING_*` write; substitution loop runs via `waitUntil(...)`.

**Response (immediate)**
```json
{
  "ok": true,
  "spaceId": "...",
  "previousStatus": "OFF",
  "currentStatus": "TRANSITIONING_ON",
  "jobId": "freeze-<timestamp>-<space-prefix>"
}
```

**Errors**
- `401` invalid signature
- `403` caller is not Org Admin
- `409` invalid transition
- `422` target is the console space

### 8.3 `POST /api/webhook`

Verifies HMAC, routes on `X-Contentful-Topic`:
- `Space.create` → `ensure_team_attached`; lazily create `spaceState`.
- `TeamSpaceMembership.delete` for the protected team → re-attach; audit `TEAM_REMOVED_DETECTED`.
- Any other topic → 200 no-op.

Returns 5xx on transient failures so Contentful retries. Idempotent against duplicate events.

### 8.4 `GET /api/cron/reconcile`

Daily `0 5 * * *` UTC. For each installation:
- Retroactive sweep.
- Resume `TRANSITIONING_*` older than 5 min.
- Repair `DEGRADED` states.
- Append `RECONCILE_RUN` audit.

### 8.5 Supporting endpoint

`GET /api/state?spaceId=…` — returns current `spaceState` + last 5 audit events. Used by iframe polling during a transition.

## 9. Error handling & drift

### 9.1 Live probes (Section 11 below covers test plan; this section lists assumptions)

| Probe | Verifies | Failure consequence |
|---|---|---|
| **P1 — `manageRoles="none"` hides R&P** | UI hides menu; API 403s | Mechanism A loses real enforcement; bolt on audit-and-revert; user-visible UX still matches the mockup |
| **P2 — Team membership not removable below Org Admin** | UI denies removal; API 403s | Webhook-based re-attach becomes the real defense |

Probes run as the first commit on the project, before product code.

### 9.2 Failure catalog

| Failure | Detection | Recovery |
|---|---|---|
| CMA 429 mid-substitution | CMA client retries w/ jitter, 3 attempts/user | Loop completes; failed users → `DEGRADED`; cron retries within 24h |
| Webhook delivery exhausted | Event never received | Nightly cron sweep catches up within 24h (can be shortened to hourly if needed) |
| Console space deleted | Subsequent CMA calls 404 on `governanceConfig` | Hard failure. Bootstrap script in repo recreates from existing team + webhook IDs (persisted in Vercel env). Wizard recommends locking deletion behind Owner during install. |
| Org Admins team deleted | CMA 404 on team ID | Critical `ERROR` audit; banner in console; no auto-recovery (requires human intent) |
| Substitute role deleted in a space mid-freeze | Cron detects orphaned `substitutions` referencing missing role | Recreate role, re-substitute. `ERROR` audit. |
| Substitution restore fails (user/role gone) | PATCH 404/409 on thaw | Drop entry; audit `SUBSTITUTION_REVERTED { result: "user_no_longer_present" }`; continue thaw |
| Concurrent toggle clicks | Optimistic concurrency on `spaceState` | Loser gets `409`, treats as no-op |
| App uninstalled mid-freeze | Next sweep finds install gone | Substituted users remain demoted; manual thaw via CMA required. Wizard warns. |
| Webhook secret rotation | Manual | `POST /api/bootstrap { action: "rotate-secrets" }`; audit `WEBHOOK_SECRET_ROTATED` |
| App private key rotation | Manual, planned | New keypair in Vercel env; old key works during grace window |

### 9.3 User-visible recovery

`DEGRADED` shows a "Retry now" button that scopes a reconcile to one space, so users don't wait until cron.

### 9.4 Logging

- **Audit log** (user-facing) — `auditEvent` entries in Contentful.
- **System log** — structured JSON in Vercel: `{ installationId, orgId, spaceId, op, durationMs, result }`.

## 10. Testing strategy

### 10.1 Live probes — see 9.1, run first

Documented in `docs/manual-probes.md`. Wizard's pre-flight covers automated subset.

### 10.2 Unit tests (Vitest)

- Pure logic: state machine transitions, `ensure_team_attached`, audit shapes, signature verification.
- CMA client wrapper (mocked `fetch`): backoff, token caching, error mapping.
- Webhook handler: fixture payloads + signatures for each topic.

Target: <2s total, ~80% of test surface.

### 10.3 Integration tests (gated by `CF_INTEGRATION=1`)

Against the live `Jobs` space + ephemeral throwaway content. Each test cleans up.

- Bootstrap round-trip.
- Freeze → thaw cycle for one space.
- Webhook fan-out: create new space → poll for team attachment within 30s.
- Drift recovery: corrupt state, trigger cron, verify resolution.

Run in CI on main + PRs touching `api/**` or `lib/**`. Skipped locally by default.

### 10.4 Manual demo scenarios

Documented in `docs/manual-test-plan.md`. Six scenarios cover first-run bootstrap, fan-out, freeze, attempted removal, thaw, and concurrency. Customer-facing demo script in `docs/demo-walkthrough.md` covers scenarios 1, 3, 4, 5 in ~7 min.

### 10.5 Out of scope (YAGNI)

- Load testing, cross-browser tests, chaos injection.

## 11. Bootstrap wizard (UX)

Six screens, ~2 minutes wall time:

1. **Welcome** — what the app does (MVP 1 + MVP 2 summary), warning that the wizard will create or attach to one space and create one team, two webhooks, plus content types. Role requirement (Org Admin/Owner).
2. **Pre-flight checks** — automated capability probes (auth, role-creation, team-creation, webhook-creation). Manual enforcement probes (P1, P2 from 9.1) are deferred and surfaced via "Invite test user" shortcut on the post-install console + link to `docs/manual-probes.md`. A failing automated probe routes to a degraded install path that ships MVP 1 only.
3. **Choose console space** — create new (default `governance-console`) or pick an existing empty space.
4. **Define Org Admins team** — team name (default "Org Admins"), initial member list (installer pre-filled and required).
5. **Review** — list of artifacts the wizard will create. Recommendation to lock console-space deletion behind Org Owner.
6. **Done** — summary of what was created; primary CTA opens the governance console.

Failure path: a failing automated pre-flight check stops the wizard with a clear remediation message; install can proceed in "MVP 1 only" mode if the user accepts.

## 12. Multi-tenancy

- App Definition lives in the publisher org (initially `30SScScam27l3EU95xxctv`); other orgs install via shared URL.
- Every CMA call in production uses App Identity (signed JWT minted per request). No PAT in production code paths.
- Every tenant has its own `governance-console` space, its own content type instances, its own webhook secrets (per-installation keying in Vercel env).
- Vercel functions take `(orgId, installationId, spaceId)` from request context — no constants.
- Distribution starts private. Marketplace listing is a later step; nothing about the design blocks it.

## 13. Bootstrap of the dev environment (one-time, for this tenant)

For `30SScScam27l3EU95xxctv`:
- Org has only one space (`ubgf1y7ixw5q` — "Jobs"). Create at least one additional empty space during dev to demonstrate fan-out.
- Invite a throwaway Contentful user to be the manual-probe subject for P1 and P2.
- During local dev, use the working PAT (`CFPAT-E_r2xN…`) against the org. Rotate after the build is complete. Production paths use App Identity.

## 14. Open questions / known unknowns

- **Q1.** Exact CMA field name(s) gating R&P UI access (current assumption: `permissions.manageRoles`). Resolved by P1.
- **Q2.** Whether `TeamSpaceMembership.delete` can be triggered by lower-than-Org-Admin actors via API. Resolved by P2.
- **Q3.** Whether Vercel `waitUntil` reliably runs the substitution loop across regional cold starts at our scale. If unreliable, fall back to a small queue (Vercel KV or a polling-based design).
- **Q4.** Exact policy on what to do if the toggling org admin would lock themselves out (e.g., they're not on the protected team). Current default: exclude self from substitution. Refine if it surfaces confusing UX during the demo.
- **Q5.** Whether Contentful's CMA exposes a stable way to register webhooks at the org level (vs per-space), required for `Space.create` to fire reliably for new spaces. If the API only supports space-level webhooks, fan-out for new spaces relies entirely on the nightly cron until the user manually triggers a sweep. Resolve during the bootstrap implementation step; if blocked, document the eventually-consistent guarantee clearly in the wizard.

## 15. Out-of-band references

- Verified PAT (dev only, rotate post-build): `CFPAT-E_r2xN…` — owner `ben.le@contentful.com`.
- Target org: `30SScScam27l3EU95xxctv` ("Ben Simple Projects").
- Demo space: `ubgf1y7ixw5q` ("Jobs").
- Auto-memory: `~/.claude/projects/-Users-benle-Desktop/memory/project_contentful_role_guard_app.md`.
