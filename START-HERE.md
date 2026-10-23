# SOMAS Showcase v1 — fresh project

This replaces the product experience with a public, lightweight idea showcase. It does not depend on your old project, Neon, Gmail authorization, AI keys, or user accounts.

## What is included

- Keyword-led presentation of self-organizing AI teams and the proposed blockchain network.
- Interactive, clearly labeled illustrative team simulation.
- Both supplied YouTube films, loaded only after a click; direct YouTube fallback links.
- Email + opinion form, no visitor account and no verification code.
- Durable Cloudflare D1 feedback storage, spam controls, and an owner inbox at `/owner`.
- Owner JSON export, email reply links, and deletion.
- Responsive CSS, privacy notice, keyboard support, reduced-motion support.

Form submissions appear in the owner inbox. This version does NOT automatically forward them to Gmail. The separate “email the founder” link opens a visitor's email application and lets them send directly to williamkevin999999@gmail.com.

## 1. Keep the old project safe

Extract this ZIP into a NEW folder, for example `D:\work\somas-showcase`. Do not copy it on top of the old application. Use a new GitHub repository called `somas-showcase` for the cleanest start. You can choose a different repository name; the Worker name remains `somas-showcase` unless you change wrangler.jsonc.

## 2. Install and sign into Cloudflare

Use Node.js 22 or newer. In Windows Command Prompt:

```bat
cd /d D:\work\somas-showcase
npm ci
npx wrangler login --device --browser=false
```

Already signed in? You can skip login. Check with `npx wrangler whoami`.

## 3. Create feedback storage once

```bat
npm run setup
```

This creates `somas-showcase-feedback`, inserts the real database ID into `wrangler.jsonc`, and creates its tables. If a database with that name already exists, use `npx wrangler d1 list`, copy its UUID into `wrangler.jsonc`, and rerun setup. Do not delete a database to retry.

Manual alternative:

```bat
npx wrangler d1 create somas-showcase-feedback
```

Copy the returned database UUID into `database_id` in `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`. Then run:

```bat
npx wrangler d1 execute somas-showcase-feedback --remote --file=schema.sql
```

## 4. Protect the owner inbox

```bat
npx wrangler secret put ADMIN_PASSWORD
```

At the hidden prompt, enter a unique random password with at least 20 characters (ASCII recommended). Save it in your password manager. If Wrangler asks to create the new Worker, answer yes. Never put the password in source code or GitHub. This is an OWNER password only, not visitor authentication.

## 5. Verify and deploy once

```bat
npm run build
npm test
npm run deploy
```

Wrangler prints the live address. Open it, submit a test opinion, then open `<your-live-address>/owner`.

Browser owner sign-in:
- Username: `owner`
- Password: the ADMIN_PASSWORD you entered.

The browser remembers Basic authentication until the browser session ends. Use a private window on shared computers and close the whole private session afterward. `/owner` is never linked publicly. Owner data is not cached.

## 6. Push to GitHub

Create an empty GitHub repository, then use its actual URL:

```bat
git init
git add .
git commit -m "Launch fresh SOMAS concept showcase"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/somas-showcase.git
git push -u origin main
```

The database UUID is configuration, not a secret; commit the updated `wrangler.jsonc`. Do not commit `.dev.vars`, `.env`, passwords, or API tokens.

## 7. Turn on automatic deployments from GitHub

In Cloudflare dashboard:
1. Workers & Pages → `somas-showcase` → Settings → Builds.
2. Connect your GitHub repository and choose `main`.
3. Root directory: repository root.
4. Build command: `npm ci && npm run build && npm test`
5. Deploy command: `npx wrangler deploy`
6. Save. Push another commit to verify an automatic deployment.

The selected Worker name must match `name` in `wrangler.jsonc`. Keep the DB binding and ADMIN_PASSWORD on this same Worker. A GitHub push alone does not deploy until this connection is configured.

No GitHub Actions token is required for this Cloudflare Builds approach. Do not put Cloudflare credentials in the repository. Your existing SOMAS Worker remains separate; add the public domain to this new Worker when you are ready to switch.

## Local full-stack development

Create an ignored `.dev.vars` file containing a development-only `ADMIN_PASSWORD` of at least 20 characters, then:

```bat
npx wrangler d1 execute somas-showcase-feedback --local --file=schema.sql
npm run dev
```

Local data and production data are separate. Opening `public/index.html` directly cannot submit feedback because it needs the Worker API.

## Maintenance

Review feedback at `/owner`, export before bulk changes, and delete messages when no longer needed. The stated retention target is 12 months; this version requires the owner to perform that cleanup. Rate-limit hashes older than the current UTC day are removed on successful submissions. Rate limiting is deliberately conservative (5 attempts per IP/day); shared networks may reach the limit, so the direct email alternative stays visible. For substantial public traffic, add Cloudflare rate limiting or Turnstile according to your abuse profile.

## Validation and limits

Node syntax/build checks and 12 backend tests pass. Desktop browser layout and scenario switching checked. Production D1 writes require completing your Cloudflare setup; they were not performed against your account here. Video IDs are preserved exactly as provided; embedding availability depends on YouTube. This is a concept presentation, not an implemented autonomous organization or blockchain.
