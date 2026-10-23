# SOMAS MVP

A private, full-stack AI team workspace on Sites / Cloudflare Workers, with D1 persistence and free-tier Groq inference. The former browser-only animation has been replaced by actual server requests. There is no simulated provider or timer-generated website fallback in production.

## Activation

1. Sign in through the platform's Continue with ChatGPT link.
2. Open **Connect AI** and enter a key from your **Groq Free account**. The server verifies the model catalog and encrypts the key per user in D1. A key is never sent to an LLM, returned by the API, stored in browser storage, or committed.
3. Select Manager and specialist models from the verified catalog, if desired.
4. Create a project and give the Manager a goal. The Manager repeatedly assigns work, evaluates reports, saves lessons and starts the next round until paused. Fast stepping works on the dashboard and project pages; hourly cloud runs advance work while closed.

The runtime requires `APP_DATA_KEY`, a persistent random server secret configured through Sites runtime secrets. Keep it stable; changing it requires users to reconnect their provider keys. Database binding is `DB`. Deployment applies generated schema migrations.

## Included behavior

- Owner-isolated projects and provider connections using platform-authenticated user IDs.
- Manager-only project start, followed by model-selected specialists and task assignments. Researcher supports the Manager; no separate Assistant exists.
- Working, resting, reporting, evaluating, learning and blocked states driven by actual task transitions.
- Real specialist reports and a separate Manager inference for every evaluation. Evaluated quality is explicitly the Manager's assessment, not a benchmark of intelligence.
- Separate persistent memories and memory versions. Accepted reports add evidence-linked lessons to the specialist and Manager. External model weights remain frozen.
- Private chatroom projects include a durable General room with text messages, ChatGPT authentication and three-second polling. Public rooms, file sharing and email/password signup are not implemented.
- Schema-validated business websites, immutable release snapshots, rollback as a new revision, and a project inquiry inbox.
- Cross-origin write rejection, owner checks on every project operation, encryption with per-owner authenticated data, project execution leases, correction retries with Manager replanning and provider timeouts.
- Five-second account-wide call spacing, explicit provider-quota queues, continuous rounds until paused. Pause takes effect for subsequent tasks while an in-flight request finishes.

## Deliberate MVP limits

Websites are generated as validated structured business pages with Agents and Preview views. Guided onboarding helps customers create/connect Cloudflare accounts and choose a generated hosting address or a new registered domain. SOMAS saves the choice and automatically deploys approved revisions after provider setup. Cloudflare handles signup verification and paid checkout. Root and per-project Subnet Managers exchange scoped reports and advisory guidance. See [independent hosting and manager network](docs/independent-hosting.md). Arbitrary code execution, payment processing and isolated browser runners are unsupported. Research has no live browsing tool, and agent reports cannot claim unobserved external work. The existing hosted audience is preserved.

Browser stepping is fast but is not a permanent worker. The linked hourly Sites schedule calls the private shared runner while closed. Each call advances one checkpoint, with a maximum 25-second provider request and durable state between calls. The hourly task runs a bounded batch and yields at quota; it does not guarantee second-by-second unattended work. Free provider limits apply across the account and may delay jobs. An API key does not establish that an account is on a free billing tier; keep the provider account on Free. The application never upgrades the account. Provider model availability is discovered at connection time.

The previous local demo projects remain untouched in the browser but are not imported as real projects or training evidence.

## Validation

`npm test` runs schema, ownership, CSRF, encryption, report/evaluation/learning, concurrent request, pause, quota, incomplete output, revision and inquiry tests against an in-memory SQLite implementation of the D1 interface. Provider fixtures exist only in tests. These tests do not demonstrate successful live Groq inference.

Use the Sites build workflow. Local D1 and hosted D1 are separate databases. Run each generated SQL migration once against the local database before browser QA. No credentials are required for the test suite.

## Background runner and operations

`GET /api/runner` reports job status; `POST /api/runner` advances one eligible publication stage or team. Both require the configured administrator’s platform identity or `X-SOMAS-Runner-Authorization` matching the server-side `SOMAS_RUNNER_TOKEN`. `PRIVATE_RUNNER_ENABLED=true` is retained as the enable switch, but it no longer replaces authentication. The Site may be public while workspaces remain isolated. Ordinary users call `POST /api/work`, which restricts all selection, work and returned status to their authenticated user ID.

