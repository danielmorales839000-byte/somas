# SOMAS 6.0.1 — Import Contacts and Broadcasts

This release restores the requested features into the existing 5.2 project. The animated Root team, random Network simulation, accounts, community, private conversations, roles and calendar remain. No provider AI execution is added.

## Before deployment

1. Preserve your existing `.git` directory and private environment files when copying this full project into `somas`.
2. In Neon SQL Editor, select the SAME database used by the Cloudflare Worker's `DATABASE_URL`. Apply the entire `db/008_import_broadcast.sql`. It is additive and repeatable, and does not create auth users from imported emails. Existing installations must already have 004/005/006 and 007 for contact conversations. Fresh installations apply 004 through 008 in order. No production migration was performed here.
3. Run `npm ci` and `npm run check` from your `somas` folder.
4. Review changes, then push when ready. Pushing to your connected `main` branch triggers Cloudflare deployment; no push or production deploy was done here.
5. Sign in as owner or administrator → To admin panel → Imported Contacts / Broadcasts. Assistors may preview imports and draft broadcasts but cannot commit, approve or send.

## Import Contacts

Select DOCX, CSV or UTF-8 TXT → declare source → Preview document → inspect counts and masked addresses → confirm review-only storage → Save review-only import.

Limits: 2 MB input, 2 MB document XML, 8 MB total archive expansion, 2,000 archive entries and 1,000 unique normalized addresses. Encrypted/macro archives are rejected; links and document contents are never executed. A 10-minute encrypted token binds the preview to its author. Preview has no persistent data side effects. Commit deduplicates by keyed identity and records an audit event. Address ciphertext remains server-side. The table supports source filtering and pagination; validation-summary export contains counts only.

Imported addresses NEVER become registered users, verified identities or subscribers. All sources remain unproven, including files labeled self-subscribed. External consent-proof ingestion is not implemented. Real users must sign up, verify their email and opt in themselves.

Original document bytes are not saved. Contacts expire from listings after 30 days; administrators must use Purge expired reports to remove their underlying rows. There is no scheduled retention job.

## In-app Broadcasts

Save unsent draft → review message and audience → Approve recipient snapshot → type the campaign name → Broadcast to approved recipients. Only real verified active, unsuspended accounts are eligible. Imports and synthetic exhibition identities are not audience sources. Each recipient gets one durable announcement, visible in Account settings. Repeating a request does not duplicate announcements.

## Gmail email broadcasts

External sending is OFF in the shipped `wrangler.jsonc`: `BROADCAST_EMAIL_ENABLED=false`. Imports, preferences, drafts, previews, approvals and in-app announcements work without enabling it.

Required existing secrets: `DATABASE_URL`, `ADMIN_USER_ID`, `OTP_HMAC_KEY`, `GOOGLE_CREDENTIAL_ENCRYPTION_KEY`. Email also requires the existing OAuth Client ID/Secret, authorized owner Gmail integration and `SOMAS_OWNER_EMAIL`. Do not put secret values into Git. Keep the identity/encryption keys stable; changing them requires a planned migration.

Before enabling email, verify the sender connection under Owner settings and review your real subscribers. Change `BROADCAST_EMAIL_ENABLED` to `true` only when you choose to enable external sends, then deploy that configuration. `CONTACT_IMPORT_ENABLED` and `BROADCAST_ENABLED` are already true.

Each real verified user opts in under Account settings → Updates & announcements. Only that user can record their subscription consent. Suppressed, unsubscribed, restricted and unverified addresses are excluded.

Compose email draft → review → approve fixed recipient identities → optionally explicitly confirm Send test to owner only → type campaign name → enqueue. Process next email handles one durable job per click. There is no background scheduler, automatic mass dispatch or automatic retry. The conservative global ceiling is five processing attempts per minute and 25 per UTC day; these are application limits, not claims about Google quotas.

Eligibility is checked at review, enqueue and immediately before dispatch. New subscribers after approval are not added to that campaign. Individual envelopes protect recipient addresses; unsubscribe and one-click headers are included. Signed unsubscribe links immediately suppress pending update jobs. Users may explicitly opt back in; admins cannot subscribe someone on their behalf.

`accepted` means Gmail API acceptance, NOT inbox delivery. No mailbox reading, bounce/complaint ingestion or open tracking is configured. An uncertain provider/network response pauses the campaign and is not retried. Process crashes can leave a `sending` record requiring operator reconciliation; there is no unsafe reclaim/resend endpoint. Cancellation stops pending jobs and cannot recall an already sending message.

## Verification and scope

Full check: 89 tests passed, one existing optional test skipped. Actual PostgreSQL SQL executed locally through PGlite and Neon HTTP fixtures; no hosted Neon credentials used. Tests cover migration reapplication, 115-address synthetic DOCX, bounded unsafe input, no account/subscription creation, repeated imports, role/CSRF gates, consent, unsubscribe, snapshots, private/idempotent announcements, disabled/revoked sender, mocked individual Gmail acceptance, no duplicate processing and ambiguous-send pause. A compiled Cloudflare runtime test parses the DOCX fixture.

Browser: restored tabs and draft/preview/approval/in-app send flow inspected using disposable accounts; phone Broadcasts layout checked at 375px with no horizontal overflow. DOCX upload is verified at API and compiled-runtime levels, not with a completed browser file chooser. The actual GitHub-address DOCX named in the design was not available for this rebuild; the included 115-address test fixture uses example.test only.

Not implemented: scheduled campaigns, automatic background delivery, editable draft revisions, external contact consent-proof validation, bounce ingestion and full-address reveal. These capabilities are not presented as operational. Existing login credentials are unchanged; this release does not reset an owner password.

No real emails were sent and no production deployment/data modification occurred.
