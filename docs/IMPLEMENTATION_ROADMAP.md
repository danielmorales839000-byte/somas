# SOMAS v2 — Implementation sequence and release gates

The first repository implements an end-to-end **safe, constrained slice**. Remaining production features are design requirements rather than pretend-complete tasks. Work from left to right; don't start commercial onboarding before security/billing gates.

| Milestone | Deliverable | State | Acceptance |
|---|---|---|---|
| M0 | Fresh Cloudflare Worker + Neon schema + basic UI | Source implemented; live deploy unverified | Successful manual Neon + Wrangler smoke test |
| M1 | Accounts, single-owner workspace, isolated projects | Source implemented; needs live tenant integration tests | Negative authorization tests; login abuse controls before production |
| M2 | Core Manager/Assistant/Virtual Customer per instance | Implemented | Separate policies and instance ownership |
| M3 | Public `/s/:slug` site and embedded `/manage` | Implemented for 3 constrained templates | Public visitors can view; only owner can manage |
| M4 | Manager-selected specialists + safe proposal/release/rollback | Implemented for JSON-template edits | No live change without explicit owner approval |
| M5 | Neural filters, verified examples, candidate holdout evaluation | Implemented alpha; weak small-sample gate | Build a stronger evaluator, rollback and traces for production |
| M6 | Budgeted AI gateway with free/provider modes | Optional implementation | Verify vendor terms, cost audit and measured free quotas |
| M7 | Virtual Customer heuristic/Playwright and bounded daily scheduler | Both modes implemented, Playwright external/manual | End-to-end browser run and CI integration verified |
| M8 | Cold-start research and evidence | Manual allowlist + bounded scheduled research | Source provenance, legal checks, changed-source filtering |
| M9 | Commercial subscriptions and centralized administration | Paddle adapter, webhook and admin APIs; merchant not configured | Signed sandbox flows, stale events, dunning, reconciliation |
| M10 | Full-stack generated code + GitHub repository per instance | **Not implemented** | Sandbox codegen, test suite, staging, deploy approval, rollback |
| M11 | Runtime per-customer domains and optional provider adapters | **Not implemented** | DNS verification, SSL and isolated tenancy |
| M12 | Production security/compliance and multi-user workspaces | **Not implemented** | MFA, verification, RLS, audit, privacy and backup drills |
| M13 | Data-driven adaptive prioritization and continual agent learning | **Not implemented** | Experimental gains on held-out longitudinal benchmarks |

## M10: precise proposed coding-worker APIs

- `POST /internal/coding/jobs`: accepts `workspaceId,projectId,taskId,gitRepoRef,scope,resourceBudget`, verifies authorization and registers immutable job, returns `jobId` and preview intent.
- `GET /internal/coding/jobs/:id`: authorized job status, last heartbeat, test artifacts, staged branch/PR URLs, expected cost, logs with secrets redacted.
- `POST /internal/coding/jobs/:id/cancel`: cancels shell/browser sandbox and revokes ephemeral credentials; keeps audit trail.
- `runCodeGeneration(job)`: reads pinned repo revision, emits diff to temporary branch, never executes code within the central Worker.
- `runPreflight(job)`: lint/tests/static scanners, network sandbox, no outbound production write tools.
- `validateDbMigration(job)`: preflight on cloned data subset, backups, non-destructive migration strategy.
- `publishPreview(job)`: uploads preview artifact to staging, not live; records URL/expiry.
- `requestOwnerApproval(job)`: owner reviews diff, tests, data migrations and predicted charges.
- `deployApprovedJob(job,approval)`: ensures unchanged artifact digest, executes provider deployment, verifies health and records release.
- `rollbackCodingJob(release)`: restores prior artifact without assuming DB rollback is reversible.

Suggested execution service: ephemeral containers hosted by a dedicated runner that can be paid only when work runs. Avoid pretending this is feasible inside the 10 ms free Worker CPU allowance.

## M12: production gate

Block public paid onboarding until each condition is verified in a hosted test environment:

1. Email verification and IP/device abuse throttling.
2. Strong tenant isolation enforced in SQL, including RLS tests, not only UI checks.
3. Multi-user permission model; cannot exploit customer site URLs to access owner operations.
4. Secrets isolation, audit/retention policies, manual incident isolation.
5. Paddle merchant approval, default checkout payment URL, signed event retries/idempotency, account statement reconciliation.
6. Data export/deletion/backup restoration and legal policy review.
7. CI/CD to deploy only tested pinned releases; infrastructure monitoring and alerting.
8. Cost ceilings, rate limits and billing visibility at instance/user/provider levels.
9. Neural-policy benchmark results, behavioral rollback and anti-poisoning safeguards.

## Deployment options

- **Preferred**: Neon Postgres + Cloudflare Workers Static Assets, on a single Worker for both API and public sites.
- **Optional later**: Vercel integration as an external deployment target, mindful of its Hobby tier's personal/non-commercial restriction. A commercial platform should use an eligible paid tier where required.
- **Paid when needed**: dedicated Playwright/code execution and scheduled neural training, not inside Worker free CPU.
