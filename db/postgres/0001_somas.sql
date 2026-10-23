-- Current SOMAS website schema through D1 migration 0014.
-- Deliberately independent of the unrelated SOMAS v2 schema.
CREATE TABLE "accounts" (
	"owner" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"models" text NOT NULL,
	"manager_model" text NOT NULL,
	"worker_model" text NOT NULL,
	"next_call" bigint DEFAULT 0 NOT NULL
, "provider" text DEFAULT 'groq' NOT NULL, "pricing" text DEFAULT '{"mode":"unknown"}' NOT NULL);

CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"status" bigint NOT NULL,
	"created" bigint NOT NULL
);

CREATE TABLE "email_logins" (
	"email" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL
);

CREATE TABLE "email_sender" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"updated" bigint NOT NULL
);

CREATE TABLE "email_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created" bigint NOT NULL,
	"expires" bigint NOT NULL
, "auth_provider" text DEFAULT 'email' NOT NULL);

CREATE TABLE "hosting_connections" (
	"owner" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"secret" text NOT NULL,
	"updated" bigint NOT NULL
, "workers_subdomain" text DEFAULT '' NOT NULL);

CREATE TABLE "login_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" bigint NOT NULL
);

CREATE TABLE "mail_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"next_at" bigint DEFAULT 0 NOT NULL,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"created" bigint NOT NULL,
	"expires" bigint DEFAULT 0 NOT NULL,
	"provider_id" text
, "last_error" text DEFAULT '' NOT NULL);

CREATE TABLE "manager_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"applicant" text NOT NULL,
	"reason" text NOT NULL,
	"challenge_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created" bigint NOT NULL,
	"reviewer" text,
	"reviewed" bigint
);

CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"created" bigint NOT NULL
);

CREATE TABLE "oauth_identities" (
	"provider" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" text NOT NULL
);

CREATE TABLE "oauth_providers" (
	"provider" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"updated" bigint NOT NULL
);

CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"browser_hash" text NOT NULL,
	"payload" text NOT NULL,
	"expires" bigint NOT NULL
);

CREATE TABLE "opinions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"message" text NOT NULL,
	"created" bigint NOT NULL
);

CREATE TABLE "project_publications" (
	"project_id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"hostname" text NOT NULL,
	"worker_name" text NOT NULL,
	"account_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"root_origin" text NOT NULL,
	"secret" text NOT NULL,
	"auto_publish" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'awaiting_release' NOT NULL,
	"desired_version" bigint DEFAULT 0 NOT NULL,
	"published_version" bigint DEFAULT 0 NOT NULL,
	"observed_version" bigint DEFAULT 0 NOT NULL,
	"next_at" bigint DEFAULT 0 NOT NULL,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"domain_id" text,
	"last_seen" bigint DEFAULT 0 NOT NULL
, "publish_stage" text DEFAULT 'preflight' NOT NULL, "address_type" text DEFAULT 'custom_domain' NOT NULL);

CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"data" text NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"paused" bigint DEFAULT 0 NOT NULL,
	"lease" text,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"updated" bigint NOT NULL
);

CREATE TABLE "publication_intents" (
	"project_id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"mode" text NOT NULL,
	"hostname" text DEFAULT '' NOT NULL,
	"auto_publish" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'awaiting_hosting' NOT NULL,
	"next_at" bigint DEFAULT 0 NOT NULL,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"updated" bigint NOT NULL
, "root_origin" text DEFAULT '' NOT NULL);

CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL
);

CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"created" bigint NOT NULL
);

CREATE TABLE "subnet_links" (
	"project_id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"connected" bigint DEFAULT 1 NOT NULL,
	"last_report" text DEFAULT '{}' NOT NULL,
	"updated" bigint NOT NULL
);

CREATE TABLE "subnet_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"direction" text NOT NULL,
	"message" text NOT NULL,
	"created" bigint NOT NULL
);

CREATE TABLE "user_details" (
	"owner" text PRIMARY KEY NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_by" text NOT NULL,
	"updated" bigint NOT NULL
);

CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"joined" bigint NOT NULL,
	"last_seen" bigint NOT NULL
, "verified_email" text, "email_verified_at" bigint DEFAULT 0 NOT NULL, "role" text DEFAULT 'user' NOT NULL, "status" text DEFAULT 'active' NOT NULL);

CREATE TABLE "verification_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"actor" text NOT NULL,
	"target" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires" bigint NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"consumed" bigint DEFAULT 0 NOT NULL,
	"created" bigint NOT NULL
);

CREATE INDEX "activity_actor_created" ON "activity" ("actor","created");

CREATE INDEX "activity_created_id" ON "activity" ("created","id");

CREATE INDEX "challenge_actor_purpose_created" ON "verification_challenges" ("actor","purpose","created");

CREATE UNIQUE INDEX "email_logins_user_id_unique" ON "email_logins" ("user_id");

CREATE INDEX "email_sessions_expires" ON "email_sessions" ("expires");

CREATE INDEX "email_sessions_user" ON "email_sessions" ("user_id");

CREATE INDEX "mail_outbox_due" ON "mail_outbox" ("status","next_at","lease_until");

CREATE UNIQUE INDEX "oauth_identity_subject" ON "oauth_identities" ("provider","issuer","subject");

CREATE INDEX "oauth_identity_user" ON "oauth_identities" ("user_id");

CREATE INDEX "project_publications_due" ON "project_publications" ("status","next_at","lease_until");

CREATE UNIQUE INDEX "project_publications_hostname_unique" ON "project_publications" ("hostname");

CREATE INDEX "publication_intents_due" ON "publication_intents" ("status","next_at","lease_until");

CREATE UNIQUE INDEX "service_project_id_unique" ON "service" ("project_id");

CREATE INDEX "subnet_messages_project_created" ON "subnet_messages" ("project_id","created");

CREATE TABLE password_credentials (user_id text PRIMARY KEY, password_hash text NOT NULL, updated bigint NOT NULL);
CREATE TABLE password_signups (challenge_id text PRIMARY KEY, password_hash text NOT NULL, expires bigint NOT NULL, flow text NOT NULL);
