ALTER TABLE `accounts` ADD `provider` text DEFAULT 'groq' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `pricing` text DEFAULT '{"mode":"unknown"}' NOT NULL;