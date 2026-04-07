ALTER TABLE `monitored_page_phrases` ADD `engineAffinity` json;--> statement-breakpoint
ALTER TABLE `monitored_page_phrases` ADD `citationProbability` enum('high','medium','low');