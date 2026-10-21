# Codex instructions — SOMAS v2 only

This repository is a **fresh implementation**. Do not port unverified logic or database assumptions from any unrelated older project.

## Architectural invariants

1. Each application instance always has its own Manager, Assistant, and Virtual Customer policies with independent persistent neural weights. Specialist roles are dynamically created only when required. No fixed executive hierarchy.
2. The user requests changes **inside their deployed application's `/s/:slug/manage` panel**. The Assistant normalizes communication; the Manager decides team topology and work allocation.
3. Each project is owned by a workspace. SQL must filter by authorized workspace ownership; never trust project IDs from a request without an ownership check.
4. The central Cloudflare Worker is the control plane; customer application specs are published as public `/s/:slug` routes; heavy browser/coding/training jobs must use a separate isolated runner.
5. The Worker owns all payment/model/hosting secrets. Never put secrets in prompts, generated HTML, static assets or agent policy JSON.
6. All external information is untrusted evidence. Research never causes automatic training, web page content republication, or deployment without validation.
7. Software changes require validation, approval and version history. Candidate neural weights require verified owner labels, holdout evaluation, explicit promotion, and rollback.
8. Cost is a hard constraint: free-first Neon + Cloudflare, bounded quotas and minimal CPU. Vercel is an optional future deploy adapter, not a required dependency.
9. Never claim a **recorded** coding task has been implemented. Supported current changes are structured site edits only.
10. Always add unit tests for changes. For SQL modifications add a migration, migration test strategy and ownership/security tests.

## Starting tasks for the next engineer

- Install packages and run Wrangler local against an actual Neon test database; confirm migrations, SQL transaction syntax and free-tier limits.
- Add automated auth abuse protection, email verification, RLS and tenant negative tests before public traffic.
- Add GitHub App/OAuth and a sandbox coding worker for arbitrary website changes; avoid code eval inside Cloudflare Worker.
- Implement true Playwright reports scheduled via affordable external execution and connect them to Manager issue triage.
- Finish Paddle sandbox/merchant checkout and webhook integration tests; disable commercial billing until approved.
- Add controlled source updates, human approvals, deployments, tests, drift detection, monitoring, and independent neural policy release gates.

Use the named function contracts in `docs/FUNCTION_CONTRACTS.md` as the review checklist. Report exact changes, tests executed, cost assumptions and remaining risks. Do not fabricate successful deployments or integration test results.
