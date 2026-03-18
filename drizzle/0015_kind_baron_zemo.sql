CREATE TABLE `ai_exposure_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`domain` varchar(255) NOT NULL,
	`result` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` bigint NOT NULL,
	CONSTRAINT `ai_exposure_cache_id` PRIMARY KEY(`id`)
);
