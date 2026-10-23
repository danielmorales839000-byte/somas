CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`status` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`expires` integer DEFAULT 0 NOT NULL,
	`provider_id` text
);
--> statement-breakpoint
CREATE TABLE `manager_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`applicant` text NOT NULL,
	`reason` text NOT NULL,
	`challenge_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	`reviewer` text,
	`reviewed` integer
);
--> statement-breakpoint
CREATE TABLE `verification_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`actor` text NOT NULL,
	`target` text NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `verified_email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;