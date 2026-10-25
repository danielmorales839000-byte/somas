# V4 implementation security review

This is an implementation review and automated fixture verification, not a third-party penetration test or certification.

## Enforced

- Additive migration; unique owner; no public owner registration. Synthetic corpus remains static and cannot authenticate.
- Secure six-digit random challenges; keyed HMAC with challenge binding; ten-minute expiry; five attempt limit; single use; 60-second resend cooldown; hourly IP/account limits. No plaintext OTP storage. Signup never returns a session before verification.
- Pending-signup passwords are bound to the emailed challenge, so reusing an unverified email record cannot silently activate an earlier password.
- Neutral password recovery responses; real mail failure does not claim delivery. Provider acceptance is explicitly distinct from inbox delivery.
- Server-side RBAC; assistors cannot review roles; administrators cannot create administrators. Owner password + owner OTP + bound single-use invitation + matching verified acceptance required. Affected sessions are revoked on elevated role changes.
- OAuth state bound to a separate short-lived Lax HttpOnly Secure cookie; one use; PKCE; exact HTTPS callback origin; authenticated owner before consent; returned Google identity must match configured owner.
- AES-256-GCM authenticated encryption for refresh credentials using a separate Worker secret; Google tokens never returned. Revoke requires password reauthentication.
- Public availability strips Calendar details; account/booking summaries require owner/staff or a long private guest token. No owner email is returned by public summaries.
- Fixed UTC grid holds inserted with booking row in one SQL statement; remote free/busy recheck; stable external event IDs; explicit uncertain state. Cancellation calls Google before local release.
- Ownership checks for private Simulation Managers. No private manager prompt appears in synthetic network records.
- Parametrized SQL, bounded bodies, CSRF origin/header enforcement, safe HTML escaping, no provider credentials requested in browser.

## Deployment verification required

Google consent/publishing and mailbox delivery, external API quotas, refresh-token revocation, correct calendar ownership and working hours, actual Meet generation, actual guest invitations and production Neon migrations require owner setup and staged testing. Tests mock Google HTTP; they cannot prove these live properties.

Existing records with unverified emails require verification after rollout; bootstrap the owner before enabling new auth. Deploying the v4 flag before migrations fails closed. Turning the flag off restores the previous legacy auth contract, including its lack of verification, and must not be treated as a secure v4 mode.

## Residual operational limits

Google and Neon do not share a transaction. External Calendar writers can race the recheck. Ambiguous holds require review; no background reconciliation worker. Availability can be unavailable during OAuth revocation/outage. Signed guest links act as bearer credentials and must not be shared. They are removed from the visible URL after opening but are not a substitute for signed-in account ownership. Configure infrastructure request-log redaction for query strings and OAuth callbacks. Database retention/cleanup and production CAPTCHA are not automated in this release. Owner recovery remains a manual deployment-time procedure.
