-- Additive only: existing project, owner and publication identities stay intact.
ALTER TABLE project_publications ADD COLUMN team_runtime integer NOT NULL DEFAULT 0;
