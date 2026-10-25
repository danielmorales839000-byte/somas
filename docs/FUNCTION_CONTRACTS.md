# Function contracts — concept & community

- `database`: one configured Neon HTTP connection; no credentials enter client assets or logs.
- `getUserFromSession`: resolves a non-expired hash-only session to a private account.
- `createUser`: creates only the account. No workspace, subscription or agents.
- `ensureProfile`: separate public profile identity and neutral generated name, never derived from email.
- `community`: public read projections exclude account ID/email, author writes require ownership, moderator writes require ADMIN_USER_ID. Hidden/deleted content is excluded from public read paths, profiles and notifications.
- `validateDiscussion`: bounded plain text, whitelist category, at most five restricted tags.
- `rateLimit`: persistent atomic hourly counters, bounded by action and account or salted IP.
- `publicSubmissions`: private consented inquiries, no auto account creation, no email-delivery claim.
- `renderBody`: text nodes and parsed http(s) links only; no user HTML execution.
- `organizationMarkup` / `mountOrganization`: local scripted presentation only, no provider calls or real task execution.

Community votes have unique database keys and explicit desired active state. Reply insertion, activity and follower notifications share one SQL statement. Moderation state and audit history share one SQL statement. Profile, report, notification and inquiry data use only their appropriate public/owner/admin boundaries.
