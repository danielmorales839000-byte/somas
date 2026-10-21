# Deployment, security and cost runbook

For registration investigation, safe request-ID diagnostics and read-only database checks, see [REGISTRATION_DIAGNOSIS.md](REGISTRATION_DIAGNOSIS.md). `/health` reports binding presence only; it does not test database connectivity or schema. The auth-only patch requires no migration; the combined Root/Customer Mission feature requires reviewed migration 003 before deployment. See [ROOT_CUSTOMER_INTEGRATION_REVIEW.md](ROOT_CUSTOMER_INTEGRATION_REVIEW.md).

## Host topology

Cloudflare `wrangler.jsonc` deploys one JavaScript Worker and static files under `public/`. `run_worker_first` makes `/api/*`, `/s/*` and `/health` dynamic. Neon database is accessed using the Neon serverless HTTPS SQL driver with parameterized queries. Public tenants are **logical** routes, not dedicated Vercel/Cloudflare accounts.

## Environments

| Env / secret | Classification | Purpose |
|---|---|---|
| `DATABASE_URL` | Worker secret | Neon PostgreSQL connection, absolutely never in browser assets |
| `ADMIN_USER_ID` | Worker secret | Immutable central administrator UUID |
| `ENABLE_LLM` | Worker var | Enables optional external explanation calls |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | Worker secret | Model provider credential, pooled across agents |
| `FREE_MONTHLY_AI_REQUESTS` | Worker var | Budget bound; active provider calls require user opt-in |
| `ENABLE_EXTERNAL_RESEARCH` | Worker var | Curated research allowlist on/off |
| `PADDLE_API_KEY`, `PADDLE_PRICE_ID` | Worker secrets | Optional checkout transaction server API |
| `PADDLE_WEBHOOK_SECRET` | Worker secret | Verify genuine provider events |
| `PADDLE_SANDBOX` | Worker var | Test-mode endpoint; configure before sandbox checkout |

## Monthly cost assumptions

The prototype is designed for **$0 fixed hosting fees within free tiers**, but this is not a guarantee of zero cost: free quotas change; optional LLM calls may be billed; custom domains require registration; merchant transactions have fees; GitHub/Playwright external runner minutes, networking and production abuse defenses consume resources. Users must monitor Neon CU, storage, Cloudflare Worker requests/CPU and provider limits. Restrict signups or freeze provisioning before quotas are exhausted.

## Defensive defaults

- No raw card numbers in SOMAS; external checkout.
- No arbitrary code execution in Worker or generated site.
- No arbitrary web fetch; allowlisted public HTTPS documentation only, redirect rejected.
- No external AI by default. Provisioned site only stores validated safe JSON spec.
- Every write needs owner session, CSRF header, and same-origin checks (Paddle webhook uses HMAC instead).
- Admin is a separate server-configured UUID and actions are audited.
- Unverified research and untrusted customer text do not modify production policies.
- Candidate neural training never auto-activates; only owner-labelled examples are eligible.
- Usage quota database operations are atomic; new project maximum check **is not yet concurrency-safe**, and must be made transactional before public signup.

## Known vulnerabilities / launch blockers

1. **Authentication**: no email verification, brute-force protection, breached-password rejection or MFA; client accounts are not production secure.
2. **Database isolation**: workspace query checks are present, PostgreSQL RLS and separate database roles are not; prove tenant isolation under attack.
3. **Migrations**: manually-applied SQL files, no lock/version/checksum migration runner.
4. **Sandbox**: arbitrary full-stack generation is intentionally not available until isolated coding execution infrastructure is developed.
5. **Subdomain tenancy**: shared `/s/:slug` URLs; independent customer domains, CSRF/cookie domain boundaries and origin customizations are future work.
6. **Observability**: platform trace correlation, anomaly alerts, incident response and immutable audit export are incomplete.
7. **Payment**: Paddle adapters not run against a real merchant/sandbox in this environment; checkout URL requires verified Paddle default payment link.
8. **Model governance**: no robust regression benchmark, neural rollback, differential privacy assessment or multi-tenant federated training.
9. **Cost**: free-tier CPU and provider limits not measured against realistic traffic; heavy inference/compilation may breach free ceilings.
10. **Browser**: Playwright runner is opt-in and requires external compute; static Virtual Customer findings must be labeled as hypotheses.
11. **GDPR/privacy**: no completed DPIA, deletion/export pipeline, consent management or jurisdiction-specific commercial policies.
12. **Generated apps**: store template is not an actual payments-enabled e-commerce implementation; no cart, orders or PCI scope claims.

## Deployment smoke-test checklist

After explicit approval, applying 001 + 002 + 003, installing dependencies and deploying the tested revision:

- `GET /health` returns `{ok:true,databaseConfigured:true}`.
- Register owner and sign in; verify cookies secure on HTTPS.
- Create project; verify three core agents in Neon and distinct policy JSON; public `/s/:slug` loads.
- Visit `/s/:slug/manage` logged in; guest is redirected, another tenant is 403.
- Request `Change title to Example`; inspect pending proposal and approve; refresh public site shows new title and higher version.
- Roll back to release 1; new version appears, old title restored.
- Request `Add Stripe payments`; it is marked `needs_engineering`; no fictional payment changes occur.
- Trigger Virtual Customer audit, inspect method `static_heuristic` in output.
- Run optional real browser test from Playwright; return findings under method `playwright_browser`.
- Submit five verified labels and generate a training candidate; ensure policy unchanged until eligible manual promotion.
- Test quotas and expired/suspended subscription behavior.
- Configure admin ID and suspend one project; ensure public site shows 503 but owner can still access project metadata.
- If billing approved: test signed Paddle sandbox event, duplicate delivery, stale event, cancellation, recovery and unauthorized signature.

## Design sources

- Cloudflare Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Workers free limits: https://developers.cloudflare.com/workers/platform/limits/
- Neon serverless HTTPS driver: https://neon.com/docs/serverless/serverless-driver
- Neon SQL transaction driver: https://github.com/neondatabase/serverless/blob/main/CONFIG.md
- Paddle signed webhooks: https://developer.paddle.com/webhooks/about/signature-verification
- Paddle create transaction / default checkout: https://developer.paddle.com/api-reference/transactions/create-transaction and https://developer.paddle.com/build/transactions/default-payment-link
- Playwright: https://playwright.dev/docs/intro
