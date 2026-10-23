# Deploy this SOMAS website to Cloudflare Workers + Neon

This is the current **SOMAS Vision** website, including its landing page, AI teams,
Root/subnet management, opinions, user management and guided project publishing.
It is not the unrelated SOMAS v2 repository. The existing ChatGPT Site is not
changed by these commands. Do not point the new Worker at v2's database schema.

## What is implemented and what is pending

Implemented: a standalone Cloudflare Worker entrypoint; Neon PostgreSQL schema,
prepared queries and transactions; email/password authentication; signup email
proof; password recovery; immutable owner bootstrap; deployment preflight;
health/readiness endpoints; hourly background work using the saved sender.

Ordinary login uses a password without emailing a code. New signups require an
8-digit code. Password recovery and privileged manager approvals separately
require email proof. Existing accounts migrated from the passwordless Site must
use **Reset password** once to establish a password. The owner can be provisioned
locally before a sender is connected; this does not mark the mailbox verified.

The database has been exercised in PostgreSQL (PGlite). Automated mail tests
simulate delivery; real Neon connectivity, external Cloudflare deployment,
source data transfer, custom-domain cutover and inbox delivery still need actual
account access and a full source backup. Do not call those steps complete yet.

## 1. Install and configure locally

Use Node.js 22.13+ and the package manager declared in package.json:

```text
corepack pnpm install --frozen-lockfile
```

Create a Neon project at https://console.neon.tech/ and an **empty database or
branch dedicated to this website**. Copy its connection URL, including the TLS
options. Do not use the database belonging to the other SOMAS v2 application.

Copy `deploy/cloudflare.env.example` to `.env.cloudflare` and fill it locally.
The file is ignored by Git. Never paste these values in a chat or commit them.
Generate each new encryption/runner secret using:

```text
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For migration, reuse the original **APP_DATA_KEY** and **SOMAS_ADMIN_USER_ID**.
Without the original key, encrypted model, Gmail and hosting connections cannot
be preserved; those connections need an explicit reconnection plan. Do not
silently replace the key or owner identity. Use an owner password of at least
12 characters. The configured owner mailbox is williamkevin999999@gmail.com.

## 2. Apply the PostgreSQL schema

```text
node --env-file=.env.cloudflare scripts/neon-migrate.mjs
```

This applies `db/postgres/*.sql` transactionally and records migration checksums.
It does not apply the SQLite Drizzle migrations to Neon or change the original
Site database. A checksum mismatch stops the operation.

## 3. Preserve existing data before cutover

Arrange a **complete** SQLite backup/export of the current Site's D1 database.
The bounded database viewer may truncate values and is not a lossless backup.
Do not import a truncated table dump. Keep the original Site operational while
testing a first copy; pause writes for the final consistent copy/cutover.

Given a complete `.sqlite` database, import to a freshly migrated empty Neon DB:

```text
node --env-file=.env.cloudflare scripts/import-d1.mjs /path/to/complete.sqlite
```

The importer preserves users, immutable IDs, projects, model connections,
opinions, Root/subnet records and hosting settings in one transaction. It refuses
nonempty destination tables. It discards old sessions, transient OAuth states,
codes and pending email requests, so users must log in again and request fresh
codes. Check row counts and representative projects before changing traffic.

Keep the same encryption key to read encrypted records. Imported Google OAuth
settings contain the old origin: update them in owner settings and add the new
callback URL to Google. Project publication `root_origin` and publication intent
origins also refer to the old site: review/update them for the final canonical
new origin, then republish the affected project Workers to update their signed
Root callbacks. Never claim old callbacks have moved merely because rows copied.

If no complete backup is available, stop the data cutover and obtain one. A new
empty deployment alone is not a migration of existing projects.

## 4. Provision owner access

After import, using the original owner ID (or a new immutable ID only for an
explicitly fresh installation):

```text
node --env-file=.env.cloudflare scripts/provision-owner.mjs
```

This creates the initial password only if none exists, and refuses to change an
existing password. It never verifies an inbox without proof. Delete the
SOMAS_OWNER_PASSWORD entry from the local environment file afterward.

## 5. Build, connect Cloudflare and publish

```text
corepack pnpm test
corepack pnpm run build:cloudflare
corepack pnpm exec wrangler login
node --env-file=.env.cloudflare scripts/deploy-independent.mjs
```

The new Worker is named **somas-cloudflare-neon**. The deploy script verifies the
Neon schema/owner, sends only the required server secrets over stdin to Wrangler,
and deploys `independent-dist/server/wrangler.json`. The owner password is never
uploaded. This Worker has no D1 binding or dependency on ChatGPT identity.

Wrangler prints the actual deployed `workers.dev` URL. Do not invent this URL.
Run `/healthz` and `/readyz` there. Health checks only Worker availability;
readiness additionally checks database connectivity and required configuration.

To attach your domain, open Cloudflare → Workers & Pages →
**somas-cloudflare-neon** → Settings → Domains & Routes. Set the final domain only
after migration and functional tests. A custom domain must already be in your
Cloudflare account; domain registration is a separate purchase.

## 6. Connect Gmail and verify end to end

Log in as the provisioned owner, then open `/?screen=email-setup`. Save your
Google sending app and connect the owner Gmail. Register this callback for the
**actual final origin**, including HTTPS:

```text
https://YOUR-FINAL-HOST/api/auth/oauth/google/callback
```

Verify the owner inbox. Create a new test user: request a fresh code, confirm it,
sign out, and confirm password login sends no new email. Submit an opinion and
check owner delivery and Reply-To. Test another user's project remains private.
Neither user Gmail passwords nor user SMTP credentials are required.

For temporary Google OAuth Testing status, authorization with gmail.send
normally expires after seven days. Complete production configuration and any
Google-required verification for ongoing use.

## Verification and rollback

Keep the original Site and its D1 database until the new deployment, data counts,
email delivery and project callbacks have been checked. No automated deletion or
DNS cutover is performed. If the new site fails acceptance, keep traffic on the
original while resolving the issue. Do not write to two databases after cutover.

Passwords use unique salts and PBKDF2-SHA256 at Workers' supported 100,000
iterations, with a 12-character minimum, per-IP/account/global rate limits,
HttpOnly Secure sessions, and same-origin checks. Never enable email-free
registration or trust client-supplied `oai-authenticated-*` headers; the standalone
entrypoint removes them before the session layer reconstructs identity.
