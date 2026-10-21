# SOMAS v2 — Function-Level Implementation Contracts

Notation: **Implemented** = present in this new codebase; **Interface** = must be implemented in a later phase. All `projectId` functions MUST check workspace ownership before any write. Error codes must not reveal cross-tenant existence. All inputs are untrusted and bounded. All outbound tools require separate policy authorization.

## Phase 0 — Infrastructure and tenancy

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `database(env)` | Worker env → parameterized Neon SQL connection | Requires server-only `DATABASE_URL`; throw if absent | Implemented |
| `uuid()` | None → v4 UUID | Cryptographic `crypto.randomUUID`; never user-controlled | Implemented |
| `createUser(sql,email,hash)` | Canonical email + password hash → `{id,workspaceId}` | Transaction creates user, workspace and trial plan; unique email conflict | Implemented |
| `getUserFromSession(sql,hash)` | SHA-256 hash → user or null | Check DB expiry; no cross-user session access | Implemented |
| `getSubscription(sql,userId)` | Owner UUID → subscription or null | Join through workspace owner | Implemented |
| `listProjects(sql,userId)` | Owner UUID → ≤100 project records | Never return another user's projects | Implemented |
| `ownedProject(sql,userId,projectId)` | User + project → project or null | Workspace join is mandatory | Implemented |
| `publicProject(sql,slug)` | Public slug → safe public spec | No agent secrets or email list; unique slug | Implemented |
| `reserveQuota(sql,userId,kind,limit)` | User, month, metric → boolean | Atomic upsert; fail closed once budget spent | Implemented |
| `usageSummary(sql,userId)` | User → current monthly counters | User-scoped | Implemented |
| `bootstrapDbMigrations()` | Database version → applied revisions | Apply versioned migrations idempotently with backups and checksum tracking | Interface |
| `enforceTenantRls()` | Session/workspace context → permitted DB operation | Postgres RLS + scoped DB roles, tested from independent tenants | Interface |

## Phase 1 — Authentication

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `hashPassword(password)` | 12–128 chars → salted PBKDF2 string | Fresh random salt; no plaintext persistence | Implemented |
| `verifyPassword(input,stored)` | Password+hash → boolean | Bounded iterations and constant-time-ish comparison | Implemented |
| `derivePassword(...)` | PBKDF2 inputs → hex key | Web Crypto SHA-256 and iteration bounds | Implemented |
| `sha256(token)` | Session token → server-side hash | Tokens never stored raw | Implemented |
| `cookieForSession(token,url)` | Session token → cookie header | HttpOnly, Strict, Secure on HTTPS, 7-day age | Implemented |
| `sessionCookie(req)` | Request → token or null | Exact 64-hex token extraction | Implemented |
| `checkMutationOrigin(req)` | Request → boolean | Reject mismatched Origin / missing custom CSRF header | Implemented |
| `createSession(sql,userId,hash)` | Credentials → expiring DB session | 7-day DB expiry | Implemented |
| `requireUser(sql,req)` | Request → authenticated user | 401 if invalid session | Implemented |
| `startEmailVerification(userId)` | User → verification token/job | Mandatory before public commercial rollout | Interface |
| `consumeEmailVerification(token)` | Token → verified user | Single-use, time-bound, rate limited | Interface |
| `rateLimitIdentityAttempt(actor,action)` | IP/device/user → permit/deny | Guard registration and login; protect password verifier CPU | Interface |
| `requireMfa(user,action)` | Actor + sensitive action → challenge | Mandatory for admins and billing actions | Interface |

## Phase 2 — Project provisioning and publishing

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `normalizeInput(text)` | Freeform text → bounded normalized instruction | Minimum 8, maximum 2,500 characters | Implemented |
| `slugify(title)` | Title → ASCII slug prefix | Sanitized; random suffix added before publication | Implemented |
| `initialSpec(title,purpose,template)` | Objective → validated schema v1 | Exactly business, portfolio or storefront-preview starter; no fictional payments | Implemented |
| `validateSpec(spec)` | Site JSON → valid spec / failure | Whitelisted structure, size limits, themes, CTA destinations | Implemented |
| `provisionProject(sql,userId,setup)` | Owner, title, purpose, slug, site spec → project and core agents | Active subscription, max 3 projects, atomic release/core agents creation | Implemented |
| `renderSite(spec,slug)` | Validated spec → escaped HTML | HTML escaping, no executable user scripts or secrets | Implemented |
| `renderOwnerPanel(project,owner)` | Authenticated project → `/s/:slug/manage` HTML | Same-origin, owner-only, CSRF-protected actions | Implemented |
| `provisionCustomDomain(instance,domain)` | Owned domain → verified SSL route | Prove DNS ownership, automate certificate, refuse collisions | Interface |
| `generateBackendScaffold(request)` | Business goal + schema → safe repo artifact | Separate sandbox, tests, permissions, no Worker eval | Interface |
| `deployIndependentRuntime(project,artifact)` | Tested artifact → provider deployment | Cloudflare or optional Vercel; stages, approvals and rollback | Interface |

