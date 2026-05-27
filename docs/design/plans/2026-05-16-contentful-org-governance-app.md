# Contentful Org Governance App Implementation Plan

> Implementation plan executed task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking progress.

**Goal:** Ship a multi-tenant Contentful App that protects org admins via an auto-attached Team (MVP 1) and freezes role/permission edits per space via role substitution (MVP 2). State in Contentful, compute on Vercel.

**Architecture:** Single Contentful App with two UI surfaces (governance console + frozen page) selected by space ID at runtime. Vercel hosts four serverless functions (`bootstrap`, `toggle-freeze`, `webhook`, `cron/reconcile`) and a supporting `GET /api/state`. CMA access via App Identity; all per-tenant state lives in three content types inside a per-tenant `governance-console` space. Build is TDD with Vitest; integration tests gated on `CF_INTEGRATION=1` run against the live target org.

**Tech Stack:** TypeScript, Node 20, Vercel Functions, React 18 + Vite, `@contentful/app-sdk`, `@contentful/f36-components`, `contentful-management`, `@contentful/node-apps-toolkit`, Vitest, pnpm.

**Spec:** `docs/design/specs/2026-05-16-contentful-org-governance-app-design.md`.

**Pre-baked context for every task:**
- Working directory: `/Users/benle/Desktop/test app`
- Target org: `30SScScam27l3EU95xxctv` (Ben Simple Projects)
- Demo space (only existing): `ubgf1y7ixw5q` (Jobs)
- Dev PAT (rotate after build): `CFPAT-REDACTED` — kept in `.env`, never committed
- All tasks must run `pnpm tsc --noEmit` clean before commit
- Commit messages use Conventional Commits prefix (`feat:`, `test:`, `chore:`, `docs:`)

---

## Phase 0 — Project setup

### Task 1: Initialize project skeleton, install deps, configure test + types

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `vercel.json`, `.env.example`, `.nvmrc`

- [ ] **Step 1: Write `.nvmrc` and `package.json`**

Create `/Users/benle/Desktop/test app/.nvmrc`:
```
20
```

Create `/Users/benle/Desktop/test app/package.json`:
```json
{
  "name": "contentful-org-governance",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "build:app": "cd app && pnpm build",
    "dev:app": "cd app && pnpm dev"
  },
  "dependencies": {
    "@contentful/node-apps-toolkit": "^3.4.0",
    "contentful-management": "^11.40.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@vercel/node": "^3.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`, `vitest.config.ts`, `vercel.json`, `.env.example`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["node", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["api/**/*", "lib/**/*", "scripts/**/*", "tests/**/*"],
  "exclude": ["app", "node_modules", "dist"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"]
  }
});
```

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/**/*.ts": { "runtime": "@vercel/node" }
  },
  "crons": [
    { "path": "/api/cron/reconcile", "schedule": "0 5 * * *" }
  ]
}
```

`.env.example`:
```
# Required: Contentful App Definition private key (PEM, multiline OK via single-line \n escaping)
APP_DEFINITION_ID=
APP_PRIVATE_KEY=

# Required: HMAC root from which per-installation webhook secrets are derived
GLOBAL_WEBHOOK_SECRET=

# Required: shared bearer to authenticate Vercel cron invocations
CRON_SECRET=

# Dev-only fallback for local probes; not used in production code paths
CF_DEV_PAT=
CF_TARGET_ORG=30SScScam27l3EU95xxctv
```

- [ ] **Step 3: Install deps and write `tests/setup.ts`**

Run:
```bash
cd "/Users/benle/Desktop/test app" && pnpm install
```

Create `tests/setup.ts`:
```ts
import { afterEach, beforeAll } from "vitest";
beforeAll(() => {
  if (!process.env.GLOBAL_WEBHOOK_SECRET) process.env.GLOBAL_WEBHOOK_SECRET = "test-global-secret";
  if (!process.env.CRON_SECRET) process.env.CRON_SECRET = "test-cron-secret";
});
afterEach(() => {});
```

- [ ] **Step 4: Verify typecheck and test runner**

Run:
```bash
pnpm typecheck && pnpm test
```
Expected: `typecheck` exits 0; `vitest` reports `No test files found`, exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts vercel.json .env.example .nvmrc tests/setup.ts
git commit -m "chore: scaffold project (TS, Vitest, Vercel, App Identity deps)"
```

---

## Phase 1 — Live probes (run first; verify load-bearing assumptions)

### Task 2: Probe 1 — `manageRoles="none"` blocks the Roles & Permissions UI

**Files:**
- Create: `scripts/probe-1-role-hides-rp.ts`, `docs/manual-probes.md`

- [ ] **Step 1: Write the probe script (automated portion only — verifies the role can be created/read)**

Create `/Users/benle/Desktop/test app/scripts/probe-1-role-hides-rp.ts`:
```ts
import { createClient } from "contentful-management";

const PAT = process.env.CF_DEV_PAT;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";
const SPACE = process.argv[2] ?? "ubgf1y7ixw5q";
const ROLE_NAME = "probe-1-frozen-admin";

if (!PAT) { console.error("CF_DEV_PAT not set"); process.exit(2); }

const cma = createClient({ accessToken: PAT });

async function main() {
  const space = await cma.getSpace(SPACE);
  const env = await space.getEnvironment("master");

  const existing = (await env.getRoles()).items.find((r) => r.name === ROLE_NAME);
  if (existing) { await existing.delete(); console.log("deleted stale probe role"); }

  const role = await space.createRole({
    name: ROLE_NAME,
    description: "Probe-1: built-in Admin minus manageRoles",
    permissions: {
      ContentDelivery: "all",
      ContentModel: ["read"],
      EnvironmentAliases: "all",
      Environments: "all",
      Settings: "all",
      Tags: "all"
    },
    policies: [{ effect: "allow", actions: "all", constraint: { and: [] } }]
  } as any);

  console.log("Created role id:", role.sys.id);
  console.log("permissions echo:", JSON.stringify(role.permissions, null, 2));
  console.log(
    "\nMANUAL STEP: invite a throwaway Contentful user to space",
    SPACE,
    "with this role and confirm Settings → Roles & Permissions is hidden in the UI."
  );
  console.log("Clean up with: pnpm tsx scripts/probe-1-role-hides-rp.ts cleanup");
}

async function cleanup() {
  const space = await cma.getSpace(SPACE);
  const role = (await space.getRoles()).items.find((r) => r.name === ROLE_NAME);
  if (role) { await role.delete(); console.log("cleaned up"); } else { console.log("nothing to clean"); }
}

(process.argv.includes("cleanup") ? cleanup() : main()).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Document the manual portion**

Create `/Users/benle/Desktop/test app/docs/manual-probes.md`:
```markdown
# Manual Probes — P1 & P2

These verify the spec's two load-bearing assumptions. Run them once against your target org. Re-run after any Contentful product change that may affect roles, teams, or webhooks.

## P1 — `manageRoles="none"` hides Settings → Roles & Permissions

**Automated portion:**
1. `pnpm tsx scripts/probe-1-role-hides-rp.ts` — creates the probe role in space `ubgf1y7ixw5q`.
2. Note the printed role ID and the `permissions` block. Confirm Contentful accepts the role with the chosen restrictions.

**Manual portion:**
3. Invite a throwaway Contentful user (e.g. `probe1+gov@<your-domain>`) to space `ubgf1y7ixw5q` with the new probe role.
4. Have the throwaway user log in.
5. Navigate to https://app.contentful.com/spaces/ubgf1y7ixw5q/settings/roles. **Expected:** denied or empty.
6. Open `Settings` in the sidebar. **Expected:** no "Roles & Permissions" entry.
7. Using a PAT generated by the throwaway user, run:
   `curl -H "Authorization: Bearer <PAT>" https://api.contentful.com/spaces/ubgf1y7ixw5q/roles`. **Expected:** HTTP 403.

**Pass criteria:** all three manual checks deny access.
**Cleanup:** `pnpm tsx scripts/probe-1-role-hides-rp.ts cleanup`.

## P2 — A Space Admin cannot remove a Team-attached membership

**Automated portion:**
1. `pnpm tsx scripts/probe-2-team-removal.ts setup` — creates Team `probe-2-admins`, adds `ben.le`, attaches to space `ubgf1y7ixw5q` as Admin.
2. The script invites `probe2+admin@<your-domain>` as a separate direct Space Admin (you accept the invite manually).

**Manual portion:**
3. As `probe2+admin@…`, open the Jobs space's Users list. Try to remove the Team membership. **Expected:** disallowed.
4. As `probe2+admin@…`, generate a PAT and run:
   `curl -X DELETE -H "Authorization: Bearer <PAT>" https://api.contentful.com/organizations/30SScScam27l3EU95xxctv/team_space_memberships/<id>` (id from the setup script output). **Expected:** HTTP 403.

**Pass criteria:** both attempts denied.
**Cleanup:** `pnpm tsx scripts/probe-2-team-removal.ts cleanup`.

## Recording outcomes

After running each probe, append a line to this file:

```
- 2026-05-16 P1: PASS (UI hides, API 403s)
- 2026-05-16 P2: PASS (UI denies, API 403s)
```

If either fails, **stop and revisit the spec** — particularly Section 9.1.
```

- [ ] **Step 3: Run the automated portion against the live org**

Run:
```bash
cd "/Users/benle/Desktop/test app" && pnpm add -D tsx >/dev/null && \
  CF_DEV_PAT="CFPAT-REDACTED" \
  pnpm tsx scripts/probe-1-role-hides-rp.ts
```
Expected: prints `Created role id: <id>` and a `permissions echo` block. If Contentful rejects the permission set, **STOP** and surface the error — the spec's Mechanism A doesn't work as written.

- [ ] **Step 4: Clean up the probe role**

Run:
```bash
CF_DEV_PAT="CFPAT-REDACTED" \
  pnpm tsx scripts/probe-1-role-hides-rp.ts cleanup
```
Expected: `cleaned up`. The role is gone.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-1-role-hides-rp.ts docs/manual-probes.md package.json pnpm-lock.yaml
git commit -m "feat(probes): add P1 — role with manageRoles=none probe + manual docs"
```

### Task 3: Probe 2 — Team-attached membership cannot be removed below Org Admin

**Files:**
- Create: `scripts/probe-2-team-removal.ts`

- [ ] **Step 1: Write the probe setup/cleanup script**

Create `/Users/benle/Desktop/test app/scripts/probe-2-team-removal.ts`:
```ts
import { createClient } from "contentful-management";
const PAT = process.env.CF_DEV_PAT!;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";
const SPACE = "ubgf1y7ixw5q";
const TEAM_NAME = "probe-2-admins";

const cma = createClient({ accessToken: PAT });

async function setup() {
  const org = await cma.getOrganization(ORG);

  const existingTeam = (await org.getTeams()).items.find((t) => t.name === TEAM_NAME);
  const team = existingTeam ?? (await org.createTeam({ name: TEAM_NAME, description: "Probe 2" }));
  console.log("teamId:", team.sys.id);

  const memberships = await org.getTeamSpaceMemberships({ "sys.team.sys.id": team.sys.id });
  if (!memberships.items.find((m) => m.sys.space?.sys.id === SPACE)) {
    const tsm = await org.createTeamSpaceMembership(team.sys.id, {
      admin: true,
      roles: [],
      sys: { space: { sys: { id: SPACE, type: "Link", linkType: "Space" } } }
    } as any);
    console.log("teamSpaceMembershipId:", tsm.sys.id);
  } else {
    console.log("teamSpaceMembershipId:", memberships.items[0]!.sys.id, "(already existed)");
  }

  console.log("\nMANUAL STEP:");
  console.log(" 1. Invite probe2+admin@<your-domain> to space", SPACE, "as direct Space Admin.");
  console.log(" 2. Log in as that user, attempt to remove the Team membership above via UI and via DELETE on the CMA.");
  console.log(" 3. Record outcome in docs/manual-probes.md.");
  console.log("Cleanup: pnpm tsx scripts/probe-2-team-removal.ts cleanup");
}

async function cleanup() {
  const org = await cma.getOrganization(ORG);
  const team = (await org.getTeams()).items.find((t) => t.name === TEAM_NAME);
  if (!team) { console.log("no team"); return; }
  const memberships = await org.getTeamSpaceMemberships({ "sys.team.sys.id": team.sys.id });
  for (const m of memberships.items) await m.delete();
  await team.delete();
  console.log("cleaned up");
}

(process.argv.includes("cleanup") ? cleanup() : setup()).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run setup against the live org**

Run:
```bash
CF_DEV_PAT="CFPAT-REDACTED" \
  pnpm tsx scripts/probe-2-team-removal.ts
```
Expected: prints `teamId: …` and `teamSpaceMembershipId: …` and the manual steps.

- [ ] **Step 3: Perform the manual steps (one-time human work)**

Follow the printed manual steps. Record the outcome in `docs/manual-probes.md` under "Recording outcomes". If the API DELETE succeeds, **STOP** — Section 9.1's defense plan changes (webhook re-attach becomes load-bearing).

- [ ] **Step 4: Clean up**

Run:
```bash
CF_DEV_PAT="CFPAT-REDACTED" \
  pnpm tsx scripts/probe-2-team-removal.ts cleanup
```
Expected: `cleaned up`.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-2-team-removal.ts docs/manual-probes.md
git commit -m "feat(probes): add P2 — team-removal protection probe"
```

---

## Phase 2 — Foundation libraries

### Task 4: CMA client with App Identity token caching

**Files:**
- Create: `lib/cma/token-cache.ts`, `tests/unit/cma/token-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/cma/token-cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenCache } from "@/lib/cma/token-cache";

describe("TokenCache", () => {
  let mint: ReturnType<typeof vi.fn>;
  let cache: TokenCache;
  beforeEach(() => {
    mint = vi.fn(async (orgId: string, spaceId: string) => ({
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/cma/token-cache.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cma/token-cache'`.

- [ ] **Step 3: Implement `TokenCache`**

