# Current database setup

Apply `004_public_submissions.sql`, then `005_community.sql` for fresh concept/community installations. Then apply `006_identity_calendar.sql` for the v4 identity/roles/Calendar release. All three can be reapplied safely. No production migration is run by startup or CI.

Existing installations keep their users and sessions. Legacy AI, project and billing tables are not queried by the new version and are not dropped. Their original migration files remain available in Git history; they are no longer part of a fresh demo-only installation. No automatic cleanup of historical data is performed.

V4 must not be enabled before migration 006 and private owner bootstrap. See `docs/V4_SETUP.md`; no database changes run automatically at application startup. Use Neon SQL Editor to execute the complete migration file, including its transaction.

For private Contact Us conversation replies, also apply `007_contact_conversations.sql` before deploying that update.
