CREATE TABLE `phrase_citation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phraseId` int NOT NULL,
	`monitoredPageId` int NOT NULL,
	`citationJobId` int,
	`chatgptCited` boolean,
	`perplexityCited` boolean,
	`googleCited` boolean,
	`geminiCited` boolean,
	`citedEnginesCount` int NOT NULL DEFAULT 0,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phrase_citation_history_id` PRIMARY KEY(`id`)
);
