# Current database setup

Apply `004_public_submissions.sql`, then `005_community.sql` for fresh concept/community installations. Both can be reapplied safely. No production migration is run by startup or CI.

Existing installations keep their users and sessions. Legacy AI, project and billing tables are not queried by the new version and are not dropped. Their original migration files remain available in Git history; they are no longer part of a fresh demo-only installation. No automatic cleanup of historical data is performed.