## Phase 3 — Agent organization, communication and model usage

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `newPolicy(role)` | Role → trainable policy JSON | Separate weights, bias, version, sample count; specialist fallback labels | Implemented |
| `features(text)` | Text → 48-d normalized hashed vector | Deterministic and bounded processing | Implemented |
| `scorePolicy(policy,text)` | Weights + input → ranked decision probabilities | No network required | Implemented |
| `classifyRequest(text)` | Owner request → category | Stable deterministic baseline | Implemented |
| `chooseTeam(text,managerPolicy)` | Request + active Manager filter → roles | Uses trained decision only above confidence and sample threshold; otherwise heuristic | Implemented |
| `createTaskWithProposal(sql,actor,project,request,team,revision)` | Decision → task, proposal, specialist agents | Single DB transaction, dynamic specialists each own neural policy | Implemented |
| `localAssistantReply(spec,text,team,revision)` | Plan → human explanation | Must distinguish prepared proposal from needs-engineering backlog | Implemented |
| `callGateway(env,messages)` | Scoped messages → provider response/usage | Provider secret stays in Worker, 15 s timeout, no arbitrary tools | Implemented |
| `planOrgGraph(objectives,capabilities,budget)` | Requirements → versioned team DAG | No fixed executive template; validate reporting cycles/authority | Interface |
| `delegateTask(task,role,capability)` | Authorized task → scoped specialist job | Enforce least privilege, rate limit and cost cap | Interface |
| `executeToolCall(agent,tool,input)` | Scoped tool call → logged result | Deny unknown tools; sandbox code and sensitive operations | Interface |
| `escalateForApproval(proposal,owner)` | Proposed high-impact action → approval object | Frozen scope, expiry, deny-by-default | Interface |
| `coordinateAgentMessages(team,trace)` | Team events → explainable decisions | Durable trace IDs, bounded messages, no uncontrolled recursion | Interface |

## Phase 4 — Software evolution and release control

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `proposeRevision(spec,request)` | Existing site + request → supported patch or engineering backlog | Strictly whitelisted title, tagline, theme, sections, FAQ | Implemented |
| `listProposals(sql,projectId)` | Authorized project → proposals | Status and originating team visible | Implemented |
| `approveProposal(sql,projectId,proposalId,actorId)` | Owner approval → new release version | Atomic acceptance, active spec swap and release record; cannot approve suspended site | Implemented |
| `listReleases(sql,projectId)` | Project → history | Read-only latest 30 versions | Implemented |
| `rollbackRelease(sql,projectId,version,actorId)` | Historical release → new current release | Preserves history and audit; no destructive migration | Implemented |
| `checkoutSourceBranch(project,task)` | Task → isolated Git branch | No direct main-branch agent write | Interface |
| `generateCodePatch(branch,task)` | Scoped requirements → diff | Sandboxed tools, approved repositories only | Interface |
| `checkMigrationSafety(current,candidate)` | Schema diff → approval/risk | Backups, expand-contract migration and rollback planning | Interface |
| `executeBuildAndSecurityTests(candidate)` | Artifact → signed evidence | Unit/integration/e2e/security tests, isolated runner | Interface |
| `promoteSoftwareRelease(candidate,approval)` | Approved tested candidate → production deployment | Reconcile provider and DB state; rollback on failure | Interface |
| `detectProductionRegression(release,telemetry)` | Change + health signals → incident | Disable risky auto rollouts, retain evidence | Interface |

