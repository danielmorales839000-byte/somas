-- Additive only. Apply after existing migrations. No existing customer tables changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(203004);
CREATE TABLE IF NOT EXISTS public_submissions (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('contact','application')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_submissions_created_idx ON public_submissions(created_at);
CREATE TABLE IF NOT EXISTS public_submission_limits (
 identity_hash text NOT NULL,
 day date NOT NULL,
 attempts integer NOT NULL CHECK(attempts>0),
 PRIMARY KEY(identity_hash,day)
);
REVOKE ALL ON public_submissions,public_submission_limits FROM PUBLIC;
COMMIT;
-- Operator retention: remove old quota rows after 7 days, inquiries after your documented period.
-- Backout: stop using the endpoints; retain tables until submissions have been safely exported.
