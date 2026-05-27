# Contentful Org Governance App

Two governance capabilities for a Contentful organization, deployable into
any org by its admin in about 15 minutes:

1. **Org Admins team auto-attach** — keeps a chosen team attached as Admin
   on every current and future space, so nobody locks Org Admins out.
2. **One-click freeze** — swaps every direct Space Admin in a chosen space
   to a read-only role, with one-click thaw. Useful before sensitive
   releases or audits.

## Quickstart

If you are a **customer installing this in your own org**, read
**[INSTALL.md](./INSTALL.md)** end-to-end. It walks through the 6 steps
(mint PAT → deploy to Vercel → create App Definition → set env → install
in console space → validate).

If you are the **maintainer running a demo**, read
**[DEMO.md](./DEMO.md)** for a click-by-click walkthrough of both MVPs.

## Architecture (one paragraph)

A React iframe (the "console") lives in one Contentful space. A small set
of Vercel serverless functions (the backend) does all CMA work using a
customer-supplied PAT. State is stored as Contentful entries in the
console space — there's no separate database. A 30-min cron sweeps the org
to keep team attachments fresh.

```
Contentful UI (iframe)  <-->  Vercel /api/*  <--PAT-->  Contentful Mgmt API
                                  |
                                  +--> writes spaceState + auditEvent
                                       entries in the console space
```

## Layout

- `api/` — Vercel functions: `bootstrap`, `toggle-freeze`, `state`,
  `spaces`, `webhook`, `cron/reconcile`
- `lib/` — Pure logic: auth, CMA client + retry, content model,
  freeze state machine + transition, fan-out
- `app/` — React frontend (Vite build) with the wizard, console, audit log
- `scripts/` — Setup + QA scripts (`setup:app-definition`, `qa:state`,
  `qa:freeze-thaw`, probes)
- `docs/design/` — Design spec + implementation plan

## Development

```sh
pnpm install
pnpm test              # unit tests
pnpm typecheck
pnpm dev:app           # frontend dev server (Vite)
```

Set `CF_DEV_PAT` (or `CONTENTFUL_MANAGEMENT_TOKEN`) plus the relevant
`CF_*_ID` env vars to run scripts against a live org (see each script's
header for required env).

## What this is NOT

- Not a replacement for Contentful's built-in roles & permissions.
- Not a hard security boundary against Org Admins / Owners — they can
  always bypass it from Org Settings. It's a guardrail against routine
  editing, not against rogue admins.
- Not multi-tenant SaaS. Each customer self-hosts on their own Vercel.

See `docs/design/specs/2026-05-16-contentful-org-governance-app-design.md`
for the full design spec.
