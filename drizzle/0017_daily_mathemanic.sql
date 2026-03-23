CREATE TABLE `monitor_audit_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredPageId` int NOT NULL,
	`auditId` int NOT NULL,
	`userId` int NOT NULL,
	`overallScore` float,
	`scoreDelta` float,
	`status` enum('completed','failed') NOT NULL DEFAULT 'completed',
	`emailSent` boolean NOT NULL DEFAULT false,
	`triggeredBy` enum('cron','manual') NOT NULL DEFAULT 'cron',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monitor_audit_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `monitored_pages` ADD `scheduleFrequency` int DEFAULT 7 NOT NULL;