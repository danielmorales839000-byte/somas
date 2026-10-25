-- Additive v4. Apply 004 and 005 first. No synthetic records are imported.
BEGIN;
SELECT pg_advisory_xact_lock(203006);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS one_somas_owner ON users(role) WHERE role='owner';
CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email ON users(lower(email));
CREATE TABLE IF NOT EXISTS email_challenges(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),purpose text NOT NULL,token_hmac text NOT NULL,pending_password_hash text,expires_at timestamptz NOT NULL,attempts int NOT NULL DEFAULT 0,consumed_at timestamptz,delivered boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS challenge_active ON email_challenges(user_id,purpose) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS challenge_user ON email_challenges(user_id,purpose,created_at DESC);
CREATE TABLE IF NOT EXISTS role_requests(id uuid PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),requested_role text NOT NULL CHECK(requested_role IN ('assistor','administrator')),reason text NOT NULL,status text NOT NULL DEFAULT 'pending',reviewed_by text REFERENCES users(id),decided_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS pending_role_request ON role_requests(user_id,requested_role) WHERE status='pending';
CREATE TABLE IF NOT EXISTS role_invitations(id text PRIMARY KEY,request_id uuid NOT NULL REFERENCES role_requests(id),user_id text NOT NULL REFERENCES users(id),token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS access_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id text,target_id text,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS owner_integrations(id text PRIMARY KEY,owner_id text NOT NULL REFERENCES users(id),ciphertext text NOT NULL,scopes text NOT NULL,status text NOT NULL DEFAULT 'connected',last_success_at timestamptz,last_error text);
CREATE TABLE IF NOT EXISTS oauth_states(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),browser_hash text NOT NULL,verifier text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS outbound_email(id uuid PRIMARY KEY,recipient_hash text NOT NULL,purpose text NOT NULL,state text NOT NULL,provider_message_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS booking_rules(id text PRIMARY KEY,timezone text NOT NULL DEFAULT 'UTC',start_hour int NOT NULL DEFAULT 9,end_hour int NOT NULL DEFAULT 17,weekdays jsonb NOT NULL DEFAULT '[1,2,3,4,5]',duration_min int NOT NULL DEFAULT 30,buffer_min int NOT NULL DEFAULT 15,notice_hours int NOT NULL DEFAULT 24);
CREATE TABLE IF NOT EXISTS calendar_meetings(id text PRIMARY KEY,user_id text REFERENCES users(id),guest_name text NOT NULL,guest_email text NOT NULL,purpose text NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,zone text NOT NULL,state text NOT NULL,token_hash text NOT NULL,idem_hash text NOT NULL UNIQUE,google_event_id text NOT NULL UNIQUE,meet_url text,created_at timestamptz NOT NULL DEFAULT now());
-- Fixed grid cells are acquired in the SAME atomic statement as the hold.
-- Cells include the buffer; this prevents overlaps across different slot starts.
CREATE TABLE IF NOT EXISTS booking_cells(cell_at timestamptz PRIMARY KEY,meeting_id text NOT NULL REFERENCES calendar_meetings(id));
CREATE TABLE IF NOT EXISTS simulation_managers(id uuid PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),settings jsonb NOT NULL,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON email_challenges,role_requests,role_invitations,access_audit,owner_integrations,oauth_states,outbound_email,booking_rules,calendar_meetings,booking_cells,simulation_managers FROM PUBLIC;
COMMIT;
