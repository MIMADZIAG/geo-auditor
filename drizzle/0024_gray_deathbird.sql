CREATE TABLE `monitored_page_phrases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredPageId` int NOT NULL,
	`userId` int NOT NULL,
	`phrase` varchar(512) NOT NULL,
	`source` enum('ai_generated','user_added','user_modified') NOT NULL DEFAULT 'ai_generated',
	`aiRationale` text,
	`intentType` enum('informational','navigational','commercial','transactional') DEFAULT 'informational',
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`lastCitedEngines` int DEFAULT 0,
	`lastCheckedAt` timestamp,
	`citationStreakDays` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monitored_page_phrases_id` PRIMARY KEY(`id`)
);
