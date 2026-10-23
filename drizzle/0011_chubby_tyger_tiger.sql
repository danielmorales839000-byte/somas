CREATE TABLE `hosting_connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`secret` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_publications` (
	`project_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`hostname` text NOT NULL,
	`worker_name` text NOT NULL,
	`account_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`root_origin` text NOT NULL,
	`secret` text NOT NULL,
	`auto_publish` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'awaiting_release' NOT NULL,
	`desired_version` integer DEFAULT 0 NOT NULL,
	`published_version` integer DEFAULT 0 NOT NULL,
	`observed_version` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`domain_id` text,
	`last_seen` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_publications_hostname_unique` ON `project_publications` (`hostname`);--> statement-breakpoint
CREATE INDEX `project_publications_due` ON `project_publications` (`status`,`next_at`,`lease_until`);--> statement-breakpoint
CREATE TABLE `subnet_links` (
	`project_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`connected` integer DEFAULT 1 NOT NULL,
	`last_report` text DEFAULT '{}' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subnet_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`direction` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subnet_messages_project_created` ON `subnet_messages` (`project_id`,`created`);
--> statement-breakpoint
INSERT OR IGNORE INTO subnet_links(project_id,owner,connected,last_report,updated) SELECT id,owner,1,json_object('name',json_extract(data,'$.name'),'status',json_extract(data,'$.status'),'version',json_extract(data,'$.version')),updated FROM projects WHERE COALESCE(json_extract(data,'$.scope'),'project') <> 'service';
