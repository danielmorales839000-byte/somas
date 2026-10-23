# Project AI team release

Each deployed business service contains a working AI team, its owner panel at `/team`, its own persisted project state, reports and agent memory. SOMAS is the control service for accounts, initial building, publishing and the Root connection. The deployed service executes the team itself.

## Code boundaries

| Module | Responsibility |
| --- | --- |
| `lib/ai-team/project-runtime.mjs` | Shared Manager / specialist / review / learning engine; storage and service operations are injected adapters. |
| `lib/ai-team/worker.mjs` | Project-local runtime, SQLite Durable Object storage, background alarms, quotas, local releases and owner sessions. |
| `lib/ai-team/panel.mjs` | Project-domain owner interface. |
| `lib/ai-team/access.mjs` | Audience-bound, one-minute, single-use owner access tickets. |
| `lib/site-renderer.mjs` | Customer website rendering, separate from team execution. |
| `lib/publishing.mjs` | Cloudflare provisioning, secrets, modules, domain and health verification. |
| `lib/server.mjs` | SOMAS accounts, management and ownership checks; uses the shared engine before project deployment. |

The build bundles `lib/ai-team/worker.mjs` into a separate `ai-team.mjs` deployment module. `bundle.generated.mjs` is generated automatically by the Vite configuration; edit the source modules, then rebuild. The customer Worker imports this module and binds one project-specific SQLite Durable Object. No SOMAS database credentials, root encryption key, hosting token or other user's state is included.

## User flow

1. Sign in to SOMAS and create a project with a goal.
2. Connect the chosen model provider. SOMAS builds the initial approved website content.
3. Choose a root domain and connect Cloudflare. A new domain requires the owner's registration checkout; SOMAS does not silently create accounts or buy domains.
4. Publish. SOMAS uploads the page module and AI-team module, installs the owner's provider key as a private Worker secret, creates the Durable Object binding, and connects the root domain.
5. After signed health verification, SOMAS bootstraps the project state over an authenticated request. Bootstrap is idempotent: later publications do not overwrite existing local team state or lessons.
6. In **Publish & network**, select **Open AI team on my domain**. The one-time ticket is carried in a URL fragment, exchanged for a host-only secure session cookie, and removed from the address bar. Sessions last 30 minutes.
7. The deployed team starts paused. Select **Resume**, or set a new goal. Background alarms execute the shared engine, with a minimum 30-second spacing and a ceiling of 60 task attempts per hour. Provider quota responses retain the task for retry. Pausing prevents further tasks after an active call finishes.
8. The Manager validates and reviews specialist output. Accepted website content is persisted and served directly on the project domain. Root receives operational summaries and returns advisory guidance; private prompts, reports and memory stay in the project's storage.

When Root is unavailable, existing project sessions and team execution continue. New owner sessions and inquiry delivery need Root. Account suspension or a Root administrator's project pause is honored when the project next contacts Root. Disconnecting the advisory Root link does not disable the local team.

## Upgrade and deployment

- Run `pnpm install --frozen-lockfile --prod=false` after replacing source files; the release adds `tldts` for correct root-domain validation, including multi-label suffixes such as `.co.uk`.
- For Neon, run `pnpm run db:neon:migrate` before deploying the new build. Migration `0002_project_team_runtime.sql` only adds a column. Do not edit the existing `0001` migration or import a backup over an existing database.
- Build with `pnpm run build:cloudflare` and deploy using the existing secure deployment procedure in `docs/cloudflare-neon.md`.
- Cloudflare token permissions: Workers Scripts Edit, Zone Read and DNS Read, scoped to the owner's account and intended zones. SQLite Durable Objects must be available on the account. Optional registrar price checks require registrar access.
- Changes to the model key or model selection in SOMAS reach an existing service on its next explicit re-publication. Deleting a key from SOMAS does not revoke the copy already installed in the owner's Cloudflare account. Pause the local team, rotate/revoke the provider key at the provider, or replace the Worker secret to revoke that copy.
- New projects require a root domain. Existing generated-subdomain services remain stored; this release does not delete them or silently move their address. Create a root-domain project for the new deployment flow.

## First-version scope and validation

The team performs real model calls, planning, specialist tasks, Manager reviews and evidence-linked memory. Its implemented tools edit and publish structured website content. Arbitrary application source editing, browser automation, new database-backed business features and model-weight training remain outside this version.

Tests execute the generated modules in real local Workers with SQLite Durable Objects and mocked provider/Root HTTP responses. They cover private access, ticket replay and project binding, cross-origin rejection, provider quota retry, Manager/specialist/review execution, local website updates during a Root outage, and preservation on re-publication. Publishing tests exercise real Workers/D1 multipart uploads. Neon tests exercise PostgreSQL migrations and the real Neon driver transport against a local PostgreSQL-compatible fixture. These checks do not verify billing or deployment to an external Cloudflare account.

Reference: [Cloudflare multipart upload metadata](https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/) and [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).
