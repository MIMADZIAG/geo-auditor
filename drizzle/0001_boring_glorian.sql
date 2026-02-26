CREATE TABLE `audit_rate_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ipAddress` varchar(64) NOT NULL,
	`auditCount` int NOT NULL DEFAULT 1,
	`windowStart` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_rate_limits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(2048) NOT NULL,
	`userId` int,
	`ipAddress` varchar(64),
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`overallScore` float,
	`technicalScore` float,
	`structuredDataScore` float,
	`contentStructureScore` float,
	`eeatScore` float,
	`aiCrawlerScore` float,
	`metaTagsScore` float,
	`findings` json,
	`recommendations` json,
	`pageTitle` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `audits_id` PRIMARY KEY(`id`)
);
