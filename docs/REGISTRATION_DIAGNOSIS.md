# SOMAS v2 registration investigation — 21 October 2026

> Historical scope: the auth patch needs no schema change. The newly integrated Root/Customer Mission feature separately requires migration 003; see `ROOT_CUSTOMER_INTEGRATION_REVIEW.md` before any combined deployment.

## Architecture and implementation status

One Cloudflare Worker serves `public/`, API requests, public `/s/:slug` applications and owner-only `/s/:slug/manage` panels. The Neon serverless HTTPS driver accesses PostgreSQL. Users own workspaces; projects belong to workspaces, and project authorization joins workspace ownership. Each project persists separate Manager, Assistant and Virtual Customer policies. Specialists are created on demand. Model/payment credentials remain Worker secrets; heavy browser/coding/training jobs require a separate isolated runner.

| Feature | Status and verification |
|---|---|
| Registration, login, hashed sessions, workspace/free subscription | Implemented; tested with real local PostgreSQL and separately in workerd using a simulated Neon HTTP service |
| Project provisioning and three independent core policies | Implemented; persistent records checked in local PostgreSQL |
| Public site and embedded management | Implemented; request-level owner, guest and other-tenant checks passed locally |
| Structured proposal, approval and release | Implemented; local SQL test confirmed title changes only after owner approval |
| Independent neural heads and candidate holdout gate | Implemented alpha; unit tests passed; hosted promotion not tested |
| Virtual Customer | Static heuristics implemented; external Playwright runner provided; real browser journeys not run here |
| Research and optional LLM gateway | Source implemented, disabled by default; real providers unverified |
| Billing and admin controls | Source adapters implemented; merchant/sandbox integration unverified |
| Arbitrary coding, sandbox execution, automated customer domains | Not implemented; unsupported changes are recorded for engineering |
| RLS, email verification, auth abuse protection, neural rollback | Outstanding production gates |

## Complete registration trace

1. `public/app.js`: `authForm` calls `/api/auth/register` with email/password JSON, same-origin credentials and `x-somas-request: 1`.
2. `src/index.js`: checks Origin/custom CSRF header, constructs a Neon client, validates JSON/email.
3. `src/auth.js`: creates a random 16-byte salt and PBKDF2-HMAC-SHA256 256-bit password hash.
4. `src/database.js:createUser`: one transaction inserts `users`, `workspaces`, `subscriptions`.
5. `createSession`: inserts only the new token's SHA-256 hash in `sessions`, with seven-day expiry.
6. Response sets HttpOnly, SameSite=Strict, host-only session cookie, Secure on HTTPS; dashboard calls `/api/me`.

Bindings, hashing, the user/workspace transaction and session insertion are distinct failure points. Existing `001_initial.sql` and `002_operations.sql` match the tested registration/project queries. Session creation remains a separate write after the user transaction: a session failure can leave an account without a session. This existing boundary is now explicitly tested and classified; retry login after DB recovery. This patch changes no SQL writes or schema.

## Evidence: confirmed versus unverified

- **Observed:** production `GET https://somas-v2.somas.workers.dev/health` returned 200, `ok: true`, service `SOMAS v2`, `databaseConfigured: true`.
- **Limitation:** `/health` checks binding presence only. It never contacts Neon or checks schema/permissions.
- **Confirmed compatibility defect:** old registration requests 120,000 PBKDF2 iterations; hosted Workers have a documented 100,000 per-call cap. A cap-enforcing regression test reproduces failure before SQL writes. New 100,000 hashes pass and match standard Node PBKDF2 vectors.
- **Local difference:** installed local workerd accepts the original 120,000 call. Runtime tests alone cannot reproduce the hosted cap; the suite also explicitly models that cap.
- **Production cause confirmed by owner-provided live logs:** reproducing registration emitted `Pbkdf2 failed: iteration counts above 100000 are not supported (requested 120000).` This identifies password hashing as the failure before registration SQL writes. The owner collected the log; it was not independently retrieved by this local session. Hosted verification of the patch remains pending deployment approval.
- **Access:** Cloudflare CLI reports not authenticated. No production log stream, secret metadata/value, hosted Neon credential, production write or deployment was accessed. The earlier Cloudflare API timeout does not establish a Neon failure.

