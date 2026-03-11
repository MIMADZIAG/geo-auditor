ALTER TABLE `citation_checks` ADD `round` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `citation_checks` ADD `competitorDomains` json;