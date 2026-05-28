# Install Guide — Contentful Org Governance App

This app gives an Org Admin (or Owner) two things across every space in their
Contentful organization:

1. **Auto-attach** an "Org Admins" team to every current and future space, so
   admin access can never be locked away by a Space Admin who removes you.
2. **One-click freeze** of any space — turns every direct Space Admin in that
   space into a read-only role until you thaw it. Useful before sensitive
   releases, audits, or while a space owner is offline.

You can install this in any Contentful org you administer. The setup takes
about 15 minutes the first time. Everything runs in your own Vercel project;
no data leaves your tenancy.

---

## Prerequisites

- **Contentful org**, and you are an **Org Admin or Owner** on it.
- **Vercel account** (free Hobby plan works for small orgs; **Pro plan
  recommended for 30+ spaces**, see [Plan limits](#vercel-plan-limits) below).
- **A service-account user** in your Contentful org. You can use a real user
  account for testing, but for production we strongly recommend creating a
  dedicated user (e.g. `governance-bot@yourcompany.com`), making them an
  Org Admin, and using *their* PAT — so when individual admins join or leave,
  the app keeps working. The PAT inherits the user's permissions.

## Step 1 — Mint a Personal Access Token (PAT)

1. Log in to Contentful as your service-account user.
2. Top-right account menu → **Account settings** → **CMA tokens** tab.
3. **Generate personal token**. Name it `org-governance-app`. Copy the value —
   you'll see it once.
4. Confirm the user owning this PAT is **Org Admin** (Org Settings → Users).

Why a PAT and not OAuth or App Identity?
- App Identity tokens are scoped to a single space; this app must reach across
  the whole org.
- OAuth would require us to operate a public OAuth app, which means data flows
  through a shared third party. The PAT model keeps everything inside your
  tenancy.
- This is the standard pattern for Contentful org-level integrations today.

## Step 2 — Deploy the app to your Vercel

1. Fork this repository to your own GitHub account.
2. In Vercel: **New Project** → import your fork.
3. Vercel auto-detects the build (`vercel.json` is already configured). Click
   **Deploy**. Wait ~2 minutes.
4. Once deployed, copy your project's URL (e.g.
   `https://gov-app-yourname.vercel.app`).

You'll add env vars in Step 4 — for now, leave the first deploy as-is.

## Step 3 — Create the Contentful App Definition

From your local clone of the fork:

```sh
pnpm install
export CONTENTFUL_MANAGEMENT_TOKEN="<your PAT from Step 1>"
export CF_ORG_ID="<your org ID — find it in Org Settings → URL contains it>"
export APP_URL="https://gov-app-yourname.vercel.app"   # from Step 2
pnpm setup:app-definition
```

The script prints two values you'll need next:

```
Created App Definition:
  ID:   abc123...
Generated App Signing Secret (store as APP_SIGNING_SECRET in Vercel):
   def456...
```

Copy both.

### What the signing secret is (and how it's made)

The **App Signing Secret** is a random 64-byte hex value the script mints
locally and registers against your App Definition via
`PUT /organizations/{org}/app_definitions/{defId}/signing_secret`. Contentful
then HMAC-signs every iframe request to your app with it; `APP_SIGNING_SECRET`
in Vercel is what the app uses to verify those signatures. It is **not** the
App private key (that's a separate thing, used for App Identity tokens).

You don't have to use the script. The equivalent manual path is:

> **Org Settings → Apps → Org Governance → App signing secret → Generate**

⚠️ Two gotchas, both of which will surface as `403 Invalid signature`:

- **Colon format.** The UI shows the secret as colon-delimited hex
  (`38:7e:86:…`). The real key is the raw hex with no colons. The app strips
  colons for you, so copy-paste either form — but if you store it somewhere
  else, store the raw value.
- **Regenerating invalidates the old one.** Clicking *Generate* (or re-running
  the PUT) mints a fresh secret and revokes the previous value. Whenever you
  regenerate, you **must** update `APP_SIGNING_SECRET` in Vercel and redeploy,
  or every request from Contentful will fail to verify. (Rotation steps are in
  the *Maintenance* section below.)

## Step 4 — Set Vercel env vars + redeploy

In your Vercel project → **Settings** → **Environment Variables**, add:

| Name | Value | Notes |
|---|---|---|
| `CONTENTFUL_MANAGEMENT_TOKEN` | your PAT | from Step 1 |
| `APP_DEFINITION_ID` | from Step 3 output | |
| `APP_SIGNING_SECRET` | from Step 3 output | used to verify signed iframe requests |
| `CRON_SECRET` | any 32-byte random hex string | guards `/api/cron/reconcile`. Generate with `openssl rand -hex 32` |
| `GLOBAL_WEBHOOK_SECRET` | any 32-byte random hex string | derive per-installation webhook secrets from this. Optional today (webhook subsystem is dormant), but recommended so future versions don't surprise you. Generate with `openssl rand -hex 32` |

### How to make `CRON_SECRET` and `GLOBAL_WEBHOOK_SECRET`

Unlike the App Signing Secret, neither of these is registered with Contentful
— they're plain random hex values you mint locally and store in Vercel only.
Generate one of each:

```sh
openssl rand -hex 32   # → paste as CRON_SECRET
openssl rand -hex 32   # → paste as GLOBAL_WEBHOOK_SECRET
```

What each protects:

- **`CRON_SECRET`** — bearer token guarding `/api/cron/reconcile`
  (`lib/auth/verify-cron-token.ts`). Vercel's own cron is allowed through the
  `x-vercel-cron` header automatically; the secret is what gates *manual*
  calls (e.g. the rotation example in *Maintenance* below). Load-bearing if
  you ever hit that endpoint from outside Vercel.
- **`GLOBAL_WEBHOOK_SECRET`** — HMAC root from which per-installation webhook
  secrets are derived as `HMAC-SHA256(GLOBAL_WEBHOOK_SECRET, installationId)`
  (`lib/secrets/derive-webhook-secret.ts`). The derived value — not the root —
  is what's stored on each Contentful webhook. **Optional today**: the
  current build does not actively register webhooks during bootstrap, so this
  value is dormant. Set it anyway so a future release doesn't surprise you.
  Rotation = change the env var and re-bootstrap (re-registers all webhooks
  with freshly derived secrets).

Apply to **Production** environment. Then **Deployments → Redeploy** the
latest with "Use existing build cache: off."

## Step 5 — Install the app in your console space

Pick one space to be the **console space** — the place where the app's UI
lives and where state/audit entries are stored. It doesn't have to be a
"big" space; many customers use a small admin-only space named `Governance`
or reuse an existing admin space.

1. In Contentful → top-right org switcher → **Organization settings** →
   **Apps**.
2. Find **Org Governance** in the list. Click → **Install to space**.
3. Select your console space. Hit Authorize.
4. The install wizard opens — walk through the 5 steps. It will:
   - Create the `governanceConfig`, `spaceState`, and `auditEvent` content
     types in the console space.
   - Create an `Org Admins` team in the org, add you to it.
   - Sweep your org and attach the team as admin to every other space.
5. After the wizard finishes you'll see **Setup complete** → tabs for
   **Spaces** and **Audit log**.
6. **Pin the console space ID.** Copy the URL of the console space from your
   browser bar — it looks like `https://app.contentful.com/spaces/<spaceId>/...`.
   In Vercel → project Settings → Environment Variables, add:
   - `CONSOLE_SPACE_ID` = `<spaceId>` (the ID from the URL)

   Then **Deployments → Redeploy**. This pins server-side validation so the
   backend rejects any request that claims a different console space. Without
   this, a Space Admin who installs the app in a second space could trick the
   backend into writing state to the wrong space.

## Step 6 — Validate

### Auto-attach (MVP 1)

- In another tab: Contentful → Org Settings → Teams → **Org Admins** →
  **Spaces**. Every space except the console should appear, role **Admin**.
- Create a new throwaway space. Wait up to 30 minutes (or trigger the cron
  manually — see "Manual reconcile" below). Reload Teams → Org Admins →
  Spaces. The new space appears.

### Freeze / thaw (MVP 2)

- In the app console → **Spaces** tab, find any non-console space. Click
  **Freeze**. Badge: OFF → TRANSITIONING_ON → FROZEN within ~4s.
- Open Settings → Users in that frozen space. Every direct Space Admin's
  role flipped to **Space Admin (frozen)** (read-only).
- Click **Thaw** in the console. Badge: FROZEN → TRANSITIONING_OFF → OFF.
  Users restored to Admin.

### Audit log

- App console → **Audit log** tab. Entries: `FREEZE_TOGGLED`,
  `SUBSTITUTION_APPLIED`, `SUBSTITUTION_REVERTED`, `RECONCILE_RUN`,
  `TEAM_ATTACHED`.

---

## Vercel plan limits

| Concern | Hobby (default) | Pro (upgrade) |
|---|---|---|
| Function timeout | 10s | 60s default, up to 300s |
| Cron frequency | Daily only | Up to every minute |
| Good for | <30 spaces, ≤5 admins per space | Anything larger |

**The repo's `vercel.json` defaults work on Hobby** (10s function timeout,
daily cron at 06:00 UTC). For organizations with **30+ spaces** or **many
admins per space**, you'll likely need Pro:

- Bump `maxDuration` in `vercel.json` to `60` (or up to `300` on Enterprise).
- Change cron schedule to `*/30 * * * *` (every 30 min) or finer.

Symptoms that you've outgrown Hobby:
- Freeze hangs on `TRANSITIONING_ON` then drops to `DEGRADED` — function
  hit the 10s timeout mid-substitution.
- New spaces take >24h to appear in the Org Admins team — daily cron is
  too infrequent.

## Manual reconcile

To trigger a sweep without waiting for the cron:

```sh
curl -X GET \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://gov-app-yourname.vercel.app/api/cron/reconcile
```

Returns JSON with sweep counts per installation.

## Operational housekeeping

- **PAT rotation.** Mint a new PAT, update `CONTENTFUL_MANAGEMENT_TOKEN` in
  Vercel env, redeploy. Then revoke the old PAT in Contentful.
- **Signing secret rotation.** Generate a new value:
  ```sh
  curl -X PUT \
    -H "Authorization: Bearer $CONTENTFUL_MANAGEMENT_TOKEN" \
    -H "Content-Type: application/vnd.contentful.management.v1+json" \
    "https://api.contentful.com/organizations/$CF_ORG_ID/app_definitions/$APP_DEFINITION_ID/signing_secret" \
    -d '{"value":"<new 64-hex-char string>"}'
  ```
  Update `APP_SIGNING_SECRET` in Vercel, redeploy.
- **Cron schedule changes.** Edit the `crons[0].schedule` field in
  `vercel.json`, redeploy. Standard cron syntax (e.g. `*/15 * * * *`
  = every 15 minutes).
- **Adding/removing service account permissions.** The PAT inherits its
  owning user's permissions. Don't reduce that user below Org Admin or the
  app loses cross-space access.

## Security model

- **Threat: Space Admin removes Org Admins team from their space.**
  Mitigation: the cron re-attaches the team within 30 minutes (or sooner via
  manual reconcile).
- **Threat: Space Admin renames the "Space Admin (frozen)" role to confuse
  the app.** Mitigation: the app finds the role by name; renaming breaks
  thaw for that space. Currently logged but not auto-repaired. **Don't grant
  the service-account role to anyone but trusted admins.**
- **Out of scope: Org Admin going rogue.** An Org Admin can always go into
  Org Settings → Spaces → bypass the freeze. This app is a guardrail
  against routine editing during sensitive windows, not a security boundary
  against the people who own the org.
- **PAT secrecy.** Treat `CONTENTFUL_MANAGEMENT_TOKEN` like a password.
  Vercel's env-var store is encrypted at rest; do not log it, commit it, or
  expose it client-side.

## Uninstall

1. App console → **Spaces** tab → **Thaw** every currently-frozen space.
2. Contentful → Org Settings → Apps → Org Governance → Uninstall from
   every space.
3. Optionally delete the `Org Admins` team and the three content types in
   the console space (`governanceConfig`, `spaceState`, `auditEvent`).
4. Delete the Vercel project.
5. Revoke the PAT in Contentful.

## Troubleshooting

- **"Invalid signature 401" on toggle-freeze.** Wrong or missing
  `APP_SIGNING_SECRET` in Vercel env. Confirm it matches what
  `pnpm setup:app-definition` printed.
- **Bootstrap wizard 500s.** Open the deployment logs in Vercel →
  `/api/bootstrap`. Most common cause: PAT is not Org Admin.
- **Freeze badge stuck on `TRANSITIONING_ON` forever.** The transition
  threw and was caught silently. Check Vercel function logs for
  `/api/toggle-freeze`. Run `pnpm qa:state` locally with `CF_TARGET_SPACE_ID`
  set to inspect the actual state of that space.
- **New space not appearing in Org Admins team.** Wait for the next cron
  tick or trigger manually (see [Manual reconcile](#manual-reconcile)).
