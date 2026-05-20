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
