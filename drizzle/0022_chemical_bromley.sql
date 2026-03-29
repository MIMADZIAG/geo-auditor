CREATE TABLE `weekly_digest_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weekStart` timestamp NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`avgScoreThisWeek` float,
	`avgScorePrevWeek` float,
	`citedEnginesThisWeek` float,
	`citedEnginesPrevWeek` float,
	`monitoredPagesCount` int DEFAULT 0,
	CONSTRAINT `weekly_digest_log_id` PRIMARY KEY(`id`)
);
