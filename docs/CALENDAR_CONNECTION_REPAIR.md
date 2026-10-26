# Restore real meeting availability

The reported page received `google_service_unavailable`. Existing code collapsed Google non-success responses into one category; the screenshot alone cannot identify whether the cause is disabled API, permissions, calendar selection, quota or a temporary upstream failure.

This update adds safe reason categories and an owner-only, rate-limited Calendar-only free/busy test, independent of Gmail sending. It does not change authorization, invent slots, expose private calendar titles or mark a failed booking confirmed.

1. In the Google Cloud project containing SOMAS's OAuth client, open APIs & Services → Library. Ensure Google Calendar API and Gmail API are enabled.
2. Sign in to SOMAS using its provisioned owner account and open `/owner/`.
3. Click Connect Gmail & Calendar. Choose the configured owner Gmail account and approve the requested permissions.
4. Click Test Calendar only. Follow its specific message if it fails. If GOOGLE_CALENDAR_ID is configured, the connected Google account needs access to that calendar; use primary for its main calendar.
5. Save booking timezone, weekdays, start/end hours, duration, buffer and notice. Use your actual availability. Asia/Rangoon is UTC+06:30; it is a timezone setting, not an availability guarantee.
6. Open `/meet/`, choose a future date within the next 30 days and press Refresh. Visitors see busy intervals and verified available starts. Booking confirmation requires a verified SOMAS account; appointment titles belonging to other people remain private.

No production credentials, calendar or deployment were changed by this update. Live Google service health is not verified locally. Run `npm run check` before committing. No database migration or additional secret is introduced.
