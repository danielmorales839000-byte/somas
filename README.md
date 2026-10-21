# SOMAS v2 — Free-first executable alpha

Root/Customer Mission integration is prepared locally: see [ROOT_CUSTOMER_INTEGRATION_REVIEW.md](docs/ROOT_CUSTOMER_INTEGRATION_REVIEW.md) for shared-engine boundaries, migration 003, tests and approval gates. Root plans improve SOMAS; customer plans improve only the owner's application. Plans do not execute or deploy themselves.

> **A completely new codebase.** Cloudflare Worker + Neon PostgreSQL. User-created sites include a private Manager/Assistant panel and independently persisted agents. This alpha is a **constrained vertical slice**, not an arbitrary, autonomous full-stack coding platform.

## What works in this repository

- Register and sign in with a 12+ character password, hashed on the server; session cookie is HttpOnly, SameSite=Strict.
- Create up to **three** private SOMAS projects per free workspace. A project instantly becomes a public site at `/s/<unique-slug>` on the **same Worker deployment**. No additional hosting project or card is needed for each virtual site.
- Each project initializes **Manager, Assistant, and Virtual Customer** agents, each with separate persisted trainable policy weights. On-demand specialist agents also receive independent policies.
- The public site contains **`/s/<slug>/manage`**, a real owner-authenticated SOMAS Manager + Assistant interface. Owners can ask for changes without returning to the main dashboard.
- Manager selects task-specific specialist teams. Current agents can safely propose these structured changes: change site title, description, supported theme, add a content section, add an FAQ. Other requests are recorded as **needs engineering**, NOT falsely deployed.
- Release proposals need explicit owner approval; releases are versioned, and code can restore an earlier content-spec as a new release.
- Virtual Customer performs labeled **static experience heuristics**; real Playwright browser-navigation runner is included separately for developer/CI environments.
- Daily cron checks up to three instances per run; it records findings but never changes a live site or trains weights by itself.
- Optional allowlisted documentation research with provenance; disabled by default. Optional Groq/OpenRouter gateway behind Worker secrets; disabled by default, requests metered.
- Verified owner-labeled neural examples, candidate training, holdout evaluation, manual promotion; stored separately by agent/tenant.
- Free-plan usage counters, Paddle **optional checkout adapter and signed subscription webhook** (requires merchant onboarding), admin instance-suspension and audit records.
- Browser UI for projects, Assistant, proposals, agents, neural training feedback, findings, rollback and usage.

## Fresh deployment: Neon + Cloudflare

**Requirements:** Node.js 22+, npm, a free Neon PostgreSQL project, a Cloudflare account. GitHub is optional until you want CI/CD.

