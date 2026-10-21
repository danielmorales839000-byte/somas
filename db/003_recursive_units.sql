-- SOMAS v2 additive migration: two scoped missions, one organizational engine.
-- Run only after 001_initial.sql and 002_operations.sql. Existing data/weights are not rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(203003);
-- Composite FK prevents later project/workspace changes from invalidating unit ownership.
CREATE UNIQUE INDEX IF NOT EXISTS projects_unit_workspace_idx ON projects(id,workspace_id);
CREATE TABLE IF NOT EXISTS somas_units (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('root','customer')),
  parent_id text REFERENCES somas_units(id),
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id text UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  mission text NOT NULL CHECK(char_length(mission) BETWEEN 8 AND 2500),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT unit_boundary CHECK (
    (kind='root' AND id='somas-root' AND parent_id IS NULL AND workspace_id IS NULL AND project_id IS NULL) OR
    (kind='customer' AND parent_id IS NOT NULL AND parent_id='somas-root'
      AND workspace_id IS NOT NULL AND project_id IS NOT NULL AND id='customer-'||project_id)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS only_one_root_somas ON somas_units (kind) WHERE kind='root';

-- Root policies are stored apart from existing project-owned agent policies.
-- Both use the same agents.js policy representation, planner, trainer and evaluator.
CREATE TABLE IF NOT EXISTS somas_root_agents (
  id text PRIMARY KEY,
  unit_id text NOT NULL REFERENCES somas_units(id) ON DELETE CASCADE CHECK(unit_id='somas-root'),
  role text NOT NULL,
  policy jsonb NOT NULL,
  is_core boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id,role)
);
CREATE TABLE IF NOT EXISTS somas_evolution_proposals (
  id text PRIMARY KEY,
  unit_id text NOT NULL REFERENCES somas_units(id) ON DELETE CASCADE,
  requested_by text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('software','intelligence','organization','business')),
  target text NOT NULL CHECK (target IN ('somas_platform','customer_application')),
  plan jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','rejected','approved_for_execution')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS somas_evolution_by_unit ON somas_evolution_proposals(unit_id,created_at DESC);
-- Database backstop: Root proposals can target only the SOMAS service, and
-- customer proposals can target only their own application mission.
CREATE OR REPLACE FUNCTION validate_somas_evolution_target() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE actual_kind text; actual_owner text;
BEGIN
  SELECT u.kind,w.owner_id INTO actual_kind,actual_owner FROM somas_units u
    LEFT JOIN workspaces w ON w.id=u.workspace_id WHERE u.id=NEW.unit_id;
  IF actual_kind IS NULL OR
     (actual_kind='root' AND NEW.target<>'somas_platform') OR
     (actual_kind='customer' AND NEW.target<>'customer_application') THEN
    RAISE EXCEPTION 'invalid_somas_evolution_scope' USING ERRCODE='23514';
  END IF;
  IF actual_kind='customer' AND NEW.requested_by IS DISTINCT FROM actual_owner THEN
    RAISE EXCEPTION 'invalid_somas_evolution_owner' USING ERRCODE='23514';
  END IF;
  IF NEW.plan->>'unitId' IS DISTINCT FROM NEW.unit_id OR
     NEW.plan->>'unitKind' IS DISTINCT FROM actual_kind OR
     NEW.plan->>'target' IS DISTINCT FROM NEW.target OR
     NEW.plan->>'changeKind' IS DISTINCT FROM NEW.kind OR
     NEW.plan->>'status' IS DISTINCT FROM 'proposed' OR
     NEW.plan->>'implementationStatus' IS DISTINCT FROM 'not_executed' OR
     NEW.plan->>'automaticDeployment' IS DISTINCT FROM 'false' OR
     NEW.plan->>'requiresHumanApproval' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'invalid_somas_evolution_plan' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_somas_evolution_target_insert ON somas_evolution_proposals;
CREATE TRIGGER validate_somas_evolution_target_insert
  BEFORE INSERT OR UPDATE ON somas_evolution_proposals
  FOR EACH ROW EXECUTE FUNCTION validate_somas_evolution_target();

-- This check prevents a project from being linked to the wrong workspace.
CREATE OR REPLACE FUNCTION validate_somas_customer_link() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE actual_workspace text;
BEGIN
  IF TG_OP='UPDATE' AND
    ROW(NEW.id,NEW.kind,NEW.parent_id,NEW.workspace_id,NEW.project_id) IS DISTINCT FROM
    ROW(OLD.id,OLD.kind,OLD.parent_id,OLD.workspace_id,OLD.project_id) THEN
    RAISE EXCEPTION 'immutable_somas_unit_boundary' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='customer' THEN
    SELECT workspace_id INTO actual_workspace FROM projects WHERE id=NEW.project_id;
    IF actual_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'invalid_somas_customer_workspace' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_somas_customer_link_insert ON somas_units;
CREATE TRIGGER validate_somas_customer_link_insert
  BEFORE INSERT OR UPDATE ON somas_units
  FOR EACH ROW EXECUTE FUNCTION validate_somas_customer_link();


-- Root agent training uses the same candidate gate as existing customer agents.
CREATE TABLE IF NOT EXISTS somas_root_learning_examples (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES somas_root_agents(id) ON DELETE CASCADE,
  submitted_by text NOT NULL REFERENCES users(id),
  input text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS somas_root_policy_candidates (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES somas_root_agents(id) ON DELETE CASCADE,
  base_version integer NOT NULL,
  proposed_policy jsonb NOT NULL,
  evaluation jsonb NOT NULL,
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','promoted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
