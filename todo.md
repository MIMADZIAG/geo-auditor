# GEO-Auditor TODO

## Phase 1 — MVP

### Database & Schema
- [x] Define `audits` table in drizzle/schema.ts
- [x] Define `audit_rate_limits` table for IP-based rate limiting
- [x] Push DB migrations

### Backend — Audit Engine
- [x] Install cheerio, robots-parser dependencies
- [x] Create server/audit/scraper.ts — fetch HTML, robots.txt, headers
- [x] Create server/audit/technical.ts — robots.txt, meta tags, canonical, HTTPS, noindex
- [x] Create server/audit/structuredData.ts — JSON-LD detection and validation
- [x] Create server/audit/contentStructure.ts — headings, TL;DR, FAQ, lists
- [x] Create server/audit/eeat.ts — author, about page, contact, citations
- [x] Create server/audit/aiCrawlers.ts — GPTBot, PerplexityBot, ClaudeBot, Google-Extended
- [x] Create server/audit/metaTags.ts — title, description, OG tags
- [x] Create server/audit/scorer.ts — weighted scoring engine (0-100)
- [x] Create server/audit/index.ts — orchestrator
- [x] Add tRPC procedure: audit.run (public, rate-limited)
- [x] Add tRPC procedure: audit.getById
- [x] Add tRPC procedure: audit.myHistory (protected)
- [x] Fix insertId extraction bug (drizzle returns [result, null] array)

### Frontend — UI
- [x] Design system: dark theme, OKLCH color palette, Inter font, global CSS variables
- [x] Landing page with hero, URL input form, feature highlights
- [x] URL input with validation, loading state, progress animation
- [x] Results page with overall score gauge/ring (SVG)
- [x] Score breakdown by 6 categories (progress bars)
- [x] Category detail cards with pass/fail checks (collapsible)
- [x] Recommendations list with priority badges and fix descriptions
- [x] AI Crawler access status panel
- [x] Mobile-responsive layout
- [x] Error states (invalid URL, fetch failed, timeout)
- [x] Copy-to-clipboard for recommendations
- [x] Fix CSS @import order (Google Fonts before tailwind)

### Tests
- [x] Unit tests for scorer.ts (5 tests)
- [x] Unit tests for technical.ts checks (7 tests)
- [x] Unit tests for structuredData.ts parser (6 tests)
- [x] Unit tests for contentStructure.ts (5 tests)
- [x] Unit tests for aiCrawlers.ts (4 tests)
- [x] Auth logout test

### Rate Limiting
- [x] Rate limiting (3 free audits per 24h by IP for anonymous users)
- [x] Authenticated users bypass rate limit

## Phase 2 — Validation (Future)
- [ ] Product Hunt launch
- [ ] User feedback collection
- [ ] Algorithm improvements based on feedback
- [ ] Email capture for waitlist

## Phase 3 — Monetization (Future)
- [ ] Stripe integration
- [ ] Paid plan tiers (Starter, Pro, Business)
- [ ] Audit history dashboard
- [ ] PDF export
- [ ] Page monitoring / scheduled re-audits

## LLM-Powered Recommendations (Step 1)

- [x] Review existing scorer.ts and audit types
- [x] Create server/audit/llmRecommendations.ts — context assembly + LLM call
- [x] Design structured JSON schema for LLM output (title, description, codeSnippet, howToFix, impact, priority)
- [x] Integrate LLM recommendations into audit/index.ts orchestrator
- [x] Update DB schema to store llmRecommendations as JSON column
- [x] Push DB migration
- [x] Update tRPC router to return llmRecommendations in getById
- [x] Update frontend Results.tsx — new LLM Recommendations panel with code snippet viewer
- [x] Add syntax highlighting for JSON-LD code snippets
- [x] Add loading/skeleton state for LLM section
- [x] Write unit tests for LLM module (mock invokeLLM)
- [x] End-to-end test with real URL

## Bug Fixes

- [x] Fix E-E-A-T: detect Polish "O nas" links in footer/nav (currently misses href="/o-nas" pattern)
- [x] Fix E-E-A-T: expand about page detection to cover Polish language patterns (o-nas, wspolpraca, kontakt)
- [x] Fix meta title: handle emoji characters in <title> tags (totalmoney.pl case)
- [x] Update unit tests for both fixes (40 tests total, all passing)

## PLG & Virality Enhancements (doc: manus.im/share/file/32ab2524)

### Rekomendacja 1: Monitoring
- [x] DB: monitored_pages table (userId, url, label, plan, createdAt, lastAuditAt, nextAuditAt)
- [x] DB: score_snapshots table for score history
- [x] Backend: tRPC procedures for add/remove/list/getSnapshots monitored pages
- [x] Frontend: /dashboard page — monitoring slots (1 free, 4 locked for upgrade)
- [x] Frontend: score history chart (recharts LineChart) in Dashboard

### Rekomendacja 2: Wiralność
- [x] Public report URL — each audit accessible at /report/:id without auth
- [x] Share buttons on Results page (LinkedIn, X/Twitter, Facebook, Copy Link)
- [x] Embeddable badge generator (score >=70) — HTML snippet with "AI-Ready: X/100 | GEO-Auditor"
- [x] Branded public report page at /report/:id with GEO-Auditor logo and CTA

### Rekomendacja 3: PLG Upsell Signals
- [x] ResultsSharePanel — share section in Results page
- [x] ScoreHistoryTeaser — locked/blurred chart with Sign In CTA for non-auth users
- [x] PLGUpgradeBanner — contextual CTA (Dashboard or Sign In) at bottom of Results
- [x] "Empty slots" visualization in Dashboard (4 locked monitoring slots)
- [x] UpgradeBanner in Dashboard with Starter plan features

### Free Plan Limit Update
- [x] Changed rate limit to 5/month per IP (aligned with new plan table)
- [x] Home nav: Sign In button for non-auth, Dashboard button for auth users

## Bug Fix: Nested Schema Detection

- [x] Fix structuredData.ts: detect @type inside @graph arrays (e.g. Product inside ItemList/@graph)
- [x] Fix structuredData.ts: detect @type inside nested item objects (e.g. ListItem.item.@type)
- [x] Fix structuredData.ts: handle @type as array (multi-type nodes like LocalBusiness+Restaurant)
- [x] Update LLM context builder to pass all detected nested schema types
- [x] Update LLM system prompt: NEVER suggest adding already-present schema types
- [x] Update unit tests for nested schema detection (3 new tests, 43 total passing)

