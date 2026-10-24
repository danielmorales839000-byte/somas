# SOMAS — Concept exhibition & real community

A premium light-mode exhibition explaining **SOMAS Platform** and **SOMAS Network**, with a real discussion community. Built on Cloudflare Workers and Neon PostgreSQL.

AI organizations, project evolution, learning and blockchain activity are **browser-local simulations**. Operational AI execution, provider gateways, training, project provisioning, billing and scheduled jobs have been removed from the source.

## Start here

1. Install Node 22 or newer.
2. Run `npm ci` and `npm run check`.
3. Apply `db/004_public_submissions.sql` and `db/005_community.sql` to a development Neon database.
4. Copy `.dev.vars.example` to `.dev.vars` and fill the database connection privately.
5. Run `npm run dev`.

Read [COMMUNITY_RELEASE.md](docs/COMMUNITY_RELEASE.md) for Mac/Git bundle instructions, migrations, administrator setup, test evidence, security boundaries and deployment steps. Nothing in this release automatically deploys production.

## Routes

Public exhibition: `/`, `/idea/`, `/looking-for/`, `/root-somas/`, `/network/`, `/videos/`, `/contact/`.

Community: `/discussions/`, `/discussions/:id/`, `/discussions/profiles/:id/`, `/account/`. Contributors apply at `/join/`; this never creates a community account. Administrator-only data: `/discussions/moderation/` and `/submissions/`.

## Real community features

- Browse, search, category filtering, latest/active/upvoted/unanswered sorting and pagination.
- Sign-in, registration and public profiles with private account emails.
- Author-owned discussion/reply editing and soft deletion.
- Idempotent upvotes, following, private in-app reply notifications and content reports.
- Administrator pin/lock/hide/remove/restore, official replies and announcements, suggestion states, posting restrictions and audit history.
- Server-side permissions, parameterized SQL, CSRF defenses, quotas, input limits and safe text/link rendering.

Production uses **only Neon** for persistence. PostgreSQL-WASM is a development dependency for isolated SQL tests; no sample community posts are seeded in production. Local QA session helpers and test posts are never included in the deployment.
