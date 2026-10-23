CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL
);
