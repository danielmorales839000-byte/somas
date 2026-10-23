CREATE INDEX `activity_actor_created` ON `activity` (`actor`,`created`);--> statement-breakpoint
CREATE INDEX `activity_created_id` ON `activity` (`created`,`id`);--> statement-breakpoint
CREATE INDEX `mail_outbox_due` ON `mail_outbox` (`status`,`next_at`,`lease_until`);--> statement-breakpoint
CREATE INDEX `challenge_actor_purpose_created` ON `verification_challenges` (`actor`,`purpose`,`created`);