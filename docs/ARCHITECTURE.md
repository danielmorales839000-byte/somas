# SOMAS v2 — System Architecture

The Root/Customer Mission slice now uses `src/somas-core.js:planEvolution` for both scopes. Root's mission is the SOMAS platform; each customer's mission comes from the saved application purpose. Root policies/examples/candidates live in separate tables, while customer policies remain in canonical `agents`. Existing typed-site edits still require owner approval. Mission plans do not execute code or deploy changes. See `ROOT_CUSTOMER_INTEGRATION_REVIEW.md` for migration 003, permission/ownership checks and local verification.

## Product thesis

A customer describes business/software objectives and settings. The Root Manager provisions a public web application and a private Instance Manager with an Assistant and Virtual Customer. From inside that published site, the owner describes defects or improvements. The Instance Manager creates a task-specific team to investigate, implement, test and propose an approved deployment. The system supports four independent but coordinated changes: application software, agent intelligence, organization topology and customer-facing business workflows/content.

## Architecture (free-first target)

```text
Customer browser -> Cloudflare static assets -> SOMAS owner UI
                 -> Cloudflare Worker API (authenticated control plane)
                       |-> Neon PostgreSQL (tenants/projects/agents/policies/releases)
                       |-> Manager planner -> specialist team / Assistant
                       |-> low-cost AI gateway -> Groq/OpenRouter (optional)
                       |-> recurring static checks / curated research (bounded cron)
                       |-> external runners (future coding sandboxes, browser, training)
                       |-> Paddle checkout/webhooks (configured merchant only)
Public users -> /s/:slug -> tenant-controlled static HTML spec from Neon
Owner -> /s/:slug/manage -> authenticated in-site Manager + Assistant
Platform operator -> restricted admin API -> instance suspension, oversight
```

## Deployment topology

One Worker deployment and one Neon project hold many *logical* isolated customer instances. This minimizes fixed charges and deployment management. An instance is not another independently provisioned Worker service. Customers obtain a live route immediately; per-customer custom domains and dedicated deployments are future infrastructure features.

**Separation**:
- Public site: read-only generated HTML; no model secrets, no code execution.
- Authenticated user plane: user/project management, control panel.
- Agent plane: scoped plan creation and actions; dedicated policy records.
- Execution plane (future): disposable containers/browser workers, resource capped, no live production credentials.
- Billing plane: merchant processor credentials and signed webhooks, entitlements from server state.
- Platform admin: distinct authorization via immutable account UUID with audit trails.

## Agent organization

### Three mandatory instance roles

- Manager: objective planning, team design, delegation, budget check, approval routing, candidate policy oversight.
- Assistant: user-facing interpretation and explanation; no unilateral policy/production privilege escalation.
- Virtual Customer: real browser journey selection, objective defect evidence and usability hypotheses, regression comparison; synthetic feedback never counts as a real customer satisfaction vote.

Each core role and specialist owns `agents.policy` with separate `weights`, `bias`, `version`, `samples`. Inputs are hashed feature vectors of dimension 48. Classification is a lightweight multinomial linear head preceding the frozen external LLM. Owner-provided verified labels can produce candidate weights; no arbitrary web text trains these policies. `manager` uses its promoted policy for team classification when sufficiently trained and confident; otherwise it falls back to deterministic routing. A specialist need not make an external LLM call for every task.

### Dynamic specialist structure

The Manager selects a minimal specialist team based on goal complexity, available capabilities, cost and decision rights; no permanent fixed CEO/CTO/CFO template. The alpha uses deterministic category-based staffing (`chooseTeam`), providing a stable upgrade point for future dynamic graph planning. Specialist policies are independent and provisioned on creation.

## Evolution lifecycle

1. `user_goal` -> Assistant normalized intent (currently lightweight extraction + optional model explanation).
2. Manager selects/reuses specialists, creates `tasks` and `proposals`.
3. Supported template changes produce a fully validated immutable `proposed_spec`; unsupported requests become engineering backlog with **no live changes**.
4. Owner reviews proposals in site or platform UI and approves.
5. Transactional release swaps the active spec, increments version and stores history. Public site immediately renders updated content.
6. Virtual Customer checks the current version (static cron or external Playwright runner); results feed findings.
7. User feedback and objective outcomes can form verified training examples; policy candidates are held behind a separate evaluation gate.
8. Future coding sandbox and CI agents expand this process to real source code changes and database migrations.

## Evidence and cold start

- Early lifecycle: static audits, allowed external documentation, deterministic tests, owner objectives and synthetic user journeys.
- Growing user base: prioritize verified user friction, bug frequency, retention signals and explicit owner requirements.
- Always: independent verification, provenance, quality/impact thresholds, issue deduplication and customer data isolation.
- Priority weighting must be dynamic and evidence-aware. No arbitrary 80/20 ratio. This alpha records sources/findings but does not implement an autonomous feedback-priority model.

## Safety and authority

LLM advice and downloaded web pages never become executable source or new permissions by themselves. A deterministic policy layer governs the only supported edits. Owner and platform-admin roles are distinct. Billing can restrict *new work* without automatically destroying customer data. Safety gates are outside the control of mutable agent policies.

## Data model

`users` → `workspaces` → `projects` → `agents` / `tasks` / `proposals` / `releases` / `findings` / `research_sources`.

`workspaces` → `subscriptions`; `users` → `sessions` / `usage_counters`; `agents` → `learning_examples` → `policy_candidates`.

`audit_events` records instance deployment, releases, rollbacks and administrative suspension. `processed_payment_events` provides provider webhook deduplication. `instance_checks` tracks periodic audit coverage.

## Important design boundaries

- Neither the central Worker nor customer pages may `eval` or run untrusted user-generated code.
- External executor runs require ephemeral resource-bounded sandboxes, scoped artifacts and network egress restrictions.
- Machine ratings cannot authorize new agent permissions or override explicit owner constraints.
- The training subsystem may update only candidate weights; release gate and measured holdout checks must remain independent.
- Multi-tenant database queries are scoped; introduce Postgres RLS and stronger tenant roles before production.