## Bug Fix: Multiple JSON-LD Blocks & Schema Subtype Mapping

- [ ] Fix structuredData.ts: parse ALL `<script type="application/ld+json">` blocks per page (not just first)
- [ ] Fix structuredData.ts: map NewsArticle → Article, BlogPosting → Article, etc. (schema.org subtype hierarchy)
- [ ] Fix structuredData.ts: handle multiple separate @context blocks (not inside @graph)
- [ ] Update LLM prompt: explicitly list all detected schema types including subtypes, never suggest adding already-present subtypes
- [ ] Update unit tests for multiple JSON-LD blocks and subtype mapping

## Scoring Recalibration & Page Type Detection

### Page Type Detector
- [ ] Create server/audit/pageTypeDetector.ts — detect: article, product-listing, category, homepage, landing-page, generic
- [ ] Detection signals: JSON-LD @type (Product, ItemList, Article, WebPage), URL patterns, H1 content, page structure
- [ ] Export PageType enum and detectPageType(page) function

### Scoring Recalibration
- [ ] Change warning multiplier: 0.5 → 0.2 (warning is now a real penalty, not a half-pass)
- [ ] GEO-specific criteria: TL;DR, FAQ section, FAQ schema → change from warning to fail when absent
- [ ] Organization schema → change from warning to fail when absent on homepage/landing; warning on others
- [ ] Recalibrate score label thresholds: Excellent ≥85, Good ≥65, Fair ≥45, Poor <45
- [ ] Adjust category weights: bump Content Structure to 30%, reduce Technical to 20% (technical is table stakes)
- [ ] Add new content checks: citation-readiness (external links count), answer-pattern detection (Q: A: format)

### Adaptive E-E-A-T
- [ ] article/blog: author byline = fail if missing (high weight), external citations = fail if missing
- [ ] product-listing / category: author = removed; add: seller_info (return policy, guarantee), review_signals (star ratings, review count), trust_badges
- [ ] homepage: author = removed; add: team_info (founders/team section), company_history, awards/press
- [ ] landing-page: author = optional; add: social_proof (testimonials, logos), case_study_links
- [ ] generic: author = warning (medium weight), external citations = warning
- [ ] Update E-E-A-T summary messages to reflect page type context
- [ ] Update LLM context builder to include detected page type

### Tests & Validation
- [ ] Add unit tests for pageTypeDetector
- [ ] Add unit tests for adaptive E-E-A-T per page type
- [ ] Verify: typical e-commerce listing scores 45–65/100
- [ ] Verify: well-optimized article scores 70–85/100
- [ ] Verify: fully optimized page can reach 90+/100

## Bug Fix: Transient HTTP Errors (Retry Logic)

- [x] Fix scraper.ts: implement retry with exponential backoff (up to 3 attempts) for 449, 429, 5xx, network errors
- [x] Fix scraper.ts: randomize User-Agent per request (pool of 5 real browser agents) to reduce bot detection
- [x] Fix scraper.ts: add jitter to retry delays to avoid thundering herd
- [x] Fix error messaging: transient errors are retried silently, transparent to user
- [x] Update tests for retry logic (5 new tests, 52 total passing)

## Content Intelligence (LLM-Powered Content Quality)

- [x] Build server/audit/contentIntelligence.ts with 5 LLM-powered checks:
  - [x] Answer Density: does the page directly answer top questions for its topic?
  - [x] Factual Density: count of numbers, dates, named entities, specs per 1000 words
  - [x] Duplicate Risk: does content sound generic/copied vs. unique perspective?
  - [x] Citation Readiness: are there citable claims with dates/authors/sources?
  - [x] Query Coverage: does content cover the questions users ask AI for this topic?
- [x] Update DB schema: add contentIntelligence JSON column to audits table
- [x] Push DB migration
- [x] Integrate contentIntelligence into audit/index.ts orchestrator
- [x] Recalibrate category weights: Content Structure 25%→30%, Technical 25%→20%
- [x] Update shared/auditTypes.ts with ContentIntelligence types
- [x] Build ContentIntelligence premium UI panel in Results.tsx
  - [x] Citeability Score gauge (SVG ring, 0-100)
  - [x] 5 expandable check cards (Answer Density, Factual Density, Duplicate Risk, Citation Readiness, Query Coverage)
  - [x] Page topics tags
  - [x] Top opportunity highlight
  - [x] PLG sign-in nudge for non-authenticated users
  - [x] "AI Citeability Score" — single number 0-100 for virality/shareability
  - [x] Specific improvement suggestions per check with examples
- [x] Write unit tests for contentIntelligence module (55 tests passing)
- [x] Verify end-to-end with real URLs

## v4 — Finalny redesign: "Asystent Audytora"

- [x] Przywrócić scoring hero 0-100 z animowanym SVG gauge — claim "AI Visibility Score"
- [x] Content Intelligence jako główna sekcja (Citeability Score + 5 wymiarów + Page Topics + Top Opportunity)
- [x] Trzy filary wyników: AI Visibility Score → Content Intelligence → Issues & Fixes
- [x] Issues uproszczone językowo — ludzki opis, zero technicznego żargonu
- [x] Nowy landing page: hero + How it works + preview wyników (Score card + CI card + Issues card)
- [x] Zachować Pricing page, email capture, share mechanics
- [x] 55 testów passing, 0 błędów TS

## v5 — Polish, PLG & Retention

- [x] Fix responsywność: tytuł audytowanej strony (line-clamp-2 + break-words + title tooltip)
- [x] Fix responsywność: URL w headerze (max-width 200px + text-overflow ellipsis)
- [x] Zmiana kolejności sekcji wyników: Critical Issues PRZED Content Intelligence
- [x] PLG: MonitorCTA po Issues (contextual, kiedy user widzi problemy)
- [x] PLG: CompetitorAnalysisTeaser (Pro feature, blurred preview)
- [x] PLG: PLGUpgradeBanner z 3-kolumnową tabelą planów (Free/Starter/Pro)
- [x] Landing page: usunięto "40+ checks" section
- [x] Landing page: nowa sekcja "Why AI search skips most pages" (4 powody, wartościowe)
- [x] 55 testów passing, 0 błędów TS

