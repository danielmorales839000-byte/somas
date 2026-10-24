# SOMAS community and demo-only release

## Source and scope

This release continues the **complete, unpushed light exhibition** delivered previously, commit `2a2c671788c3218973ff49238f8056d4d19e538a`, in `lotsmanroman781-gif/somas`. The user explicitly selected that source rather than replacing it with the older GitHub deployment. Development branch: `feat/community-demo-only`.

The previous seven public pages, design-reference avatars, organization graph, eight customer examples, video gallery, contributor form, contact details, red demo notification and global share/feedback actions remain. Discussions adds an eighth navigation item, a seventh carousel destination, homepage genuine-content previews and an Idea-page invitation.

No production deployment, production data change, GitHub push or merge has been performed. The last live-site fetch was unavailable; verification uses the selected local source, its compiled Worker, and the browser preview.

## Real versus simulated

| Area | Behavior |
| --- | --- |
| Root organization, tasks, policy learning | Scripted browser-local demonstration, no AI calls or weights training |
| Customer projects and evolution | Branded concept previews on reserved `.example` addresses; no sites or domains are provisioned |
| SOMAS Network, blockchain and costs | Deterministic illustrative records; no blockchain connections or transactions |
| Community accounts and profiles | Real password/session authentication and separate public profile identities |
| Discussions, replies, votes, follows | Real persistent Neon records with server-side permissions |
| Notifications | Private database-backed reply/official-response inbox; manual refresh, no email or real-time push |
| Reports and moderation | Real restricted review and auditable state changes |
| Contributor/contact forms | Real private inquiry storage; no automatic account creation or email sending |
| Social sharing | Prepare/copy content or open a platform; users review and publish themselves |

Browser screenshots contain clearly marked **QA TEST** contributions and fictional QA profiles created through the local test workflow. These are not seeded in migrations or included as production community records.

## Operational AI removal — intentional compatibility change

Removed source modules: agent planning/execution, neural training and policy promotion, model gateways, external research, recursive operational units, billing hooks, project provisioning/release logic, execution runner, obsolete operational dashboard/scripts/styles, old dark command-center prototype and their dedicated tests/setup documents.

`src/database.js` now contains only database/account/session primitives. Registration creates no workspace, subscription, policy or agents. `src/index.js` contains no scheduled handler. `wrangler.jsonc` explicitly has an empty cron list and no AI/provider quota flags. Worker name `somas-v2`, Neon use and the `ASSETS` binding remain.

Legacy `/s/*` application routes and operational `/api/projects`, `/api/agents`, `/api/admin/root`, `/api/billing`, `/api/webhooks`, `/api/runner`, `/api/research`, `/api/learning` return 410. Other old execution endpoints have no handler. `/workspace.html` is a community-account alias. Existing operational customer websites and management panels are intentionally no longer served by this release.

**No existing database tables or rows are dropped.** Old project, billing and policy data remains in the existing database, but the new runtime never queries it. Historical migrations 001–003 and source remain in Git history rather than in fresh demo-only setup. No live Cloudflare secrets or schedules were modified; the new configuration takes effect only when the owner later publishes it.

## Community experience

- `/discussions/`: real empty/error/loading states; six categories; search; latest, active, upvoted and unanswered sorts; twenty-item pages.
- `/discussions/:id/`: public thread, paragraphs, safe http(s) links, chronological replies, thirty-item reply pages, upvote/follow controls, author editing/deletion and content reports.
- `/discussions/profiles/:id/`: display name, initials, optional public introduction, join date and up to twenty recent discussions/replies of each type. Public IDs are separate from private account IDs. Email is never automatically displayed.
- `/account/`: sign in/create account, edit public profile and private reply inbox. Existing account sessions and supported password hashes remain compatible.
- `/discussions/moderation/`: administrator-only reports, hidden/removed content, restrictions, suggestions and recent audit history. Pin/unpin, lock/unlock, hide/remove/restore, official marking, suggestion states and restrictions require a reason.
- `/join/`: contributor inquiry only. Never implicitly registers or authorizes a community account.
- `/submissions/`: existing private inquiry review using the same administrator identity.

Discussion titles: 4–140 characters; body: 20–10,000; replies: 2–5,000; display names: 2–50; introductions: up to 500; reports: 10–1,000; up to five restricted tags of 24 characters each. The request body additionally has an 18 KB byte ceiling.

