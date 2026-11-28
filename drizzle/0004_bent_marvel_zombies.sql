CREATE TABLE `achievements` (
	`profile_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`game` text NOT NULL,
	`earned_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `achievement_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `favourites` (
	`profile_id` text NOT NULL,
	`game` text NOT NULL,
	PRIMARY KEY(`profile_id`, `game`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