## AI Sandbox Simulator (moduł z czatu a0jlR4RI3zkml89F0datTJ)

- [x] Pobrać archiwum ZIP z Google Drive i rozpakować moduł geo-sandbox
- [x] Skopiować silnik (engine/simulator.ts, engine/contentAnalyzer.ts, engine/algorithmProfiles.ts) do client/src/geo-sandbox/
- [x] Skopiować komponenty UI (ScoreGauge, EngineBreakdown, IssuesList, WhatIfEditor, RRFVisualizer, CitationProbabilityChart) do client/src/geo-sandbox/components/
- [x] Naprawić błąd TS: Set spread → Array.from(new Set(...)) w contentAnalyzer.ts
- [x] Dodać tRPC procedure sandbox.fetchPage (pobiera HTML + robots.txt z URL dla silnika)
- [x] Zbudować stronę /sandbox z SandboxWithTRPC wrapper (podłączony do tRPC zamiast mock)
- [x] Zarejestrować trasę /sandbox w App.tsx
- [x] Dodać AISandboxCTA banner w Results.tsx (po Content Intelligence, przed Competitor Teaser)
- [x] Naprawić uszkodzony PLGUpgradeBanner (błąd edycji — brakujące zamknięcia JSX)
- [x] 55 testów passing, 0 błędów TS

## Bug Fix: H1/nagłówki, CI kolejność, WhatIfEditor

- [x] Fix contentStructure.ts: H1 i nagłówki liczone PRZED usunięciem elementu <header> (był strip H1 razem z <header>)
- [x] Fix CI panel: Query Coverage questions (top_questions) pokazane PRZED Citeability Score gauge — user widzi zapytania najpierw
- [x] Odblokować WhatIfEditor w Sandbox dla wszystkich użytkowników — usunięto isPremium gate
- [x] Sandbox.tsx: header message zmieniony z "Sign in to unlock" na "Sign in to save history"
- [x] 55 testów passing, 0 błędów TS

## v6 — Bug Fixes & Enhancements

- [x] Fix #1: blokada wyników gdy non-200 po 3 retry (audit/index.ts) + Puppeteer fallback gdy cheerio zwraca <500 znaków
- [x] Fix #2: JS-rendered scraper — Puppeteer (systemowy Chromium) jako fallback dla JS-heavy stron
- [x] Fix #3: 5 nowych trudnych checks w technical.ts, kalibracja progów scoringowych (Excellent ≥85, Good ≥65)
- [x] Fix #4: detekcja Privacy Policy/O nas/Kontakt w PL, EN, DE, FR, ES — wzorce href + text + footer
- [x] Fix #5: nowy moduł brandAuthority.ts — Brand Presence Score (domena, social, Wikipedia, branża)
- [x] Integracja brandAuthority w audit/index.ts i scorer.ts (waga 22% BASE, 18% WITH_CI)
- [x] Dodanie "Brand Presence" do CATEGORY_META i opisów w Results.tsx
- [x] Naprawa testów po zmianie wag scorera (55 testów passing)
- [x] 0 błędów TS

## v7 — iPullRank AI Search Manual Algorithm Upgrades

Based on: https://ipullrank.com/ai-search-manual/ (Chapters 7, 9, 10, 11)

### technical.ts (Ch.7 — How AI Crawlers Work)
- [x] Add max-snippet meta tag check (max-snippet:0 = fail, -1 = pass, limited = warning)
- [x] Add noai/noimageai directive detection (explicit AI opt-out = fail)
- [x] Add JavaScript rendering detection (thin body text + heavy JS = warning)
- [x] Update scoring weights: new checks weighted 8pts each

### structuredData.ts (Ch.9 — Knowledge Graph & Entities)
- [x] Add HowTo schema as high-value type (explicitly recommended by iPullRank)
- [x] Add sameAs property check for Organization (Knowledge Graph readiness)
- [x] Add schema completeness scoring (0-100, "be comprehensive not just compliant")
- [x] Add Person schema type to HIGH_VALUE_TYPES
- [x] Add SpeakableSpecification schema type (voice/AI assistant optimization)
- [x] Add datePublished check alongside dateModified (freshness signals)
- [x] Organization schema: require sameAs for "pass" status (without = "warning")

### contentStructure.ts (Ch.9 — Semantic Chunking & Entity Richness)
- [x] Add semantic_chunking check (paragraph length 40-80 words = pass)
- [x] Add entity_richness check (named entities density per 1000 words)
- [x] Add information_gain check (unique data, original research, statistics with dates)
- [x] Add co_reference_clarity check (pronoun-to-noun ratio)
- [x] Add readability_score check (Flesch-Kincaid proxy via sentence/word length)

### contentIntelligence.ts (Ch.9, 11 — LLM Content Quality)
- [x] Add embedding_language dimension (weight 15%) — vector embedding quality
- [x] Add topic_authority dimension (weight 15%) — topical coverage and depth
- [x] Add freshness_signals dimension (weight 10%) — temporal relevance
- [x] Add semantic_gaps field to result (missing subtopics)
- [x] Update weights: 8 dimensions, iPullRank-aligned priorities

### eeat.ts (Ch.9 — Experience in E-E-A-T)
- [x] Add experience_signals check (first-person language, case studies, test results)
- [x] Add expertise_signals check (credentials, qualifications, professional background)
- [x] Update scoring weights for new checks per page type

### aiCrawlers.ts (Ch.7 — AI Crawler Landscape)
- [x] Add OAI-SearchBot (ChatGPT Search — different from GPTBot)
- [x] Add YouBot (You.com AI search)
- [x] Add Bytespider (ByteDance/TikTok AI)
- [x] Improve robots.txt sitemap directive check

