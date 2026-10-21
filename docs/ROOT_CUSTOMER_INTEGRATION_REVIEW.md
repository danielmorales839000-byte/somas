# Root/Customer Mission integration review

Integrated into the current `somas-v2` working tree from `SOMAS_v2_Root_Customer_Mission_Patch.diff` and `reference_new_files/`. Existing staged registration/security changes were preserved. No branch switch, commit, push, production migration, secret change or deployment is performed. Original integration-kit files remain intact as review inputs; do not apply the diff again.

## Implemented behavior

- `src/somas-core.js` supplies the same `planEvolution` implementation for Root and customers: bounded dynamic specialists, Manager/Assistant/Virtual Customer, four change kinds and a common investigation/evaluation/authorization workflow.
- Root's fixed mission targets `somas_platform`; customer missions derive from the saved owner-requested project purpose and target `customer_application`. Caller instructions and neural policies cannot change target/authority. These are **plans only**, not implemented code or live deployments.
- Root APIs/dashboard require an authenticated session matching server-side `ADMIN_USER_ID`. Without it, signed-in users receive 403; signed-out users receive 401. This ID alone is not a bearer credential.
- Customer unit/evolution APIs reuse `requireProject`, workspace ownership, subscription/suspension checks, CSRF/Origin guards and durable planning quotas. Root admin status does not grant ownership of another customer's project.
- Root policies/examples/candidates are separate from canonical customer `agents`/learning tables. Both reuse `newPolicy`, `chooseTeam`, `prepareCandidate` and the holdout/manual promotion gate. Initializers use conflict-ignore inserts and never overwrite learned weights.
- `/api/admin/root/view` serves the operator panel; `/s/:slug/manage` includes the customer's mission/evolution form. Existing structured-site proposals and owner-approved releases remain available. There is no general source-code execution or self-deployment endpoint.

## Hardening beyond the reference patch

1. New project/core-policy/unit initialization occurs in a **single transaction**. Missing migration 003 fails without leaving a partially provisioned project. Existing accounts and sessions still work without 003.
2. Explicit API `target` claims are passed to the shared planner and rejected on cross-scope requests. Unit identity and Root mission are validated rather than accepted from request fields.
3. Customer plan reads filter authorized workspace ownership. The migration also rejects a customer's proposal whose `requested_by` is not its workspace owner.
4. PostgreSQL's nullable-CHECK loophole is closed by requiring a non-null customer parent and canonical `customer-<project-id>` identity. Unit identity/scope cannot later be changed.
5. A composite project/workspace foreign key prevents later project reassignment from leaving a mismatched unit. A unique supporting index is added to the existing projects table; no existing user or neural rows are rewritten.
6. Proposal triggers bind stored plan unit/kind/target/change-kind to its row and require proposal-only, human-approval, nonautomatic status flags. Ordinary foreign keys alone would not enforce these boundaries.
7. Both scopes use `src/policy-releases.js` for promotion and rollback. The gate locks the active agent, checks holdout/base version, requires a saved rollback snapshot, and writes audit/version metadata atomically. Competing candidates cannot both overwrite the same version. Ineligible/stale/foreign candidates fail closed.
8. Root planning has a bounded durable monthly quota. New validation/not-found/conflict responses preserve safe error categories; the operator UI also retains request-reference reporting.

### Explicit neural rollback

New training candidates store an independent copy of the previous active policy inside their private evaluation JSON. This adds no columns and does not rewrite existing candidates/weights. Existing candidates without a snapshot now return 409 on promotion and must be retrained; old active policies remain usable. Normal customer candidate listings omit snapshot bytes.

Authenticated, CSRF-protected POST routes are `/api/admin/root/policies/:candidateId/rollback` (operator only) and `/api/projects/:projectId/policies/:candidateId/rollback` (project owner only). Rollback restores the saved weights/bias/sample state only while that promoted candidate still matches the current active version; it records a new, higher version and an audit event. Duplicate/stale/foreign rollbacks fail. This is latest-promotion rollback, not an unrestricted historical policy registry. No automatic rollback or training is performed, and these API operations still require explicit human action.

## Preserved fixes

`src/auth.js`, `src/errors.js`, `scripts/check-database.mjs` and their existing auth/diagnostic tests are unchanged from the prepared registration fix. New registration still derives/records 100,000 PBKDF2 iterations. Legacy factors are never silently lowered. Hash/session/cookie semantics and safe registration-stage logging remain intact. The database checker still tests connection and **registration columns**, not migration 003 or all business-schema readiness.

