ALTER TABLE `citation_checks` MODIFY COLUMN `engine` enum('chatgpt','google') NOT NULL;--> statement-breakpoint
ALTER TABLE `citation_checks` ADD `allCitedUrls` json;--> statement-breakpoint
ALTER TABLE `citation_checks` ADD `hasAIOverview` boolean DEFAULT false;