CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`expires` integer NOT NULL
);