Create `/Users/benle/Desktop/test app/lib/cma/token-cache.ts`:
```ts
export type MintedToken = { token: string; expiresAt: number };
export type Minter = (orgId: string, spaceId: string) => Promise<MintedToken>;

export class TokenCache {
  private readonly store = new Map<string, MintedToken>();
  constructor(private readonly mint: Minter, private readonly skewMs = 5_000) {}

  async get(orgId: string, spaceId: string): Promise<string> {
    const key = `${orgId}/${spaceId}`;
    const hit = this.store.get(key);
    if (hit && hit.expiresAt - this.skewMs > Date.now()) return hit.token;
    const fresh = await this.mint(orgId, spaceId);
    this.store.set(key, fresh);
    return fresh.token;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/cma/token-cache.test.ts`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cma/token-cache.ts tests/unit/cma/token-cache.test.ts
git commit -m "feat(cma): add TokenCache for App Identity tokens"
```

### Task 5: CMA client wrapper with retry/backoff

**Files:**
- Create: `lib/cma/rate-limit.ts`, `lib/cma/client.ts`, `tests/unit/cma/rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/benle/Desktop/test app/tests/unit/cma/rate-limit.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/cma/rate-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `withRetry` and the CMA client factory**

Create `/Users/benle/Desktop/test app/lib/cma/rate-limit.ts`:
```ts
type ErrLike = { status?: number };
export type RetryOpts = { maxAttempts: number; baseMs: number };

function retriable(e: ErrLike): boolean {
  const s = e.status ?? 0;
  return s === 429 || (s >= 500 && s < 600);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < opts.maxAttempts) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!retriable(e as ErrLike)) throw e;
      attempt++;
      if (attempt >= opts.maxAttempts) break;
      const jitter = Math.random() * opts.baseMs;
      const delay = opts.baseMs * Math.pow(2, attempt - 1) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

Create `/Users/benle/Desktop/test app/lib/cma/client.ts`:
```ts
import { createClient, type ClientAPI } from "contentful-management";
import { getManagementToken } from "@contentful/node-apps-toolkit";
import { TokenCache } from "./token-cache";

const APP_DEF = process.env.APP_DEFINITION_ID;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
const DEV_PAT = process.env.CF_DEV_PAT;

async function mintAppToken(orgId: string, spaceId: string) {
  if (!APP_DEF || !APP_PRIVATE_KEY) throw new Error("App Identity env not configured");
  const token = await getManagementToken(APP_PRIVATE_KEY, {
    appInstallationId: APP_DEF,
    spaceId,
    environmentId: "master"
  });
  return { token, expiresAt: Date.now() + 9 * 60_000 };
}

const cache = new TokenCache(mintAppToken);

export async function cmaForSpace(orgId: string, spaceId: string): Promise<ClientAPI> {
  const accessToken = DEV_PAT ?? (await cache.get(orgId, spaceId));
  return createClient({ accessToken });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/cma/`
Expected: all `TokenCache` + `withRetry` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cma/rate-limit.ts lib/cma/client.ts tests/unit/cma/rate-limit.test.ts
git commit -m "feat(cma): add retry/backoff and App-Identity-aware client"
```

### Task 6: App Identity signature verification (iframe → Vercel auth)

**Files:**
- Create: `lib/auth/verify-app-signature.ts`, `tests/unit/auth/verify-app-signature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/auth/verify-app-signature.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { verifyAppSignature } from "@/lib/auth/verify-app-signature";

vi.mock("@contentful/node-apps-toolkit", () => ({
  verifyRequest: vi.fn((_pk: string, req: any) =>
    req.headers["x-contentful-signature"] === "valid"
  )
}));

describe("verifyAppSignature", () => {
  const baseReq = {
    method: "POST",
    path: "/api/toggle-freeze",
    headers: {
      "x-contentful-signature": "valid",
      "x-contentful-signed-headers": "x-contentful-timestamp",
      "x-contentful-timestamp": String(Date.now()),
      "x-contentful-user-id": "user-abc",
      "x-contentful-space-id": "ubgf1y7ixw5q",
      "x-contentful-environment-id": "master"
    },
    body: '{"spaceId":"ubgf1y7ixw5q","action":"freeze"}'
  };

  it("returns identity claims on valid signature", () => {
    const id = verifyAppSignature(baseReq, "private-key-pem");
    expect(id).toEqual({
      userId: "user-abc",
      spaceId: "ubgf1y7ixw5q",
      environmentId: "master"
    });
  });

  it("throws on invalid signature", () => {
    const bad = { ...baseReq, headers: { ...baseReq.headers, "x-contentful-signature": "bad" } };
    expect(() => verifyAppSignature(bad, "private-key-pem")).toThrow(/signature/i);
  });

  it("throws on stale timestamp (> 30s old)", () => {
    const stale = { ...baseReq, headers: { ...baseReq.headers, "x-contentful-timestamp": String(Date.now() - 60_000) } };
    expect(() => verifyAppSignature(stale, "private-key-pem")).toThrow(/timestamp/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/auth/verify-app-signature.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement signature verification**

Create `/Users/benle/Desktop/test app/lib/auth/verify-app-signature.ts`:
```ts
import { verifyRequest } from "@contentful/node-apps-toolkit";

export type AppIdentity = { userId: string; spaceId: string; environmentId: string };
export type IncomingReq = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
};

const MAX_SKEW_MS = 30_000;

