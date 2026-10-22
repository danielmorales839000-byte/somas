# SOMAS v2 development release review

**Status: implemented and locally tested development slice; not approved for production.**

Base: `somas-v2` commit `25c4b419dfabf442cbe1daea17a92696f1861cfc`.
Branch: `codex/somas-v2-audit-20261022`.
The [live audit](audit/2026-10-22.md) records an unresolved deployed-source mismatch and production Command Center schema error. Nothing in this change repairs production merely by existing on a branch.

## Changes and practical behavior

- Project provisioning now atomically creates a persistent mission and its first assessment alongside the original project, independent policies and organizational unit. Existing units initialize missions when their authorized owner opens operations.
- Root and Customer use the same mission/job engine, with different unit identities, objectives, agent stores and data access. Root assessment reads aggregate service metadata, not customer conversations, objectives, specs or evidence.
- Durable jobs have explicit queued, working, waiting, blocked, failed, completed and canceled states. Idle means an agent has no recorded execution. Claims use row locks, leases, fresh fencing tokens, bounded retries and duplicate keys. A lease alone is not a result; expired leases never display as active work.
- Mission assessment retains the original goal, current source capabilities, criteria, owner requirements, defects, gaps, budgets and history. Explicit owner requests have higher priority than optional packaging/research. Assessment does not prove arbitrary business workflows work.
- A database-backed monthly new-job limit (default 30) caps each mission. Attempts are bounded at three; owner-requested retries/cycles and credential issuance have additional user quotas. Pausing a mission prevents claims and scheduled checks. Account suspension revokes sessions/runner tokens and prevents new customer job claims.
- Worker cron can run bounded assessments/packaging after logout. It processes at most three due units, at most two local executions each, per daily tick. This is bounded periodic work, not a permanently running process or an uptime guarantee. Old static audits are retained, bounded, and respect mission/account pauses.
- Genuine implemented execution: objective/spec assessment; typed standalone application packaging; optional allowlisted accessibility-document research; external scoped Chromium smoke journeys. Source findings and reports include their method. Browser results are attributed external reports, not automatic mission completion or verified neural training labels.
- Unavailable arbitrary coding and hosting providers produce explicit blockers. No arbitrary customer code runs in the control-plane Worker. No production deployment, model call, paid resource, database migration or secret update was performed during this work.
- Dedicated Manager conversation retains messages and task references across page reloads. The local planner is deterministic unless the pre-existing optional model gateway is enabled; it is not represented as general autonomous LLM reasoning.
- Integrated dark Live Organization shows actual persisted identities, assignments, states, significant events and evidence. New communication events can animate a connection once; initial history never animates as live work. Responsive layout, keyboard project navigation, escaped text and reduced-motion support are included.
- Root control adds operational account/instance/subscription summaries, account suspension/restoration, security events and the shared mission view. It does not grant operators customer ownership. Billing reconciliation, MFA, domain provisioning and commercial subscription lifecycle remain incomplete.
- Independent artifacts contain an application identity, separate Worker name/config, entry point, source release and canonical JSON digests that survive JSONB object-key reordering. They can be unpacked and independently built/deployed after review. They are static content applications; a package is neither a deployed URL nor a working shop/restaurant/business workflow.
- Project-count enforcement moves into a locking PostgreSQL trigger. Proposal approval pins the exact release used to compute the revision, serializes on the project and rejects stale/legacy proposals. Release/audit events commit with the content change. JSON payload reads are bounded while streaming.

## Reproducible local verification

| Check | Result in this environment | What it establishes |
|---|---|---|
| `npm run check` | 48 passed; 3 native SQL suites skipped without a disposable native DB | Unit/security/model tests, Neon-protocol fixtures, bundled Worker auth runtime and syntax checks |
| `npm run test:sql` | 2 integration suites passed | Migrations 001–004 including repeat application, owner/admin/tenant denials, independent policies, lease fencing, stale approvals, quotas, conversation persistence, logout/background execution, token scope/rotation, account suspension and standalone packages on PostgreSQL/WASM |
| `npm run test:runtime-browser` | End-to-end Chromium journey passed against actual Worker handlers and disposable PostgreSQL/WASM | Registration, project creation, Manager message persistence, runtime assessment, actual external Playwright-agent report, artifacts, Root access, mobile width, reduced motion, absence of page exceptions |
| `npx wrangler deploy --dry-run --outdir /tmp/somas-v2-worker-build` | Bundled successfully, no deployment | Worker bundling and asset inclusion; not provider authentication, hosted SQL or runtime CPU limits |
| Separately unpacked application package + Wrangler dry build | Passed; generated Worker 2.69 KiB with no control-plane bindings | Independent package integrity/routing/build; no independent hosted URL |
| `npm run test:postgres` | Cannot start here: only OS UID 0 is mapped | Native concurrent-connection verification remains required; CI is configured to run it under a non-root user |

Chromium's standard download returned truncated archives in this environment. The successful local browser run used an npm-distributed Chromium executable with an explicit test-only path/argument override. Default CI uses the normal Playwright browser installation. No browser credentials from the live audit entered these tests. Screenshots in [audit/ui](audit/ui) show the isolated application, not production.

PostgreSQL/WASM serializes transactions. Its passing race-shaped tests do not prove native row-lock contention, production load behavior or hosted Neon transport. Native integration and browser jobs are included in the quality workflow but a configured workflow is not a completed CI run.

## Required migration and rollout