Cloud callers obtain `siwc_bypass_bearer_token` from Sites `get_site` and send it only to this Site as both `OAI-Sites-Authorization: Bearer …` (platform access) and `X-SOMAS-Runner-Authorization: …` (app runner authorization). `SOMAS_RUNNER_TOKEN` is configured from that supported service credential through native runtime secrets; no credential is stored in source, browser code or prompts. If Sites rotates the service credential, the stored runner value needs updating; fail closed until it matches. Never fabricate visitor identity.

Runs can call the writer up to 80 times or eight minutes, respecting `nextAt`, then read status again. Stop when no job is eligible, at provider quota, pause or an actionable configuration error. Do not repeatedly hammer the provider. The status response also lists `setups` and `publications`; waiting setup, queued/publishing/domain-pending jobs are eligible at their `next_at` time when no lease is active. A publishing step returns `processed` with the project ID and `kind: publication`, so batch callers continue through its checkpoints. Routine data updates do not require republishing SOMAS.

The runner upgrades eligible legacy auto-improve jobs once (runner version 2), preserving their tasks, reports, memories and releases. Explicit pauses, disconnected credentials, authentication errors and restored revisions stay stopped. Transient failures retain tasks and queue exponential retries; invalid model output includes format guidance on the next attempt. Unsupported provider configurations require Settings rather than an infinite retry loop.

## Two management levels

- **Root Manager / root team:** a separate persistent service project, linked by the `service` table. It observes database/encryption readiness, project execution status/errors, and user opinions. Its six specialists report to Root Manager and maintain separate memories. It can apply validated dashboard headline, Guide copy and 5–60 second model-call spacing after a real Manager review. Root findings outside these tools stay `needs_code`; this runtime cannot repair arbitrary source or claim all problems are fixed.
- **Subnet Manager / project team:** each user project retains its own requirement, reports, memories, revisions and execution loop. Root settings never replace project goals.
- Both use the shared fair runner and the existing hourly background schedule, yielding to provider quotas and explicit pauses. There is no permanent daemon or neural-weight training.

`SOMAS_ADMIN_USER_ID` is configured server-side from the existing owner’s Site-scoped identity. No first-visitor/admin bootstrap exists. Only that administrator can list users and inspect their projects. Inspection of another user's project is read-only; project mutation and private message access still require ownership. No provider secret appears in management responses. Sign-in records display name/email when provided; legacy owners appear without invented profile data.

The dashboard replaces **Send SOMAS team** with **Opinions**, and adds **User management** and **Root team** for the administrator. Opinions are durable, visible to their author and the administrator, and included as untrusted evidence at the root team’s next diagnostic round.


## Provider selection and agent values

Connect AI supports user-owned Groq, Google Gemini, OpenAI, Anthropic and OpenRouter keys. Provider endpoints are allowlisted; switching requires a freshly verified key for that provider. Each account selects a Manager model and a specialist model from its provider catalog. No application-wide provider key is needed. Stored credentials are encrypted and owner-bound.

Agent vitals show saved execution states, live elapsed age, purpose, token usage and a learning value. New agents record creation timestamps; legacy specialists show tracked age from their first retained report. Learning adds one for each accepted evidence-linked lesson and can decrease when evidence is withdrawn. This is persistent memory, not model-weight training.

Usage is recorded for model responses even when output validation fails. OpenRouter-reported cost is retained when supplied. Other costs use the user’s per-million-token rates or their explicitly selected free tier. Unknown rates remain unknown; historical calls are not retroactively priced. Estimates exclude unreported provider charges and are not invoices. Existing Groq connections migrate with unknown pricing.

Saved pending reports take priority over new tasks. Quota waits retain their review; changing credentials requeues provider-blocked, unpaused work. Continuous work remains subject to provider limits and the existing page-driven/hourly runner.


## Membership and human administration

The pending feature branch adds required inbox verification, owner-approved human Managers, user suspension/project controls, activity logs, opinion notifications and prepared social sharing. See [setup and review](docs/membership-administration.md) before deploying. Configure `RESEND_API_KEY` and an authorized `MAIL_FROM` sender first; preserve `APP_DATA_KEY` and `SOMAS_ADMIN_USER_ID`. Without a sender, verification intentionally blocks workspace access. The signup email is used as Reply-To on opinion notifications, not as an unauthorized From address. Owner-only Gmail API sending is available; automatic Instagram/YouTube publishing is not implemented.

## Deploy this version to Cloudflare + Neon

For the current website's independent Cloudflare Worker, Neon migration,
signup verification and password login, see [the deployment guide](docs/cloudflare-neon.md).
Use `pnpm run build:cloudflare`; the existing Sites deployment remains a separate target.
