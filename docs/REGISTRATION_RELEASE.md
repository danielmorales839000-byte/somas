# Registration hotfix release preparation

> This guide describes the auth-only hotfix. The current working tree also contains the Root/Customer Mission feature, which **requires reviewed migration 003 before deployment**. Do not use the auth-only staging/deployment commands to publish the combined tree; follow `ROOT_CUSTOMER_INTEGRATION_REVIEW.md` and wait for explicit approval.

The owner confirmed the production exception from Cloudflare live logs:

```text
Pbkdf2 failed: iteration counts above 100000 are not supported (requested 120000).
```

## Scope and compatibility

New registration calls `hashPassword`, which derives and records exactly 100,000 PBKDF2-HMAC-SHA256 iterations with a fresh random 16-byte salt. The stored format remains `pbkdf2-sha256$iterations$salt$digest`. No production password/session/workspace records are rewritten, and no database migration or secret change is needed. Existing cookie/session and tenant ownership behavior is preserved.

Verification reads the recorded work factor. Legacy 120,000 hashes work in runtimes supporting that factor, but the confirmed hosted cap makes them unsupported on this deployment. The verifier does not retry with fewer iterations: it returns safe 503 `password_hash_runtime_unsupported`. Do not edit the stored iteration field, reset a database, or claim all existing hashes can log in on the capped host. If such accounts exist, an explicitly approved compatible verifier or verified recovery process is a separate prerequisite for their login. Existing valid sessions are not invalidated by this patch.

The cap-compatible work factor is below modern password-storage guidance. Before public launch, plan a reviewed stronger hosted-compatible KDF or managed authentication solution, a versioned hash format with proven legacy compatibility, upgrade only after successful password verification, and tested recovery. Add bounded distributed signup/login throttling before hashing, per-identity/IP controls, generic credential failures, and negative/concurrency tests. Also retain email verification, MFA, RLS and recovery as launch gates. No custom multi-pass KDF or additional paid service is introduced by this hotfix.

## Review, commit and push (PowerShell, Node 22)

Release-preparation validation: **27 tests passed, zero failed/skipped**, including actual workerd and disposable local PostgreSQL; configured JavaScript syntax checks passed. Wrangler dry run passed with four assets and a 259.10 KiB JavaScript bundle (70.82 KiB gzip). The separate optional browser suite reported **two skips** without a test-site URL. Hosted post-deployment checks are still pending. No migration, production secret change, commit, push or deployment was performed during this preparation.

The commands below are instructions for the owner; no commit, push or deployment is performed by release preparation. A push can trigger an existing connected Cloudflare build. Before pushing, pause automatic production deployment if it is enabled, so publication still requires explicit approval.

```powershell
git switch somas-v2
git status --short
git diff --check
git diff
npm ci
npm run check
npx wrangler deploy --dry-run --outdir .wrangler/registration-build
git add README.md docs/DEPLOYMENT_AND_SECURITY.md docs/FUNCTION_CONTRACTS.md docs/REGISTRATION_DIAGNOSIS.md docs/REGISTRATION_RELEASE.md package.json package-lock.json public/app.js public/manage.js src/auth.js src/index.js src/errors.js scripts/check-database.mjs tests/auth.test.js tests/diagnostics.test.js tests/helpers/neon-fixture.js tests/postgres.test.js tests/registration.test.js tests/worker-runtime.test.js
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "Fix SOMAS v2 registration for Cloudflare PBKDF2 limit"
git push origin somas-v2
```

Never stage `.dev.vars`, `.env`, logs or provider credentials. The example connection strings in fixtures are disposable test values, not live secrets. The opt-in PostgreSQL case skips unless `SOMAS_TEST_DATABASE_URL` points at a disposable loopback server with CREATEDB privileges; never use production for that test. On Windows actual workerd tests require Microsoft's Visual C++ runtime.

## Deploy only after explicit approval

Confirm the intended tested commit, existing `somas-v2` Worker and runtime `DATABASE_URL` secret. Keep LLM/research/billing settings unchanged. Do not apply SQL, change a secret or buy a plan for this release.

```powershell
git switch somas-v2
git status --short
git rev-parse HEAD
npm ci
npm run check
npx wrangler deploy --dry-run --outdir .wrangler/registration-build
# STOP here until the owner explicitly approves production deployment.
# After approval only:
npm run deploy
```

Record the deployed version/commit. Keep the previous version ID for an explicitly approved rollback; reverting to it would restore the original registration defect. No Worker/database is recreated. Backend operation does not depend on the Windows PC remaining on.

## Post-deployment acceptance (pending)

1. Read `https://somas-v2.somas.workers.dev/health`: expect 200. This proves liveness/config presence only.
2. Run `npm run diagnose:database` with the Neon connection configured privately in the administrative shell as described in `REGISTRATION_DIAGNOSIS.md`. It performs read-only connectivity/required-auth-column checks and does not prove write permissions. Remove the temporary shell variable afterward.
3. Open Cloudflare live logs or `npx wrangler tail somas-v2 --format=json --status error`.
4. Through the production browser form, register a new disposable identity you control. Expect POST `/api/auth/register` JSON 201 and entry into its workspace. Confirm no PBKDF2-cap exception.
5. Check session cookie attributes: HttpOnly, Secure, SameSite=Strict, Path=/, no Domain override. Refresh: `/api/me` should return 200. The cookie must never appear in a shared report.
6. Log out: `/api/me` should return 401. Log back in with the correct password: 200 and a new valid session. A wrong password must return generic 401. Test a legacy hash only with an explicitly authorized test account and record the known 120,000 limitation separately.
7. Successful registration plus authenticated refresh proves application writes/readback. If needed, privately inspect the new user's hash-prefix/work factor and related workspace/subscription/session expiry in Neon SQL Editor; never copy full hashes/tokens into reports. Avoid bulk exporting account data.
8. Create one project; confirm Manager, Assistant and Virtual Customer and the owner-only `/s/:slug/manage` panel. Use a second test identity for cross-tenant denial checks.
9. Record actual HTTP statuses, tested commit/time and safe request references. If failures remain, use the structured log `stage`/`code`; never share raw exceptions containing credentials.

Do not call the release successful until registration, login, session persistence and Neon connectivity have actually passed on the deployed Worker. The browser suite's two optional skipped tests do not establish hosted acceptance.
