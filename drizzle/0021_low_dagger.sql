ALTER TABLE `monitored_pages` ADD `lastCitedEngines` int;--> statement-breakpoint
ALTER TABLE `monitored_pages` ADD `lastTotalEngines` int;--> statement-breakpoint
ALTER TABLE `monitored_pages` ADD `lastCitationAt` timestamp;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `citedEnginesCount` int;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `totalEnginesChecked` int;--> statement-breakpoint
ALTER TABLE `score_snapshots` ADD `citationJobId` int;