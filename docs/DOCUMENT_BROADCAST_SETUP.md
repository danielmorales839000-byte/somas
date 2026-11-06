# SOMAS 6.1 document email broadcasts

## What changed

Admin panel → Broadcasts is the only contact-email action. The separate Import tab is removed.

1. Select a DOCX, CSV or TXT (2 MB maximum, 1,000 distinct addresses).
2. Enter the email subject and plain text message.
3. Click Broadcast once. The app analyzes and deduplicates the document, saves the recipient snapshot, queues the campaign and starts sending immediately.
4. View extracted recipient counts and delivery states while it runs. There is no separate Analyze, Review or Approve button.
5. Keep the page open. Pause, cancel remaining, or resume a saved queue later.

Clicking Broadcast authorizes real sending through the connected Gmail. An invalid file prevents sending. Recipients do not need accounts or verification.

The parser accepts Gmail and other valid email domains. It validates syntax, not mailbox existence. DOCX, CSV and TXT are supported; legacy .doc and PDF are not supported. Upload bytes are not retained. Campaign recipients are stored encrypted; their full addresses are visible only to administrators on campaign review. Existing imported review reports do not silently become recipients: upload the document in the new flow.

Legacy campaign records are retained in the database; the Broadcast interface only shows document broadcasts. Imported contacts never create authentication accounts or falsely record subscriptions.

## Deploy this upgrade

1. Back up your project and database. Copy the release files into your existing SOMAS checkout.
2. Run `npm ci` and `npm run check`.
3. In the same Neon database used by your Worker, run the full contents of `db/009_document_broadcast.sql` through the Neon SQL editor. Existing installations must already have migrations 004 through 008. For a fresh database apply 004, 005, 006, 007, 008, then 009 in order. The migrations are additive and repeatable.
4. In `wrangler.jsonc`, change `BROADCAST_EMAIL_ENABLED` from `"false"` to `"true"`. Leave `CONTACT_IMPORT_ENABLED`, `BROADCAST_ENABLED` and `AUTH_V4_ENABLED` set to `"true"`.
5. Preserve the existing Worker secrets: DATABASE_URL, ADMIN_USER_ID, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, GOOGLE_CREDENTIAL_ENCRYPTION_KEY, OTP_HMAC_KEY and SOMAS_OWNER_EMAIL. Do not put secrets in Git. No new secret is introduced by this upgrade.
6. Open Owner settings and confirm the owner Gmail is connected. Reconnect if permission has expired or been revoked. The sender must be the Gmail account authorized by the owner.
7. Commit and push to the branch your Cloudflare build watches, normally main. This publishes when your connected Cloudflare build succeeds.
8. Initially use a document containing only an email address you control. Broadcast a short test. Verify the inbox and results before using a larger list.

This release was not deployed to production. Enabling the flag does not send emails by itself. Only the admin Broadcast action starts an approved document queue.

## Sending behavior and limits

- Default application caps: 30 send attempts/minute, 400/day (UTC reset). `DOCUMENT_EMAILS_PER_MINUTE` and `DOCUMENT_EMAILS_PER_DAY` in Worker vars configure lower limits; hard application bounds are 60/minute and 2,000/day. These are application throttles, not promises of Gmail capacity. Google may enforce lower quotas shared with the sender's other mail.
- A recipient gets one message with a single To address; the rest of the list is not disclosed.
- Every message includes an unsubscribe link and one-click unsubscribe header. Suppressed addresses are excluded from future document sends, regardless of reupload.
- Accepted means Google accepted the API call, not that the message reached an inbox. There is no bounce tracking or guaranteed deliverability.
- A network failure after a send begins is marked uncertain and pauses processing. Resume only processes untouched recipients; uncertain and accepted rows are never reset or retried automatically.
- An interrupted worker claim older than two minutes becomes uncertain on subsequent processing. You may resume the remaining queue, without resending that recipient.
- Limits pause automatic browser processing; remaining recipients are saved. Resume after reset. Cancellation affects only pending recipients; a message already in flight cannot be recalled.
- This is a browser-driven durable outbox, not an unattended background campaign scheduler. Closing the page stops subsequent requests, although a request already in flight may finish.
- Separate deliberate campaigns can send to the same address again unless it is suppressed. Repeated Broadcast clicks on one campaign do not requeue accepted messages.

## Verification

Tests execute actual SQL against isolated PostgreSQL in WASM with a Neon HTTP adapter. Gmail calls are mocked. Production Neon and live Gmail delivery were not exercised. No real contact list was mailed.
