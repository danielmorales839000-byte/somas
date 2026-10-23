CREATE TABLE `publication_intents` (
	`project_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`hostname` text DEFAULT '' NOT NULL,
	`auto_publish` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'awaiting_hosting' NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `publication_intents_due` ON `publication_intents` (`status`,`next_at`,`lease_until`);--> statement-breakpoint
CREATE TABLE `user_details` (
	`owner` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `hosting_connections` ADD `workers_subdomain` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_publications` ADD `address_type` text DEFAULT 'custom_domain' NOT NULL;