### scorer.ts — Category Weights (iPullRank aligned)
- [x] contentStructure: 20% → 22% (semantic chunking is core GEO signal)
- [x] eeat: 12% → 15% (Experience is increasingly important)
- [x] contentIntelligence: 24% → 25% (content quality = #1 predictor)
- [x] Add 8 new recommendation types for new checks

### Tests
- [x] Update weight-based tests to match new values (55 tests passing, 0 TS errors)
- [x] Update organization_schema tests to reflect sameAs requirement

## Bug Fix: H1 Detection & Heading Order

- [x] Fix contentStructure.ts: H1 detection false negative — H1 counted BEFORE removing <header> element (many CMS/e-commerce sites place H1 inside <header>)
- [x] Fix contentStructure.ts: heading order check downgraded from "fail/ranking factor" to "info/hint" — status always 'info', weight 0 in scorer, shown as advisory only
- [x] 55 tests passing, 0 TS errors

## Bug Fix: H1 Puppeteer Fallback (Vue.js/JS-rendered)

- [x] Root cause found: pageTypeDetector.ts mutated shared page.$ by calling $('header').remove() BEFORE contentStructure ran — destroying H1 in header
- [x] Fix: pageTypeDetector.ts now uses cheerio.load(page.html) fresh instance for content-length check — never mutates page.$
- [x] Pipeline simulation test confirms fix: OLD=0 H1, NEW=1 H1 for totalmoney.pl
- [x] 55 tests passing, 0 TS errors

## Regression Test & page.$ Mutation Audit

- [x] Add regression test: 4 tests covering H1-in-header pipeline isolation (detectPageType → contentStructure → eeat cross-module DOM integrity)
- [x] Audit all audit modules for page.$ mutations — contentStructure.ts now uses cheerio.load(page.html) local copy; pageTypeDetector.ts already fixed; llmRecommendations.ts and contentIntelligence.ts already safe
- [x] Add JSDoc immutability contract to ScrapedPage interface with ✅/❌ examples
- [x] 59 tests passing, 0 TS errors

## Feature: AI Citation MVP (Pro)

- [x] DB schema: citation_checks, citation_jobs tables (migration 0008 applied)
- [x] tRPC: citation.startCheck (protectedProcedure), citation.getResults (publicProcedure)
- [x] Citation engine: prompt generation via internal LLM (zero cost)
- [x] Citation engine: OpenAI Responses API web search (gpt-4o-mini-search-preview, BYOK key)
- [x] Citation engine: Perplexity via built-in Manus LLM (zero cost) + optional direct Perplexity API
- [x] Citation engine: Puppeteer scraper for Google AI Overviews (zero cost)
- [x] Cache layer: 24h deduplication by query+engine hash (in DB)
- [x] UI: AICitationPanel in Results.tsx (after ContentIntelligencePanel)
- [x] UI: per-engine cards (ChatGPT / Perplexity / Google) with citation score + query list
- [x] UI: "queries with no citations" section (content gap signal)
- [x] UI: unauthenticated blur/lock state with login CTA
- [x] OPENAI_API_KEY configured and validated ✅
- [ ] Tests: citation worker unit tests (pending)

## Bug Fix: AI Citation — Fałszywe dane, język, zapytania

- [x] Fix: reuse Content Intelligence top_questions jako zapytania (zero kosztu LLM, precyzyjne frazy)
- [x] Fix: detekcja języka strony przez html lang attr + heurystyka polskich znaków; język przekazywany do wszystkich silników
- [x] Fix: STRICT URL matching w OpenAI — tylko exactCitation w annotations[].url = "yes"; text mentions usunięte
- [x] Fix: STRICT URL matching w Puppeteer Google — tylko exactCitation w href links AI Overview; unwrap Google redirect URLs
- [x] Fix: Perplexity — langInstruction w języku strony; usunięty hint "uwzględnij targetUrl" (zapobiega hallucynacjom)
- [x] Fix: tRPC startCheck — przyjmuje topQuestions[] i language; Results.tsx przekazuje CI top_questions i html_lang
- [x] DB migration 0009: language column w citation_jobs
- [x] 59 tests passing, 0 TS errors

## Bug Fix: AI Citation — Query Fan-Out v2

- [x] Przepisano worker.ts: extractPageContent() pobiera URL niezależnie od pipeline audytu
- [x] fanOutQueries() generuje 6 zapytań przez LLM z tytułu + H1 + H2 + meta description
- [x] startCheck przyjmuje tylko auditId — zero zależności od frontendu
- [x] AICitationPanel uproszczony — przekazuje tylko auditId
- [x] Język auto-wykrywany z html lang + heurystyka polskich znaków
- [x] Fallback queries deterministyczne z tytułu strony (bez LLM)
- [x] 59 testów passing, 0 błędów TS

## Feature: AI Citation — Domain Match State (3-state)

- [x] Citation worker: 3-state isCited — "yes" (exact URL), "domain" (other page same domain), "no" (not cited)
- [x] Store domainCitedUrl separately from exactCitedUrl in citation_checks
- [x] DB migration 0010: isCited enum updated (yes/no/domain), domainCitedUrl column added
- [x] UI: amber/yellow state for domain match with message "Twoja domena jest cytowana, ale na innej stronie"
- [x] UI: show cited URL as clickable link when domain match
- [x] UI: color coding — green (exact), amber (domain), grey (no)
- [x] UI: "Domain-level citations" insight panel when domain cited but exact URL not
- [x] 59 tests passing, 0 TS errors

## Bug Fix: ChatGPT Citation Engine — Wrong API Endpoint

- [x] Fix worker.ts: switch from `/v1/responses` (Responses API) to `/v1/chat/completions` with `web_search_options: {}`
- [x] Root cause: `/v1/responses` endpoint returns "Model not found" for gpt-4o-mini-search-preview; `/v1/chat/completions` works correctly
- [x] Fix annotation parsing: `ann.url_citation.url` (chat/completions format) instead of `ann.url` (responses format)
- [x] New OPENAI_API_KEY configured and validated — gpt-4o-mini-search-preview returns real web citations
- [x] End-to-end test confirmed: API returns cited URLs with `?utm_source=openai` suffix
- [x] 59 tests passing, 0 TS errors

## AI Citation Check v3 — Complete Rebuild

- [x] Remove Perplexity engine entirely (only ChatGPT + Google AI Overview)
- [x] DB schema: engine enum updated to ["chatgpt", "google"], added allCitedUrls JSON column, hasAIOverview boolean column
- [x] DB migration applied (old citation data cleared, new schema in place)
- [x] Worker v3: ChatGPT engine uses chat/completions + web_search_options (confirmed working)
- [x] Worker v3: Google AI Overview uses Puppeteer with 3-strategy selector fallback
- [x] Worker v3: allCitedUrls saved for every query (full competitor domain list)
- [x] Worker v3: hasAIOverview flag saved for Google results
- [x] Worker v3: fanOutQueries generates 4 realistic user queries via LLM
- [x] UI v3: AICitationPanel rebuilt from scratch
  - [x] Pre-check state: explains what will be checked, CTA to start
  - [x] Running state: step-by-step progress indicator
  - [x] Results: summary header (cited / domain / not cited)
  - [x] Results: per-engine section (ChatGPT + Google) with score %
  - [x] Results: per-query rows with collapsible details
  - [x] Results: competitor domains listed per query ("Kto jest cytowany zamiast Ciebie")
  - [x] Results: CompetitorSummary — ranked list of all competing domains with frequency bar
  - [x] Results: PLGUpsell — What-IF Simulator + AI Sandbox CTA with amber warning about technical factors
- [x] Results.tsx: simplified AICitationPanel props (only auditId + url)
- [x] 59 tests passing, 0 TS errors

## Fix: What-IF Editor — Embed as Tab in Results Page

- [x] Add "What-IF Editor" as a dedicated section directly in the Results page (like old app)
- [x] Embed WhatIfEditor component inline in Results — no navigation to /sandbox required
- [x] Fix mobile: removed hidden sm:flex from Sandbox CTA button in header
- [x] Ensure What-IF works without login (isPremium=true for all)

## Fix: AI Content Co-Pilot — Wire to inline WhatIfSection

- [x] Built trpc.sandbox.rewrite procedure with 5 modes (full_rewrite, answer_first, add_faq, add_statistics, improve_structure)
- [x] Wire Full AI Rewrite / Answer-First / Add FAQ / Add Statistics / Improve Structure buttons in WhatIfSection to LLM
- [x] Pass audit issues/findings as context to LLM so rewrites are informed by actual audit results
- [x] Show loading state during AI rewrite (spinner + animated text)
- [x] After rewrite: auto-run simulation and show score delta

## Fix: AI Co-Pilot — Language Detection

- [x] Updated trpc.sandbox.rewrite system prompt with CRITICAL LANGUAGE RULE — detects input language and responds in same language (PL/EN/DE/etc.)

## Fix: H1/Hx Detection — page.$ Mutation Bug

- [x] Audited all server/audit/*.ts modules — no active page.$ mutations found (pageTypeDetector, contentStructure, contentIntelligence all use isolated cheerio instances)
- [x] ScrapedPage type already has full immutability contract comment in scraper.ts (lines 85-103)
- [x] Existing regression tests: H1 in <header> + pipeline order (detectPageType → contentStructure → eeat) — all passing
- [x] NEW: Added H1 inside <nav> regression test
- [x] NEW: Added H1 inside <aside> regression test
- [x] NEW: Added full 4-module pipeline test (detectPageType + contentStructure + eeat + brandAuthority) — H1 intact throughout
- [x] 62 tests passing, 0 TS errors

## Improvements: Critical Checks + What-IF Rebuild

### scorer.ts / technical.ts changes
- [x] Demoted add_title (ID 8) from critical → high
- [x] Demoted fix_nosnippet (ID 3) from critical → high
- [x] Added nofollow check: detect meta robots nofollow (critical — blocks all link equity)
- [x] Added disallow check: verify robots.txt Disallow for audited subpage path (critical)
- [x] Fixed AI crawler check: GPTBot = training only (informational), OAI-SearchBot = ChatGPT Search (critical if blocked)
- [x] Fixed Google-Extended: blocking = Gemini training only, NOT AI Overviews — demoted to warning/informational

### What-IF Simulator rebuild
- [x] fetchPage now returns cleanText (server-side HTML stripping via cheerio) and pageType
- [x] Added pageType parameter to rewrite procedure with 6 page-type-specific prompt contexts
- [x] Rewritten system prompt: no markdown symbols, no ALL CAPS, natural language, language-aware, beautiful ready-to-use text
- [x] Replaced raw HTML textarea with clean Before/After text preview panels
- [x] Added "Kopiuj tekst" button with clipboard API + toast confirmation
- [x] After rewrite: shows green "Gotowa treść po optymalizacji AI" panel with detected page type badge
- [x] 62 tests passing, 0 TS errors

## AI Citation Check v4 — Adaptive Fan-Out + Entity-Driven Queries [DONE]

- [x] Audited citation worker and Content Intelligence entity output
- [x] Rebuilt citation worker v4: entity-driven query generation from CI keywords/top_questions/topics
- [x] Implemented adaptive fan-out loop: up to 5 rounds × 5 queries = 25 max queries
- [x] Stop early if citation found (exact URL or domain match)
- [x] Collect competitor domains per query (all cited URLs in AI Overview)
- [x] Updated DB schema: round column + competitorDomains JSON per check (migration applied)
- [x] Rebuilt AICitationPanel v4: professional query exposition (full prompt text shown in accordion)
- [x] Show round-by-round results with query text + per-engine status badges
- [x] Show competitor domain count per query (blurred/locked in Free plan)
- [x] Pro upsell gate: blurred competitor list + "X domen cytowanych zamiast Ciebie — odblokuj w Pro"
- [x] Global CompetitorSummary: ranked bar chart of all competitor domains (Pro gate)
- [x] Inform user clearly when domain is invisible after 25 queries (red hero card)
- [x] PLGUpsell: What-IF Simulator + AI Sandbox CTA with amber note about technical factors
- [x] 62 tests passing, 0 TS errors

## Infrastructure: Google AI Overview Selector Monitoring

- [x] Read current Puppeteer scraper — extracted all CSS selectors: .YzCcne, .M8OgIe, .YzVZnd, .kno-result, [data-attrid='SGE'], div[jsname='yEVEwb'], .AIOverview, .ai-overview + 2 fallback strategies
- [x] Built server/citation/selectorHealth.ts — tests 5 fixed queries (EN+PL), 3-strategy detection, structured SelectorHealthReport type
- [x] Wired cron job in server/_core/index.ts — initial check 2min after startup, recurring every 6h
- [x] notifyOwner() alert with full diagnostic: broken selectors vs blocked scraper vs degraded
- [x] Added tRPC admin procedure: citation.selectorHealth (admin-only) — returns cached report or triggers forceRun
- [x] 62 tests passing, 0 TS errors

## Fix: Google AI Overview Citation Detection Reliability

- [x] Root cause diagnosed: Google blocks datacenter IPs with CAPTCHA ("Nasze systemy wykryły nietypoć ruch") — Puppeteer scraper is fundamentally unreliable from server
- [ ] Replace Puppeteer scraper with SerpApi Google Search API (reliable, no CAPTCHA)
- [ ] Store SERPAPI_API_KEY in project secrets
- [ ] Extract ai_overview.references[] for cited URLs and competitor domains
- [ ] Handle missing AI Overview gracefully (not all queries trigger it)
- [ ] Update selectorHealth.ts to use SerpApi health check instead of Puppeteer
- [ ] Run TypeScript check and tests

## v8 — Stripe Payments + PDF Export + SerpApi

### SerpApi Integration (Google AI Overviews)
- [x] Replace Puppeteer-based Google AI Overview scraper with SerpApi
- [x] Add SERPAPI_API_KEY to environment secrets
- [x] Update citation/worker.ts to use SerpApi Google Search endpoint
- [x] Verify AI Overview detection works with real queries

### Stripe Payment Integration
- [x] Install stripe npm package
- [x] Add stripeCustomerId, stripeSubscriptionId, plan, planExpiresAt to users table
- [x] Push DB migration for new user fields
- [x] Create server/stripe/products.ts — plan definitions (Starter $39, Pro $99, Business $299)
- [x] Create server/stripe/handler.ts — checkout session, billing portal, webhook handler
- [x] Register /api/stripe/webhook route before express.json() middleware
- [x] Add payments.getPlans, payments.getMyPlan, payments.createCheckout, payments.createBillingPortal tRPC procedures
- [x] Update Pricing.tsx — real Stripe checkout instead of window.alert placeholder
- [x] Update Dashboard.tsx UpgradeBanner — real pricing ($39) and navigate to /pricing
- [x] UpgradeBanner hides for paid users

### PDF Export
- [x] Install pdfkit + @types/pdfkit
- [x] Create server/pdf/reportGenerator.ts — branded dark-theme PDF with score breakdown, findings, AI insight
- [x] Register /api/audit/:auditId/pdf GET endpoint in server
- [x] Add PDF download button to Results.tsx header (green, with Download icon)

### Tests
- [x] 62 tests passing, 0 TS errors

## Fix: SerpApi AI Overview Detection Rate (Warsaw/Poland)

- [x] Diagnose root cause: desktop device + no location = 0% AI Overview detection for Polish queries
- [x] Add `device=mobile` parameter — mobile shows AI Overviews significantly more frequently
- [x] Add `location` parameter per language (Warsaw, Poland for pl; Berlin for de; Paris for fr; etc.)
- [x] Handle deferred AI Overview (`page_token`) — second request to `google_ai_overview` engine when page_token is present
- [x] Improve URL cleaning: strip `#fragment` and `:~:text=` suffixes from cited URLs
- [x] Improve text extraction: include nested list items from text_blocks
- [x] Test result: 7/8 queries (87.5%) now return AI Overview vs 0/3 before fix
- [x] 62 tests passing, 0 TS errors

## Bug: AI Citations — fałszywy brak AI Overview + niepełne URL konkurencji

- [x] Diagnoza: sprawdzić co SerpApi zwraca dla zapytań o "projekty domów parterowych"
- [x] Naprawić generowanie zapytań dla stron e-commerce/katalogowych (extradom.pl/projekty-domow-parterowych)
- [x] Zwracać pełne URL konkurencji (np. https://extradom.pl/projekty-domow-parterowych) zamiast tylko domen
- [x] Sprawdzić czy problem leży w generowaniu zapytań przez LLM czy w parsowaniu odpowiedzi SerpApi

## KRYTYCZNY BUG: AI Citations — ostateczna naprawa

- [x] Deep-diagnoza: sprawdzić surowy JSON SerpApi dla zapytań które realnie mają AI Overview
- [x] Zweryfikować wszystkie warianty struktury odpowiedzi SerpApi (ai_overview, knowledge_graph, answer_box, inline_images)
- [x] Przepisać checkGoogleAIOverview — obsłużyć wszystkie przypadki poprawnie
- [x] Test end-to-end z realnym linkiem Google AI Mode

## What-IF Full Rewrite AI — Rebuild

- [x] Audyt aktualnego kodu What-IF Full Rewrite — znaleźć wszystkie błędy (JSON/dane techniczne w output)
- [x] Crawler konkurencji — crawl 3-10 cytowanych URL-i z AI Citations
- [x] Ekstrakcja kluczowych fragmentów i encji z treści konkurencji
- [x] Przepisanie backendu Full Rewrite: naprawienie błędów + integracja z danymi konkurencji
- [x] Prompt Helpful Content: uwagi z audytu + Content Intelligence + encje konkurencji
- [x] Aktualizacja UI What-IF: źródła konkurencji, wskaźniki jakości, czysty output
- [x] Test end-to-end z realnym URL

## LLM Switch: Gemini → GPT-4o

- [x] Zamiana modelu z Gemini 2.5 Flash (Manus Forge) na GPT-4o (OpenAI API)
- [x] Podłączenie OPENAI_API_KEY z connectorów użytkownika
- [x] Aktualizacja llm.ts: endpoint → api.openai.com, model → gpt-4o, max_tokens → 16384
- [x] Usunięcie parametru thinking (Gemini-specific)
- [x] Test API: GPT-4o odpowiada poprawnie (model: gpt-4o-2024-08-06)
- [x] 62 testy przechodzą, 0 błędów TS

## Full Rewrite AI — Refaktoryzacja (4 mechanizmy)

- [x] Krok 1: BM25 chunking w competitorCrawler.ts (zamiast 70% word overlap)
- [x] Krok 2: Ekstrakcja trójek semantycznych (Subject-Predicate-Object) przez LLM
- [x] Krok 3: Weryfikator E-E-A-T (nowy plik eeAtVerifier.ts) z auto-rewizją
- [x] Krok 4: Iteracyjne generowanie sekcja po sekcji w routers.ts
- [x] TypeScript check + testy po wszystkich zmianach (62/62 pass, 0 TS errors)

## Model Update: GPT-5.4 / GPT-4.1

- [x] llm.ts: zmienić domyślny model na gpt-5.4 (główne wywołania)
- [x] routers.ts sandbox.rewrite: draft generation → gpt-5.4, wysoki max_tokens
- [x] eeatVerifier.ts: evaluateEEAT → gpt-5.4, reviseContent → gpt-5.4-pro dla trudnych przypadków (score < 6)
- [x] competitorCrawler.ts: extractSemanticTriples → gpt-4.1 (tanie zadanie ekstrakcji)
- [x] routers.ts: inne tanie zadania pomocnicze (klasyfikacja sekcji, scoring) → gpt-4.1

## UI Uproszczenie — Content Copilot

- [x] Usunąć zakładkę/sekcję What-IF z widoku wyników (zachować kod backendu)
- [x] Usunąć tryby Content Copilot inne niż full_rewrite (zachować kod backendu)
- [x] Usunąć baner/element zachęcający do AI Simulator z widoku AI Citations
- [x] Zostawić tylko "AI Full Rewrite" jako jedyną opcję Content Copilot

## UX Improvements — 3 zadania

- [x] Usunąć "AI Sandbox" z nawigacji głównej (topbar) — zastąpić linkiem do /pricing
- [x] Dodać wskaźnik postępu podczas Full Rewrite (etapy: Pobieranie → Crawl → Generowanie sekcji → E-E-A-T)
- [x] Renderowanie Markdown w output Full Rewrite (Streamdown zamiast <pre>)

## Homepage Redesign — Konwersja do planów płatnych

- [x] Nowe hero: asymetryczny layout, live audit demo po lewej + mockup wyników po prawej
- [x] Social proof bar: liczby (40+ checks, AI engines covered, pages audited)
- [x] Sekcja "Twoi konkurenci są już cytowani" — emocjonalny hook
- [x] Feature showcase: 6 kart z ikonami i opisem każdej funkcji
- [x] Sekcja AI Citations — kluczowy differentiator vs konkurencji
- [x] Full Rewrite AI — showcase z przykładem przed/po
- [x] Pricing preview (3 plany) z CTA bezpośrednio na stronie głównej
- [x] Testimonials / social proof (mock na start — liczniki)
- [x] FAQ sekcja (5 pytań)
- [x] Final CTA z urgency
- [x] Footer rozbudowany z linkami

## Bug Fixes + Hero Copy
- [x] Fix max_tokens → max_completion_tokens w llm.ts (GPT-5.4 wymaga nowego parametru)
- [x] Diagnoza i naprawa błędu ładowania Content Intelligence (gpt-4o dla json_schema Structured Outputs)
- [x] Przepisanie hero copy — "Dowiedz się, czy AI cytuje Twoją stronę. I co zrobić, żeby cytowała."

## Hero Copy v2 — Emocjonalne, konwertujące
- [x] Hero headline: "Twoja strona istnieje. Dla AI — nie."
- [x] Subheadline: "ChatGPT i Google AI ignorują Cię i cytują konkurencję."
- [x] CTA: "Sprawdź teraz — za darmo" + trust: "Bez rejestracji · Wynik w 30 sekund"
- [x] Badge: "94% stron jest niewidocznych dla AI — sprawdź czy Twoja też"
- [x] Emotional hook section: "Każde zapytanie w ChatGPT to szansa sprzedażowa. Twój konkurent ją właśnie zgarnął."
- [x] Final CTA: "Twoja konkurencja już to wie. Ty możesz wiedzieć za darmo."

## Bug Fix: Content Intelligence nie działa
- [x] Diagnoza błędu Content Intelligence — max_tokens: 32768 przekracza limit gpt-4o (max 16384)
- [x] Naprawa: llm.ts clampuje limit do 16384 dla modeli gpt-4* automatycznie

## Ulepszenia UX: Retry CI + Full Rewrite Paywall + Citeability Score
- [x] Retry z fallbackiem w audit/index.ts (2 próby + exponential backoff dla CI i LLM)
- [x] Frontend: komunikat "Analiza AI chwilowo niedostępna" zamiast pustej sekcji CI
- [x] Backend: blokada Full Rewrite + fetchPage dla planu Free (FORBIDDEN dla nieplącących)
- [x] Frontend: atrakcyjny upsell/paywall w miejscu Full Rewrite dla Free (blur + CTA + benefits grid)
- [x] Citeability Score jako drugi główny wskaźnik w nagłówku wyników (obok AI Visibility Score — animowany ring)

## Bug Fix: Full Rewrite AI — "The string did not match the expected pattern"
- [x] Diagnoza: eeatVerifier.ts używał gpt-5.4-pro (nie jest modelem chat) dla score < 6 — API zwracało 400
- [x] Naprawa: zastąpiono gpt-5.4-pro przez gpt-5.4 w reviseContent()

## Bug Fix: Full Rewrite AI — "Unexpected token '<', <!DOCTYPE is not valid JSON"
- [x] Diagnoza: llm.ts używał bezpośrednio api.openai.com z kluczem sk-proj z limitami rate limit — przy 8 sekcjach x 4000 tokenow API zwracało błąd/timeout, a Vite fallback zwracał HTML
- [x] Naprawa: llm.ts używa teraz Manus Forge API (forge.manus.ai) bez limitów, z fallbackiem do OpenAI

## KRYTYCZNY Bug Fix: Full AI Rewrite — halucynacje, fałszywe cytaty ekspertów
- [x] Analiza promptów: systemPrompt, modeInstructions (full_rewrite, add_statistics), eeatVerifier, reviseContent
- [x] Przepisanie promptów: dodano blok ZAKAZ HALUCYNACJI jako najwyższy priorytet w systemPrompt
- [x] Naprawa add_statistics: zakaz dodawania fikcyjnych danych, komentarz dla użytkownika gdy brak danych
- [x] Nowy moduł hallucinationGuard.ts: regex + LLM weryfikacja post-generation, usuwanie fałszywych cytatów
- [x] Integracja w routers.ts: Krok 4 (Hallucination Guard) po E-E-A-T verification
- [x] 62 testy, 0 błędów TS

## Bug Fix: Full AI Rewrite — tekst urywa się w trakcie (niepełna treść)
- [x] Diagnoza: max_tokens=4000 za mało dla ostatniej sekcji FAQ, section.body.slice(0,3000) obcinało wejście, brak instrukcji kompletności
- [x] Naprawa: ostatnia sekcja max_tokens=8000, pozostałe 5000; usunięto slice na body; dodano instrukcję BEZWZGLĘDNIE zakończ każde zdanie; cleanedContent.slice 12000→20000

## Nowa funkcjonalność: AI Page Creator (tylko płatne plany)
- [x] Schemat bazy: tabela page_creations (id, userId, pageType, brief, status, result, createdAt, queryFanOut, groundingSources)
- [x] Backend: procedure pageCreator.create — walidacja planu, query fan-out (8 zapytań), grounding scraper, LLM pipeline
- [x] Backend: procedure pageCreator.getStatus — polling statusu i pobieranie wyników
- [x] Backend: procedure pageCreator.list — historia generacji użytkownika
- [x] Frontend: wizard krok 1 — 8 typów stron z ikonami i opisami
- [x] Frontend: wizard krok 2 — szczegółowy brief (temat, słowa kluczowe, tone of voice, język, dodatkowe info)
- [x] Frontend: wizard krok 3 — progress z etapami (researching/generating/completed)
- [x] Frontend: strona wyników PageCreatorResult.tsx — 3 zakładki: Treść / Wytyczne techniczne / Badania AI
- [x] Treść: Answer-First Paragraph, sekcje z nagłówkami H1/H2/H3, FAQ, kluczowe encje
- [x] Wytyczne techniczne: meta title/desc, OG tags, schema.org JSON-LD, linkowanie wewnętrzne, cele długości
- [x] Badania AI: query fan-out, źródła grounding, synteza badań
- [x] AI Readiness Score (predicted) z animowanym ringiem SVG
- [x] Frontend: CTA "Audytuj tę stronę" + "Stwórz kolejną stronę" po wygenerowaniu
- [x] Paywall dla Free — blokada z upsell i listą benefitów
- [x] Nawigacja: link "AI Page Creator" w Dashboard nav (zielony, z ikoną Sparkles)
- [x] Routing: /page-creator i /page-creator/:id w App.tsx
- [x] 62 testy, 0 błędów TS

## Rozbudowa Full Rewrite AI — architektura AI Page Creator
- [x] Analiza porównawcza: 6 mechanizmów AI Page Creator przeniesionych do Full Rewrite
- [x] Nowy moduł rewriteResearch.ts: query fan-out (6 zapytań), grounding (DDG + fetch top 3 wyników), synthesis LLM
- [x] Integracja w sandbox.rewrite: research pipeline uruchamiany przed generowaniem sekcji (tylko full_rewrite + url)
- [x] Kontekst badawczy wstrzyknięty do systemPrompt (brief badawczy, kluczowe encje, answer-first draft)
- [x] Return rozszerzony o researchData (queries, keyEntities, aiReadinessTips, answerFirstDraft, sources)
- [x] fetchPage zwraca metadata (title, h1, metaDescription) — przekazywane do research pipeline
- [x] Input schema rozszerzony o pageTitle, h1, metaDescription, language
- [x] Frontend: 3 zakładki wyników: ✨ Treść / 🏷️ Encje i wskazówki / 🔬 Źródła badań
- [x] Tab Encje: Answer-First Opening, lista encji jako tagi, wskazówki GEO z numerami, query fan-out
- [x] Tab Źródła: lista scraped sources z tytułem, snippetem i URL
- [x] Toast po rewrite: "Zbadano X źródeł — treść wzbogacona o kontekst badawczy"
- [x] 62 testy, 0 błędów TS

## Bug Fix: Full Rewrite AI — duplikacja sekcji (FAQ pisane dwukrotnie)
- [x] Diagnoza: splitIntoSections używał heurystyki "krótka linia z wielkiej litery" jako nagłówek — fałszywe podziały powodowały wielokrotne is Last=true i generowanie FAQ wielokrotnie
- [x] Naprawa 1: splitIntoSections wykrywa nagłówki TYLKO przez ## / ### / [H] — usunięto heurystykę
- [x] Naprawa 2: nowy deduplicateContent() — usuwa zduplikowane bloki (porównanie 120 znaków) + deduplikacja sekcji FAQ (zachowuje ostatnią)
- [x] 62 testy, 0 błędów TS

## Bug Fix: PageCreator — "Cannot update Route while rendering PageCreator" (navigate w render)
- [x] Naprawa: navigate() przeniesiony do useEffect (był wywoływany bezpośrednio w render przy jobStatus==completed)

## Nowa funkcjonalność: AI Search Exposure Score (Ahrefs AI Overview)
- [ ] Backend: moduł aiExposure.ts — pobieranie top-50 fraz domeny, analiza ai_overview w SERP features
- [ ] Backend: tabela ai_exposure_cache w bazie (TTL 24h)
- [ ] Backend: tRPC procedure audit.getAiExposure
- [ ] Frontend: AI Search Exposure Score w nagłówku Results — animowany ring, breakdown, insight cards
- [ ] Frontend: sekcja "Twoja widoczność w AI Search" — lista fraz z AI Overview, porównanie z domeną
- [ ] Testy i weryfikacja

## Nowa funkcjonalność: AI Search Exposure Score (Live Intelligence)
- [x] Moduł aiExposure/index.ts — query fan-out Ahrefs, SERP features analysis, composite score (60% coverage + 40% citation)
- [x] 4 tiery: Invisible / Emerging / Visible / Dominant z kolorami i opisami
- [x] Tabela ai_exposure_cache (migracja 0015) — TTL 24h per domena
- [x] tRPC procedure aiExposure.getScore — cache lookup + compute + upsert
- [x] ENV.ahrefsApiKey dodany do env.ts
- [x] Frontend: AiExposurePanel — animowany ring score, 3 metryki (coverage%, citations, keywords), tier badge
- [x] Frontend: AI Insights (3 dynamiczne wskazówki), Top Keywords table (cited/AI Overview/Standard)
- [x] Wstawiony między ScoreHero a IssuesAndFixes w Results.tsx
- [x] 62 testy, 0 błędów TS