## Migration 003 review and strategy

**This combined feature release requires `db/003_recursive_units.sql`; the auth hotfix by itself does not.** Apply only after 001 and 002. There is no automatic migration at Worker startup or during requests.

The migration creates five tables: units, Root agents, evolution proposals, Root learning examples and Root policy candidates. It adds a supporting projects index, constrained scope/ownership references, validation triggers and a singleton-Root index. Existing customer policies are not copied or reset. Existing projects are adopted lazily by their authenticated owner; new projects create their unit transactionally.

DDL runs inside a transaction with an advisory transaction lock, 5-second lock timeout and 30-second statement timeout. If locks/timeouts fail, the transaction rolls back; review availability and workload rather than retrying blindly. The supporting index can briefly block project writes. Pause writes for the approved maintenance window and take a verified Neon backup first. Test on a dedicated Neon branch/database before production. `IF NOT EXISTS` is not a schema-drift/version checker: inspect any pre-existing 003 tables/constraints, particularly if a different reference draft was applied previously.

After explicit approval for schema deployment, use Neon SQL Editor against the intended branch/database to run the reviewed 003 file. Do not drop tables, recreate the database or run an unrelated schema. Then verify read-only:

```sql
BEGIN READ ONLY;
SELECT to_regclass('public.somas_units'),
       to_regclass('public.somas_root_agents'),
       to_regclass('public.somas_evolution_proposals'),
       to_regclass('public.somas_root_learning_examples'),
       to_regclass('public.somas_root_policy_candidates');
SELECT conname FROM pg_constraint
WHERE conrelid='public.somas_units'::regclass ORDER BY conname;
COMMIT;
```

Do not remove these tables to roll back application code. An older application can leave the additive tables unused; preserve plans and policies for review. Actual hosted migration/recovery remains unverified.

## Local validation commands

PowerShell, Node 22, existing dependencies:

```powershell
npm ci
$env:SOMAS_TEST_DATABASE_URL='postgresql://LOCAL_TEST_ROLE:LOCAL_TEST_PASSWORD@127.0.0.1:5432/postgres'
npm run check
npx wrangler deploy --dry-run --outdir .wrangler/mission-build
npm run test:browser -- --reporter=line
git diff --check
```

Use only a disposable loopback PostgreSQL role with CREATEDB permission. Tests create/drop random `somas_test_*` databases. Without the variable, real SQL cases skip. Neon HTTP transport is simulated/adapted in local tests; passing is not a hosted Neon integration claim. Actual workerd tests require Microsoft Visual C++ runtime on Windows.

Integration tests cover 001/002→003 upgrade and repeated 003, password/policy preservation, missing-003 rollback, admin/owner/cross-tenant denial, cross-target requests, DB-level malformed scope/ownership/plan rejection, initializers preserving trained policies, independent Root/customer training, manual promotion/rollback with exact restored matrices and audit records, ineligible/stale/snapshot-less candidates and a real concurrent promotion race. Existing authentication, structured proposal/approval, safe diagnostic and actual Worker tests are also run.

Recorded results: **42 tests passed, zero failures/skips** with disposable local PostgreSQL 17.5 and actual workerd enabled. All configured JavaScript syntax checks passed. Wrangler deploy dry run passed with five static assets, 280.56 KiB JavaScript before compression (76.09 KiB gzip). The separate optional browser suite reported **two skips**, since no hosted test site was supplied. `git diff --check` passed. Auth/hash/error/checker files were compared against the pre-existing staged fixes and remain unchanged.

## Approval and hosted acceptance still pending

Do not commit, push or deploy until the owner approves. A push can trigger connected automatic deployment; coordinate/pause it before future publishing. Root/Customer plans cannot authorize their own execution or promotion.

After approval, migrate/verify the intended Neon test environment, configure `ADMIN_USER_ID` privately for the real operator account, deploy the tested Worker revision and verify registration/login/session plus Root operator and customer management paths. Test a second user, forged targets, plans remaining unexecuted, and policy persistence after a new request/deployment. `/health` is liveness only; retain the read-only database checker and safe request IDs.

Cost assumptions remain Cloudflare/Neon free-first, bounded plans/specialists, no paid model calls or always-on Windows backend. Stored rollback snapshots add bounded per-candidate storage; monitor retention deliberately. Hosted CPU/quotas, browser journeys, production migration and independent security audit remain unverified. RLS, abuse protection, stronger compatible hashing, email verification, isolated coding/browser runners, a full historical policy registry and real release execution remain future gates.
