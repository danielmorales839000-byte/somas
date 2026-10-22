-- Additive staging migration. Apply after 001–003. Never run automatically on production.
BEGIN;
CREATE TABLE IF NOT EXISTS somas_runtime_missions (
  id text PRIMARY KEY,
  unit_id text NOT NULL UNIQUE REFERENCES somas_units(id) ON DELETE CASCADE,
  objective text NOT NULL CHECK(length(objective) BETWEEN 8 AND 2500),
  requirements jsonb NOT NULL DEFAULT '[]',
  criteria jsonb NOT NULL DEFAULT '[]',
  constraints jsonb NOT NULL DEFAULT '{}',
  capabilities jsonb NOT NULL DEFAULT '[]',
  state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused')),
  monthly_job_limit integer NOT NULL DEFAULT 30 CHECK(monthly_job_limit BETWEEN 1 AND 100),
  next_assessment_at timestamptz NOT NULL DEFAULT now(),
  last_assessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,unit_id)
);
CREATE TABLE IF NOT EXISTS somas_runtime_jobs (
  id text PRIMARY KEY,
  mission_id text NOT NULL,
  unit_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('assess_mission','package_application','browser_journey','code_change','research_document')),
  agent_role text NOT NULL,
  priority integer NOT NULL DEFAULT 20 CHECK(priority BETWEEN 0 AND 100),
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','working','waiting','blocked','failed','completed','canceled')),
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  blocker text,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  lease_token text,
  lease_until timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY(mission_id,unit_id) REFERENCES somas_runtime_missions(id,unit_id) ON DELETE CASCADE,
  UNIQUE(mission_id,dedupe_key),
  UNIQUE(id,unit_id),
  CHECK((status='working')=(lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS somas_runtime_ready_idx ON somas_runtime_jobs(unit_id,status,next_run_at,priority);
CREATE TABLE IF NOT EXISTS somas_runtime_gaps (
  id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES somas_runtime_missions(id) ON DELETE CASCADE,
  gap_key text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','open','blocked','verified')),
  evidence jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,gap_key)
);
CREATE TABLE IF NOT EXISTS somas_runtime_events (
  id bigserial PRIMARY KEY,
  unit_id text NOT NULL REFERENCES somas_units(id) ON DELETE CASCADE,
  job_id text,
  event_type text NOT NULL CHECK(event_type IN ('mission_created','mission_assessed','mission_updated','task_assigned','execution_started','execution_completed','execution_failed','execution_blocked','artifact_created','message_received','manager_responded','browser_reported','release_recorded','team_changed')),
  actor_role text NOT NULL,
  recipient_role text,
  status text NOT NULL,
  summary text NOT NULL CHECK(length(summary)<=300),
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(job_id,unit_id) REFERENCES somas_runtime_jobs(id,unit_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS somas_runtime_events_unit_idx ON somas_runtime_events(unit_id,id DESC);
CREATE TABLE IF NOT EXISTS somas_runtime_messages (
  id text PRIMARY KEY,
  seq bigserial UNIQUE,
  unit_id text NOT NULL REFERENCES somas_units(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','manager')),
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 4000),
  task_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS somas_runtime_messages_unit_idx ON somas_runtime_messages(unit_id,created_at DESC);
CREATE TABLE IF NOT EXISTS somas_runtime_artifacts (
  id text PRIMARY KEY,
  unit_id text NOT NULL REFERENCES somas_units(id) ON DELETE CASCADE,
  job_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('application_package','browser_report','assessment')),
  digest text NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(job_id,unit_id) REFERENCES somas_runtime_jobs(id,unit_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS somas_runtime_runner_tokens (
  token_hash text PRIMARY KEY,
  unit_id text NOT NULL REFERENCES somas_units(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
-- Existing hashes, policies, project content and releases are preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended'));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS base_release integer;
-- Legacy proposals are intentionally left NULL: inspect and regenerate them before approval.
CREATE OR REPLACE FUNCTION somas_enforce_project_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF (SELECT count(*) FROM projects WHERE workspace_id=NEW.workspace_id)>=3 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='free_project_limit_3';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS somas_project_limit ON projects;
CREATE TRIGGER somas_project_limit BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION somas_enforce_project_limit();
COMMIT;