## Phase 5 — Virtual Customer and external research

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `virtualCustomerHeuristics(spec)` | Site spec → labeled static findings | Never pretend static checks equal browser clicks | Implemented |
| `recordFindings(sql,projectId,findings,method)` | Structured evidence → DB rows | Distinguish `static_heuristic` and `playwright_browser` | Implemented |
| `run-virtual-customer.mjs` | Owner secrets, project ID → real Chromium navigation + browser report | HTTPS targets from authenticated project, no real payments, bounded viewports | Implemented, runner is opt-in |
| `cronEvolutionTick(env)` | Scheduled event → ≤3 static audits / optionally 1 research item | Bounded workload, read-only research, no auto code/weight changes | Implemented |
| `fetchAllowlistedResearch(url)` | Allowlisted HTTPS page → title, excerpt | No redirects, limited body size, never interpret page text as instructions | Implemented via endpoint |
| `rankEvidence(proposals,feedback,outcomes)` | Source provenance + user signals → priorities | Prefer verified owner and real-user problems, dynamic confidence | Interface |
| `generateCustomerPersonas(project)` | Project goals → test journeys | Diverse accessibility/devices, synthetic evidence flagged | Interface |
| `scheduleBrowserJourneys(project,budget)` | Site revision → permitted browser jobs | External provider or controlled CI, max attempts | Interface |
| `deduplicateFindings(findings)` | New/old traces → issue set | Reproduction/frequency/impact and issue lifecycle | Interface |
| `validateResearchLicense(source)` | URL/content policy → allowable use | Robots/site licenses and privacy, no wholesale redistribution | Interface |

## Phase 6 — Neural learning and policy promotion

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `trainVerified(policy,input,label)` | One owner-verified classification → new policy JSON | Gradient step on independent weights, never mutate original | Implemented |
| `validateTrainingLabel(role,label)` | Role/label → boolean | No unknown labels | Implemented |
| `prepareCandidate(policy,examples)` | ≥5 verified examples → policy candidate + held-out metrics | Time-ordered holdout 20%; candidate only, not active | Implemented |
| `recordVerifiedFeedback(agent,input,label,actor)` | Authorized owner feedback → learning record | Does not directly change production weights | Implemented endpoint |
| `createPolicyCandidate(agent,examples)` | Existing weights + labels → versioned candidate | Existing policy remains live | Implemented endpoint |
| `promotePolicyCandidate(agent,candidate,approval)` | Eligible candidate → new active policy | Version equality and evaluation gate; no implicit web-text training | Implemented endpoint |
| `trainManagerDecisionGraph(trace,reward)` | Verified outcome history → candidate organization policy | Strong baselines, replay, counterfactual risks, separate train set | Interface |
| `evaluatePolicySafety(candidate,suites)` | Candidate → pass/fail and metrics | Independent fixtures, worst-case guardrails, costs | Interface |
| `rollbackPolicy(agent,version)` | Version ID → prior policy | Signed policy registry and compatibility check | Interface |
| `auditCrossTenantTraining(data)` | Training batch → privacy certificate | Private weights/memories cannot leak to other customers | Interface |

## Phase 7 — Subscription billing, cost governance, platform control

| Function | Inputs → Outputs | Rules / failures | Status |
|---|---|---|---|
| `reserveQuota(sql,userId,kind,limit)` | Actor+quota → permit/deny | Atomic counter, hard stop at zero remaining | Implemented |
| `verifyPaddleSignature(raw,header,secret)` | Signed webhook → boolean | HMAC-SHA256, freshness window, raw body compare | Implemented |
| `createPaddleCheckout(env,workspaceId)` | Authenticated workspace → external checkout URL | Secret API key, configured provider price, default payment page required | Implemented adapter, merchant unconfigured |
| `paddleStatusToSomas(status)` | Provider status → entitlement status | No client-side payment claims | Implemented |
| `applySubscriptionWebhook(event)` | Verified subscription event → persisted entitlement | Dedupe event IDs, ignore older timestamps, workspace binding | Implemented endpoint, requires sandbox tests |
| `listPlatformInstances(admin)` | Admin actor → limited instance overview | Admin immutable UUID secret; do not export customer data | Implemented endpoint |
| `suspendInstance(admin,instance,reason)` | Authorized admin action → suspend/un-suspend | Audit; owner can still view account/data | Implemented endpoint |
| `reconcileSubscriptions()` | Provider API + local DB → corrections | Required before real charging, alert drift | Interface |
| `calculateInvoiceUsage(workspace,period)` | Metered events → charge summary | Define product inclusions, currency, tax rules | Interface |
| `enablePerTenantBudgets(workspace)` | Spending policy → enforced limits | Multi-agent concurrent reservations and billing caps | Interface |
| `rotateProviderCredential(providerId)` | Credential → new secret version | Key never exposed to agents or frontend | Interface |
| `exportTenantData(workspace,actor)` | Authorized request → downloadable archive | Privacy law, retention, security check | Interface |
| `deleteTenantData(workspace,actor)` | Authorized request → delayed deletion job | Backups, retention laws, idempotence, support appeals | Interface |
| `reconcileInstanceHeartbeat(project)` | Health signal → status | Detect outage while preserving customer data | Interface |

