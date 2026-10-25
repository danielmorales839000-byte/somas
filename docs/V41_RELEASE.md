# SOMAS 4.1 — navigation, consent and scheduling

This release updates the existing v4 project. No production push or deployment was performed.

## Changed

- Removed the red top notification from all public page shells. Demo descriptions and the footer Demo Disclosure remain; the disclosure no longer depends on the removed banner.
- Removed the separate Community Account navigation link. Sign in, Sign up, account identity and Schedule a Meeting now belong to the main navigation, including the mobile menu.
- Signup's checkbox and plain consent label toggle acceptance. Separate Read Privacy Policy and Read Terms links open in a new tab without losing entered form values.
- Replaced the simple date form with a month calendar, today/selected-date indicators, bounded month navigation, IANA timezone selector, daily timeline, busy blocks, available time choices and booking form.
- Date and timezone changes re-fetch the selected day's availability. Outdated responses cannot replace a newer selection. Selection resets before each refresh.
- Public busy intervals contain only clipped/merged timestamps. Calendar titles, participants, organizer identifiers and descriptions remain private. A verified member sees only their own SOMAS booking titles and review links.
- The server computes timezone-aware day windows, including 23/25-hour DST days, and reuses bounded Intl formatters. Existing booking integrity and verification requirements remain.

## Validation

Full suite: 60 tests, 59 passed, 1 optional native PostgreSQL migration test skipped. Focused follow-up: 17 tests passed. Syntax checks and Cloudflare dry-run passed (10,214 static assets).

Browser preview: consent label checked its checkbox without leaving signup; legal links have new-tab targets; main navigation contains identity controls; red banner and Community Account link absent; selected day/timezone refreshed; selecting a time populated its date/time/timezone summary. Mobile calendar measured 375px client width and 375px scroll width. Calendar preview uses isolated PostgreSQL and MOCKED Google free/busy; it does not show real owner meetings or prove live Google connectivity.

## Apply to the Windows checkout

Copy the contents of the small update ZIP into `D:\work\somas`, replacing matching files. Keep `.git`, `.env*` and `.dev.vars`. No new database migration or dependency is required beyond the v4 baseline. Run:

```
npm ci
npm run check
git add .
git commit -m "Improve consent navigation and calendar scheduling"
git push origin HEAD:main
```

Only push when ready for the existing automatic deployment. If remote main has moved, do not force-push; inspect that result first.

## Existing setup issue in the supplied screenshot

`verification not configured` means `OTP_HMAC_KEY` is missing or shorter than 32 characters on the Worker. This is separate from the consent/navigation issue. Generate a private random secret locally and enter it through:

```
npx wrangler secret put OTP_HMAC_KEY --name somas-cloudflare-neon
```

Do not paste secrets into chat or commit them. Gmail must also be connected by the bootstrapped owner. Google Calendar and booking hours must be configured before real availability can load. See `V4_SETUP.md`. Until then the new calendar shows an explicit unavailable state rather than invented meetings.
