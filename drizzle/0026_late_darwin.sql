CREATE TABLE `visibility_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredPageId` int NOT NULL,
	`citationJobId` int NOT NULL,
	`auditId` int,
	`citedEnginesCount` int NOT NULL DEFAULT 0,
	`totalEnginesChecked` int NOT NULL DEFAULT 4,
	`visibilityRate` float NOT NULL DEFAULT 0,
	`visibilityScore` int NOT NULL DEFAULT 0,
	`sentimentScore` float,
	`sentimentLabel` enum('positive','neutral','negative'),
	`sentimentThemes` json,
	`avgMentionPosition` float,
	`prominenceRate` float,
	`shareOfVoice` float,
	`competitorCitationCount` int DEFAULT 0,
	`topCompetitorDomains` json,
	`engineBreakdown` json,
	`sampleResponses` json,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visibility_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `visibilityRate` float;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `avgMentionPosition` float;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `sentimentScore` float;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `prominenceRate` float;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `shareOfVoice` float;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `competitorCitationCount` int;