## Root/Customer Mission integration contracts

Both scopes call `planEvolution(unit,instruction,{changeKind,target,managerPolicy})`. Descriptors and policies come from authenticated server context, never caller-supplied unit/authority fields. Targets are fixed to `somas_platform` or `customer_application`; cross-scope claims are 403. Plans remain unexecuted and require human approval.

`ensureRootUnit` is admin/server-internal; `ensureCustomerUnit` additionally checks the actor's workspace ownership. `unitPlans` scopes customer reads to that owner. `proposeScopedEvolution` atomically stores a proposal and only missing specialists, preserving canonical policies. `recordRootFeedback` stores operator labels without changing active weights; `prepareRootCandidate` uses the shared holdout evaluator; `promoteRootCandidate` locks the Root agent and checks evaluation/base version before activation. Root routes require session plus `ADMIN_USER_ID`, independently of customer ownership. See `ROOT_CUSTOMER_INTEGRATION_REVIEW.md` for migration backstops, negative tests and limits.

`candidateEvaluation` records an independent rollback snapshot for new candidates in either scope. `releasePolicy` is the shared locked promotion/rollback gate: explicit authorized action, eligible candidate/base version, snapshot required, monotonic versions and atomic audit records. Old candidates without snapshots require retraining and are not rewritten. Latest-promotion rollback is implemented; arbitrary historical policy registry/rollback remains a later interface.

## Frontend behavior contracts

Registration diagnostics supplement the authentication contracts: `hashPassword` uses a 100,000 per-call PBKDF2 work factor for hosted Worker compatibility; existing hashes retain their stored factor. `reportFailure` emits only static classifications, stage and random request ID. `scripts/check-database.mjs:checkDatabase` performs a read-only connection/registration-column preflight and never migrates. See `REGISTRATION_DIAGNOSIS.md` for tradeoffs and production evidence still required.

| Screen | Input → action → expected output | Failure behavior |
|---|---|---|
| Registration / login | Email/password → session → private workspace | Generic invalid-credentials error |
| Project creation | Title, goal, template → provision → site link and three core agents | Limit and validation errors shown |
| Project details | Project UUID → authorized detail, agents, site URL | Unauthorized IDs return not found |
| Embedded manager panel | In-site owner prompt → Assistant → Manager task/proposal | Visitor redirected to login, non-owner forbidden |
| Evolution proposals | Select preview → inspect JSON summary; approve → release | Unsupported changes show engineering backlog |
| Agent policies | Labels + input → stored examples; train → candidate metrics | Fewer than five examples rejected |
| Virtual Customer | Run audit → method-labeled findings | Clearly says when no real browser navigation occurred |
| Releases | Select old version → confirmed rollback → new release | Missing versions rejected |
| Usage and plan | Read counters/subscription state → allowances | Never infer payment success from checkout redirect |
| Admin API | UUID-scoped operator → list/suspend instance | Other actors cannot access admin metadata |

## End-to-end acceptance gates for later phases

- **A1**: Two independent users cannot read/write each other's projects, policies, requests, releases, billing or agent data, even by guessed project ID.
- **A2**: Every provisioned instance has exactly one each of Manager, Assistant, Virtual Customer with distinct policy IDs/weights.
- **A3**: Supported content changes appear only after owner approval; unsupported API/payment changes never appear as deployed.
- **A4**: A rejected, duplicated or concurrently approved proposal cannot produce inconsistent releases.
- **A5**: A deployment rollback restores the intended prior site spec and increments version without deleting history.
- **A6**: External web content alone can neither create tool permissions nor train/neural-promote weights.
- **A7**: No provider credential appears in public HTML, browser logs, stored prompts, research excerpts or client JS.
- **A8**: A legitimate Paddle sandbox transaction sends signed subscription events; duplicate and out-of-order events do not cause entitlement escalation.
- **A9**: Admin suspension affects only the named instance and is fully auditable; false admin claims rejected.
- **A10**: Browser-runner findings are reproducible, distinguishable from synthetic UX opinions, and never perform real purchases.
- **A11**: Free-tier consumption remains bounded across multiple agents and concurrent requests, with enforced fail-closed quotas.
- **A12**: A candidate policy cannot promote without verified labels, holdout evidence and explicit owner action; rollback is supported before real production use.
