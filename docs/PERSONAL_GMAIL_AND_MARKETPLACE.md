# Personal Gmail and marketplace-inspired panels — 6.2

## Administrator Gmail

- An accepted administrator signs in normally and opens Admin panel → My Gmail.
- Connect my Gmail starts Google's OAuth flow with OpenID/email identity and Gmail send-only permission. It does not request Calendar permission or send an email.
- The Google account may differ from the administrator's SOMAS sign-in email. Google must confirm its verified identity; entering an arbitrary sender email cannot authorize it.
- Refresh tokens are encrypted server-side with the existing GOOGLE_CREDENTIAL_ENCRYPTION_KEY. Browsers receive connection status/email, never credentials. Different administrators have separate records.
- An administrator can only use their own personal connection. A campaign's sender is fixed at creation. Switching to another Google identity requires a new campaign; existing ones cannot silently switch sender.
- The shared Owner Gmail option preserves the preexisting administrator broadcast capability. Owner Gmail continues to send account verification, invitation and booking mail. Personal connections are for document broadcasts only.
- Revoked/demoted or disabled staff cannot send. Disconnect requires the administrator's SOMAS password, deletes their saved personal connection, and pauses their queued campaigns. It does not revoke the owner's separate integration. An in-flight email cannot be recalled. Google Account permissions can also be revoked directly at Google.

## Required owner setup

Apply `db/010_admin_gmail.sql` after migrations 004 through 009. Do not recreate the database.

In Google Cloud / Google Auth Platform → Clients → the existing Web application client → Authorized redirect URIs, add:

`https://somas-cloudflare-neon.somas.workers.dev/api/admin/gmail/callback`

Use the actual deployed domain if it differs. Keep the original `/api/owner/google/callback` URI. The two connections are independent. My Gmail displays the exact callback for the current host.

Keep the existing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_CREDENTIAL_ENCRYPTION_KEY. Never commit those values. No new secret is introduced. A different or newly reset encryption key cannot decrypt existing saved credentials.

Enable Gmail API in the Google Cloud project associated with that OAuth client. While the app is in Testing, add each administrator's Google account under Audience → Test users. Public access may require completing Google's applicable consent and verification process. This code does not override Google's restrictions, quotas or app review requirements.

## Broadcast behavior

The simplified workflow remains: select a document, choose sender, enter subject and body, click Broadcast. A valid document is analyzed and deduplicated, a sender-bound snapshot is saved and sending starts. The full recipient list and state remain available in progress/history. Recipients need no SOMAS account or verification.

New campaigns select personal Gmail by default when connected; otherwise they show owner Gmail. A disconnected option is disabled. Historic campaigns without sender fields continue to use the owner.

Application caps apply separately to each sender connection. Google may impose lower limits shared with that Gmail account's other traffic. Accepted means Gmail accepted the request, not inbox delivery. Unknown outcomes pause and are not automatically retried. The browser must stay open for subsequent processing; closing it leaves remaining recipients saved for resume.

Specific safe errors distinguish reconnect-required, API-not-enabled, permission-denied and rate-limit problems. Raw provider bodies, tokens and secrets are not exposed.

## Template and panels

The design takes cues from Alibaba's dense but organized account/management experience, without copying Alibaba branding or adding commerce features. SOMAS retains its own logo and concept purpose.

- Global light theme: neutral background, white surfaces, warm orange primary actions, functional section search and responsive navigation.
- Home: a visual introductory panel linking the two ideas; existing agent/team/network concept demos remain available below.
- My SOMAS: personalized welcome, account state, real meeting and access-request counts, profile/meetings/Manager shortcuts.
- Admin: a left section menu, searchable real-record tables, dedicated My Gmail, and an uncluttered Broadcast form.
- The recruitment dialog no longer opens automatically over account, owner, booking, unsubscribe or moderation work. The Join SOMAS button remains available.
- AI, training and blockchain visuals remain simulations. Real account and communication data are separate.

## Verification limits

Tests use isolated PostgreSQL in WASM through a Neon HTTP adapter. Google OAuth and Gmail responses are mocked, with tests for browser state, PKCE, ownership, replay rejection, encrypted tokens, sender isolation and disconnect behavior. No real credentials were entered or emails sent. Browser QA used sample fixture accounts against an isolated local database. Production Neon, live Google consent and inbox delivery require the owner setup and a controlled test after deployment.

Design reference: https://buyer.alibaba.com/
OAuth reference: https://developers.google.com/identity/protocols/oauth2/web-server
