# SOMAS membership, human Managers, activity, email and sharing

Implemented on `feature/two-ideas-homepage`. Publication was approved; account and homepage features are deployed.

## What the research supports

Established account-management designs distinguish authentication, email ownership and authorization. A verified address does not by itself grant an administrator role. Privileged operations require server-side checks; short-lived, single-use verification codes need resend and attempt limits. Operational audit records should exclude credentials, verification tokens and unnecessary message content.

Sources consulted:

- [OWASP Email Validation and Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html)
- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Resend sending API](https://resend.com/docs/api-reference/emails/send-email) and [verified sender domains](https://resend.com/docs/dashboard/domains/introduction)
- [X Web Intents](https://docs.x.com/x-for-websites/web-intents/overview)
- [Instagram content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [Gmail authorization scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [YouTube uploads and OAuth](https://developers.google.com/youtube/data/guides/uploading_a_video)

The implementation applies these patterns to SOMAS; this is not a claim that every website uses the same workflow.

## Signup and verification

The public user flow is now **Email → Continue → Code → Verify → Workspace**, without a password or a ChatGPT account requirement. The same code flow signs returning users in. Homepage signup has no Manager selection. After successful verification, users can open **Become a Manager** in the workspace and request the owner's approval separately.

Anonymous visitors submit their email to `/api/auth/email/start`. The server sends the code and binds the challenge to an HttpOnly browser cookie; no user account or session is created before the code succeeds. `/api/auth/email/verify` checks the browser binding, mailbox, expiry, attempts and code, then creates or resumes the corresponding account. New accounts always have the User role. Successful verification redirects directly to the requested workspace, without a password screen or welcome detour. The public homepage still explains Platform and Network.

Sessions use 256-bit random tokens, SHA-256 token hashes in D1 and a `Secure; HttpOnly; SameSite=Lax` host-only cookie. They expire after seven days and are revoked server-side on sign-out. Every request reloads account status and roles. Suspension and project ownership checks remain active. Tokens and codes never go in localStorage, URLs or response JSON. Login writes require the same Origin. Code requests have account, peer and global hourly limits. New code requests invalidate earlier codes for that mailbox.

Existing hosted ChatGPT sign-in remains available for owner setup/recovery and legacy users. After proving the configured owner mailbox by code, the existing configured owner identity is resumed, preserving projects. Other existing verified accounts are linked only when the mailbox identifies one account unambiguously; duplicates are rejected for manual resolution. No role is accepted from signup form input.

Codes contain eight random digits, expire after 15 minutes, are account/request bound and single-use, and allow five valid-shaped attempts. Resends have a 60-second cooldown and a five-per-hour limit. Manager approval requests additionally have a service-wide hourly cap. HMAC digests are stored instead of plaintext codes. Pending email payloads are encrypted and removed after provider acceptance or expiry. Concurrent requests cannot reuse a consumed code.

## Human roles

| Permission | Verified user | Approved human Manager | Verified owner |
| --- | --- | --- | --- |
| Own projects and API connection | Yes | Yes | Yes |
| Inspect users, their projects, and operational activity | No | Yes | Yes |
| Read all submitted opinions | No | Yes | Yes |
| Suspend/reactivate ordinary users | No | Yes | Yes |
| Pause/resume user projects | Own projects | All supported projects | All supported projects |
| Inspect the Root team | No | Yes | Yes |
| Approve/revoke Managers; change another Manager's access | No | No | Yes |
| Inspect email delivery queue | No | No | Yes |
| Read stored provider keys in plaintext | No | No | No |

The human Manager is an application administrator, separate from the AI Manager. No interface promises control over external hosting accounts, arbitrary source deployment, ChatGPT passwords, or other unavailable tools.

A verified user selects **Human Manager** or **Apply as human Manager**, provides a reason, and requests approval. The code is sent exclusively to **williamkevin999999@gmail.com**. The owner checks the applicant's identity and reason, then enters that code on the exact pending request. Applicants never receive an approval code from the API and cannot approve themselves, even if they learn the code. Other Managers cannot approve applicants. Expired requests require a fresh request from the applicant.

Ownership requires both the configured stable Site identity (`SOMAS_ADMIN_USER_ID`) and a code verified at `williamkevin999999@gmail.com`. That owner contact inbox is independent of the email supplied by ChatGPT sign-in. Matching an email address in a signup field never grants ownership. The owner and one's own access cannot be suspended/revoked through ordinary user controls.

## Email sender and Reply-To

The latest requested sender behavior is implemented as **Reply-To = the opinion submitter's verified signup email**. The actual From address remains a service-authorized sender. Verification and manager-approval codes do not use the applicant as Reply-To.

After saving an opinion, **Send from my email** opens a prefilled email draft addressed to **williamkevin999999@gmail.com**. The user chooses their signup mailbox and clicks Send in their own email app. The draft includes their opinion; its subject and body are URL-encoded. SOMAS never reports draft opening as email delivery and cannot enforce which mailbox the email app uses. The original opinion remains saved even if the draft is closed without sending.

Automatic sending from each user's mailbox still requires their authorization through a separate mailbox integration, which is not configured. No email-provider credentials are collected by this draft flow. The separate Resend notification continues to use an authorized service sender and the user's verified email as Reply-To. Both notifications and manager-approval codes now target **williamkevin999999@gmail.com**.

Opinions are saved first, followed by an encrypted notification queue entry. Immediate delivery is attempted; temporary failures retry with the same provider idempotency key. The existing authenticated background runner drains pending mail, and the owner can trigger retries from **Email delivery**. Retries are bounded and failures stay visible. “Accepted” means provider acceptance, not confirmed inbox delivery. Delivery/bounce webhooks are not implemented.

## Activity and social sharing

Managers can select a user, inspect their projects and activity, suspend/reactivate an ordinary user, and pause/resume projects. The paginated activity log records account/verification operations, page visits, project controls, model planning/report/review activity, released revisions, provider-setting changes, opinions, sharing actions and administrative outcomes. Client navigation events describe reported UI activity rather than proving a social post was published.

The UI discloses activity recording. Keys, codes, passwords, request bodies, private message contents, typed drafts and screen recordings are excluded. Anonymous share actions do not create user identities or anonymous tracking records. Records begin with this feature; past activity cannot be reconstructed. An activity-retention policy is not yet implemented and should be set before sustained high-volume operation.

**Share SOMAS** prepares a public homepage link and an accurate explanation of Platform versus the proposed Network. It offers Facebook, X, LinkedIn, WhatsApp, Telegram, Reddit, Instagram and YouTube. X/messaging links prefill supported text. Facebook shares the public link; users paste their explanation. Instagram/YouTube buttons copy caption/description and open the destination; users supply media and publish themselves. There is no automatic cross-platform publishing, connected-account OAuth, or media upload implementation. Private project query strings are never shared.

## Enable email before publishing

The initial hosted configuration had no email sender. Email delivery must be configured through the owner connection screen or deployment secrets before signup can send real codes; no real delivery was exercised by these fixture tests.

1. Configure an authorized transactional-email account and verify a sending domain. With Resend, complete the sender-domain DNS verification in its dashboard.
2. Configure `RESEND_API_KEY` and `MAIL_FROM` as server-side Site runtime values, using secure entry. `MAIL_FROM` should be an address on that verified domain, such as `SOMAS <notifications@your-verified-domain>`; it is not an arbitrary user's Gmail address.
3. Preserve the existing `APP_DATA_KEY`, `SOMAS_ADMIN_USER_ID`, runner authentication, database and Site audience. Preserve the existing configured Site owner ID. That account verifies the owner contact address `williamkevin999999@gmail.com`, even when ChatGPT supplies the former sign-in address. Changing the notification address alone does not transfer hosting ownership or an external account. Keep email verification enabled; the explicit legacy bypass in old fixture tests is not a production recommendation.
4. Review the feature branch. After deployment approval, publish through Sites with all pending migrations through `0007_high_midnight.sql`. These append tables/columns/indexes; applied older migrations remain immutable.
5. Sign in as the configured owner using `williamkevin999999@gmail.com`, verify that inbox, and smoke-test verification, manager approval, opinion delivery, suspension and activity permissions with controlled test accounts. Do not open general signup until delivery is confirmed: verification is required and deliberately blocks workspace access when sending is not configured.

## Verification and artifacts

- **76 automated tests passed.** Tests cover verification, ownership, approval, replay, concurrency, expiry, resend/attempt limits, suspension, cross-user permissions, Reply-To, durable retries, audit isolation, anonymous sharing, safe public share links, and existing agent execution.
- Browser checks: public sharing dialog; human-Manager signup link; labeled fixture screens for verification setup, approval dialog, selecting users/projects, and activity; 390px layout checks with no horizontal document overflow.
- Browser administration screenshots contain **test data only**. The temporary fixture pages were removed before the production build. No real accounts were changed.
- TypeScript, JavaScript syntax and production build checks passed before the feature commit.
- Local D1 schema was inspected: only migration 0000 existed. Pending 0001–0005 applied successfully to the local database. The hosted database was not changed.

Changed areas: `lib/membership.mjs`, `lib/server.mjs`, `db/schema.ts`, appended Drizzle SQL/metadata, `public/app.js`, `public/share-content.mjs`, shared styles, `components/landing/SharePanel.tsx`, homepage actions/metadata, membership tests and UI navigation tests. Preview screenshots are in `docs/membership-preview/`.

## Owner mailbox correction and opinion draft handoff

The owner mailbox is now `williamkevin999999@gmail.com`. Tests cover revoking the previous mailbox match, retaining the stable identity requirement, and presenting a user-sent draft without claiming delivery. This update remains on the feature branch; hosted environment values, hosting ownership, and the live deployment were not changed. Real service email delivery and sending from a visitor's mailbox remain unverified.

## Recovery from missing sender configuration

`/?screen=email-setup` lets only the configured, active Site owner connect the service's Resend account before email verification. This narrow bootstrap permission does not grant access to projects, users, Manager approvals, or the root team. Ordinary accounts, including accounts whose email matches the owner mailbox, cannot use it. Same-origin checks apply to every write. A supplied key and authorized From address are encrypted in the new `email_sender` table with the existing application data key, and are never returned in plaintext. Deployment-managed sender secrets take precedence and are changed through Site runtime settings. The authenticated background runner also loads this connection for queued mail.

After saving, the owner requests a code sent to `williamkevin999999@gmail.com` and enters it before administration is enabled. Ordinary users still verify the email supplied by their own sign-in. A configured sender is not a confirmed delivery: provider rejection and temporary errors remain visible, and verification is never granted without the code.

Resend needs a verified sending domain for general recipients. Its `onboarding@resend.dev` test sender can only send to the email associated with the Resend account. No provider key is presently available for a real delivery test.

Recovery checks: 66 automated tests, TypeScript and JavaScript syntax passed. The owner recovery and connection forms rendered in a local fixture browser check. The screenshot capture timed out; no real provider delivery was tested.

## Passwordless signup validation

Passwordless API tests cover anonymous account creation, direct workspace access, no automatic Manager elevation, browser/mailbox binding, code replay and concurrent use, resend invalidation, expiry, attempts, Origin checks, rate limits, hashed sessions, logout, suspension, project isolation, and preservation of the configured owner identity. The frontend test verifies Email → Code → Workspace with no password field or Manager signup choice. TypeScript and syntax checks passed. Real delivery remains dependent on connecting an authorized sender.

The new email and code forms were rendered in labeled local browser fixtures, with no desktop horizontal overflow. Test fixtures were removed before packaging. The final 76-test suite and production build passed.