Ordinary users cannot assign official badges or suggestion states, modify other authors, view reports/audits, or alter posting restrictions. Reserved team display names are protected for non-administrators. Editing official content removes its official flag pending renewed review. Locking pauses replies and edits; authors may still remove their own visible content. Deleted content is retained for moderator review/restoration.

## Migration and configuration

Use a development Neon database/branch first. Do not run tests against the production connection.

1. Back up or branch the intended database using your normal Neon workflow.
2. In the Neon SQL editor, apply the complete `db/004_public_submissions.sql` if not already applied.
3. Apply the complete `db/005_community.sql`.
4. Both scripts are additive/idempotent and can be reapplied. Migration 005 creates retained account/session tables when absent, community entities, constraints and indexes, and six valid categories. It does not seed users, posts, replies or votes.
5. Keep the existing Worker `DATABASE_URL` secret. Fresh setups supply it privately through Cloudflare settings or `.dev.vars` for local Wrangler.
6. Keep or set `ADMIN_USER_ID` to the actual private account ID of the owner. This is not the public profile ID or email.

For a fresh administrator account: register through `/account/`, then use the private Neon SQL editor to resolve its ID:

```sql
SELECT id FROM users WHERE email = 'YOUR_OWN_REGISTERED_EMAIL';
```

Set that returned ID as `ADMIN_USER_ID` in the intended Worker environment. Do not commit the value or database credentials. Existing configured administrators need no privilege change. There is no user-controlled admin checkbox or public admin-assignment endpoint.

For local development, copy `.dev.vars.example` to `.dev.vars`, fill its placeholders privately, then run `npm run dev`. Do not use the local QA server or its fixture sessions as a deployment server.

## Security and consistency

- Retains PBKDF2 password hashing and HttpOnly, SameSite=Strict session cookies; HTTPS cookies are Secure. Sessions store only token hashes.
- Every mutation requires the exact request Origin and `x-somas-request: 1`; bodies are bounded JSON. No cross-origin wildcard CORS is enabled.
- Queries are parameterized; category, sort, action and state values are validated.
- User content is rendered as text nodes/escaped text. Only parsed http(s) URLs become external links, with `noopener noreferrer nofollow ugc`. Arbitrary HTML is never executed.
- Public API projections omit email, private account IDs, session secrets and legacy private projects. Notification queries filter by recipient; reports, restrictions, audit and inquiries require administrator authority.
- Votes use unique database keys and an explicit desired active state. Repeated requests cannot add repeated votes. Counts are calculated from actual visible records.
- Reply creation, activity update and follower notification insertion share one statement. Moderator changes and their audit insertion share one statement. New discussion and author follow records use a transaction.
- Persistent hourly action quotas: registration 5/IP, login 30/IP, discussions 5/account, replies 30, votes 120, reports 10, profile edits 20, content edits 30, follow changes 60, moderation 120. Sign-in IP keys are salted hashes; no raw IP is stored in these counters. Inquiry limits retain their separate five/day policy.
- Honeypots, validation, quotas, reporting, soft deletion and restrictions provide initial abuse controls. They are not a complete anti-spam or identity-verification system.
- Error logs contain static error categories and request IDs, not messages, credentials or post content. No third-party tracking was introduced.

Initial scale bounds: public offsets stop at 10,000; notifications show the latest fifty and fan out to at most 1,000 followers per reply; moderator review returns up to 100 oldest open reports and fifty recent suggestions/audit/hidden rows. There is no expensive real-time infrastructure.

### Maintenance

No automatic maintenance job was added. Review operational retention and privacy requests, securely handle resolved inquiries, and periodically remove stale counters/sessions under your own policy:

```sql
DELETE FROM community_limits WHERE window_start < now() - interval '7 days';
DELETE FROM public_submission_limits WHERE day < current_date - 7;
DELETE FROM sessions WHERE expires_at < now() - interval '7 days';
```

Public content is soft-deleted; permanent removal and restoration of personal data require an administrator's deliberate retention process. The inquiry privacy page retains the goal of deleting resolved inquiries within twelve months. Existing legacy data cleanup is not part of this migration.

## Tests and browser evidence