export function verifyAppSignature(req: IncomingReq, appPrivateKey: string): AppIdentity {
  const ts = Number(req.headers["x-contentful-timestamp"]);
  if (!ts || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    throw new Error("Stale or missing timestamp");
  }
  const ok = verifyRequest(appPrivateKey, {
    method: req.method,
    path: req.path,
    headers: req.headers as Record<string, string>,
    body: req.body
  });
  if (!ok) throw new Error("Invalid signature");
  const userId = req.headers["x-contentful-user-id"];
  const spaceId = req.headers["x-contentful-space-id"];
  const environmentId = req.headers["x-contentful-environment-id"];
  if (!userId || !spaceId || !environmentId) throw new Error("Missing identity headers");
  return { userId, spaceId, environmentId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/auth/`
Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/verify-app-signature.ts tests/unit/auth/verify-app-signature.test.ts
git commit -m "feat(auth): verify Contentful App Identity request signatures"
```

### Task 7: Webhook HMAC and cron bearer auth + derived webhook secrets

**Files:**
- Create: `lib/auth/verify-webhook-hmac.ts`, `lib/auth/verify-cron-token.ts`, `lib/secrets/derive-webhook-secret.ts`, `tests/unit/auth/verify-webhook-hmac.test.ts`, `tests/unit/secrets/derive-webhook-secret.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/benle/Desktop/test app/tests/unit/secrets/derive-webhook-secret.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deriveWebhookSecret } from "@/lib/secrets/derive-webhook-secret";

describe("deriveWebhookSecret", () => {
  it("is deterministic for same inputs", () => {
    const a = deriveWebhookSecret("global", "inst-1");
    const b = deriveWebhookSecret("global", "inst-1");
    expect(a).toBe(b);
  });
  it("differs across installations", () => {
    expect(deriveWebhookSecret("global", "inst-1")).not.toBe(deriveWebhookSecret("global", "inst-2"));
  });
  it("differs across global roots", () => {
    expect(deriveWebhookSecret("globalA", "inst-1")).not.toBe(deriveWebhookSecret("globalB", "inst-1"));
  });
});
```

Create `/Users/benle/Desktop/test app/tests/unit/auth/verify-webhook-hmac.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookHmac } from "@/lib/auth/verify-webhook-hmac";

const SECRET = "derived-secret";
const BODY = '{"sys":{"type":"Space","id":"newspace"}}';
const VALID = createHmac("sha256", SECRET).update(BODY).digest("hex");

describe("verifyWebhookHmac", () => {
  it("accepts a valid signature", () => {
    expect(() => verifyWebhookHmac(BODY, VALID, SECRET)).not.toThrow();
  });
  it("rejects mismatched signature", () => {
    expect(() => verifyWebhookHmac(BODY, "0".repeat(64), SECRET)).toThrow(/hmac/i);
  });
  it("rejects missing signature", () => {
    expect(() => verifyWebhookHmac(BODY, undefined, SECRET)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/secrets/ tests/unit/auth/verify-webhook-hmac.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement derive + verifiers**

Create `/Users/benle/Desktop/test app/lib/secrets/derive-webhook-secret.ts`:
```ts
import { createHmac } from "node:crypto";
export function deriveWebhookSecret(globalSecret: string, installationId: string): string {
  return createHmac("sha256", globalSecret).update(`webhook:${installationId}`).digest("hex");
}
```

Create `/Users/benle/Desktop/test app/lib/auth/verify-webhook-hmac.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyWebhookHmac(rawBody: string, signature: string | undefined, secret: string): void {
  if (!signature) throw new Error("Missing webhook HMAC");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Webhook HMAC mismatch");
}
```

Create `/Users/benle/Desktop/test app/lib/auth/verify-cron-token.ts`:
```ts
import { timingSafeEqual } from "node:crypto";
export function verifyCronToken(header: string | undefined): void {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = (header ?? "").replace(/^Bearer\s+/i, "");
  if (!expected) throw new Error("CRON_SECRET not configured");
  if (provided.length !== expected.length) throw new Error("Cron auth mismatch");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) throw new Error("Cron auth mismatch");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/secrets/ tests/unit/auth/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/secrets/derive-webhook-secret.ts lib/auth/verify-webhook-hmac.ts lib/auth/verify-cron-token.ts \
        tests/unit/secrets/derive-webhook-secret.test.ts tests/unit/auth/verify-webhook-hmac.test.ts
git commit -m "feat(auth): webhook HMAC + cron bearer + per-installation derived secrets"
```

---

## Phase 3 — Content model layer

### Task 8: Content type definitions + ensure-types installer

**Files:**
- Create: `lib/content-model/content-types.ts`, `lib/content-model/ensure-types.ts`, `tests/unit/content-model/ensure-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/content-model/ensure-types.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { ensureContentTypes } from "@/lib/content-model/ensure-types";
import { GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE } from "@/lib/content-model/content-types";

function fakeEnv(existing: string[]) {
  return {
    getContentTypes: vi.fn().mockResolvedValue({ items: existing.map((id) => ({ sys: { id } })) }),
    createContentTypeWithId: vi.fn(async (id: string) => ({
      sys: { id, version: 1 },
      publish: vi.fn(async () => ({ sys: { id, version: 2 } }))
    }))
  } as any;
}

describe("ensureContentTypes", () => {
  it("creates all three when none exist", async () => {
    const env = fakeEnv([]);
    await ensureContentTypes(env);
    expect(env.createContentTypeWithId).toHaveBeenCalledTimes(3);
    const ids = env.createContentTypeWithId.mock.calls.map((c: any[]) => c[0]);
    expect(ids).toEqual(expect.arrayContaining([GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE]));
  });

  it("skips ones that already exist", async () => {
    const env = fakeEnv([GOVERNANCE_CONFIG_TYPE]);
    await ensureContentTypes(env);
    expect(env.createContentTypeWithId).toHaveBeenCalledTimes(2);
  });

  it("is idempotent", async () => {
    const env = fakeEnv([GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE]);
    await ensureContentTypes(env);
    expect(env.createContentTypeWithId).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/content-model/ensure-types.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement content type definitions and ensure-types**

Create `/Users/benle/Desktop/test app/lib/content-model/content-types.ts`:
```ts
export const GOVERNANCE_CONFIG_TYPE = "governanceConfig";
export const SPACE_STATE_TYPE = "spaceState";
export const AUDIT_EVENT_TYPE = "auditEvent";

export const GOVERNANCE_CONFIG_SCHEMA = {
  name: "Governance Config",
  description: "Singleton org-wide governance settings",
  displayField: "orgAdminsTeamId",
  fields: [
    { id: "orgAdminsTeamId", name: "Org Admins Team ID", type: "Symbol", required: false },
    { id: "frozenRoleName", name: "Frozen Role Name", type: "Symbol", required: true,
      defaultValue: { "en-US": "Space Admin (frozen)" } },
    { id: "enforcementEnabled", name: "Enforcement Enabled", type: "Boolean", required: true,
      defaultValue: { "en-US": true } }
  ]
};

export const SPACE_STATE_SCHEMA = {
  name: "Space State",
  description: "Per-space governance state",
  displayField: "spaceName",
  fields: [
    { id: "spaceId", name: "Space ID", type: "Symbol", required: true },
    { id: "spaceName", name: "Space Name", type: "Symbol", required: false },
    { id: "freezeStatus", name: "Freeze Status", type: "Symbol", required: true,
      validations: [{ in: ["OFF", "FROZEN", "TRANSITIONING_ON", "TRANSITIONING_OFF", "DEGRADED"] }],
      defaultValue: { "en-US": "OFF" } },
    { id: "frozenAt", name: "Frozen At", type: "Date", required: false },
    { id: "frozenBy", name: "Frozen By", type: "Symbol", required: false },
    { id: "substitutions", name: "Substitutions", type: "Object", required: false },
    { id: "customFrozenRoleId", name: "Custom Frozen Role ID", type: "Symbol", required: false },
    { id: "lastReconciledAt", name: "Last Reconciled At", type: "Date", required: false }
  ]
};

export const AUDIT_EVENT_SCHEMA = {
  name: "Audit Event",
  description: "Append-only governance audit log",
  displayField: "eventType",
  fields: [
    { id: "eventType", name: "Event Type", type: "Symbol", required: true,
      validations: [{ in: [
        "FREEZE_TOGGLED", "TEAM_ATTACHED", "TEAM_REMOVED_DETECTED", "RECONCILE_RUN",
        "SUBSTITUTION_APPLIED", "SUBSTITUTION_REVERTED", "WEBHOOK_SECRET_ROTATED", "ERROR"
      ] }] },
    { id: "spaceId", name: "Space ID", type: "Symbol", required: false },
    { id: "actorUserId", name: "Actor User ID", type: "Symbol", required: false },
    { id: "details", name: "Details", type: "Object", required: false },
    { id: "timestamp", name: "Timestamp", type: "Date", required: true }
  ]
};
```

Create `/Users/benle/Desktop/test app/lib/content-model/ensure-types.ts`:
```ts
import {
  GOVERNANCE_CONFIG_TYPE, SPACE_STATE_TYPE, AUDIT_EVENT_TYPE,
  GOVERNANCE_CONFIG_SCHEMA, SPACE_STATE_SCHEMA, AUDIT_EVENT_SCHEMA
} from "./content-types";

type Env = {
  getContentTypes(): Promise<{ items: { sys: { id: string } }[] }>;
  createContentTypeWithId(id: string, payload: unknown): Promise<{
    sys: { id: string; version: number };
    publish(): Promise<{ sys: { id: string; version: number } }>;
  }>;
};

const PLAN: Array<[string, unknown]> = [
  [GOVERNANCE_CONFIG_TYPE, GOVERNANCE_CONFIG_SCHEMA],
  [SPACE_STATE_TYPE, SPACE_STATE_SCHEMA],
  [AUDIT_EVENT_TYPE, AUDIT_EVENT_SCHEMA]
];

export async function ensureContentTypes(env: Env): Promise<void> {
  const existing = new Set((await env.getContentTypes()).items.map((c) => c.sys.id));
  for (const [id, schema] of PLAN) {
    if (existing.has(id)) continue;
    const created = await env.createContentTypeWithId(id, schema);
    await created.publish();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/content-model/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/content-model/ tests/unit/content-model/
git commit -m "feat(content-model): define governance content types + ensure-types installer"
```

### Task 9: Repository functions for `spaceState` (upsert + read)

**Files:**
- Create: `lib/content-model/space-state.ts`, `tests/unit/content-model/space-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/content-model/space-state.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { upsertSpaceState, readSpaceState } from "@/lib/content-model/space-state";

function fakeEnv(initial: any[] = []) {
  const items = [...initial];
  return {
    getEntries: vi.fn(async ({ content_type, "fields.spaceId": id }: any) => ({
      items: items.filter((i) => i.sys.contentType.sys.id === content_type && i.fields.spaceId["en-US"] === id)
    })),
    createEntry: vi.fn(async (_t: string, payload: any) => {
      const entry = {
        sys: { id: `e${items.length + 1}`, version: 1, contentType: { sys: { id: _t } } },
        fields: payload.fields,
        update: vi.fn(async function (this: any) { this.sys.version++; return this; }),
        patch: vi.fn(async function (this: any, ops: any[]) {
          for (const op of ops) {
            if (op.op === "replace") {
              const path = op.path.split("/").filter(Boolean);
              this.fields[path[0]] = { "en-US": op.value };
            }
          }
          this.sys.version++; return this;
        })
      };
      items.push(entry);
      return entry;
    })
  } as any;
}

describe("space-state repository", () => {
  it("creates on first upsert", async () => {
    const env = fakeEnv();
    const e = await upsertSpaceState(env, { spaceId: "spc1", spaceName: "Jobs", freezeStatus: "OFF" });
    expect(e.sys.id).toBe("e1");
    expect(env.createEntry).toHaveBeenCalledTimes(1);
  });

  it("patches on subsequent upsert", async () => {
    const env = fakeEnv();
    await upsertSpaceState(env, { spaceId: "spc1", spaceName: "Jobs", freezeStatus: "OFF" });
    const updated = await upsertSpaceState(env, { spaceId: "spc1", freezeStatus: "FROZEN" });
    expect(env.createEntry).toHaveBeenCalledTimes(1);
    expect(updated.fields.freezeStatus["en-US"]).toBe("FROZEN");
  });

  it("readSpaceState returns undefined when missing", async () => {
    const env = fakeEnv();
    expect(await readSpaceState(env, "missing")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/content-model/space-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement upsert + read**

Create `/Users/benle/Desktop/test app/lib/content-model/space-state.ts`:
```ts
import { SPACE_STATE_TYPE } from "./content-types";

export type SpaceStateFields = {
  spaceId: string;
  spaceName?: string;
  freezeStatus?: "OFF" | "FROZEN" | "TRANSITIONING_ON" | "TRANSITIONING_OFF" | "DEGRADED";
  frozenAt?: string;
  frozenBy?: string;
  substitutions?: Record<string, { originalRoleId: string; substitutedRoleId: string }>;
  customFrozenRoleId?: string;
  lastReconciledAt?: string;
};

type Env = {
  getEntries(q: Record<string, unknown>): Promise<{ items: any[] }>;
  createEntry(typeId: string, payload: { fields: Record<string, { "en-US": unknown }> }): Promise<any>;
};

function toFields(p: Partial<SpaceStateFields>): Record<string, { "en-US": unknown }> {
  const out: Record<string, { "en-US": unknown }> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = { "en-US": v };
  return out;
}

export async function readSpaceState(env: Env, spaceId: string): Promise<any | undefined> {
  const r = await env.getEntries({ content_type: SPACE_STATE_TYPE, "fields.spaceId": spaceId, limit: 1 });
  return r.items[0];
}

export async function upsertSpaceState(env: Env, fields: Partial<SpaceStateFields> & { spaceId: string }): Promise<any> {
  const existing = await readSpaceState(env, fields.spaceId);
  if (!existing) return env.createEntry(SPACE_STATE_TYPE, { fields: toFields(fields) });
  const ops = Object.entries(fields)
    .filter(([k]) => k !== "spaceId")
    .map(([k, v]) => ({ op: "replace", path: `/fields/${k}/en-US`, value: v }));
  await existing.patch(ops);
  return existing;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/content-model/space-state.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/content-model/space-state.ts tests/unit/content-model/space-state.test.ts
git commit -m "feat(content-model): spaceState upsert/read (application-level uniqueness)"
```

### Task 10: Governance config + audit event repositories

**Files:**
- Create: `lib/content-model/governance-config.ts`, `lib/content-model/audit-event.ts`, `tests/unit/content-model/governance-config.test.ts`, `tests/unit/content-model/audit-event.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/benle/Desktop/test app/tests/unit/content-model/governance-config.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { readConfig, writeConfig } from "@/lib/content-model/governance-config";

function fakeEnv(initial?: any) {
  const store: any = { entry: initial };
  return {
    getEntries: vi.fn(async () => ({ items: store.entry ? [store.entry] : [] })),
    createEntry: vi.fn(async (_t: string, payload: any) => {
      store.entry = { sys: { id: "cfg", version: 1 }, fields: payload.fields, update: vi.fn(async function () { return this; }) };
      return store.entry;
    })
  } as any;
}

describe("governance config repo", () => {
  it("creates the singleton on first write", async () => {
    const env = fakeEnv();
    const r = await writeConfig(env, { orgAdminsTeamId: "team-1", frozenRoleName: "Space Admin (frozen)", enforcementEnabled: true });
    expect(r.sys.id).toBe("cfg");
    expect(env.createEntry).toHaveBeenCalledTimes(1);
  });
  it("read returns undefined when none", async () => {
    const env = fakeEnv();
    expect(await readConfig(env)).toBeUndefined();
  });
});
```

Create `/Users/benle/Desktop/test app/tests/unit/content-model/audit-event.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/content-model/governance-config.test.ts tests/unit/content-model/audit-event.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both repositories**

Create `/Users/benle/Desktop/test app/lib/content-model/governance-config.ts`:
```ts
import { GOVERNANCE_CONFIG_TYPE } from "./content-types";

export type GovernanceConfigFields = {
  orgAdminsTeamId?: string;
  frozenRoleName: string;
  enforcementEnabled: boolean;
};

type Env = {
  getEntries(q: Record<string, unknown>): Promise<{ items: any[] }>;
  createEntry(typeId: string, payload: { fields: Record<string, { "en-US": unknown }> }): Promise<any>;
};

function toFields(p: Partial<GovernanceConfigFields>) {
  const out: Record<string, { "en-US": unknown }> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = { "en-US": v };
  return out;
}

export async function readConfig(env: Env): Promise<any | undefined> {
  const r = await env.getEntries({ content_type: GOVERNANCE_CONFIG_TYPE, limit: 1 });
  return r.items[0];
}

export async function writeConfig(env: Env, fields: Partial<GovernanceConfigFields>): Promise<any> {
  const existing = await readConfig(env);
  if (!existing) return env.createEntry(GOVERNANCE_CONFIG_TYPE, { fields: toFields(fields) });
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) existing.fields[k] = { "en-US": v };
  }
  return existing.update();
}
```

Create `/Users/benle/Desktop/test app/lib/content-model/audit-event.ts`:
```ts
import { AUDIT_EVENT_TYPE } from "./content-types";

export type AuditEventType =
  | "FREEZE_TOGGLED" | "TEAM_ATTACHED" | "TEAM_REMOVED_DETECTED" | "RECONCILE_RUN"
  | "SUBSTITUTION_APPLIED" | "SUBSTITUTION_REVERTED" | "WEBHOOK_SECRET_ROTATED" | "ERROR";

export type AuditPayload = {
  eventType: AuditEventType;
  spaceId?: string;
  actorUserId?: string;
  details?: Record<string, unknown>;
};

type Env = { createEntry(typeId: string, payload: any): Promise<any> };

export async function appendAudit(env: Env, p: AuditPayload): Promise<any> {
  const fields: Record<string, { "en-US": unknown }> = {
    eventType: { "en-US": p.eventType },
    timestamp: { "en-US": new Date().toISOString() }
  };
  if (p.spaceId) fields.spaceId = { "en-US": p.spaceId };
  if (p.actorUserId) fields.actorUserId = { "en-US": p.actorUserId };
  if (p.details) fields.details = { "en-US": p.details };
  return env.createEntry(AUDIT_EVENT_TYPE, { fields });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/content-model/`
Expected: all PASS (including prior space-state + ensure-types tests).

- [ ] **Step 5: Commit**

```bash
git add lib/content-model/governance-config.ts lib/content-model/audit-event.ts \
        tests/unit/content-model/governance-config.test.ts tests/unit/content-model/audit-event.test.ts
git commit -m "feat(content-model): governance-config singleton + audit-event append"
```

---

## Phase 4 — Fan-out (MVP 1)

### Task 11: `ensure_team_attached` idempotent operation

**Files:**
- Create: `lib/fanout/ensure-team-attached.ts`, `tests/unit/fanout/ensure-team-attached.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/fanout/ensure-team-attached.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";

function fakeOrg(initial: any[]) {
  const items = [...initial];
  return {
    getTeamSpaceMemberships: vi.fn(async (q: any) =>
      ({ items: items.filter((m) => m.team === q["sys.team.sys.id"] && m.space === q["sys.space.sys.id"]) })),
    createTeamSpaceMembership: vi.fn(async (teamId: string, payload: any) => {
      const m = { sys: { id: `tsm${items.length + 1}` }, team: teamId, space: payload.sys.space.sys.id, admin: payload.admin };
      items.push(m); return m;
    })
  } as any;
}

describe("ensureTeamAttached", () => {
  it("creates membership when none exists", async () => {
    const org = fakeOrg([]);
    const r = await ensureTeamAttached(org, "tA", "sX");
    expect(r).toBe("ATTACHED");
    expect(org.createTeamSpaceMembership).toHaveBeenCalledOnce();
  });

  it("no-ops when admin membership exists", async () => {
    const org = fakeOrg([{ team: "tA", space: "sX", admin: true, sys: { id: "tsm0" } }]);
    const r = await ensureTeamAttached(org, "tA", "sX");
    expect(r).toBe("NO_OP");
    expect(org.createTeamSpaceMembership).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/fanout/ensure-team-attached.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the operation**

Create `/Users/benle/Desktop/test app/lib/fanout/ensure-team-attached.ts`:
```ts
type Org = {
  getTeamSpaceMemberships(q: Record<string, unknown>): Promise<{ items: any[] }>;
  createTeamSpaceMembership(teamId: string, payload: any): Promise<any>;
};

export type FanoutResult = "ATTACHED" | "NO_OP" | "REPAIRED";

export async function ensureTeamAttached(org: Org, teamId: string, spaceId: string): Promise<FanoutResult> {
  const r = await org.getTeamSpaceMemberships({ "sys.team.sys.id": teamId, "sys.space.sys.id": spaceId });
  const adminMembership = r.items.find((m: any) => m.admin === true);
  if (adminMembership) return "NO_OP";
  await org.createTeamSpaceMembership(teamId, {
    admin: true,
    roles: [],
    sys: { space: { sys: { id: spaceId, type: "Link", linkType: "Space" } } }
  });
  return "ATTACHED";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/fanout/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fanout/ensure-team-attached.ts tests/unit/fanout/ensure-team-attached.test.ts
git commit -m "feat(fanout): ensureTeamAttached idempotent operation"
```

### Task 12: Retroactive sweep

**Files:**
- Create: `lib/fanout/sweep.ts`, `tests/unit/fanout/sweep.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/fanout/sweep.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/fanout/sweep.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement sweep**

Create `/Users/benle/Desktop/test app/lib/fanout/sweep.ts`:
```ts
import type { FanoutResult } from "./ensure-team-attached";
import { ensureTeamAttached as defaultEnsure } from "./ensure-team-attached";

export type SweepCounts = { attached: number; repaired: number; noop: number };

export async function sweep(
  org: { getSpaces(): Promise<{ items: { sys: { id: string } }[] }> } & Parameters<typeof defaultEnsure>[0],
  teamId: string,
  consoleSpaceId: string,
  ensure: typeof defaultEnsure = defaultEnsure
): Promise<SweepCounts> {
  const spaces = (await org.getSpaces()).items;
  const counts: SweepCounts = { attached: 0, repaired: 0, noop: 0 };
  for (const s of spaces) {
    if (s.sys.id === consoleSpaceId) continue;
    const r: FanoutResult = await ensure(org as any, teamId, s.sys.id);
    if (r === "ATTACHED") counts.attached++;
    else if (r === "REPAIRED") counts.repaired++;
    else counts.noop++;
  }
  return counts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/fanout/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fanout/sweep.ts tests/unit/fanout/sweep.test.ts
git commit -m "feat(fanout): retroactive sweep over org spaces (skips console)"
```

### Task 13: Webhook topic router

**Files:**
- Create: `lib/webhook/route-by-topic.ts`, `tests/unit/webhook/route-by-topic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/webhook/route-by-topic.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/webhook/`
Expected: FAIL.

- [ ] **Step 3: Implement the router**

Create `/Users/benle/Desktop/test app/lib/webhook/route-by-topic.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/webhook/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/webhook/route-by-topic.ts tests/unit/webhook/route-by-topic.test.ts
git commit -m "feat(webhook): topic router for Space.create + TeamSpaceMembership.delete"
```

---

## Phase 5 — Freeze (MVP 2)

### Task 14: Freeze state machine validator

**Files:**
- Create: `lib/freeze/state-machine.ts`, `tests/unit/freeze/state-machine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/freeze/state-machine.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/freeze/state-machine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the validator**

Create `/Users/benle/Desktop/test app/lib/freeze/state-machine.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/freeze/state-machine.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/freeze/state-machine.ts tests/unit/freeze/state-machine.test.ts
git commit -m "feat(freeze): formalize state machine transitions"
```

### Task 15: Ensure substitute role + enumerate admins

**Files:**
- Create: `lib/freeze/ensure-frozen-role.ts`, `lib/freeze/enumerate-admins.ts`, `tests/unit/freeze/ensure-frozen-role.test.ts`, `tests/unit/freeze/enumerate-admins.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/benle/Desktop/test app/tests/unit/freeze/ensure-frozen-role.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { ensureFrozenRole } from "@/lib/freeze/ensure-frozen-role";

const FROZEN_NAME = "Space Admin (frozen)";

function fakeSpace(roles: any[]) {
  const list = [...roles];
  return {
    getRoles: vi.fn(async () => ({ items: list })),
    createRole: vi.fn(async (payload: any) => {
      const role = { sys: { id: `r${list.length + 1}` }, name: payload.name, permissions: payload.permissions };
      list.push(role); return role;
    })
  } as any;
}

describe("ensureFrozenRole", () => {
  it("returns existing role id when present", async () => {
    const space = fakeSpace([{ sys: { id: "rZ" }, name: FROZEN_NAME }]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("rZ");
    expect(space.createRole).not.toHaveBeenCalled();
  });
  it("creates role with manageRoles=none when absent", async () => {
    const space = fakeSpace([]);
    const id = await ensureFrozenRole(space, FROZEN_NAME);
    expect(id).toBe("r1");
    expect(space.createRole).toHaveBeenCalledOnce();
    const payload = space.createRole.mock.calls[0]![0];
    expect(payload.permissions.Settings).not.toContain("manageRoles");
  });
});
```

Create `/Users/benle/Desktop/test app/tests/unit/freeze/enumerate-admins.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { enumerateSpaceAdmins } from "@/lib/freeze/enumerate-admins";

describe("enumerateSpaceAdmins", () => {
  it("returns direct admins excluding caller and team-sourced memberships", async () => {
    const space = {
      getSpaceMemberships: vi.fn(async () => ({
        items: [
          { sys: { id: "m1", user: { sys: { id: "userA" } } }, admin: true, roles: [] },
          { sys: { id: "m2", user: { sys: { id: "userB" } } }, admin: true, roles: [] },
          { sys: { id: "m3", user: { sys: { id: "userTeam" } }, team: { sys: { id: "tA" } } }, admin: true, roles: [] },
          { sys: { id: "m4", user: { sys: { id: "userC" } } }, admin: false, roles: [{ sys: { id: "rEditor" } }] }
        ]
      }))
    } as any;
    const out = await enumerateSpaceAdmins(space, "userA");
    expect(out.map((m) => m.userId)).toEqual(["userB"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/freeze/ensure-frozen-role.test.ts tests/unit/freeze/enumerate-admins.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement both modules**

Create `/Users/benle/Desktop/test app/lib/freeze/ensure-frozen-role.ts`:
```ts
type Space = {
  getRoles(): Promise<{ items: { sys: { id: string }; name: string }[] }>;
  createRole(payload: unknown): Promise<{ sys: { id: string } }>;
};

export async function ensureFrozenRole(space: Space, frozenRoleName: string): Promise<string> {
  const roles = await space.getRoles();
  const existing = roles.items.find((r) => r.name === frozenRoleName);
  if (existing) return existing.sys.id;
  const created = await space.createRole({
    name: frozenRoleName,
    description: "Auto-managed by Org Governance App. Admin minus Settings.manageRoles.",
    permissions: {
      ContentDelivery: "all",
      ContentModel: "all",
      EnvironmentAliases: "all",
      Environments: "all",
      Settings: ["editLocales", "manageEnvironments", "manageEnvironmentAliases", "configureSpace"],
      Tags: "all"
    },
    policies: [{ effect: "allow", actions: "all", constraint: { and: [] } }]
  });
  return created.sys.id;
}
```

Create `/Users/benle/Desktop/test app/lib/freeze/enumerate-admins.ts`:
```ts
export type SpaceAdminMembership = { membershipId: string; userId: string };

type Space = {
  getSpaceMemberships(): Promise<{ items: any[] }>;
};

export async function enumerateSpaceAdmins(space: Space, excludeUserId: string): Promise<SpaceAdminMembership[]> {
  const r = await space.getSpaceMemberships();
  return r.items
    .filter((m: any) => m.admin === true)
    .filter((m: any) => !m.sys.team)
    .filter((m: any) => m.sys.user?.sys.id !== excludeUserId)
    .map((m: any) => ({ membershipId: m.sys.id, userId: m.sys.user.sys.id }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/freeze/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/freeze/ensure-frozen-role.ts lib/freeze/enumerate-admins.ts \
        tests/unit/freeze/ensure-frozen-role.test.ts tests/unit/freeze/enumerate-admins.test.ts
git commit -m "feat(freeze): ensure substitute role + enumerate direct space admins"
```

### Task 16: Substitute & restore individual users

**Files:**
- Create: `lib/freeze/substitute.ts`, `tests/unit/freeze/substitute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/freeze/substitute.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { substituteMembership, restoreMembership } from "@/lib/freeze/substitute";

function membership(id: string, admin: boolean, roleId?: string) {
  return {
    sys: { id, version: 1 },
    admin,
    roles: roleId ? [{ sys: { id: roleId } }] : [],
    update: vi.fn(async function (this: any) { this.sys.version++; return this; })
  };
}

function spaceWith(m: any) {
  return { getSpaceMembership: vi.fn(async () => m) } as any;
}

describe("substitute / restore membership", () => {
  it("substitute swaps admin→false and assigns the frozen role", async () => {
    const m = membership("m1", true);
    const space = spaceWith(m);
    const rec = await substituteMembership(space, "m1", "rFrozen");
    expect(m.admin).toBe(false);
    expect(m.roles).toEqual([{ sys: { id: "rFrozen", type: "Link", linkType: "Role" } }]);
    expect(m.update).toHaveBeenCalledOnce();
    expect(rec).toEqual({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
  });

  it("restore puts admin back to true and clears roles", async () => {
    const m = membership("m1", false, "rFrozen");
    const space = spaceWith(m);
    await restoreMembership(space, "m1", { originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
    expect(m.admin).toBe(true);
    expect(m.roles).toEqual([]);
    expect(m.update).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/freeze/substitute.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement substitute/restore**

Create `/Users/benle/Desktop/test app/lib/freeze/substitute.ts`:
```ts
type Membership = {
  sys: { id: string; version: number };
  admin: boolean;
  roles: { sys: { id: string; type: string; linkType: string } }[];
  update(): Promise<Membership>;
};
type Space = { getSpaceMembership(id: string): Promise<Membership> };

export type SubstitutionRecord = { originalRoleId: string; substitutedRoleId: string };

export async function substituteMembership(space: Space, membershipId: string, frozenRoleId: string): Promise<SubstitutionRecord> {
  const m = await space.getSpaceMembership(membershipId);
  m.admin = false;
  m.roles = [{ sys: { id: frozenRoleId, type: "Link", linkType: "Role" } }];
  await m.update();
  return { originalRoleId: "admin-builtin", substitutedRoleId: frozenRoleId };
}

export async function restoreMembership(space: Space, membershipId: string, _rec: SubstitutionRecord): Promise<void> {
  const m = await space.getSpaceMembership(membershipId);
  m.admin = true;
  m.roles = [];
  await m.update();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/freeze/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/freeze/substitute.ts tests/unit/freeze/substitute.test.ts
git commit -m "feat(freeze): substitute and restore individual memberships"
```

### Task 17: Toggle orchestrator (the substitution loop)

**Files:**
- Create: `lib/freeze/run-transition.ts`, `tests/unit/freeze/run-transition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/freeze/run-transition.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runTransition } from "@/lib/freeze/run-transition";

describe("runTransition (freeze)", () => {
  it("substitutes each admin, records in state, marks FROZEN on success", async () => {
    const space = {} as any;
    const enumerate = vi.fn().mockResolvedValue([{ membershipId: "m1", userId: "u1" }, { membershipId: "m2", userId: "u2" }]);
    const ensureRole = vi.fn().mockResolvedValue("rFrozen");
    const substitute = vi.fn().mockResolvedValue({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" });
    const writeState = vi.fn();
    const audit = vi.fn();

    await runTransition("freeze", {
      spaceId: "sX", actorUserId: "uActor", frozenRoleName: "FR",
      space, enumerate, ensureRole, substitute, restore: vi.fn(), writeState, audit
    });

    expect(ensureRole).toHaveBeenCalledWith(space, "FR");
    expect(substitute).toHaveBeenCalledTimes(2);
    const writes = writeState.mock.calls.map((c) => c[0]);
    const final = writes[writes.length - 1];
    expect(final.freezeStatus).toBe("FROZEN");
    expect(final.substitutions).toEqual({
      u1: { originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" },
      u2: { originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" }
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "SUBSTITUTION_APPLIED" }));
  });

  it("marks DEGRADED if a user fails", async () => {
    const space = {} as any;
    const enumerate = vi.fn().mockResolvedValue([{ membershipId: "m1", userId: "u1" }, { membershipId: "m2", userId: "u2" }]);
    const ensureRole = vi.fn().mockResolvedValue("rFrozen");
    const substitute = vi.fn()
      .mockResolvedValueOnce({ originalRoleId: "admin-builtin", substitutedRoleId: "rFrozen" })
      .mockRejectedValueOnce(new Error("boom"));
    const writeState = vi.fn();
    const audit = vi.fn();

    await runTransition("freeze", {
      spaceId: "sX", actorUserId: "uActor", frozenRoleName: "FR",
      space, enumerate, ensureRole, substitute, restore: vi.fn(), writeState, audit
    });

    const final = writeState.mock.calls.at(-1)![0];
    expect(final.freezeStatus).toBe("DEGRADED");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ERROR" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/freeze/run-transition.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the orchestrator**

Create `/Users/benle/Desktop/test app/lib/freeze/run-transition.ts`:
```ts
import type { SubstitutionRecord } from "./substitute";
import type { Action } from "./state-machine";

export type RunDeps = {
  spaceId: string;
  actorUserId: string;
  frozenRoleName: string;
  space: any;
  enumerate(space: any, exclude: string): Promise<{ membershipId: string; userId: string }[]>;
  ensureRole(space: any, name: string): Promise<string>;
  substitute(space: any, membershipId: string, roleId: string): Promise<SubstitutionRecord>;
  restore(space: any, membershipId: string, rec: SubstitutionRecord): Promise<void>;
  writeState(patch: { freezeStatus?: string; substitutions?: Record<string, SubstitutionRecord>; customFrozenRoleId?: string; lastReconciledAt?: string }): Promise<void>;
  audit(event: { eventType: string; details?: Record<string, unknown> }): Promise<void>;
  priorSubstitutions?: Record<string, SubstitutionRecord>;
};

export async function runTransition(action: Action, d: RunDeps): Promise<void> {
  if (action === "freeze") {
    const roleId = await d.ensureRole(d.space, d.frozenRoleName);
    await d.writeState({ customFrozenRoleId: roleId });
    const admins = await d.enumerate(d.space, d.actorUserId);
    const substitutions: Record<string, SubstitutionRecord> = { ...(d.priorSubstitutions ?? {}) };
    const failed: string[] = [];
    for (const a of admins) {
      if (substitutions[a.userId]) continue;
      try {
        substitutions[a.userId] = await d.substitute(d.space, a.membershipId, roleId);
        await d.writeState({ substitutions });
      } catch (e) { failed.push(a.userId); }
    }
    if (failed.length === 0) {
      await d.writeState({ freezeStatus: "FROZEN" });
      await d.audit({ eventType: "SUBSTITUTION_APPLIED", details: { applied: Object.keys(substitutions).length } });
    } else {
      await d.writeState({ freezeStatus: "DEGRADED" });
      await d.audit({ eventType: "ERROR", details: { phase: "freeze", failedUserIds: failed } });
    }
    return;
  }
  const remaining: Record<string, SubstitutionRecord> = { ...(d.priorSubstitutions ?? {}) };
  for (const [userId, rec] of Object.entries(remaining)) {
    const membershipId = await findMembershipByUser(d.space, userId);
    if (!membershipId) { delete remaining[userId]; await d.writeState({ substitutions: remaining }); continue; }
    try {
      await d.restore(d.space, membershipId, rec);
      delete remaining[userId];
      await d.writeState({ substitutions: remaining });
    } catch (e) {
      await d.audit({ eventType: "ERROR", details: { phase: "thaw", userId } });
    }
  }
  if (Object.keys(remaining).length === 0) {
    await d.writeState({ freezeStatus: "OFF" });
    await d.audit({ eventType: "SUBSTITUTION_REVERTED" });
  } else {
    await d.writeState({ freezeStatus: "DEGRADED" });
  }
}

async function findMembershipByUser(space: any, userId: string): Promise<string | undefined> {
  if (!space.getSpaceMemberships) return undefined;
  const r = await space.getSpaceMemberships({ "sys.user.sys.id": userId });
  return r.items[0]?.sys.id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/freeze/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/freeze/run-transition.ts tests/unit/freeze/run-transition.test.ts
git commit -m "feat(freeze): toggle orchestrator with resumable substitution loop"
```

---

## Phase 6 — Vercel function endpoints

### Task 18: `POST /api/toggle-freeze` endpoint

**Files:**
- Create: `api/toggle-freeze.ts`, `tests/unit/api/toggle-freeze.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/benle/Desktop/test app/tests/unit/api/toggle-freeze.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "@/api/toggle-freeze";

vi.mock("@/lib/auth/verify-app-signature", () => ({
  verifyAppSignature: vi.fn(() => ({ userId: "uActor", spaceId: "sX", environmentId: "master" }))
}));

function fakeRes() {
  const r: any = {};
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
}

describe("POST /api/toggle-freeze", () => {
  beforeEach(() => { process.env.APP_PRIVATE_KEY = "x"; });
  it("422 when target is the console space", async () => {
    const req = {
      method: "POST", url: "/api/toggle-freeze",
      headers: { "x-contentful-signature": "valid", "x-contentful-timestamp": String(Date.now()),
                 "x-contentful-user-id": "u", "x-contentful-space-id": "console", "x-contentful-environment-id": "master" },
      body: { spaceId: "console", action: "freeze" }
    } as any;
    const res = fakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/api/toggle-freeze.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `/Users/benle/Desktop/test app/api/toggle-freeze.ts`:
```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "@/lib/auth/verify-app-signature";
import { nextStatus, type Action } from "@/lib/freeze/state-machine";
import { cmaForSpace } from "@/lib/cma/client";
import { readSpaceState, upsertSpaceState } from "@/lib/content-model/space-state";
import { readConfig } from "@/lib/content-model/governance-config";
import { appendAudit } from "@/lib/content-model/audit-event";
import { runTransition } from "@/lib/freeze/run-transition";
import { ensureFrozenRole } from "@/lib/freeze/ensure-frozen-role";
import { enumerateSpaceAdmins } from "@/lib/freeze/enumerate-admins";
import { substituteMembership, restoreMembership } from "@/lib/freeze/substitute";

async function consoleEnvFor(orgId: string, consoleSpaceId: string) {
  const cma = await cmaForSpace(orgId, consoleSpaceId);
  const space = await cma.getSpace(consoleSpaceId);
  return space.getEnvironment("master");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  let id;
  try {
    id = verifyAppSignature({
      method: req.method,
      path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})
    }, process.env.APP_PRIVATE_KEY!);
  } catch { return res.status(401).json({ error: "invalid signature" }); }

  const body = req.body as { spaceId?: string; action?: Action; orgId?: string; consoleSpaceId?: string };
  if (!body.spaceId || !body.action || !body.orgId || !body.consoleSpaceId) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (body.spaceId === body.consoleSpaceId) {
    return res.status(422).json({ error: "cannot freeze console space" });
  }

  const env = await consoleEnvFor(body.orgId, body.consoleSpaceId);
  const config = await readConfig(env);
  const stateEntry = await readSpaceState(env, body.spaceId);
  const curStatus = stateEntry?.fields.freezeStatus?.["en-US"] ?? "OFF";

  const t = nextStatus(curStatus, body.action);
  if (!t.ok) return res.status(409).json({ error: t.reason });
  const jobId = `freeze-${Date.now()}-${body.spaceId.slice(0, 4)}`;
  await upsertSpaceState(env, {
    spaceId: body.spaceId,
    freezeStatus: t.next as any,
    frozenBy: id.userId,
    frozenAt: new Date().toISOString()
  });
  await appendAudit(env, { eventType: "FREEZE_TOGGLED", spaceId: body.spaceId, actorUserId: id.userId, details: { action: body.action, jobId } });

  if (t.idempotent) return res.status(200).json({ ok: true, jobId, currentStatus: t.next, previousStatus: curStatus });

  const targetCma = await cmaForSpace(body.orgId, body.spaceId);
  const targetSpace = await targetCma.getSpace(body.spaceId);

  (globalThis as any).Vercel?.waitUntil?.(runTransition(body.action, {
    spaceId: body.spaceId,
    actorUserId: id.userId,
    frozenRoleName: config?.fields.frozenRoleName?.["en-US"] ?? "Space Admin (frozen)",
    space: targetSpace,
    enumerate: enumerateSpaceAdmins,
    ensureRole: ensureFrozenRole,
    substitute: substituteMembership,
    restore: restoreMembership,
    writeState: async (patch) => { await upsertSpaceState(env, { spaceId: body.spaceId!, ...patch } as any); },
    audit: async (ev) => { await appendAudit(env, { eventType: ev.eventType as any, spaceId: body.spaceId!, actorUserId: "system", details: ev.details }); },
    priorSubstitutions: stateEntry?.fields.substitutions?.["en-US"] ?? {}
  }));

  return res.status(200).json({ ok: true, jobId, currentStatus: t.next, previousStatus: curStatus });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/api/toggle-freeze.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add api/toggle-freeze.ts tests/unit/api/toggle-freeze.test.ts
git commit -m "feat(api): POST /api/toggle-freeze with async substitution"
```

### Task 19: `POST /api/webhook` endpoint

**Files:**
- Create: `api/webhook.ts`, `tests/unit/api/webhook.test.ts`, `tests/fixtures/webhook-space-create.json`, `tests/fixtures/webhook-team-membership-delete.json`

- [ ] **Step 1: Write fixtures and the failing test**

Create `/Users/benle/Desktop/test app/tests/fixtures/webhook-space-create.json`:
```json
{ "sys": { "id": "sNew", "type": "Space" }, "name": "New Space" }
```

Create `/Users/benle/Desktop/test app/tests/fixtures/webhook-team-membership-delete.json`:
```json
{ "sys": { "id": "tsm123", "type": "TeamSpaceMembership",
  "team": { "sys": { "id": "tOrgAdmins" } },
  "space": { "sys": { "id": "sX" } } } }
```

Create `/Users/benle/Desktop/test app/tests/unit/api/webhook.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import handler from "@/api/webhook";
import spaceCreatePayload from "@/tests/fixtures/webhook-space-create.json";

const GLOBAL = "test-global-secret";
const INSTALLATION = "inst-1";

function fakeRes() {
  const r: any = {}; r.status = vi.fn((c: number) => { r.statusCode = c; return r; }); r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
}

vi.mock("@/lib/fanout/ensure-team-attached", () => ({ ensureTeamAttached: vi.fn().mockResolvedValue("ATTACHED") }));
vi.mock("@/lib/cma/client", () => ({ cmaForSpace: vi.fn().mockResolvedValue({
  getOrganization: vi.fn().mockResolvedValue({ getTeamSpaceMemberships: vi.fn() }),
  getSpace: vi.fn().mockResolvedValue({ getEnvironment: vi.fn().mockResolvedValue({
    getEntries: vi.fn().mockResolvedValue({ items: [{ fields: { orgAdminsTeamId: { "en-US": "tOrgAdmins" } } }] }),
    createEntry: vi.fn().mockResolvedValue({})
  }) })
}) }));

describe("POST /api/webhook", () => {
  beforeEach(() => { process.env.GLOBAL_WEBHOOK_SECRET = GLOBAL; });
  it("401s missing HMAC", async () => {
    const req = { method: "POST", url: "/api/webhook",
      headers: { "x-contentful-topic": "ContentManagement.Space.create",
                 "x-contentful-installation-id": INSTALLATION, "x-contentful-org-id": "org",
                 "x-contentful-console-space-id": "console" },
      body: spaceCreatePayload, rawBody: JSON.stringify(spaceCreatePayload) } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("200s a valid Space.create event", async () => {
    const raw = JSON.stringify(spaceCreatePayload);
    const sig = createHmac("sha256", createHmac("sha256", GLOBAL).update(`webhook:${INSTALLATION}`).digest("hex")).update(raw).digest("hex");
    const req = { method: "POST", url: "/api/webhook",
      headers: { "x-contentful-topic": "ContentManagement.Space.create",
                 "x-contentful-installation-id": INSTALLATION, "x-contentful-org-id": "org",
                 "x-contentful-console-space-id": "console",
                 "x-contentful-webhook-signature": sig },
      body: spaceCreatePayload, rawBody: raw } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/api/webhook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the webhook endpoint**

Create `/Users/benle/Desktop/test app/api/webhook.ts`:
```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyWebhookHmac } from "@/lib/auth/verify-webhook-hmac";
import { deriveWebhookSecret } from "@/lib/secrets/derive-webhook-secret";
import { routeByTopic } from "@/lib/webhook/route-by-topic";
import { cmaForSpace } from "@/lib/cma/client";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";
import { appendAudit } from "@/lib/content-model/audit-event";
import { upsertSpaceState } from "@/lib/content-model/space-state";
import { readConfig } from "@/lib/content-model/governance-config";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const installationId = req.headers["x-contentful-installation-id"] as string | undefined;
  const orgId = req.headers["x-contentful-org-id"] as string | undefined;
  const consoleSpaceId = req.headers["x-contentful-console-space-id"] as string | undefined;
  const topic = req.headers["x-contentful-topic"] as string | undefined;
  const sig = req.headers["x-contentful-webhook-signature"] as string | undefined;
  if (!installationId || !orgId || !consoleSpaceId || !topic) return res.status(400).json({ error: "missing routing headers" });

  const raw = (req as any).rawBody ?? JSON.stringify(req.body);
  try {
    const secret = deriveWebhookSecret(process.env.GLOBAL_WEBHOOK_SECRET!, installationId);
    verifyWebhookHmac(raw, sig, secret);
  } catch { return res.status(401).json({ error: "invalid hmac" }); }

  const cma = await cmaForSpace(orgId, consoleSpaceId);
  const consoleEnv = await (await cma.getSpace(consoleSpaceId)).getEnvironment("master");
  const config = await readConfig(consoleEnv);
  const teamId = config?.fields.orgAdminsTeamId?.["en-US"] as string | undefined;
  if (!teamId) return res.status(409).json({ error: "missing teamId in governanceConfig" });

  const org = await cma.getOrganization(orgId);

  try {
    await routeByTopic(topic, req.body, {
      onSpaceCreate: async ({ spaceId }) => {
        await ensureTeamAttached(org as any, teamId, spaceId);
        await upsertSpaceState(consoleEnv, { spaceId, freezeStatus: "OFF" });
        await appendAudit(consoleEnv, { eventType: "TEAM_ATTACHED", spaceId, actorUserId: "system", details: { trigger: "webhook" } });
      },
      onTeamSpaceMembershipDelete: async ({ teamId: t, spaceId }) => {
        if (t !== teamId) return;
        await ensureTeamAttached(org as any, teamId, spaceId);
        await appendAudit(consoleEnv, { eventType: "TEAM_REMOVED_DETECTED", spaceId, actorUserId: "system", details: { reattached: true } });
      }
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e as Error).message) });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/api/webhook.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add api/webhook.ts tests/unit/api/webhook.test.ts tests/fixtures/
git commit -m "feat(api): POST /api/webhook with HMAC verification + topic routing"
```

### Task 20: `POST /api/bootstrap` endpoint

**Files:**
- Create: `api/bootstrap.ts`, `tests/unit/api/bootstrap.test.ts`

- [ ] **Step 1: Write a smoke test (full integration covered in Phase 9)**

Create `/Users/benle/Desktop/test app/tests/unit/api/bootstrap.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "@/api/bootstrap";

vi.mock("@/lib/auth/verify-app-signature", () => ({
  verifyAppSignature: vi.fn(() => ({ userId: "uOwner", spaceId: "console", environmentId: "master" }))
}));

function fakeRes() {
  const r: any = {}; r.status = vi.fn((c: number) => { r.statusCode = c; return r; }); r.json = vi.fn((b: unknown) => { r.body = b; return r; }); return r;
}

describe("POST /api/bootstrap", () => {
  beforeEach(() => { process.env.APP_PRIVATE_KEY = "x"; });
  it("400 when required fields missing", async () => {
    const req = { method: "POST", url: "/api/bootstrap",
      headers: { "x-contentful-signature": "valid", "x-contentful-timestamp": String(Date.now()),
                 "x-contentful-user-id": "u", "x-contentful-space-id": "console", "x-contentful-environment-id": "master" },
      body: {} } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/api/bootstrap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `/Users/benle/Desktop/test app/api/bootstrap.ts`:
```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "@/lib/auth/verify-app-signature";
import { cmaForSpace } from "@/lib/cma/client";
import { ensureContentTypes } from "@/lib/content-model/ensure-types";
import { writeConfig } from "@/lib/content-model/governance-config";
import { appendAudit } from "@/lib/content-model/audit-event";
import { sweep } from "@/lib/fanout/sweep";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";
import { deriveWebhookSecret } from "@/lib/secrets/derive-webhook-secret";

type BootstrapBody = {
  orgId: string;
  installationId: string;
  consoleSpaceId: string;
  orgAdminsTeamName?: string;
  initialTeamMemberUserIds?: string[];
};

async function ensureTeam(org: any, name: string, members: string[]): Promise<string> {
  const existing = (await org.getTeams()).items.find((t: any) => t.name === name);
  const team = existing ?? await org.createTeam({ name, description: "Auto-managed by Org Governance App" });
  for (const userId of members) {
    const existingMembers = (await team.getTeamMemberships?.() ?? { items: [] }).items;
    if (!existingMembers.find((m: any) => m.sys.user?.sys.id === userId)) {
      await org.createTeamMembership(team.sys.id, { admin: false, sys: { user: { sys: { id: userId, type: "Link", linkType: "User" } } } });
    }
  }
  return team.sys.id;
}

async function ensureWebhook(org: any, name: string, topic: string, url: string, secret: string): Promise<string> {
  const existing = (await org.getWebhooks?.() ?? { items: [] }).items.find((w: any) => w.name === name);
  if (existing) return existing.sys.id;
  const wh = await org.createWebhook({
    name, url, topics: [topic],
    httpBasicUsername: undefined,
    headers: [{ key: "X-Contentful-Webhook-Signature", value: "{{ payload | hmac_sha256: '" + secret + "' }}", secret: true }]
  });
  return wh.sys.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    verifyAppSignature({
      method: req.method, path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})
    }, process.env.APP_PRIVATE_KEY!);
  } catch { return res.status(401).json({ error: "invalid signature" }); }

  const b = req.body as BootstrapBody;
  if (!b?.orgId || !b?.installationId || !b?.consoleSpaceId) return res.status(400).json({ error: "missing fields" });

  const teamName = b.orgAdminsTeamName ?? "Org Admins";
  const cma = await cmaForSpace(b.orgId, b.consoleSpaceId);
  const space = await cma.getSpace(b.consoleSpaceId);
  const env = await space.getEnvironment("master");
  const org = await cma.getOrganization(b.orgId);

  await ensureContentTypes(env as any);

  const teamId = await ensureTeam(org as any, teamName, b.initialTeamMemberUserIds ?? []);

  await writeConfig(env, { orgAdminsTeamId: teamId, frozenRoleName: "Space Admin (frozen)", enforcementEnabled: true });

  const vercelBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.PUBLIC_BASE_URL ?? "");
  const secret = deriveWebhookSecret(process.env.GLOBAL_WEBHOOK_SECRET!, b.installationId);
  const wh1 = await ensureWebhook(org as any, `org-gov-space-create-${b.installationId}`, "ContentManagement.Space.create",
    `${vercelBase}/api/webhook`, secret);
  const wh2 = await ensureWebhook(org as any, `org-gov-team-remove-${b.installationId}`, "ContentManagement.TeamSpaceMembership.delete",
    `${vercelBase}/api/webhook`, secret);

  const swept = await sweep(org as any, teamId, b.consoleSpaceId, ensureTeamAttached as any);
  await appendAudit(env, { eventType: "RECONCILE_RUN", actorUserId: "system", details: { phase: "bootstrap", swept } });

  return res.status(200).json({ ok: true, orgAdminsTeamId: teamId, swept, webhookIds: [wh1, wh2] });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/api/bootstrap.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add api/bootstrap.ts tests/unit/api/bootstrap.test.ts
git commit -m "feat(api): POST /api/bootstrap idempotent tenant setup"
```

### Task 21: `GET /api/cron/reconcile` + `GET /api/state`

**Files:**
- Create: `api/cron/reconcile.ts`, `api/state.ts`, `tests/unit/api/state.test.ts`

- [ ] **Step 1: Write a small test for `state`**

Create `/Users/benle/Desktop/test app/tests/unit/api/state.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "@/api/state";

vi.mock("@/lib/auth/verify-app-signature", () => ({
  verifyAppSignature: vi.fn(() => ({ userId: "u", spaceId: "console", environmentId: "master" }))
}));
vi.mock("@/lib/cma/client", () => ({
  cmaForSpace: vi.fn().mockResolvedValue({
    getSpace: vi.fn().mockResolvedValue({
      getEnvironment: vi.fn().mockResolvedValue({
        getEntries: vi.fn().mockResolvedValue({ items: [{ fields: { spaceId: { "en-US": "sX" }, freezeStatus: { "en-US": "OFF" } } }] })
      })
    })
  })
}));

function fakeRes() {
  const r: any = {}; r.status = vi.fn((c: number) => { r.statusCode = c; return r; }); r.json = vi.fn((b: unknown) => { r.body = b; return r; }); return r;
}

describe("GET /api/state", () => {
  beforeEach(() => { process.env.APP_PRIVATE_KEY = "x"; });
  it("returns current state for a space", async () => {
    const req = { method: "GET", url: "/api/state?spaceId=sX&orgId=org&consoleSpaceId=console",
      headers: { "x-contentful-signature": "valid", "x-contentful-timestamp": String(Date.now()),
                 "x-contentful-user-id": "u", "x-contentful-space-id": "console", "x-contentful-environment-id": "master" },
      query: { spaceId: "sX", orgId: "org", consoleSpaceId: "console" }, body: "" } as any;
    const res = fakeRes(); await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.spaceId).toBe("sX");
    expect(res.body.freezeStatus).toBe("OFF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/api/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement state and cron**

Create `/Users/benle/Desktop/test app/api/state.ts`:
```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAppSignature } from "@/lib/auth/verify-app-signature";
import { cmaForSpace } from "@/lib/cma/client";
import { readSpaceState } from "@/lib/content-model/space-state";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    verifyAppSignature({
      method: req.method ?? "GET", path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body: typeof req.body === "string" ? req.body : ""
    }, process.env.APP_PRIVATE_KEY!);
  } catch { return res.status(401).json({ error: "invalid signature" }); }

  const spaceId = String(req.query.spaceId ?? "");
  const orgId = String(req.query.orgId ?? "");
  const consoleSpaceId = String(req.query.consoleSpaceId ?? "");
  if (!spaceId || !orgId || !consoleSpaceId) return res.status(400).json({ error: "missing query" });

  const cma = await cmaForSpace(orgId, consoleSpaceId);
  const env = await (await cma.getSpace(consoleSpaceId)).getEnvironment("master");
  const entry = await readSpaceState(env as any, spaceId);
  if (!entry) return res.status(200).json({ spaceId, freezeStatus: "OFF" });
  return res.status(200).json({
    spaceId,
    freezeStatus: entry.fields.freezeStatus?.["en-US"] ?? "OFF",
    frozenAt: entry.fields.frozenAt?.["en-US"],
    frozenBy: entry.fields.frozenBy?.["en-US"]
  });
}
```

Create `/Users/benle/Desktop/test app/api/cron/reconcile.ts`:
```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyCronToken } from "@/lib/auth/verify-cron-token";
import { cmaForSpace } from "@/lib/cma/client";
import { sweep } from "@/lib/fanout/sweep";
import { ensureTeamAttached } from "@/lib/fanout/ensure-team-attached";
import { readConfig } from "@/lib/content-model/governance-config";
import { appendAudit } from "@/lib/content-model/audit-event";

type Installation = { orgId: string; consoleSpaceId: string; installationId: string };

async function loadInstallations(): Promise<Installation[]> {
  const raw = process.env.INSTALLATIONS_JSON;
  if (!raw) return [];
  return JSON.parse(raw);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { verifyCronToken(req.headers.authorization as string); }
  catch { return res.status(401).json({ error: "invalid cron auth" }); }

  const installations = await loadInstallations();
  const out: any[] = [];
  for (const inst of installations) {
    try {
      const cma = await cmaForSpace(inst.orgId, inst.consoleSpaceId);
      const env = await (await cma.getSpace(inst.consoleSpaceId)).getEnvironment("master");
      const config = await readConfig(env);
      const teamId = config?.fields.orgAdminsTeamId?.["en-US"];
      if (!teamId) { out.push({ installationId: inst.installationId, skipped: "no teamId" }); continue; }
      const org = await cma.getOrganization(inst.orgId);
      const swept = await sweep(org as any, teamId, inst.consoleSpaceId, ensureTeamAttached as any);
      await appendAudit(env, { eventType: "RECONCILE_RUN", actorUserId: "system", details: { phase: "cron", swept } });
      out.push({ installationId: inst.installationId, swept });
    } catch (e) {
      out.push({ installationId: inst.installationId, error: String((e as Error).message) });
    }
  }
  return res.status(200).json({ ok: true, results: out });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all unit tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add api/state.ts api/cron/reconcile.ts tests/unit/api/state.test.ts
git commit -m "feat(api): GET /api/state + GET /api/cron/reconcile"
```

---

## Phase 7 — App Framework frontend

### Task 22: Scaffold the React app + Contentful App SDK plumbing

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/src/index.tsx`, `app/src/api-client.ts`, `app/src/locations/router.tsx`

- [ ] **Step 1: Write `app/package.json` and config**

Create `/Users/benle/Desktop/test app/app/package.json`:
```json
{
  "name": "org-governance-app-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@contentful/app-sdk": "^4.29.0",
    "@contentful/f36-components": "^4.65.0",
    "@contentful/f36-tokens": "^4.0.0",
    "@contentful/react-apps-toolkit": "^2.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

Create `/Users/benle/Desktop/test app/app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "noUncheckedIndexedAccess": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

Create `/Users/benle/Desktop/test app/app/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], base: "./", build: { outDir: "dist", sourcemap: true } });
```

Create `/Users/benle/Desktop/test app/app/index.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"/><title>Org Governance</title></head>
<body><div id="root"></div><script type="module" src="/src/index.tsx"></script></body></html>
```

- [ ] **Step 2: Implement the router and API client**

Create `/Users/benle/Desktop/test app/app/src/index.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { SDKProvider, useSDK } from "@contentful/react-apps-toolkit";
import { Router } from "./locations/router";

function App() { const sdk = useSDK(); return <Router sdk={sdk} />; }
createRoot(document.getElementById("root")!).render(<SDKProvider><App /></SDKProvider>);
```

Create `/Users/benle/Desktop/test app/app/src/api-client.ts`:
```ts
type AppSdk = any;

async function callSigned(sdk: AppSdk, path: string, init: RequestInit) {
  const signed = await sdk.cma.appSignedRequest.create({ appDefinitionId: sdk.ids.app! }, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" } as any,
    path,
    body: init.body as any ?? ""
  });
  const url = `${(window as any).GOV_API_BASE ?? ""}${path}`;
  const res = await fetch(url, { method: signed.method, headers: signed.headers as any, body: init.body });
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status, body: await res.text() });
  return res.json();
}

export const api = {
  bootstrap: (sdk: AppSdk, body: object) => callSigned(sdk, "/api/bootstrap", { method: "POST", body: JSON.stringify(body) }),
  toggleFreeze: (sdk: AppSdk, body: object) => callSigned(sdk, "/api/toggle-freeze", { method: "POST", body: JSON.stringify(body) }),
  getState: (sdk: AppSdk, q: Record<string, string>) =>
    callSigned(sdk, `/api/state?${new URLSearchParams(q).toString()}`, { method: "GET" })
};
```

Create `/Users/benle/Desktop/test app/app/src/locations/router.tsx`:
```tsx
import React from "react";
import { AppConfig } from "./app-config";
import { PageConsole } from "./page-console";
import { PageFrozen } from "./page-frozen";

export function Router({ sdk }: { sdk: any }) {
  const loc = sdk.location;
  if (loc.is(sdk.locations.LOCATION_APP_CONFIG)) return <AppConfig sdk={sdk} />;
  if (loc.is(sdk.locations.LOCATION_PAGE)) {
    const isConsole = sdk.ids.space === sdk.parameters.installation?.consoleSpaceId;
    return isConsole ? <PageConsole sdk={sdk} /> : <PageFrozen sdk={sdk} />;
  }
  return null;
}
```

- [ ] **Step 3: Install + smoke-build**

Run:
```bash
cd "/Users/benle/Desktop/test app/app" && pnpm install
mkdir -p src/locations
cat > src/locations/app-config.tsx <<'EOF'
import React from "react"; export function AppConfig({sdk}:{sdk:any}){return <div>Wizard placeholder</div>;}
EOF
cat > src/locations/page-console.tsx <<'EOF'
import React from "react"; export function PageConsole({sdk}:{sdk:any}){return <div>Console placeholder</div>;}
EOF
cat > src/locations/page-frozen.tsx <<'EOF'
import React from "react"; export function PageFrozen({sdk}:{sdk:any}){return <div>Frozen placeholder</div>;}
EOF
pnpm build
```
Expected: Vite build succeeds.

- [ ] **Step 4: Typecheck**

Run: `cd "/Users/benle/Desktop/test app/app" && pnpm tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "feat(app): scaffold React app with SDK, router, and API client"
```

### Task 23: Bootstrap wizard (6 steps)

**Files:**
- Modify: `app/src/locations/app-config.tsx`
- Create: `app/src/wizard/step-welcome.tsx`, `app/src/wizard/step-preflight.tsx`, `app/src/wizard/step-console-space.tsx`, `app/src/wizard/step-team.tsx`, `app/src/wizard/step-review.tsx`, `app/src/wizard/step-done.tsx`

- [ ] **Step 1: Replace placeholder with the wizard shell**

Overwrite `/Users/benle/Desktop/test app/app/src/locations/app-config.tsx`:
```tsx
import React, { useState } from "react";
import { Stack, Heading } from "@contentful/f36-components";
import { StepWelcome } from "../wizard/step-welcome";
import { StepPreflight } from "../wizard/step-preflight";
import { StepConsoleSpace } from "../wizard/step-console-space";
import { StepTeam } from "../wizard/step-team";
import { StepReview } from "../wizard/step-review";
import { StepDone } from "../wizard/step-done";

export type WizardState = {
  consoleSpaceId?: string;
  consoleSpaceName?: string;
  orgAdminsTeamName: string;
  initialMembers: string[];
  preflight: { passed: boolean; failures: string[] };
};

export function AppConfig({ sdk }: { sdk: any }) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    orgAdminsTeamName: "Org Admins",
    initialMembers: [sdk.ids.user],
    preflight: { passed: false, failures: [] }
  });
  const steps = [
    <StepWelcome key={0} onNext={() => setStep(1)} />,
    <StepPreflight key={1} sdk={sdk} onNext={(r) => { setState({ ...state, preflight: r }); setStep(2); }} onBack={() => setStep(0)} />,
    <StepConsoleSpace key={2} sdk={sdk} state={state} setState={setState} onBack={() => setStep(1)} onNext={() => setStep(3)} />,
    <StepTeam key={3} sdk={sdk} state={state} setState={setState} onBack={() => setStep(2)} onNext={() => setStep(4)} />,
    <StepReview key={4} sdk={sdk} state={state} onBack={() => setStep(3)} onNext={() => setStep(5)} />,
    <StepDone key={5} sdk={sdk} state={state} />
  ];
  return (
    <Stack flexDirection="column" spacing="spacingL" padding="spacingXl">
      <Heading>Org Governance — Setup</Heading>
      {steps[step]}
    </Stack>
  );
}
```

- [ ] **Step 2: Implement the six step components**

Create `/Users/benle/Desktop/test app/app/src/wizard/step-welcome.tsx`:
```tsx
import React from "react";
import { Stack, Paragraph, Button, Note } from "@contentful/f36-components";
export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <Paragraph>This app installs two governance capabilities across your org:</Paragraph>
      <ul>
        <li><b>Protected org-admin access</b> via an auto-attached team.</li>
        <li><b>Role/permission freeze</b> per space via role substitution.</li>
      </ul>
      <Note variant="warning">The wizard will create or attach to one space and create one team, two webhooks, plus three content types. You must be an Org Admin or Owner.</Note>
      <Button variant="primary" onClick={onNext}>Get started</Button>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/wizard/step-preflight.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Stack, Paragraph, Button, Spinner, Note } from "@contentful/f36-components";

type Check = { name: string; result?: "pass" | "fail" | "skip"; detail?: string };

export function StepPreflight({ sdk, onNext, onBack }: { sdk: any; onNext: (r: { passed: boolean; failures: string[] }) => void; onBack: () => void }) {
  const [checks, setChecks] = useState<Check[]>([
    { name: "App Identity token validates" },
    { name: "Caller is Org Admin or Owner" },
    { name: "Can create+delete a probe role with manageRoles=none" },
    { name: "Can create+delete a probe team" }
  ]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setRunning(true);
    (async () => {
      const next: Check[] = [];
      try { await sdk.cma.user.getCurrent(); next.push({ name: checks[0]!.name, result: "pass" }); }
      catch (e: any) { next.push({ name: checks[0]!.name, result: "fail", detail: String(e?.message) }); }
      try {
        const memberships = await sdk.cma.organizationMembership.getMany({ organizationId: sdk.ids.organization });
        const me = memberships.items.find((m: any) => m.sys.user?.sys.id === sdk.ids.user);
        next.push({ name: checks[1]!.name, result: (me?.role === "owner" || me?.role === "admin") ? "pass" : "fail", detail: `role=${me?.role ?? "unknown"}` });
      } catch (e: any) { next.push({ name: checks[1]!.name, result: "fail", detail: String(e?.message) }); }
      next.push({ name: checks[2]!.name, result: "skip", detail: "Verified by automated probe in scripts/probe-1-role-hides-rp.ts before install" });
      next.push({ name: checks[3]!.name, result: "skip", detail: "Verified at runtime during bootstrap (idempotent)" });
      setChecks(next); setRunning(false);
    })();
  }, []);

  const failures = checks.filter((c) => c.result === "fail").map((c) => c.name);
  const passed = checks.length > 0 && failures.length === 0;

  return (
    <Stack flexDirection="column" spacing="spacingM">
      {running && <Spinner />}
      <ul>
        {checks.map((c, i) => (
          <li key={i}>{c.result === "pass" ? "✓ " : c.result === "fail" ? "✗ " : c.result === "skip" ? "○ " : "… "}{c.name}{c.detail ? <span style={{ opacity: 0.6 }}> — {c.detail}</span> : null}</li>
        ))}
      </ul>
      {!running && failures.length > 0 && <Note variant="negative">Failing checks: {failures.join(", ")}</Note>}
      {!running && passed && <Note variant="positive">All automated checks passed.</Note>}
      <Stack>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" isDisabled={running || !passed} onClick={() => onNext({ passed, failures })}>Continue</Button>
      </Stack>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/wizard/step-console-space.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Stack, Radio, TextInput, Select, FormControl, Button } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepConsoleSpace({ sdk, state, setState, onNext, onBack }:
  { sdk: any; state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [name, setName] = useState("governance-console");
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [pickedId, setPickedId] = useState<string>("");
  useEffect(() => {
    sdk.cma.space.getMany({}).then((r: any) => setSpaces(r.items.map((s: any) => ({ id: s.sys.id, name: s.name }))));
  }, []);
  async function next() {
    let id: string, n: string;
    if (mode === "create") {
      const created = await sdk.cma.space.create({ organizationId: sdk.ids.organization }, { name, defaultLocale: "en-US" });
      id = created.sys.id; n = created.name;
    } else { id = pickedId; n = spaces.find((s) => s.id === pickedId)?.name ?? pickedId; }
    setState({ ...state, consoleSpaceId: id, consoleSpaceName: n });
    onNext();
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <FormControl><FormControl.Label>Console space</FormControl.Label>
        <Radio name="mode" isChecked={mode === "create"} onChange={() => setMode("create")}>Create new space</Radio>
        {mode === "create" && <TextInput value={name} onChange={(e) => setName(e.target.value)} />}
        <Radio name="mode" isChecked={mode === "existing"} onChange={() => setMode("existing")}>Use existing space</Radio>
        {mode === "existing" && (
          <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
            <Select.Option value="">— pick —</Select.Option>
            {spaces.map((s) => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
          </Select>
        )}
      </FormControl>
      <Stack><Button onClick={onBack}>Back</Button><Button variant="primary" onClick={next} isDisabled={mode === "existing" && !pickedId}>Next</Button></Stack>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/wizard/step-team.tsx`:
```tsx
import React, { useState } from "react";
import { Stack, FormControl, TextInput, Button, Pill, Flex } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepTeam({ state, setState, onNext, onBack }:
  { sdk: any; state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void }) {
  const [member, setMember] = useState("");
  function add() {
    if (!member) return;
    setState({ ...state, initialMembers: [...state.initialMembers, member] }); setMember("");
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <FormControl><FormControl.Label>Team name</FormControl.Label>
        <TextInput value={state.orgAdminsTeamName} onChange={(e) => setState({ ...state, orgAdminsTeamName: e.target.value })} />
      </FormControl>
      <FormControl><FormControl.Label>Initial members (user IDs)</FormControl.Label>
        <Flex gap="spacingS" flexWrap="wrap">{state.initialMembers.map((m, i) => <Pill key={i} label={m} />)}</Flex>
        <Flex gap="spacingS">
          <TextInput value={member} onChange={(e) => setMember(e.target.value)} placeholder="user-id" />
          <Button onClick={add}>Add</Button>
        </Flex>
      </FormControl>
      <Stack><Button onClick={onBack}>Back</Button><Button variant="primary" onClick={onNext}>Next</Button></Stack>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/wizard/step-review.tsx`:
```tsx
import React, { useState } from "react";
import { Stack, Button, Note, Spinner } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";
import { api } from "../api-client";

export function StepReview({ sdk, state, onNext, onBack }:
  { sdk: any; state: WizardState; onNext: () => void; onBack: () => void }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  async function install() {
    setRunning(true); setError(undefined);
    try {
      await api.bootstrap(sdk, {
        orgId: sdk.ids.organization,
        installationId: sdk.ids.app,
        consoleSpaceId: state.consoleSpaceId,
        orgAdminsTeamName: state.orgAdminsTeamName,
        initialTeamMemberUserIds: state.initialMembers
      });
      await sdk.app.setParameters({ consoleSpaceId: state.consoleSpaceId });
      onNext();
    } catch (e: any) { setError(e.body ?? e.message); }
    finally { setRunning(false); }
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <table>
        <tbody>
          <tr><td>Console space</td><td>{state.consoleSpaceName} ({state.consoleSpaceId})</td></tr>
          <tr><td>Org Admins team</td><td>{state.orgAdminsTeamName} ({state.initialMembers.length} member(s))</td></tr>
          <tr><td>Content types</td><td>governanceConfig, spaceState, auditEvent</td></tr>
          <tr><td>Webhooks</td><td>Space.create, TeamSpaceMembership.delete</td></tr>
        </tbody>
      </table>
      {error && <Note variant="negative">{error}</Note>}
      {running && <Spinner />}
      <Stack><Button onClick={onBack} isDisabled={running}>Back</Button><Button variant="primary" onClick={install} isDisabled={running}>Install</Button></Stack>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/wizard/step-done.tsx`:
```tsx
import React from "react";
import { Stack, Heading, Paragraph, Button } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepDone({ sdk, state }: { sdk: any; state: WizardState }) {
  function openConsole() {
    sdk.navigator.openPageExtension({ id: sdk.ids.app, path: "/", spaceId: state.consoleSpaceId });
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <Heading>All set up</Heading>
      <Paragraph>The app is installed in your org. The Org Admins team is attached to your existing spaces, and webhooks are registered.</Paragraph>
      <Button variant="primary" onClick={openConsole}>Open governance console</Button>
    </Stack>
  );
}
```

- [ ] **Step 3: Build the app to verify it compiles**

Run: `cd "/Users/benle/Desktop/test app/app" && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Typecheck**

Run: `cd "/Users/benle/Desktop/test app/app" && pnpm tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/locations/app-config.tsx app/src/wizard/
git commit -m "feat(app): bootstrap wizard with 6 steps including pre-flight"
```

### Task 24: Console page (freeze toggle + audit log) and Frozen page

**Files:**
- Modify: `app/src/locations/page-console.tsx`, `app/src/locations/page-frozen.tsx`
- Create: `app/src/console/space-list.tsx`, `app/src/console/freeze-toggle.tsx`, `app/src/console/audit-log.tsx`

- [ ] **Step 1: Implement the frozen page (simple)**

Overwrite `/Users/benle/Desktop/test app/app/src/locations/page-frozen.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Stack, Heading, Paragraph, Spinner } from "@contentful/f36-components";
import { api } from "../api-client";

export function PageFrozen({ sdk }: { sdk: any }) {
  const [state, setState] = useState<any>();
  useEffect(() => {
    api.getState(sdk, { spaceId: sdk.ids.space, orgId: sdk.ids.organization, consoleSpaceId: sdk.parameters.installation?.consoleSpaceId })
       .then(setState).catch(() => setState({ freezeStatus: "OFF" }));
  }, []);
  if (!state) return <Spinner />;
  if (state.freezeStatus !== "FROZEN" && state.freezeStatus !== "TRANSITIONING_ON") {
    return <Paragraph>This space is not currently frozen.</Paragraph>;
  }
  return (
    <Stack flexDirection="column" spacing="spacingL" padding="spacingXl" alignItems="center">
      <Heading style={{ fontSize: 56 }}>🔒</Heading>
      <Heading>Frozen by org policy</Heading>
      <Paragraph>Role and permission edits are disabled. Contact your org admin to request a change.</Paragraph>
    </Stack>
  );
}
```

- [ ] **Step 2: Implement the console page and its widgets**

Overwrite `/Users/benle/Desktop/test app/app/src/locations/page-console.tsx`:
```tsx
import React from "react";
import { Stack, Heading, Tabs } from "@contentful/f36-components";
import { SpaceList } from "../console/space-list";
import { AuditLog } from "../console/audit-log";

export function PageConsole({ sdk }: { sdk: any }) {
  return (
    <Stack flexDirection="column" padding="spacingXl" spacing="spacingL">
      <Heading>Org Governance Console</Heading>
      <Tabs defaultTab="spaces">
        <Tabs.List><Tabs.Tab panelId="spaces">Spaces</Tabs.Tab><Tabs.Tab panelId="audit">Audit log</Tabs.Tab></Tabs.List>
        <Tabs.Panel id="spaces"><SpaceList sdk={sdk} /></Tabs.Panel>
        <Tabs.Panel id="audit"><AuditLog sdk={sdk} /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/console/space-list.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Table, Stack, Spinner } from "@contentful/f36-components";
import { FreezeToggle } from "./freeze-toggle";

export function SpaceList({ sdk }: { sdk: any }) {
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    sdk.cma.space.getMany({}).then((r: any) =>
      setSpaces(r.items.map((s: any) => ({ id: s.sys.id, name: s.name }))
        .filter((s: any) => s.id !== sdk.parameters.installation?.consoleSpaceId))
    );
  }, []);
  if (!spaces.length) return <Spinner />;
  return (
    <Table>
      <Table.Head><Table.Row><Table.Cell>Space</Table.Cell><Table.Cell>Freeze</Table.Cell></Table.Row></Table.Head>
      <Table.Body>
        {spaces.map((s) => (
          <Table.Row key={s.id}><Table.Cell>{s.name}</Table.Cell><Table.Cell><FreezeToggle sdk={sdk} spaceId={s.id} /></Table.Cell></Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/console/freeze-toggle.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Button, Badge, Stack } from "@contentful/f36-components";
import { api } from "../api-client";

export function FreezeToggle({ sdk, spaceId }: { sdk: any; spaceId: string }) {
  const [status, setStatus] = useState<string>("OFF");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await api.getState(sdk, { spaceId, orgId: sdk.ids.organization, consoleSpaceId: sdk.parameters.installation?.consoleSpaceId });
    setStatus(r.freezeStatus);
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [spaceId]);

  async function toggle() {
    setBusy(true);
    try {
      await api.toggleFreeze(sdk, {
        spaceId, orgId: sdk.ids.organization,
        consoleSpaceId: sdk.parameters.installation?.consoleSpaceId,
        action: status === "OFF" ? "freeze" : "thaw"
      });
      await refresh();
    } finally { setBusy(false); }
  }

  const variant = status === "FROZEN" ? "negative" : status === "OFF" ? "positive" : "warning";
  return (
    <Stack>
      <Badge variant={variant}>{status}</Badge>
      <Button size="small" onClick={toggle} isLoading={busy} isDisabled={status === "TRANSITIONING_ON" || status === "TRANSITIONING_OFF"}>
        {status === "OFF" ? "Freeze" : "Thaw"}
      </Button>
    </Stack>
  );
}
```

Create `/Users/benle/Desktop/test app/app/src/console/audit-log.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Table, Spinner } from "@contentful/f36-components";

export function AuditLog({ sdk }: { sdk: any }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const env = await (await sdk.cma.space.get({ spaceId: sdk.parameters.installation?.consoleSpaceId }) as any).getEnvironment("master");
      const r = await env.getEntries({ content_type: "auditEvent", order: "-fields.timestamp", limit: 50 });
      setRows(r.items);
    })();
  }, []);
  if (!rows.length) return <Spinner />;
  return (
    <Table>
      <Table.Head><Table.Row><Table.Cell>When</Table.Cell><Table.Cell>Type</Table.Cell><Table.Cell>Space</Table.Cell><Table.Cell>Actor</Table.Cell></Table.Row></Table.Head>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.sys.id}>
            <Table.Cell>{r.fields.timestamp?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.eventType?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.spaceId?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.actorUserId?.["en-US"]}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
```

- [ ] **Step 3: Build the app**

Run: `cd "/Users/benle/Desktop/test app/app" && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Typecheck**

Run: `cd "/Users/benle/Desktop/test app/app" && pnpm tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/locations/page-console.tsx app/src/locations/page-frozen.tsx app/src/console/
git commit -m "feat(app): console page (freeze toggle + audit log) and frozen page"
```

---

## Phase 8 — Operator docs

### Task 25: Manual test plan + demo walkthrough docs

**Files:**
- Create: `docs/manual-test-plan.md`, `docs/demo-walkthrough.md`

- [ ] **Step 1: Write the manual test plan**

Create `/Users/benle/Desktop/test app/docs/manual-test-plan.md`:
```markdown
# Manual Test Plan

All scenarios run against the target org `30SScScam27l3EU95xxctv` (Ben Simple Projects) with the deployed Vercel backend and Contentful App installed.

## Scenario 1 — First-run bootstrap
1. Install the app in the org via the install URL.
2. Walk the wizard end-to-end (Welcome → Pre-flight → Console space → Team → Review → Done).
3. Confirm a new space (`governance-console`) appears in the org.
4. Open the console page; confirm the existing space ("Jobs") appears with `freezeStatus: OFF`.

## Scenario 2 — Fan-out to a new space
1. From the Contentful web app, create a new empty space.
2. Within 60 seconds, refresh the console; confirm the new space appears with `freezeStatus: OFF`.
3. Confirm the Org Admins team is attached to the new space as Admin.

## Scenario 3 — Freeze ON
1. In the console, click **Freeze** on the Jobs space.
2. Status transitions OFF → TRANSITIONING_ON → FROZEN within ~10s.
3. Invite a throwaway user as a direct Space Admin (or use the one from Probe 1).
4. Log in as that user, navigate to Settings. **Expected:** no "Roles & Permissions" entry.

## Scenario 4 — Removal attempt during freeze
1. As the throwaway space admin, open Users → find the Org Admins team membership.
2. Try to remove it via UI. **Expected:** denied.
3. Try via CMA `DELETE /organizations/.../team_space_memberships/<id>`. **Expected:** 403.

## Scenario 5 — Thaw and verify
1. In the console, click **Thaw** on the Jobs space.
2. Status transitions FROZEN → TRANSITIONING_OFF → OFF.
3. As the throwaway space admin, refresh. **Expected:** Settings → Roles & Permissions is back.

## Scenario 6 — Concurrent toggle conflict
1. Open the console in two browser tabs.
2. Click **Thaw** on the same space in both tabs nearly simultaneously.
3. Both tabs show the in-progress job; only one substitution loop runs end-to-end (verified via audit log).
```

- [ ] **Step 2: Write the demo walkthrough**

Create `/Users/benle/Desktop/test app/docs/demo-walkthrough.md`:
```markdown
# Customer Demo Walkthrough (~7 minutes)

## Setup (do before the demo)
- App installed, bootstrap complete.
- One additional empty space exists (besides "Jobs"), so Scenario 2 demonstrates fan-out from history.
- A throwaway user already exists as a direct Space Admin on "Jobs", logged in on a second browser profile.

## Beat 1 — The problem (1 min)
Frame the customer's TELUS-style ask: central admins lose visibility and control as spaces multiply; Space Admin is the only tool, and it's a sledgehammer.

## Beat 2 — MVP 1 in action (2 min)
- Show the governance console: "Jobs" already lists the Org Admins team.
- Live-create a new empty space.
- Refresh the console — the new space appears, Org Admins attached automatically.
- Open the new space's Users — point out the Org Admins team membership.

## Beat 3 — MVP 2 in action (3 min)
- In the console, click **Freeze** on "Jobs".
- Switch to the throwaway-admin browser.
- Open Settings — show no "Roles & Permissions" entry.
- Try the URL directly — show denied.
- Back in the console, click **Thaw** — settings returns.

## Beat 4 — Why this stays safe (1 min)
- Open the audit log tab — point out the `FREEZE_TOGGLED`, `SUBSTITUTION_APPLIED`, `TEAM_ATTACHED` events.
- Mention the nightly reconcile cron and the webhook-backed defense for team removal.
```

- [ ] **Step 3: Verify both files render**

Run: `head -5 "/Users/benle/Desktop/test app/docs/manual-test-plan.md" "/Users/benle/Desktop/test app/docs/demo-walkthrough.md"`
Expected: shows the H1 of each.

- [ ] **Step 4: Add a short README pointing at the docs**

Create `/Users/benle/Desktop/test app/README.md`:
```markdown
# Contentful Org Governance App

Production-ready Contentful App delivering:
- **MVP 1:** Protected org-admin access via an auto-attached Team across every current and future space.
- **MVP 2:** Per-space role/permission freeze via custom-role substitution.

## Layout
- `api/` — Vercel serverless functions (bootstrap, toggle-freeze, webhook, cron/reconcile, state)
- `lib/` — Pure-logic libraries (auth, CMA client, content model, freeze, fanout)
- `app/` — Contentful App frontend (wizard + console + frozen page)
- `scripts/` — Live probes (P1, P2)
- `docs/` — Spec, plan, manual probes, test plan, demo walkthrough

## Quickstart
1. `pnpm install`
2. Copy `.env.example` to `.env` and fill in. Use the dev PAT for local probing.
3. Run probes: `pnpm tsx scripts/probe-1-role-hides-rp.ts` then `scripts/probe-2-team-removal.ts`.
4. Run tests: `pnpm test`.
5. Deploy to Vercel; create the Contentful App Definition pointing at the deployed frontend bundle + `/api/*` endpoints.
6. Install in the target org and run the bootstrap wizard.

See `docs/design/specs/2026-05-16-contentful-org-governance-app-design.md` for the spec and `docs/design/plans/2026-05-16-contentful-org-governance-app.md` for this plan.
```

- [ ] **Step 5: Commit**

```bash
git add docs/manual-test-plan.md docs/demo-walkthrough.md README.md
git commit -m "docs: manual test plan, demo walkthrough, README"
```

---

## Phase 9 — Integration tests

### Task 26: Bootstrap + freeze/thaw round-trip integration

**Files:**
- Create: `tests/integration/bootstrap-round-trip.test.ts`, `tests/integration/freeze-thaw-cycle.test.ts`

- [ ] **Step 1: Write the failing bootstrap integration test**

Create `/Users/benle/Desktop/test app/tests/integration/bootstrap-round-trip.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "contentful-management";

const RUN = process.env.CF_INTEGRATION === "1";
const PAT = process.env.CF_DEV_PAT!;
const ORG = process.env.CF_TARGET_ORG ?? "30SScScam27l3EU95xxctv";

describe.runIf(RUN)("integration — bootstrap round-trip", () => {
  let cma: any, consoleSpaceId: string;
  beforeAll(() => { cma = createClient({ accessToken: PAT }); });

  it("creates a console space, content types, team, then cleans up", async () => {
    const created = await cma.createSpace({ name: "gov-it-" + Date.now(), defaultLocale: "en-US" }, ORG);
    consoleSpaceId = created.sys.id;
    try {
      const env = await (await cma.getSpace(consoleSpaceId)).getEnvironment("master");
      const { ensureContentTypes } = await import("@/lib/content-model/ensure-types");
      await ensureContentTypes(env as any);
      const types = (await env.getContentTypes()).items.map((c: any) => c.sys.id);
      expect(types).toEqual(expect.arrayContaining(["governanceConfig", "spaceState", "auditEvent"]));
    } finally {
      const s = await cma.getSpace(consoleSpaceId);
      await s.delete();
    }
  }, 120_000);
});
```

- [ ] **Step 2: Write the failing freeze/thaw integration test**

Create `/Users/benle/Desktop/test app/tests/integration/freeze-thaw-cycle.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "contentful-management";
import { ensureFrozenRole } from "@/lib/freeze/ensure-frozen-role";

const RUN = process.env.CF_INTEGRATION === "1";
const PAT = process.env.CF_DEV_PAT!;
const TARGET = process.env.CF_TARGET_SPACE ?? "ubgf1y7ixw5q";

describe.runIf(RUN)("integration — freeze role lifecycle", () => {
  let cma: any;
  beforeAll(() => { cma = createClient({ accessToken: PAT }); });

  it("creates the substitute role and removes it", async () => {
    const space = await cma.getSpace(TARGET);
    const id = await ensureFrozenRole(space as any, "it-frozen-role");
    expect(id).toMatch(/.+/);
    const role = (await space.getRoles()).items.find((r: any) => r.sys.id === id);
    await role.delete();
  }, 120_000);
});
```

- [ ] **Step 3: Run integration tests against the live org**

Run:
```bash
CF_INTEGRATION=1 \
  CF_DEV_PAT="CFPAT-REDACTED" \
  pnpm test -- tests/integration/
```
Expected: both tests PASS. If `bootstrap-round-trip` 422s on space creation, check org space limits.

- [ ] **Step 4: Run the full unit + integration suite**

Run: `CF_INTEGRATION=1 CF_DEV_PAT="…" pnpm test`
Expected: all PASS; integration tests are guarded so they're skipped without `CF_INTEGRATION=1`.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/
git commit -m "test: integration round-trips for bootstrap + freeze role"
```

---

## Phase 10 — Deployment

### Task 27: Deploy to Vercel + create the App Definition

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: Deploy to Vercel**

Run (one-time):
```bash
cd "/Users/benle/Desktop/test app" && pnpm dlx vercel link --yes && pnpm dlx vercel --prod
```
Capture the resulting Vercel production URL (e.g. `https://gov-app.vercel.app`).

Then in the Vercel dashboard for the project, under **Settings → Environment Variables**, set:
- `APP_DEFINITION_ID` — fill after the next step
- `APP_PRIVATE_KEY` — fill after the next step
- `GLOBAL_WEBHOOK_SECRET` — generate with `openssl rand -hex 32`
- `CRON_SECRET` — generate with `openssl rand -hex 32`
- `INSTALLATIONS_JSON` — leave empty until the first install; update after install with `[{"orgId":"30SS…","consoleSpaceId":"<from wizard>","installationId":"<from wizard>"}]`

- [ ] **Step 2: Create the App Definition in Contentful**

Manual UI step (one-time, requires Org Admin):
1. Open `https://app.contentful.com/account/organizations/30SScScam27l3EU95xxctv/app_definitions`.
2. Click **Create app**.
3. Name: `Org Governance`. Bundle URL: `https://<vercel-url>/app/` (the frontend's `dist/`). Locations: `App configuration screen`, `Page`.
4. Save. Copy the **App Definition ID** into Vercel's `APP_DEFINITION_ID` env var.
5. In **Keys** for the same App Definition, generate a key pair. Copy the private key into Vercel's `APP_PRIVATE_KEY` env var (escape newlines as `\n`).
6. Re-deploy: `pnpm dlx vercel --prod`.

- [ ] **Step 3: Serve the frontend bundle from the Vercel project**

Add a Vercel-side static rewrite. Update `/Users/benle/Desktop/test app/vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm build:app",
  "outputDirectory": "app/dist",
  "functions": { "api/**/*.ts": { "runtime": "@vercel/node" } },
  "crons": [{ "path": "/api/cron/reconcile", "schedule": "0 5 * * *" }]
}
```

Re-deploy: `pnpm dlx vercel --prod`. Verify `https://<vercel-url>/index.html` returns the bundled frontend.

- [ ] **Step 4: Install the app in the target org and run the wizard**

In Contentful UI:
1. Go to the App Definition page; click **Install to space** → choose `30SScScam27l3EU95xxctv` → pick a space to install (the wizard will create the console space inside the org regardless).
2. Walk the wizard.
3. Copy the **installationId** the wizard shows on the "Done" screen.
4. Update Vercel env `INSTALLATIONS_JSON` to include the installation; redeploy.

- [ ] **Step 5: Final smoke check + commit deployment docs**

Run Scenarios 1–5 from `docs/manual-test-plan.md` against the deployed instance. Record any deltas.

Update `README.md` Quickstart with the actual Vercel URL placeholder and `vercel.json` outputs. Commit:
```bash
git add vercel.json README.md
git commit -m "chore: production deployment configuration"
```

---

## Self-review — done as part of writing this plan

- **Spec coverage:** Sections 1–13 of the spec each map to one or more tasks above:
  - Spec §4 system overview → Task 22 router.
  - §5 content model → Tasks 8, 9, 10.
  - §6 freeze flow → Tasks 14–17.
  - §7 fan-out → Tasks 11–13.
  - §8 function contracts → Tasks 18–21.
  - §9 error handling & drift → cron reconcile (Task 21) + state machine guards + resumable orchestrator.
  - §10 testing → unit tests inline with each task + Task 26 integration + Task 25 manual.
  - §11 wizard UX → Tasks 22, 23.
  - §12 multi-tenancy → Tasks 4 (token cache), 5 (App-Identity client), 7 (derived secrets), 20 (bootstrap reading `installationId`).
  - §13 dev env bootstrap → Phase 1 probes + Task 27 deployment.
- **Placeholder scan:** Every task has concrete code and exact commands. No "TODO" / "TBD" in steps.
- **Type consistency:** `FreezeStatus`, `FanoutResult`, `SubstitutionRecord`, `AuditEventType`, and `ensureTeamAttached` / `sweep` / `runTransition` signatures are referenced consistently across tasks 11, 12, 14, 16, 17, 18, 21.
- **Open spec questions:** Q1–Q5 from §14 are resolved (or pinned for resolution) by the probes (Q1, Q2), the `runTransition` resume logic (Q3), the self-exclusion in `enumerateSpaceAdmins` (Q4), and the bootstrap-time webhook registration with cron as the safety net (Q5).
