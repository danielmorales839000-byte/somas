BEGIN;
SELECT pg_advisory_xact_lock(203010);
CREATE TABLE IF NOT EXISTS admin_gmail_integrations (
 user_id text PRIMARY KEY REFERENCES users(id), email text NOT NULL, ciphertext text NOT NULL,
 scopes text NOT NULL, status text NOT NULL DEFAULT 'connected', last_error text,
 connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_gmail_oauth (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), browser_hash text NOT NULL,
 verifier text NOT NULL, redirect_uri text NOT NULL, expires_at timestamptz NOT NULL
);
ALTER TABLE document_campaigns ADD COLUMN IF NOT EXISTS sender_user_id text REFERENCES users(id);
ALTER TABLE document_campaigns ADD COLUMN IF NOT EXISTS sender_email text;
REVOKE ALL ON admin_gmail_integrations,admin_gmail_oauth FROM PUBLIC;
COMMIT;
