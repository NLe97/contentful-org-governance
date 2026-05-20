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
