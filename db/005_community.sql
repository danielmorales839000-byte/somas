-- Additive community release. Existing operational tables/data are not altered or dropped.
-- Fresh demo-only installations need 004 + 005; historical 001–003 are retained only in Git history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(203005);
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY,email text NOT NULL UNIQUE,password_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS community_profiles (
 id uuid PRIMARY KEY, user_id text NOT NULL UNIQUE REFERENCES users(id),
 display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 2 AND 50),
 bio text NOT NULL DEFAULT '' CHECK(char_length(bio)<=500),
 suspended boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_categories (slug text PRIMARY KEY,name text NOT NULL);
INSERT INTO community_categories VALUES ('platform','SOMAS Platform'),('network','SOMAS Network'),('ideas','Ideas & Suggestions'),('questions','Questions & Answers'),('general','General Discussion'),('bugs','Bug Reports & Feedback') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS community_discussions (
 id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES community_profiles(id),
 title text NOT NULL CHECK(char_length(title) BETWEEN 4 AND 140),
 category text NOT NULL REFERENCES community_categories(slug),
 body text NOT NULL CHECK(char_length(body) BETWEEN 20 AND 10000),
 tags jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(tags)='array' AND jsonb_array_length(tags)<=5),
 status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','deleted')),
 pinned boolean NOT NULL DEFAULT false, locked boolean NOT NULL DEFAULT false, official boolean NOT NULL DEFAULT false,
 suggestion_state text NOT NULL DEFAULT 'proposed' CHECK(suggestion_state IN ('proposed','under_review','planned','in_progress','implemented','declined')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_activity timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_discussion_recent ON community_discussions(status,pinned DESC,created_at DESC,id);
CREATE INDEX IF NOT EXISTS community_discussion_category ON community_discussions(category,status,last_activity DESC);
CREATE INDEX IF NOT EXISTS community_discussion_author ON community_discussions(profile_id,created_at DESC);
CREATE TABLE IF NOT EXISTS community_replies (
 id uuid PRIMARY KEY,discussion_id uuid NOT NULL REFERENCES community_discussions(id),profile_id uuid NOT NULL REFERENCES community_profiles(id),
 body text NOT NULL CHECK(char_length(body) BETWEEN 2 AND 5000),status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','deleted')),
 official boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_reply_thread ON community_replies(discussion_id,status,created_at,id);
CREATE INDEX IF NOT EXISTS community_reply_author ON community_replies(profile_id,created_at DESC);
CREATE TABLE IF NOT EXISTS community_votes (
 profile_id uuid NOT NULL REFERENCES community_profiles(id),discussion_id uuid REFERENCES community_discussions(id),reply_id uuid REFERENCES community_replies(id),
 CHECK(num_nonnulls(discussion_id,reply_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS community_vote_discussion ON community_votes(profile_id,discussion_id) WHERE discussion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS community_vote_reply ON community_votes(profile_id,reply_id) WHERE reply_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_vote_discussion_count ON community_votes(discussion_id);
CREATE INDEX IF NOT EXISTS community_vote_reply_count ON community_votes(reply_id);
CREATE TABLE IF NOT EXISTS community_follows (
 profile_id uuid NOT NULL REFERENCES community_profiles(id),discussion_id uuid NOT NULL REFERENCES community_discussions(id),PRIMARY KEY(profile_id,discussion_id)
);
CREATE TABLE IF NOT EXISTS community_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id uuid NOT NULL REFERENCES community_profiles(id),discussion_id uuid NOT NULL REFERENCES community_discussions(id),reply_id uuid NOT NULL REFERENCES community_replies(id),
 kind text NOT NULL CHECK(kind IN ('reply','official')),read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(recipient_id,reply_id)
);
CREATE INDEX IF NOT EXISTS community_notifications_recipient ON community_notifications(recipient_id,created_at DESC);
CREATE TABLE IF NOT EXISTS community_reports (
 id uuid PRIMARY KEY,reporter_id uuid NOT NULL REFERENCES community_profiles(id),discussion_id uuid REFERENCES community_discussions(id),reply_id uuid REFERENCES community_replies(id),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(num_nonnulls(discussion_id,reply_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS community_report_discussion ON community_reports(reporter_id,discussion_id) WHERE discussion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS community_report_reply ON community_reports(reporter_id,reply_id) WHERE reply_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_reports_status ON community_reports(status,created_at DESC);
CREATE TABLE IF NOT EXISTS community_moderation (
 id uuid PRIMARY KEY,actor_user_id text NOT NULL REFERENCES users(id),target_id uuid NOT NULL,action text NOT NULL,reason text NOT NULL CHECK(char_length(reason) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_limits (key text NOT NULL,window_start timestamptz NOT NULL,attempts integer NOT NULL CHECK(attempts>0),PRIMARY KEY(key,window_start));
REVOKE ALL ON community_profiles,community_categories,community_discussions,community_replies,community_votes,community_follows,community_notifications,community_reports,community_moderation,community_limits FROM PUBLIC;
COMMIT;
