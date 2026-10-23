CREATE TABLE `oauth_identities` (
	`provider` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_identity_user` ON `oauth_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_providers` (
	`provider` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`browser_hash` text NOT NULL,
	`payload` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `email_sessions` ADD `auth_provider` text DEFAULT 'email' NOT NULL;