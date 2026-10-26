-- Additive private reply history. Apply after 004, 005, 006.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS contact_replies (
 id uuid PRIMARY KEY,
 submission_id uuid NOT NULL REFERENCES public_submissions(id),
 sender_user_id text NOT NULL REFERENCES users(id),
 from_staff boolean NOT NULL,
 body text NOT NULL CHECK(char_length(body) BETWEEN 2 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_replies_thread ON contact_replies(submission_id,created_at,id);
REVOKE ALL ON contact_replies FROM PUBLIC;
COMMIT;
