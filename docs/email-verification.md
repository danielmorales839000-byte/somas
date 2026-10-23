# Email verification

Visitors sign in or sign up using email and an eight-digit code. Google, Microsoft and GitHub visitor login has been removed. Old public OAuth start endpoints return 410 and create no account or session. Existing account data is retained. The hosting owner can still use the native hosting identity to recover email settings.

The sender configured by the owner sends the code to the visitor's entered mailbox. Codes expire after 15 minutes, have bounded attempts and can be used once. A resend invalidates unsent older codes. Challenge metadata survives a refresh in tab-scoped session storage; typed codes and provider secrets are never stored there.

## Cloudflare transport fix

Cloudflare Workers does not support `redirect: "error"`. It throws a TypeError before any network request. That option was incorrectly used in mail, Google token and AI provider requests, which made real requests fail while Node tests passed. All fixed upstream requests now use `redirect: "manual"` and reject 3xx responses explicitly. Credentials are never forwarded to another host.

The Worker runtime regression tests use Miniflare/workerd and real D1 migrations. They reproduce the former TypeError, then exercise signup, sending and code verification with mock external mail services in the actual Worker runtime. Provider acceptance is distinct from inbox delivery.

## Owner sender setup

Open `/?screen=email-setup` using the existing hosting owner account. A saved Resend sender must use a domain authorized in Resend. A Resend test sender can only send to the Resend account owner's address. To send from `williamkevin999999@gmail.com`, the owner may instead connect Gmail once; the remaining Google OAuth flow is only for owner send-mail authorization, not visitor login.

The Google web app callback is `/api/auth/oauth/google/callback`. Save the app using the owner-only `/api/email-setup/google` endpoint, enable Gmail API and approve gmail.send. Sending credentials stay encrypted. No user or Manager role is granted by connecting Gmail.

References: https://developers.cloudflare.com/workers/runtime-apis/request/ ; https://resend.com/docs/api-reference/errors ; https://developers.google.com/workspace/gmail/api/guides/sending

Permanent Resend 4xx errors (except rate limiting) stop retries and display safe instructions for the owner. Domain and test-recipient restrictions are distinguished. Network and rate-limit errors retain bounded retries. The live transport test after the redirect fix reached Resend and received 403, showing that the currently saved sender still needs authorization. No live inbox delivery has been confirmed.
