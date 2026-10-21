# SOMAS v2 — Root/Customer architectural symmetry (implemented first slice)

> Integration note: see `ROOT_CUSTOMER_INTEGRATION_REVIEW.md` for actual verification and hardening beyond this reference design. Customer scope/owner constraints and Root promotion locking are implemented locally. No production migration or deployment has been performed.

The integration additionally shares a locked neural promotion/rollback gate between Root and customers, requires rollback snapshots for new promotions, and records monotonic rollback versions/audit events. Explicit rollback APIs and compatibility limits are documented in the integration review; the original broader source-code release/registry roadmap below remains future work.

**Decision:** Root SOMAS improves the SOMAS platform. Customer SOMAS instances improve the software/business application the customer requested. Both use the same `planEvolution()` engine, three core roles, independent policy shapes, dynamic specialist selection, and the same four evolution kinds.

## Implemented contracts

| Function | Purpose | Permission | Output and failure |
| --- | --- | --- | --- |
| `rootDescriptor()` | Stable Root mission and scope | Internal-only | Root instance identity; no tenant context |
| `customerDescriptor(ownedProject)` | Derive customer instance mission from saved project purpose | Caller proves ownership | Customer descriptor; fails if malformed/owner context absent |
| `validateUnit(unit)` | Reject malformed or scope-escalated unit descriptors | Deterministic boundary | Validated unit or boundary error |
| `targetFor(unit)` | Server-derived target of evolution | Both | Platform or customer-application target |
| `authorizeEvolution(unit, target?)` | Reject cross-scope suggestions | Both | Target or `cross_scope_evolution_forbidden` |
| `planEvolution(unit, instruction, options)` | **Shared Root and Customer planner**; dynamic specialists and explicit bounded workflow | Scoped and authenticated by caller | Proposal-only plan; rejects unauthorized target, invalid type or input |
| `permissionsFor(unit)` | State immutable least-privilege limits | Both | Never unrestricted deployment, secrets or child provisioning |
| `ensureRootUnit(sql)` | Initialize Root state/core neural policies once | Only in admin routes or server-internal | Existing weights untouched; requires migration 003 |
| `ensureCustomerUnit(sql, ownedProject)` | Link project to an isolated child of Root | **Owned** project only | Mission-scoped customer unit |
| `rootAgents(sql)` | Fetch Root policy state | Admin only | Root agent records |
| `unitPlans(sql,unitId)` | View only specific unit's planning history | Root admin or verified project owner | Up to 40 proposals |
| `proposeScopedEvolution(sql,options)` | Save a plan, provision only selected missing specialist policies | Admin / project owner | Pending, nonexecuting proposal |
| `recordRootFeedback()` | Record Root role labels without changing weights | Admin only | Stored example; training false |
| `prepareRootCandidate()` | Evaluate proposed Root policy weights against holdout | Admin only | Candidate + evaluation; active policy unchanged |
| `promoteRootCandidate()` | Version-gated Root neural policy promotion | Admin only | Activated policy version or conflict/ineligibility |

Customer policy feedback/candidate/promotion uses the **existing customer `agents` and learning APIs**, sharing `newPolicy()` and `prepareCandidate()`. Root policy state lives in a separate `somas_root_agents` table; this avoids duplicating or overwriting existing customer neural weights.

## New APIs

- `GET /api/admin/root/view`: platform-operator-only Root dashboard, with authorization by `ADMIN_USER_ID`.
- `GET /api/admin/root`: Root mission, agents, permission summary, proposed changes.
- `POST /api/admin/root/evolution`: `{message,changeKind}` creates Root service evolution plan. Never modifies production software.
- `POST /api/admin/root/agents/:id/feedback`: `{input,label}` store verified/admin-reviewed example.
- `POST /api/admin/root/agents/:id/train`: propose candidate based on Root labels.
- `POST /api/admin/root/policies/:id/promote`: promote independently evaluated policy candidate.
- `GET /api/projects/:projectId/unit`: project-owner-only customer unit mission, agents, plans.
- `POST /api/projects/:projectId/unit/evolution`: `{message,changeKind}` proposes customer application evolution.
- On project creation, provision a customer unit under Root automatically.

All POST requests use existing `checkMutationOrigin()` and must have a valid session. All customer project routes use `requireProject()` and `allowedSubscription()` (where appropriate). All Root routes require `user.id === env.ADMIN_USER_ID`.

## Security and limitations

1. **Mission is not delegated authority.** The planner cannot modify another tenant or platform by requesting a different target.
2. **Root is not an all-powerful customer admin.** Root planning operates on SOMAS service infrastructure, not arbitrary customer data. Platform admin support capabilities are separately audited.
3. **No self-deployment is implemented.** `planEvolution()` creates a validated plan and specialist policies, not real code, a cloud deployment, a browser test or a neural-model change.
4. **Neural policy updates require evaluation and explicit authorization**; a plan cannot promote itself.
5. Root operator must not be an arbitrary project owner; `ADMIN_USER_ID` must be protected.
6. `db/003_recursive_units.sql` is additive. It needs to be run before deploying code which calls new instance routes or creates projects.
7. **No unmanaged instance recursion:** new customer units can only be created from owned projects and are children of the singleton Root.
8. `createCustomerUnit()` relies on the verified owned-project object from API. Future RLS and DB-level tenant consistency constraints should be added before production scale.
9. Do not alter Codex's recently fixed Cloudflare PBKDF2 hashing and safe registration logging when merging this extension.

## Follow-up phases (not implemented here)

1. Replace simple keyword planning with a robust manager-generated organization graph and task DAG, evaluated for quality and cost.
2. Implement real isolated coding/build/testing workers; integrate source repos, staging and database migrations.
3. Implement a capability gateway with scoped read/write tools and cost accounting at both Root and Customer levels.
4. Add browser-based Virtual Customer regression testing, permissioned external Research Somas and evidence-driven prioritization.
5. Add candidate releases for application code, Root code, organization and neural policies with rollout/rollback.
6. Add durable asynchronous jobs and recovery, security hardening, billing controls and observability.

## Apply to your Windows SOMAS v2 repository

**Your Windows repo has newer Codex changes not present in the reference alpha.** Do not overwrite your repository with this reference archive. Use the `SOMAS_v2_Root_Customer_Mission_Patch.diff` file and apply it to a fresh Git branch from `somas-v2`. Inspect any context conflicts with Codex, especially `src/index.js` and `public/manage.js`. Keep all auth fixes, tests, and lockfile from the currently deployed project.

Steps:

```powershell
cd D:\work\somas
git switch somas-v2
git pull --ff-only
git switch -c feature/recursive-somas-missions
# Copy patch file into D:\work\somas, then:
git apply --check .\SOMAS_v2_Root_Customer_Mission_Patch.diff
git apply .\SOMAS_v2_Root_Customer_Mission_Patch.diff
# If context fails, have Codex integrate the diff manually, keeping the new auth code.
npm.cmd run check
node --test tests/somas-core.test.js
```

Before deployment: inspect migration 003, back up Neon, run the migration in the correct Neon branch/database, run all tests, verify auth and tenant isolation, and explicitly approve deployment. Do **not** auto-deploy from this patch.
