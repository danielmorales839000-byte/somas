# V4 route and validation checklist

The v3 project was updated in place from the supplied v4 document and glass/pearl reference. Production was not pushed or deployed. No real owner email, Google credentials or calendar data was used in tests.

| Route | Delivered |
|---|---|
| Dashboard | Existing invitation and seven destinations; global identity/schedule controls |
| Platform | Two equally weighted compact 3D gateways; richer ten-agent campus kept on dedicated Root route |
| Root Manager | Existing ten identifiable animated agents, concurrency, 5× playback, task/event inspector preserved |
| Create Manager | Five steps, review, temporary anonymous sandbox or verified account-owned simulation saved in Neon |
| Manager detail | Ownership-checked saved settings, replay, 3D preview, archive; no real execution |
| Network | New silver/pearl 3D node composition, particles and 10K searchable synthetic organizations; compact 36% desktop map and source analytics |
| Account | Separate sign-in/signup, six-box verification UI, cooldown, resend, password recovery |
| Settings | Verified identity, current role, requests/history, My Meetings, My Simulation Managers, existing public-profile editor link |
| Owner | OAuth connect/test/revoke, booking hours, administrator/assistor queue, password + owner-code step-up |
| Meet | Date/timezone availability, verified member confirmation, private booking summary, Meet status sync, Google template link, .ics, cancellation |
| Administrator | Approved layout preserved; real user verification/role/last-login fields, access review and live booking links added |
| Join / Opportunities | Existing categorized real inquiry forms retained |
| Videos / Discussions / Contact | Existing genuine films, community and inquiries retained; Schedule accessible from every page |
| Footer | Privacy, Terms, Contact and Demo Disclosure |

## Verification evidence

- Latest full run: 57 tests, 56 passed, 1 optional native PostgreSQL migration test skipped; syntax checks passed.
- Tests execute real PostgreSQL-WASM SQL through a Neon HTTP fixture, with mocked Google HTTP endpoints. Cover signup recipient/sender separation, hash-only OTPs, expiry, attempts, cooldown, replay, encrypted refresh tokens, browser-bound single-use OAuth state, staff authorization, owner-only invitations and session revocation, private Manager ownership, Calendar collision control, signed summaries, ICS, cancellation, outage and uncertain-insertion reconciliation.
- Browser preview: signup screen and six-field code screen render; protected browser credential entry prevented completion of the OTP UI flow. API verification is tested; do not call the entire email flow browser-verified.
- A disposable verified fixture session completed slot lookup and booking confirmation against mocked Google. Calendar links and cancellation states were observed. Browser .ics download observation timed out; ICS response/content are API-tested, actual browser download remains a manual check.
- Browser: a verified disposable fixture created an account-owned Simulation Manager through all five wizard steps; it appeared in Account Settings and reopened successfully. Mobile signup measured 375px client width and 375px scroll width (no horizontal overflow).
- Earlier v3 desktop/mobile layout checks remain relevant. V4 final screenshots show Network and signup. WebGL is unavailable in the QA browser; CPU fallback is inspected. Real-device GPU performance is unverified.
- Cloudflare dry-run succeeds. It does not test hosted Neon or Google authorization.

## Deliberate boundaries / remaining scope

No live AI, BYOK, training, blockchain consensus or paid provider use. Manager visual previews reuse a standard demonstration team rather than generating unique rigs per scenario. Ordinary Google social sign-in, direct profile country/contact preferences, CAPTCHA service, automatic reconciliation jobs and fully atomic rescheduling are not implemented. Rescheduling is cancel-then-book. Video library search/caption redesign and GPU instancing remain outside this update. Calendar privacy and actual owner setup are detailed in `V4_SETUP.md`; security review in `V4_SECURITY_REVIEW.md`.

## Important rollout order

Migrate 006 → set private credentials → bootstrap owner → deploy only with approval → connect Google → test disposable real email/meeting in a closed rollout. Read setup guide before pushing to a production-connected main branch.
