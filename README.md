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

See `docs/superpowers/specs/2026-05-16-contentful-org-governance-app-design.md` for the spec and `docs/superpowers/plans/2026-05-16-contentful-org-governance-app.md` for this plan.
