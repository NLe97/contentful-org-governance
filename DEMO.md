# Org Governance App — Demo Guide

This walks you through demoing the two MVPs end-to-end against your own org.

App is hosted on Vercel at `https://gov-app-impl.vercel.app`. Backend is stable —
the freeze inconsistency you saw was caused by two bugs (deprecated `user` field
in PUT body, plus JSON-Patch `replace` on missing fields) which are now fixed
and deployed.

---

## Prereqs

- Org with at least 2 spaces. Today: `Jobs` (`ubgf1y7ixw5q`, console) and `Ben Test` (`hgnalq3865je`, demo target).
- You're an Org Admin / Owner of the org.
- App is installed in the console space (Jobs). It does NOT need to be installed in Ben Test — the backend manages Ben Test via a PAT.

---

## Demo 1 — Auto-attach (MVP 1: protected admin team)

**Goal:** show that adding a new space causes the `Org Admins` team to be attached
as an admin of that space, automatically, with no manual click.

1. Open Contentful → top-right org switcher → **Organization settings** → **Teams**.
2. Confirm `Org Admins` exists, with your user (`Ben Le`) as a member. It was
   created by the app on first bootstrap.
3. In the same Teams view, click into `Org Admins`. Under **Spaces**, you
   should see both `Jobs` and `Ben Test` listed with role **Admin**.

To demo "what happens for a NEW space":

4. Create a new space in the org (any name, e.g. `Demo Space 3`).
5. Reload the Teams → Org Admins → Spaces view within ~30s. The new space
   appears with role **Admin**.

Behind the scenes:
- The Vercel cron (`/api/cron/reconcile`, runs every 5 min) iterates all spaces
  in the org and ensures `Org Admins` is an admin team member on each.
- Spaces older than the cron interval can also be force-swept manually by
  clicking **Run reconcile** in the app's console (Jobs space → Apps → Org
  Governance Console).

---

## Demo 2 — Role substitution freeze (MVP 2)

**Goal:** show that clicking **Freeze** on a non-console space demotes every
direct space-admin in that space from full Admin to a custom **read-only**
"Space Admin (frozen)" role — they can still view content (entries, assets,
content model) but can't edit, publish, delete, or change settings — and
**Thaw** restores their Admin rights.

### Important distinction: Org Admin vs Space Admin

Freeze targets **Space Admins** (per-space memberships marked `admin: true`).
It does NOT and cannot prevent an **Org Admin / Owner** from going into Org
Settings → Spaces → Ben Test and re-adding themselves as an Admin. Org-level
power is by design above the app. Freeze is a guardrail against routine
editing during a sensitive window, not a security boundary against the
people who own the org.

### Open the app console

1. In Contentful, switch to the `Jobs` space (the console).
2. Apps menu (top nav) → **Org Governance Console**. You should see two tabs:
   **Spaces** and **Audit log**.

### Verify starting state of Ben Test (optional but reassuring)

3. In a separate tab: switch to `Ben Test` → **Settings** → **Users**.
4. Confirm `Ben Le` (or whoever) is listed with **Admin** role.

### Freeze

5. Back in the console (Jobs space) → **Spaces** tab. You'll see a row for
   `Ben Test` with a green **OFF** badge and a **Freeze** button.
6. Click **Freeze**. The badge will briefly flip to **TRANSITIONING_ON** (yellow),
   then to **FROZEN** (red) within ~4 seconds (the UI polls every 4s).
7. Switch to the Ben Test → **Settings** → **Users** tab and reload. The user
   row now shows the role **Space Admin (frozen)** instead of Admin. That role
   exists in Ben Test → Settings → Roles & permissions — it grants **read-only**
   access (view entries, assets, content model), with no edit, publish,
   delete, or settings permissions.
8. To verify the read-only behavior: open the Content tab in Ben Test (as the
   substituted user). You can browse all entries and assets, but every edit
   action (publish, save, delete, add field) is disabled.

### Thaw

8. Back in the console **Spaces** tab. The Ben Test row now has a **Thaw**
   button. Click it. Badge → **TRANSITIONING_OFF** → **OFF** within ~4 seconds.
9. Reload Ben Test → Settings → Users. The user is back to **Admin**.

### Audit log

10. In the console, click the **Audit log** tab. You'll see the most recent
    events: `FREEZE_TOGGLED`, `SUBSTITUTION_APPLIED`, `SUBSTITUTION_REVERTED`,
    plus `RECONCILE_RUN` from the cron.

---

## What if the badge doesn't update?

- The UI polls every 4s, so wait up to ~5s.
- If it stays on `TRANSITIONING_*` for more than 30s, something has thrown.
  Open the deployment logs at https://vercel.com/ben-le-s-projects/gov-app-impl
  → most recent deployment → Functions → `/api/toggle-freeze`. The stack trace
  will explain.
- If you got into a bad state during earlier testing, run from the project
  worktree:
  ```sh
  CF_DEV_PAT="CFPAT-..." npx tsx scripts/qa-check-state.ts
  ```
  to inspect, or
  ```sh
  CF_DEV_PAT="CFPAT-..." npx tsx scripts/qa-freeze-thaw.ts
  ```
  to round-trip freeze+thaw against Ben Test directly (bypasses the UI and
  signed-request layer).

---

## Hosting trade-off (Vercel vs Contentful-hosted frontend)

The current architecture has TWO parts:

- **Frontend** (React app at the `app-config`, `page`, `dialog` locations) —
  hosted on Vercel today.
- **Backend** (`/api/*` endpoints + cron) — must stay on Vercel; Contentful
  doesn't host long-running functions, scheduled jobs, or secrets.

You CAN switch the App Definition's "App URL" to Contentful-hosted (toggle in
Org settings → Apps → Org Governance → "Hosted by Contentful"). That would
move ONLY the iframe HTML to Contentful's CDN. The `/api/*` endpoints would
still need Vercel.

**Recommendation:** stay on Vercel for both for now. The freeze flakiness was
backend bugs, not Vercel cold-starts. If you later see UI loading issues
specifically (blank iframe, slow first paint), that's when Contentful hosting
of the frontend is worth trying — it removes one network hop on cold load.

---

## Operational housekeeping

- The dev PAT is stored as `CONTENTFUL_MANAGEMENT_TOKEN` (legacy fallback:
  `CF_DEV_PAT`) in Vercel env. **Rotate it after every demo** by issuing a new
  PAT in Contentful → Account → CMA tokens, updating the Vercel env var, and
  redeploying. Never paste PAT values into committed files.
- Cron schedule lives in `vercel.json` (`/api/cron/reconcile` every 5 minutes).
- App Signing Secret is stored as `APP_SIGNING_SECRET`. If you rotate it in
  Contentful (`PUT /organizations/{org}/app_definitions/{def}/signing_secret`),
  also update the Vercel env var.
