CREATE TABLE `device_pairings` (
	`code` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`profile_id` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_pairings_secret_unique` ON `device_pairings` (`secret`);--> statement-breakpoint
CREATE INDEX `device_pairings_expires_idx` ON `device_pairings` (`expires`);