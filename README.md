# SOMAS 6.0.1 — restored Import Contacts and Broadcasts

The full project includes the new administrator tabs. Apply `db/008_import_broadcast.sql` before using them. Read [setup](docs/IMPORT_BROADCAST_SETUP.md). External email is off by default; no deployment or real email was performed here.

# SOMAS v5.2 — Animated Network demonstration

Network statistics now evolve through random browser-local submissions, reviews, Sub-Manager creation/retirement and state changes. Pause, single-step, reset and source-snapshot modes are included. See [simulation notes](docs/NETWORK_SIMULATION.md). Real backend services and records are unaffected.

# SOMAS v5.2 — Network dashboard overview

The dashboard now includes a blockchain-style concept overview with exact synthetic claim counts for 1h, 24h, 3d, 7d, 30d and all time. See [Network overview release notes](docs/NETWORK_OVERVIEW.md).

# SOMAS v5.1 — Organization Studio dashboard

The dashboard now adapts the supplied terminal-style reference to the existing SOMAS light template: selectable agent roster, animated 2D team, scenario metrics, project evolution, agent profile, Network gateway and evidence log. See [dashboard release notes](docs/DASHBOARD_STUDIO.md).

# SOMAS v5 — 2D concept exhibition

The current release replaces the core 3D scenes with original SVG cartoon teams and a Canvas 2D network map. All agent and blockchain activity is simulated. Real community, account, private contact and booking features remain. See [v5 release notes](docs/V5_2D_RELEASE.md).

# SOMAS v4.1 — calendar and navigation update

See `docs/V41_RELEASE.md` for this update. Existing v4 owner/Google setup remains required.

# SOMAS v4 — identity, controlled roles and scheduling

Read `docs/V4_SETUP.md` BEFORE deployment. Migration 006 and owner bootstrap are required. Live Gmail/Calendar behavior requires owner Google authorization and has not been verified in this delivery.

# SOMAS v3 — invitation, Managers and Network

See `docs/V3_DESIGN_RELEASE.md` for the route checklist, validation and demo limitations.

# Current release: SOMAS 2.4 kinetic 3D demonstration

See [KINETIC_3D_RELEASE.md](docs/KINETIC_3D_RELEASE.md) for the circular campus, 5× playback, group reporting and 48 concurrent simulated network exchanges. The complete supplied corpus and all real community workflows are preserved.

# Current release: SOMAS 2.3 synthetic exhibition

See [EXHIBITION_DATA_RELEASE.md](docs/EXHIBITION_DATA_RELEASE.md) for the supplied 100,000-person / 10,000-Sub-SOMAS corpus, browser exploration, provenance limits and deployment instructions. All example records remain static and separate from real authentication and community data.

# SOMAS 3D concept exhibition + community

The spatial update is documented in [SPATIAL_3D_RELEASE.md](docs/SPATIAL_3D_RELEASE.md). Original articulated characters and deterministic scenarios are demonstrations; community and private inquiry workflows use real server-authorized records. Production deployment remains an explicit operator step.

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