Latest `npm run check`: **32 tests, 31 passed, 0 failed, 1 skipped**. The skipped native PostgreSQL inquiry-migration test requires a disposable loopback `SOMAS_TEST_DATABASE_URL`. All community SQL integration tests run without external credentials using an actual local PostgreSQL-WASM engine, adapted to the real Neon HTTP protocol. This verifies SQL syntax/constraints/transactions, not hosted Neon connectivity or concurrency performance.

Automated coverage includes guest browsing/auth gates, registration/session/logout, author creation/replies/edits/deletion, cross-author denial, idempotent voting and removal, safe public projections, search/filter/sort, notifications and private recipient scope, report deduplication, administrator-only moderation, lock/hide/restore, suggestion-state protection, restrictions and audit, quotas, long-thread/list pagination, oversize rejection, migration reapplication without record loss, and disabled operational routes. The compiled Worker is also exercised in Miniflare against the isolated SQL engine.

Browser inspection used the actual frontend and Worker handlers against the isolated SQL engine. Verified guest publish gating; discussion publishing; plain-text rendering of a script payload with zero inserted script elements; upvote; reply creation/editing; saved private report; administrator suggestion review with audit record; official team response; member's private notification, mark-read and profile save; search/filter/sort; dashboard carousel/preview; and retained Root zoom/fit/avatar loading. Desktop and 390×844 phone CSS viewport screenshots accompany this release. Phone testing uses an iframe viewport, not a physical device. Tablet CSS behavior remains inherited from the retained responsive design; no claim of full physical-device certification.

`npx wrangler deploy --dry-run`: passes, 51 public assets. `git diff --check`: clean. No application JavaScript error was observed in the inspected flows. The browser extension may emit unrelated metadata warnings.

## Mac import and review

The full source ZIP includes the complete updated repository source. **Extract to a clean folder; do not overlay it onto old files**, because an overlay can leave removed AI code behind. The Git bundle applies additions and deletions correctly and preserves the prior unpushed release history.

If your local Git repository contains the original `somas-v2` history:

```sh
cd /path/to/somas
git status
# If necessary, safely back up/stash your local edits before switching.
git bundle verify ~/Downloads/somas-community.bundle
git fetch ~/Downloads/somas-community.bundle feat/community-demo-only:feat/community-demo-only
git switch feat/community-demo-only
npm ci
npm run check
```

The bundle requires base `25c4b419dfabf442cbe1daea17a92696f1861cfc` and includes the two prior unpushed light-exhibition commits plus this community release. Keep `.dev.vars`/secrets private and out of Git.

When ready for GitHub review, push the feature branch and open a pull request targeting `somas-v2`. Do not merge into an automatically deployed branch until you decide to publish and the database migration/staging checks are complete. This session did not push anything.

## Deployment, only after owner approval

1. Apply and verify migrations on staging first.
2. Retain `DATABASE_URL`, configure `ADMIN_USER_ID`, and ensure the Worker identity stays `somas-v2`.
3. Run `npm ci`, `npm run check` and `npx wrangler deploy --dry-run`.
4. In staging, register a disposable normal account and use an owner account to verify post/reply/vote, ownership denial, report/moderation, private inquiry save, and notification scope against hosted Neon.
5. Review the intentional retirement of legacy `/s/*` sites and AI management before publishing.
6. After explicit approval, the existing GitHub-connected Cloudflare build can publish the selected deployment branch using `npx wrangler deploy`. This is a plain Worker/static-assets project, not Vite; no Vite build command is needed.
7. Confirm no AI cron remains active; the new config explicitly declares an empty list. Old external model secrets are unused by the source; cleanup is an optional separate owner operation.

No hosted Neon/Cloudflare account was modified here. Source rollback can restore the previous runtime if required, while keeping the additive community/inquiry tables intact for data preservation.

## Outstanding limitations

Hosted Neon migration/persistence and live production behavior still require the staging check above. No production load test or dedicated security audit is claimed. Email verification, password reset/recovery, email notifications, real-time push, attachments and rich HTML/Markdown editing are not part of this release. Very old password hashes that exceed hosted Workers' PBKDF2 limit fail clearly rather than silently reducing their strength; those accounts need an owner-managed recovery plan.

YouTube links and the supplied local film are preserved. The environment could not independently certify external YouTube streaming. The temporary local preview uses disposable SQL data; the QA-only session helpers are outside the repository and absent from the deployable Worker.
