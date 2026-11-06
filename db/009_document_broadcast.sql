-- Document recipients are contacts, not authentication users or account subscribers.
BEGIN;
SELECT pg_advisory_xact_lock(203009);
CREATE TABLE IF NOT EXISTS document_campaigns (
 id uuid PRIMARY KEY, author_id text NOT NULL REFERENCES users(id), filename text NOT NULL,
 subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','complete','paused','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
 CHECK(length(subject) BETWEEN 1 AND 150), CHECK(length(body) BETWEEN 1 AND 6000)
);
CREATE TABLE IF NOT EXISTS document_recipients (
 campaign_id uuid NOT NULL REFERENCES document_campaigns(id), identity text NOT NULL,
 ciphertext text NOT NULL, unsubscribe_token text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','suppressed','uncertain','cancelled')),
 provider_id text, last_error text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,identity)
);
CREATE INDEX IF NOT EXISTS document_recipient_queue ON document_recipients(campaign_id,status);
REVOKE ALL ON document_campaigns,document_recipients FROM PUBLIC;
COMMIT;
