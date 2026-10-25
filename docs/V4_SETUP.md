# SOMAS v4 — owner setup and rollout

This release preserves the v3 3D concept exhibition and adds real identity, staff access and Calendar integration code. AI execution and blockchain remain simulated. Google has NOT been connected or tested against the owner's real mailbox/calendar in this delivery. Automated tests use mocked Google HTTP responses and actual isolated PostgreSQL-WASM SQL.

## Before deployment

1. Back up the existing database. Apply `db/006_identity_calendar.sql` after existing 004 and 005 using your private Neon connection. This is additive; do not re-import the exhibition corpus.
2. Set deployment secrets below. The tracked Wrangler config enables `AUTH_V4_ENABLED=true`. Do not deploy it before the migration and owner bootstrap. Existing ordinary accounts will need to verify their email at their next login; their passwords and community history remain intact. Existing owner sessions are revoked by bootstrap.
3. Keep the owner email and IDs in private configuration. The release removes the owner email from public JavaScript/UI. Public contact still works through the inquiry form and Telegram.

## Private configuration

Use a private `.dev.vars` file for `wrangler dev`, or a private `.env.owner` file for setup scripts. Both must stay excluded from Git. Never paste secrets into chat.

- `DATABASE_URL`: existing Neon connection string.
- `ADMIN_USER_ID`: exact owner user ID. For a new database choose a long random ID. For an existing database use that account's current ID.
- `SOMAS_OWNER_EMAIL`: your intended owner Gmail address, server-side only.
- `SOMAS_OWNER_PASSWORD`: bootstrap-only password for a fresh install, 12–128 characters. Remove this variable after bootstrap. It is not needed as a runtime Worker secret.
- `OTP_HMAC_KEY`: random secret, at least 32 characters. Generate separately from encryption key.
- `GOOGLE_CREDENTIAL_ENCRYPTION_KEY`: exactly 64 hexadecimal characters (32 random bytes). Losing/changing it makes stored Google tokens unreadable; reconnect after rotation.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`: Google Web application OAuth credentials.
- `GOOGLE_OAUTH_REDIRECT_URI`: exact `https://YOUR_DOMAIN/api/owner/google/callback` registered with Google.
- `GOOGLE_CALENDAR_ID`: `primary` or a dedicated booking calendar that the authorized account can edit.

Generate each secret independently with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Run locally; do not publish its output.

Bootstrap owner once:

```
node --env-file=.env.owner scripts/bootstrap-owner.mjs
```

The CLI creates a fresh account only if none matches the configured identity; otherwise it requires the exact existing ID/email match. It sets the unique owner role, verifies that identity and revokes old owner sessions. There is no public owner registration or bootstrap endpoint. Store the bootstrap environment securely and remove the bootstrap password afterward.

Upload each runtime secret using `npx wrangler secret put NAME` and enter it at the private prompt. Do not use real values in committed `wrangler.jsonc`. `AUTH_V4_ENABLED=true` is a non-secret rollout setting. The existing seven-day opaque sessions remain hashed in the database and HttpOnly/SameSite protected; no JWT signing secret is required.

## Google Cloud

1. Create/select a Google Cloud project. Enable Gmail API and Google Calendar API.
2. Configure Google Auth Platform branding/audience. During testing, add the owner Gmail as a test user.
3. Create OAuth Client ID → Web application. Register the exact HTTPS callback above. Store client ID and secret privately.
4. The owner connection requests `openid`, `email`, `gmail.send`, `calendar.events`, and `calendar.freebusy`. These are not permission to read your inbox. Gmail sending is sensitive; review Google's production verification requirements. Testing-mode refresh credentials may expire and require reconnecting.
5. Sign into SOMAS with the bootstrapped owner password. Open `/owner/` → **Connect Gmail & Calendar**. Choose the configured owner account and authorize. A different Google identity is rejected. PKCE, a short-lived browser-bound state cookie and one-use database state protect the callback.
6. Return to Owner Settings. Choose booking timezone, weekdays, hours, duration, buffer and minimum notice. These are your business settings; they do not infer your location.
7. Click **Test connection**. The UI reports success only after Gmail accepts the test and Calendar responds. Check your actual mailbox. Provider acceptance does not guarantee inbox delivery.

Official references: [server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending), [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Acceptance before public rollout

Use disposable test addresses and calendar slots, with the owner's permission:

- Sign up, receive a code at the MEMBER's address, verify, sign out and sign in.
- Check wrong/expired/replayed codes and 60-second resend cooldown. A failed delivery must not create a session.
- Submit an assistor request; approve as administrator/owner. Sign in again. Suspend and verify prior sessions fail immediately.
- Submit an administrator request. Owner reauthenticates, receives step-up code and sends an invitation. Only the matching verified applicant can accept.
- Choose a slot, confirm using a verified member account and inspect My Meetings. Confirm the actual Google Calendar event and guest invite. Use .ics for other calendars.
- If video creation is pending, use **Check Google status**. Do not assume Meet is ready until its link appears.
- Cancel the test event; verify the remote event, local row and released time agree.
- Disconnect/revoke Google and confirm sending/booking fail clearly.

## Booking behavior and limits

Availability uses the configured owner timezone, notice, weekdays, hours and buffer, within 30 days. It exposes only free starts. Confirmation requires a verified SOMAS account (Google login is unnecessary). Slot holds and five-minute UTC grid cells are inserted atomically, preventing overlapping SOMAS bookings. Google is rechecked before creation. Other clients modifying the owner's Calendar can still race after that recheck; Google Calendar has no cross-system transaction with Neon.

Calendar insertion uses a stable external event ID and guest notices. If the request times out ambiguously, the record becomes `reconcile_pending`; it is NOT presented as confirmed and its cells stay held. Owner/staff or the guest can use Check Google status. A missing remote event does not automatically release an uncertain hold. Staff can review/cancel to release it. A database outage after Google success needs the same reconciliation. No unattended reconciliation job is installed.

Google Meet creation can be asynchronous; status refresh reads the event. Guests receive a private summary and .ics, plus a Google Calendar template link. Google controls invite delivery and calendar auto-appearance; neither is guaranteed. Rescheduling is the explicit cancel-then-book workflow, not an atomic remote move. Working-hours changes can affect available starts; existing bookings are retained.

## Scope boundaries

- Persistent Simulation Managers are authenticated and ownership-scoped in Neon. Anonymous users can choose an explicitly temporary local sandbox. No API-key input or live provider calls are added.
- Optional Google sign-in for ordinary users is not implemented; the Google connection is owner-only sending/calendar authorization.
- Existing profile editing stays in the community account UI. Country/contact preferences and direct password-change UI are not added; password recovery is separate and supported.
- Anti-abuse uses server rate limits, consent/honeypots, code attempt bounds and verification. A production CAPTCHA or advanced bot scoring is not connected.
- Staff booking review is appended to the approved admin workspace. It does not replace private inquiry-based meeting requests from earlier versions; old requests remain separate from real Google bookings.
- OAuth notifications, invitations and calendar mail occur only after the owner connects Google. No email was sent to real people during development.

Run `npm ci`, `npm run check` and `npm run dev`. Deployment still requires owner approval. Do not push to a production-connected branch until ready.
