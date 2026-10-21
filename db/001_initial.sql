-- SOMAS v2 alpha: run once in Neon SQL Editor. No database is required per customer.
-- Customer isolation: enforced in all application queries via workspace ownership.
-- TODO before production scale: tenant RLS and database roles, migrations runner, backups.
BEGIN;
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriptions (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'none',
  provider_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','canceled','suspended')),
  plan text NOT NULL DEFAULT 'free',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  purpose text NOT NULL,
  spec jsonb NOT NULL,
  active_release integer NOT NULL DEFAULT 1,
  suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id);
CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL,
  name text NOT NULL,
  policy jsonb,
  is_core boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,role)
);
CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by text NOT NULL REFERENCES users(id),
  prompt text NOT NULL,
  category text NOT NULL,
  team jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('proposed','needs_engineering','released')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proposals (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('structured_site_update','needs_engineering')),
  proposed_spec jsonb,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_project_idx ON proposals(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS releases (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  spec jsonb NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,version)
);
CREATE TABLE IF NOT EXISTS findings (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  severity text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  evidence text NOT NULL,
  method text NOT NULL DEFAULT 'static_heuristic',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS learning_examples (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submitted_by text NOT NULL REFERENCES users(id),
  input text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS policy_candidates (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  base_version integer NOT NULL,
  proposed_policy jsonb NOT NULL,
  evaluation jsonb NOT NULL,
  status text NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','promoted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month text NOT NULL,
  kind text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,month,kind)
);
CREATE TABLE IF NOT EXISTS usage_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  agent_id text REFERENCES agents(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research_sources (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  actor_id text,
  project_id text,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
-- Additional migrations are in 002_operations.sql, run after initial schema.