1. First identify the **actual deployed Git revision and migration ledger**. Production serves modules/endpoints absent from the supplied branch. Reconcile those changes into the development branch; do not replace production with this older source base.
2. Back up the database; create a disposable Neon branch with no production-write credentials. Run the existing migrations 001–003 as appropriate, then review and apply `db/004_mission_runtime.sql` in staging only.
3. Migration 004 adds runtime tables/indexes, `users.account_status`, `proposals.base_release`, and a project-limit trigger. It does not overwrite existing passwords, policies, specs or releases. Existing proposals have NULL base releases and intentionally require regeneration before approval. Existing projects are not deleted, even if already above the cap.
4. Set `PUBLIC_CONTROL_ORIGIN` to the canonical **staging** origin. Leave external research/model access disabled until explicitly configured. Missing origin blocks browser jobs safely.
5. Test login/registration against the hosted Worker and actual Neon schema. Exercise two accounts, Root authorization, project-limit races, stale releases, pause/suspension, expired leases and a real scheduled run after logout. Measure CPU, query count, storage and request use.
6. The owner may generate a short-lived token through `POST /api/projects/:id/operations/runner-token`. It permits only that unit's browser jobs, expires in one hour, and rotation revokes previous tokens. Keep it in a protected runner environment, never chat, screenshots, source or command history. There is no always-on runner service supplied here.
7. Run `npm run browser-agent` in isolated external compute with `SOMAS_BASE_URL`, `SOMAS_TARGET_ORIGIN`, and `SOMAS_RUNNER_TOKEN` configured securely. The browser receives no owner session or provider secrets, cannot traverse foreign origins, and performs read-only smoke journeys. Reports from a stale release are blocked. Failed checks create mission gaps. Application-specific journeys, screenshot storage and a stronger independently attested runner remain future work.
8. Download a package from Live Organization and use its outer artifact integrity reference. The unpacker verifies both that canonical artifact digest and the canonical digest of its files. `node scripts/unpack-application.mjs PACKAGE.json NEW_DIRECTORY EXPECTED_ARTIFACT_DIGEST` only unpacks for review. Build that entry point independently with Wrangler in its output directory. Deploying it requires a separate explicit approval and provider credentials; no deployment command is invoked by SOMAS.
9. Present the reconciled diff, hosted test results, migration plan, measured limits/costs and remaining risks for explicit approval. Only then deploy the pinned production revision, verify health and user journeys, and record the actual independent application URL.

### Rollback

Preserve runtime tables and history. Do not drop tables or reverse account suspension protections to roll back UI changes. Revert to a known compatible application revision in staging first. For typed content, the existing approved rollback creates a new release, never deletes old releases. Independent hosting releases, database rollback/restoration and post-deployment verification remain operator/provider work until a deployment adapter exists. Reverting to old auth code that ignores account status would weaken suspension controls; do not do that without an equivalent external access control.

## Costs and capacity (reviewed official docs, 22 October 2026)

- Free Workers: 100,000 requests/day, 10 ms CPU/invocation ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Local packaging/hashing/assessment CPU still needs hosted measurement. A local successful build does not establish free-plan suitability.
- Cloudflare Containers require Workers Paid and metered resources ([pricing](https://developers.cloudflare.com/containers/platform/pricing/)); arbitrary coding sandboxes are not assumed free.
- Neon Free has finite compute, storage and branch allowances ([plans](https://neon.com/docs/introduction/plans)). Persistent event/artifact storage needs a retention/export policy before scale. This implementation bounds per-mission writes but does not claim a global unlimited free quota.
- Browser/coding CI minutes, models, hosting/domain operations and optional providers have separate quotas or charges. No external spending is enabled in mission constraints. No paid plan was selected or purchased.

## Acceptance matrix

| Requested outcome | Current evidence / remaining gap |
|---|---|
| Root/customer authorization | Source + SQL + local browser checks; production non-admin denial observed. Actual production admin testing unavailable. |
| Registration and persistence | Unit, bundled Worker, SQL/WASM, browser verified. Hosted release verification required. |
| Customer-specific organization | Independent existing policies preserved; dynamic specialists are persisted when actually assigned. |
| Dedicated Manager conversation | Integrated and refresh-persistent, locally browser-verified. Open-ended semantic planning requires a configured model/coding provider. |
| Live organization and activity | Integrated real records and event-driven motion, local desktop/mobile verification. Production schema failure remains unresolved until source/schema reconciliation. |
| Original mission after logout | Durable records and scheduled execution tested without a session in SQL/WASM. Hosted scheduled trigger not observed. |
| Research | Existing manual allowlist plus mission-related optional MDN research. Broad web/business research provider and live external research verification absent. |
| Virtual Customer | Actual scoped Chromium smoke executor and report persisted in E2E. Not all business journeys; no independent evidence attestation or remote screenshot store. |
| Real application code development | **Not implemented**: isolated coding/model/repository provider unavailable. Jobs remain blocked; no recorded task is labeled implemented. |
| Independent customer application | Reviewable separately buildable Worker package exists. **No independent deployment or URL was created.** The existing shared preview is not counted as acceptance. |
| Approval, rollback and releases | Source-pinned typed-content approvals/rollback implemented and SQL tested. Full code/hosting release, infrastructure rollback and health gates remain unavailable. |
| Production completeness | **Not met**. Reconcile live source/schema, configure safe execution/deployment providers, complete hosted tests and obtain explicit release approval. |

This branch is a tested integrated improvement to the actual repository, not a claim that the complete autonomous-product acceptance standard is satisfied.