1. Download/unzip this project. Do not merge with any older SOMAS app; this repo has a new data model.
2. Create a database using [Neon](https://console.neon.tech/). Copy its pooled or direct PostgreSQL connection URL from the dashboard. **Never put it in GitHub or public JS.**
3. After schema review/approval, in Neon's **SQL Editor**, execute `db/001_initial.sql`, `db/002_operations.sql`, then `db/003_recursive_units.sql` in that order. Back up existing data first; test 003 on a dedicated branch/database. These scripts are **not a full migration framework**. Do not deploy the mission feature before 003 is applied.
4. Run `npm install` inside the project directory.
5. Copy `.dev.vars.example` to `.dev.vars`, fill `DATABASE_URL` with the Neon connection string, keep LLM credentials blank unless desired.
6. Run `npm run dev`. Open the local URL displayed by Wrangler (typically `http://localhost:8787`). Register; create an application; visit its `/s/...` public URL and `/s/.../manage` owner console.
7. Run `npm run check` for the local unit/syntax checks. Use browser suite separately if desired.
8. Run `npx wrangler login` and `npx wrangler secret put DATABASE_URL` (enter the Neon connection URL when prompted).
9. Run `npm run deploy`. Wrangler prints your `*.workers.dev` public URL after successful deployment. All customer sites appear under **this URL's `/s/` route**.
10. For a custom domain, follow Cloudflare Workers domain routing docs. A custom per-customer domain is **not yet automated**.

### Set up an admin

Register your own account first; retrieve its immutable UUID from the Neon SQL Editor with `SELECT id FROM users WHERE email='your-email@example.com';`. Add it securely with `npx wrangler secret put ADMIN_USER_ID`. This identity—not an unverified email string—authorizes:

- `GET /api/admin/instances`
- `POST /api/admin/instances/:id/suspend` with JSON `{"suspended":true,"reason":"..."}`

**Never set the admin ID to an arbitrary customer's account.** A proper admin console, MFA, and support roles are later milestones.

### Optional LLM gateway

- Set `ENABLE_LLM` to `"true"` under `vars` in `wrangler.jsonc` and redeploy.
- Add **one** of `GROQ_API_KEY` or `OPENROUTER_API_KEY` using `npx wrangler secret put <NAME>`.
- The Assistant uses the gateway only when the owner checks *Use optional external AI explanation*; it **never** receives keys directly.
- The model IDs are starter defaults, **not promises of free capacity**. Check current provider pricing, commercial-use terms, data retention, and request quotas before use.
- Token usage is logged per user/project. The quota counts attempts, including failed provider requests.
- The neural filter performs local routing before the external call. Deterministic orchestration still works if the provider is disabled.

### Optional Paddle billing

The checkout adapter and webhook handler are included; **real recurring payment does not start until you register/verify a Paddle merchant account**, configure product/price IDs, a verified/default checkout payment URL, and a webhook destination.

1. Configure Paddle sandbox and prices. Set `PADDLE_API_KEY`, `PADDLE_PRICE_ID`, `PADDLE_WEBHOOK_SECRET` via Wrangler secrets. Set `PADDLE_SANDBOX=true` in vars for tests and redeploy.
2. Set your approved Paddle default payment link in the Paddle dashboard. The link page must load Paddle.js and support Paddle transaction checkout.
3. Configure the webhook destination as `https://your-worker.workers.dev/api/webhooks/paddle`.
4. The logged-in user can call `POST /api/billing/checkout` with `x-somas-request: 1`; it returns a provider checkout URL created with a server-owned workspace reference.
5. Verified subscription webhooks update only matching workspace subscriptions, deduplicate events, and ignore stale provider timestamps.
6. Do **not** go live without testing sandbox checkout, webhook retries, cancellations, grace periods, billing reconciliation, refunds and customer support flows.

**Important:** The default UI does not show a live payment button when billing is unconfigured. This is intentional; never collect cards in SOMAS UI.

### Optional browser-based Virtual Customer

Worker free-tier CPU cannot host unrestricted browser automation. Run the Playwright integration in CI or a separate isolated machine:

```bash
npx playwright install chromium
TEST_SITE_URL=https://YOUR-WORKER.workers.dev/s/YOUR-SLUG npx playwright test tests/customer-browser.spec.js
```

For a report that **feeds real browser findings back into the instance's Manager queue**:

```bash
SOMAS_BASE_URL=https://YOUR-WORKER.workers.dev \
SOMAS_PROJECT_ID=YOUR_PROJECT_UUID \
SOMAS_EMAIL=OWNER_EMAIL \
SOMAS_PASSWORD=OWNER_PASSWORD \
npm run virtual-customer
```

Use protected CI secrets when scheduling this runner; avoid putting credentials into scripts or shell history. The output is saved as findings with method `playwright_browser`, distinct from the built-in static heuristics.

### Scheduled checks and research

`wrangler.jsonc` includes a daily 04:00 UTC cron trigger. It runs **bounded static audits of up to three instances per day** and optionally retrieves *one* curated MDN document if `ENABLE_EXTERNAL_RESEARCH=true`.

Research documents are held only as sourced evidence. SOMAS does not republish their content, modify deployed sites, or train neural weights using raw scraped text. The manual research endpoint only accepts `https://developers.cloudflare.com`, `https://developer.mozilla.org`, and `https://neon.com` URLs without redirects.

## Useful commands

```bash
npm install
npm run dev
npm run check
npm run deploy
```

### Tests verified locally in package authoring environment

The registration investigation adds password-runtime, API, actual Worker and opt-in real PostgreSQL tests. See [REGISTRATION_DIAGNOSIS.md](docs/REGISTRATION_DIAGNOSIS.md) for evidence, commands, remaining production uncertainty and the password-work-factor tradeoff. `npm run check` runs automated tests and syntax checks. The PostgreSQL case is skipped without a disposable loopback `SOMAS_TEST_DATABASE_URL`; it is distinct from hosted Neon validation. Browser tests need a separately supplied `TEST_SITE_URL`.

## Production limitations (do not ignore)

This is a serious alpha foundation—not ready for unrestricted public signup or payment collection. Important outstanding controls include email verification, signup/login abuse protection, MFA, team membership/RBAC, DB-level tenant RLS, connection/quotas load testing, data export and deletion, automatic backups, professional incident response, SOC2/privacy assessments, secret rotation UI, production billing reconciliation, domain provisioning, isolated code executors and secure migration runners.

**No arbitrary generated full-stack code is executed or deployed.** This version offers typed template edits. A separate sandboxed coding worker with GitHub integration, tests and staging is required before SOMAS can safely implement arbitrary changes autonomously.

## Developer guidance

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/FUNCTION_CONTRACTS.md`, and `docs/IMPLEMENTATION_ROADMAP.md` before extending the code. See `docs/DEPLOYMENT_AND_SECURITY.md` for risks and rollout gates.
