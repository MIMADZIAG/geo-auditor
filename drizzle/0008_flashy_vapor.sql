CREATE TABLE `citation_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`auditId` int NOT NULL,
	`query` text NOT NULL,
	`engine` enum('chatgpt','perplexity','google') NOT NULL,
	`isCited` enum('yes','no','partial') NOT NULL DEFAULT 'no',
	`citedUrl` text,
	`snippet` text,
	`responseText` text,
	`cacheKey` varchar(64),
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `citation_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `citation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditId` int NOT NULL,
	`userId` int,
	`url` varchar(2048) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`prompts` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `citation_jobs_id` PRIMARY KEY(`id`)
);
