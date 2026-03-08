ALTER TABLE `citation_checks` MODIFY COLUMN `isCited` enum('yes','no','domain') NOT NULL DEFAULT 'no';--> statement-breakpoint
ALTER TABLE `citation_checks` ADD `domainCitedUrl` text;