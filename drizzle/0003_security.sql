CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_reset_idx` ON `rate_limits` (`reset_at`);
--> statement-breakpoint
-- Session tokens are now stored as SHA-256 hashes. Existing sessions hold raw tokens, so end them: everyone signs in once more.
DELETE FROM `profile_sessions`;
