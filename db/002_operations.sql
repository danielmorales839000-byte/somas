BEGIN;
CREATE TABLE IF NOT EXISTS processed_payment_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS instance_checks (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_release integer NOT NULL DEFAULT 0,
  checked_at timestamptz NOT NULL DEFAULT now(),
  findings_count integer NOT NULL DEFAULT 0
);
COMMIT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_event_at timestamptz;