Primary sources: [Cloudflare runtime issue](https://github.com/cloudflare/workerd/issues/1346), [proposed cap increase](https://github.com/cloudflare/workerd/pull/7550). An open proposal is not evidence your deployed runtime supports it.

## Changes and security tradeoffs

- `src/auth.js`: named 100,000-iteration default, strict stored-hash shape, bounded password inputs. Existing hashes retain their recorded work factor; no hashes are rewritten. On a capped host, a legacy 120,000 hash returns safe `password_hash_runtime_unsupported` 503 rather than pretending the password is wrong. Such legacy verification passed in Node; hosted compatibility remains a limitation.
- **Work factor:** 100,000 is about 17% lower than 120,000, and below modern PBKDF2 guidance. This alpha compatibility fix does not certify public authentication security. Stronger hosted-compatible hashing and abuse controls require review before unrestricted signup. No custom KDF or paid service was introduced.
- `src/errors.js` and `src/index.js`: static safe failure classifications plus random request IDs. Unexpected-failure logs contain only ID, stage and safe code; no raw exception, SQL, email, password, token or URI. Expected validation/auth responses remain unchanged.
- `public/app.js`, `public/manage.js`: display safe request references for support correlation.
- `scripts/check-database.mjs`: administrative read-only connection and required-auth-column check. No DDL, data import or connection details in output. It does not prove write permissions or full business-schema readiness.
- Tests exercise hashing, safe diagnostics, actual driver/Worker behavior, real SQL transactions, owner isolation and approval. Added dev tools are not production imports; `package-lock.json` locks installed versions.

**Migrations required: none.** Existing installations still need both v2 scripts. Do not reset Neon, drop production tables or blindly apply scripts to a conflicting schema. Use a dedicated test database/branch for future migrations.

## Exact Windows checks

Install Node 22 and use PowerShell at the repository root on `somas-v2`:

```powershell
npm ci
npm run check
npx wrangler deploy --dry-run --outdir .wrangler/registration-build
```

On Windows, workerd requires the official Microsoft Visual C++ runtime. A process startup failure is not an application exception.

Optional real SQL integration uses only disposable **loopback** PostgreSQL with CREATEDB permission:

```powershell
$env:SOMAS_TEST_DATABASE_URL='postgresql://LOCAL_TEST_ROLE:LOCAL_TEST_PASSWORD@127.0.0.1:5432/postgres'
npm run check
Remove-Item Env:SOMAS_TEST_DATABASE_URL
```

The test creates/drops a random `somas_test_*` database, applies both scripts twice and executes real SQL. Its Neon HTTPS transport is locally adapted to PostgreSQL; hosted Neon DNS/TLS/permissions/quotas are not tested. Never supply a production/remote test URI.

Privately check a Neon **test** URL without placing it in shell history:

```powershell
$privateDatabaseUrl=Read-Host 'Neon test DATABASE_URL' -AsSecureString
$env:DATABASE_URL=[System.Net.NetworkCredential]::new('', $privateDatabaseUrl).Password
try { npm run diagnose:database } finally { Remove-Item Env:DATABASE_URL }
```

The standalone Node checker does not auto-load `.dev.vars`. Without a URL it deliberately exits safely with code 1. If required columns are missing, review the intended database and existing SQL scripts before applying anything.

## Production diagnostics if any failure remains after deployment

Dashboard → Workers & Pages → **somas-v2** → Settings → Variables and Secrets: confirm runtime secret `DATABASE_URL` exists; do not reveal or replace it speculatively. A build-only variable is insufficient. Open Observability/Logs live view and reproduce one registration with a disposable identity you control. Record timestamp, HTTP status and sanitized exception class/stage. Current unpatched raw logs may contain private information: redact URLs, parameters, emails, tokens and secrets before sharing.

Alternatively:

```powershell
npx wrangler login
npx wrangler secret list --name somas-v2
npx wrangler tail somas-v2 --format=json --status error
```

Secret listing shows names/metadata, not values. If the API times out, use Dashboard independently; never disable TLS or embed tokens in commands. Stop tail with Ctrl+C. After an approved patch deployment, correlate the UI request reference with `somas_request_failure` and its stage.

## Deploy only after explicit owner approval

No deployment is authorized or performed by this investigation. After reviewing the diff, tests and password/legacy tradeoff, the owner can approve the pinned `somas-v2` revision and run:

```powershell
npm ci
npm run check
npx wrangler deploy --dry-run --outdir .wrangler/registration-build
npm run deploy
```

Keep the existing Worker and secret. Do not run `secret put` without evidence and separate approval. No migration, paid plan, external AI key or always-on Windows process is required. After publication, verify browser registration/login/logout, secure cookies, project/core-agent creation, public and owner-management URLs, proposal approval and a second-tenant negative test. Green `/health` alone is insufficient.

## Verification and remaining gates

The investigation's initial clean install/check passed 26 tests. Release preparation adds an explicit capped-host legacy-hash test: the stored 120,000 factor must be attempted exactly once, rejected safely and never retried at a lower factor. Updated release results are recorded in `REGISTRATION_RELEASE.md`. Hosted Neon, production registration after this patch, deployment and real browser journeys remain unverified. No paid model/payment requests were made.

Cost remains free-first Cloudflare + Neon within quotas. Tests do not measure hosted hashing CPU, realistic concurrent load or abuse resistance. Existing gates remain: throttling, email verification, MFA, RLS, backup/restore drills, all-endpoint tenant coverage, migration locking/checksums, concurrency-safe project quota, robust neural promotion/rollback, isolated coding execution and merchant sandbox acceptance. Do not enable commercial billing or unrestricted public traffic based on this patch alone.
