# SOMAS v2 — Integrating Root/Customer Mission Symmetry

> Reference instructions from the supplied kit. The patch has now been merged into the current working tree while preserving staged auth fixes; do not apply it again or follow the commit/stash/push/deploy steps without approval. The actual migration review and verification are in `ROOT_CUSTOMER_INTEGRATION_REVIEW.md`.

**Goal:** Preserve your live v2 + Codex registration fix while adding a shared Root/Customer SOMAS engine.

## What this patch is and isn't

It is a tested, **additive architectural implementation**, based on the available SOMAS v2 alpha snapshot. Your latest repo has more recent authentication and diagnostic changes, which this environment cannot access. It is NOT a replacement repository and was NOT deployed. Apply through Codex or a Git branch and review the merge.

New features: shared planning core (`src/somas-core.js`), Neon persistence (`src/somas-units.js`, `db/003_recursive_units.sql`), Root administrator interface (`GET /api/admin/root/view`), Root training/policy candidate endpoints, project-owned instance missions and owner evolution interface, tests, specification.

Crucially, `planEvolution` **creates proposals only**. It does NOT generate code, browse websites, deploy applications, or run self-training autonomously. Code execution requires an isolated development runner. Neural changes require human-verified feedback, candidate evaluation and promotion.

## Safe Windows integration

1. Ensure there are no important uncommitted changes (run `git status`). Commit or stash them separately before applying anything.
2. Stop/disable any automatic production deployment connected to GitHub.
3. Use a feature branch from `somas-v2`, **not production directly**.
4. Put `SOMAS_v2_Root_Customer_Mission_Patch.diff` in the local repo root.
5. Verify patch before applying:

```powershell
cd D:\work\somas
git switch somas-v2
git pull --ff-only
git switch -c feature/somas-root-customer-missions
git apply --check .\SOMAS_v2_Root_Customer_Mission_Patch.diff
```

6. If `git apply --check` succeeds, run:

```powershell
git apply .\SOMAS_v2_Root_Customer_Mission_Patch.diff
npm.cmd ci
npm.cmd run check
node --test tests/somas-core.test.js tests/somas-units.test.js
git diff --check
```

7. If the patch conflicts with files changed by Codex (`src/index.js` is likely), **do not overwrite anything**. Ask Codex to merge the patch intelligently and preserve `src/auth.js`, `src/errors.js`, diagnostic logging and all new registration tests. Codex should run all 27+ previous tests AND the new tests, and check that the Worker bundling remains valid.

8. Confirm `ADMIN_USER_ID` is configured, otherwise Root routes correctly deny access. Do not expose an admin UUID publicly as an authorization token: the route also requires a valid matching authenticated session.
9. Back up your Neon database; inspect and apply `db/003_recursive_units.sql` in the *actual production branch/database* **before** deploying these changes. It is additive and keeps existing customer agent policies.
10. Verify the DB migration using read-only queries:

```sql
SELECT to_regclass('public.somas_units') AS units,
       to_regclass('public.somas_root_agents') AS root_agents,
       to_regclass('public.somas_evolution_proposals') AS evolution;
```

11. On staging, verify `GET /api/admin/root` for admin, 403 for nonadmin, and `GET /api/projects/:id/unit` for owner, 404 for other customers. Plan Root platform changes and customer application changes and verify distinct targets. Verify policies persist across requests. Check that changes remain *proposals*, not auto deployed.
12. Only after reviewing changes and giving deployment approval, commit/push and deploy using `npm.cmd run deploy`. Do not run production mutations until the migration and permissions have been checked.

## Codex prompt

> Read `docs/ROOT_CUSTOMER_SYMMETRY.md` and this integration guide. Merge `SOMAS_v2_Root_Customer_Mission_Patch.diff` into my current SOMAS v2 branch, preserving all existing Codex registration/PBKDF2 fixes and tests. The Root Manager must evolve the SOMAS platform; each customer Manager must evolve only its owner's application. Both must call the same `planEvolution` function and use independently persisted neural policies. Review the new Neon migration, ensure Root API requires `ADMIN_USER_ID` and authenticated session, verify project ownership for customer APIs, and test cross-tenant/mission denials. Do not alter production data, commit, push or deploy without my approval. Report what is implemented versus still only planned.
