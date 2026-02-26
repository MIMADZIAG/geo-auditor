CREATE TABLE `monitored_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`label` varchar(255),
	`lastAuditId` int,
	`lastScore` float,
	`lastAuditAt` timestamp,
	`nextAuditAt` timestamp,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monitored_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `score_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredPageId` int NOT NULL,
	`auditId` int NOT NULL,
	`overallScore` float NOT NULL,
	`technicalScore` float,
	`structuredDataScore` float,
	`contentStructureScore` float,
	`eeatScore` float,
	`aiCrawlerScore` float,
	`metaTagsScore` float,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `score_snapshots_id` PRIMARY KEY(`id`)
);
