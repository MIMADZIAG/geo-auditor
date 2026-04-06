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
- [x] Stripe integration
- [x] Paid plan tiers (Starter, Pro, Business)
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

## Bug Fix: Audyt nie ładuje się — crash w Results.tsx (runtime error po AI Exposure Score)
- [ ] Diagnoza i naprawa błędu runtime w Results.tsx
- [ ] Pełny test e2e wyników audytu

## Bug Fix: AiExposurePanel field name mismatch (2026-03-18)

- [x] Fix AiExposureResult interface in Results.tsx — align field names with backend:
  - `totalKeywords` → `totalKeywordsAnalyzed`
  - `citedInAiOverview` → `keywordsCitedInAiOverview`
  - `topAiKeywords` → `topKeywords`
  - `isCited` → `isCitedInAiOverview`
  - Removed `aiOverviewCoveragePercent` (now calculated on frontend from `keywordsWithAiOverview / totalKeywordsAnalyzed`)
  - Added `exposureScore`, `citationScore`, `tierLabel`, `opportunities` fields
- [x] Add defensive `?? []` guards for `topKeywords` and `opportunities` arrays
- [x] Add Growth Opportunities section to AiExposurePanel
- [x] Write unit tests for aiExposure module (19 tests, 81 total passing)

## Bug Fix: "The string didn't match expected pattern" (2026-03-18 — krytyczny)

- [x] Zidentyfikować źródło błędu: natywna walidacja HTML5 `<input type="url">` w przeglądarce
- [x] Naprawa: zmiana `type="url"` na `type="text"` we wszystkich formularzach URL (Home.tsx, Dashboard.tsx, Sandbox.tsx, AISandbox.tsx)
- [x] Testy TypeScript: 0 błędów, 81 testów jednostkowych passing
- [x] Testy e2e API: audit.run, audit.getById, aiExposure.getScore — wszystkie PASS

## Bug Fix: AI Search Exposure Score — zawsze pokazuje "Invisible" (2026-03-18)

- [x] Diagnoza: 4 błędy w Ahrefs API v3 — brak `date`, zła kolumna `positions` (powinno być `serp_features`), zły `order_by=traffic` (powinno być `sum_traffic`), tryb `domain` zamiast `subdomains`
- [x] Naprawa: poprawne parametry API, dodanie `getAhrefsDate()`, zwiększenie limitu do 100 słów kluczowych
- [x] Dodanie AHREFS_API_KEY jako sekretu projektu przez webdev_request_secrets
- [x] Weryfikacja: healthline.com = 71% AI Overview (tier: Widoczny), nytimes.com = 1%, wikipedia.org = 5%
- [x] 86 testów jednostkowych passing (5 nowych testów dla Ahrefs API params)

## Bug Fix: AI Search Exposure — 0 fraz dla direct.money.pl (2026-03-18)

- [x] Diagnoza: direct.money.pl był w cache z danymi 0 keywords (z czasów gdy AHREFS_API_KEY nie był dostępny)
- [x] Naprawa: dodanie cache invalidation dla wpisów z totalKeywordsAnalyzed=0 gdy klucz API jest dostępny
- [x] Dodanie importu ENV do routers.ts
- [x] Wyczyszczenie całego cache ai_exposure_cache przez SQL
- [x] Weryfikacja: direct.money.pl = 48% AI Overview, tier 'Wschodzący w AI Search', score 29/100
- [x] 86 testów passing, 0 błędów TypeScript

## Bug Fix: AI Search Exposure — błędna logika wykrywania cytowań (2026-03-19)

- [x] Diagnoza: Ahrefs API nie dostarcza bezpośrednich danych o cytowaniach — `ai_overview_sitelink` to feature SERP (sitelinki), a nie wskaźnik cytowania konkretnej domeny
- [x] Naprawa: nowa heurystyka cytowania: `hasAiOverview && position <= 5` (Google AI Overview cytuje głównie top-5 organicznych wyników)
- [x] Weryfikacja: doz.pl / nimesil (pos=1, ai_overview) = isCitedInAiOverview: true ✔
- [x] Zaktualizowano komunikaty insights — poprawna terminologia ("prawdopodobnie cytowana")
- [x] 88 testów passing (2 nowe testy dla nowej logiki cytowania)

## Zmiana kolejności sekcji w karcie audytu (2026-03-19)
- [x] Zmiana kolejności: Score → #1 Priority Fix → AI Citations → Issues → Content Intelligence → AI Exposure → Rewrite → Competitor → Share → Upsell
- [x] 88 testów passing, 0 błędów TS

## #1 Priority Fix — Quick Win badge (2026-03-19)
- [x] Backend: rozszerzenie llmResult.topPriority o scoreGain (szacowany wzrost score) i difficulty (łatwe/średnie/trudne) bazując na wykrytych problemach
- [x] Backend: nowe kolumny llmScoreGain i llmDifficulty w tabeli audits (migracja DB)
- [x] Frontend: badge w TopPriorityBanner z "+X pkt potential" i stopniem trudności (Easy/Medium/Hard)
- [x] Logika: difficulty i scoreGain generowane przez LLM na podstawie severity (critical/improvement) i kategorii problemu
- [x] Aktualizacja shared/auditTypes.ts, PublicReport.tsx, Results.tsx
- [x] 88 testów passing, 0 błędów TypeScript

## Reguła normalizacji liter po znakach interpunkcyjnych (2026-03-21)
- [x] Funkcja `normalizePolishCapitalization(text)` — małe litery po : - – — / | • w języku polskim
- [x] Detekcja języka (PL/EN) — reguła aktywna tylko dla polskiego
- [x] Wstrzyknięcie do pipeline Full Rewrite (server-side, po odpowiedzi LLM, Krok 5)
- [x] Wstrzyknięcie do pipeline AI Content Creator (server-side, po odpowiedzi LLM)
- [x] TypeScript: 0 błędów, 108 testów passing (20 nowych testów dla modułu normalizacji)

## Warunkowe wyświetlanie upsellów w Results.tsx (2026-03-21)
- [x] Zlokalizuj: MonitorCTA, CompetitorAnalysisTeaser, PLGUpgradeBanner w Results.tsx
- [x] Pobierz plan użytkownika przez useAuth().user.plan
- [x] Ukryj 3 boxy jeśli user jest zalogowany i ma plan płatny (starter/pro/business/agency)
- [x] Zachowaj boxy dla: niezalogowanych, free, bez planu
- [x] TypeScript: 0 błędów, 108 testów passing

## Tłumaczenie sekcji Problemy i poprawki (2026-03-21)
- [x] Przetłumaczono etykiety i opisy w 7 plikach audytu: aiCrawlers.ts, brandAuthority.ts, metaTags.ts, technical.ts, contentStructure.ts, eeat.ts, structuredData.ts
- [x] Przetłumaczono system prompt contentIntelligence.ts (LLM generuje opisy po polsku)
- [x] Przetłumaczono system prompt llmRecommendations.ts (LLM generuje rekomendacje po polsku)
- [x] Przetłumaczono etykiety checków w contentIntelligence.ts (8 etykiet)
- [x] TypeScript: 0 błędów, 108 testów passing

## Automatyczny monitoring cykliczny (2026-03-23)
- [x] DB: scheduleFrequency w monitoredPages + tabela monitorAuditRuns (migracja 0017)
- [x] Worker cron: setInterval co 1h, batch 3 strony równolegle, obsługa błędów, plan guards (Starter/Pro/Business)
- [x] Email: HTML email z wynikami audytu (Nodemailer, fallback dev mode bez SMTP)
- [x] tRPC: setFrequency (Pro/Business), getRunHistory, plan guards (Starter locked to 7 days)
- [x] DB helper: updateMonitoredPageFrequency, updateMonitoredPageAfterAudit z frequencyDays
- [x] Worker uruchamiany w server/_core/index.ts po starcie serwera
- [x] Testy: 13 nowych testów, 121 łącznie passing
- [x] TypeScript: 0 błędów

## UI częstotliwości monitoringu + SMTP (2026-03-23)
- [ ] UI: dropdown zmiany częstotliwości przy monitorowanych stronach (Pro/Business)
- [ ] UI: lock badge dla Starter (7 dni, niezmienny) z upsell tooltip
- [ ] UI: wyświetlanie następnego audytu (nextAuditAt) przy każdej stronie
- [ ] SMTP: konfiguracja przez webdev_request_secrets (SMTP_HOST, PORT, USER, PASS, FROM)
- [ ] SMTP: weryfikacja wysyłki testowego emaila
- [ ] TypeScript: 0 błędów, testy passing

## Historia audytów monitoringu w Dashboardzie (2026-03-24)
- [x] Rozwijana sekcja "Historia" w MonitoredPageCard z listą poprzednich audytów
- [x] Mini-wykres trendu score (sparkline) z ostatnich audytów
- [x] Każdy wpis historii: data, wynik, delta vs poprzedni, link do raportu
- [x] Stan pusty: "Brak historii — pierwszy audyt zostanie wykonany automatycznie"
- [x] TypeScript: 0 błędów, 132 testy passing

## Bug Fix: Fałszywy brak robots.txt (2026-03-24)
- [x] Zdiagnozowano przyczynę: Node.js fetch (undici) wysyła `sec-fetch-mode: cors` i ma inny fingerprint TLS — WAF totalmoney.pl odpowiada 449
- [x] Naprawiono: zastąpiono fetch() dedykowaną funkcją fetchRobotsTxtNative() opartą na natywnym moduł https Node.js
- [x] Dodano obsługę gzip/deflate/brotli w fetchRobotsTxtNative
- [x] Dodano 9 testów jednostkowych dla logiki robots.txt (141 testów passing)
- [x] TypeScript: 0 błędów

## 3 usprawnienia po bug fix robots.txt (2026-03-24)
- [x] Fallback na natywny https gdy fetchWithRetry zwróci 449/403 (fetchHtmlNative + wafBlocked flag w ScrapedPage)
- [x] WAF/CDN notice w Results.tsx gdy wafBlocked=true (amber banner z Shield icon)
- [x] Rozszerzony SUBTYPE_MAP w llmRecommendations.ts (wszystkie typy z PARENT_MAP) + expandedSchemaTypes w LLM context
- [x] DB schema: wafBlocked boolean w tabeli audits, migracja 0018 zastosowana
- [x] TypeScript: 0 błędów, 141 testów passing

## 4 zadania (2026-03-24)
- [x] Fix structuredData.ts: parsowanie wielu JSON-LD bloków + subtype mapping — potwierdzono że extractSchemas().each() już iteruje wszystkie bloki; PARENT_MAP i SUBTYPE_MAP rozszerzone w poprzednim sprincie
- [x] Fix technical.ts: hreflang — check "Deklaracja języka" zawsze pass/fail dla lang attr; hreflang_validity TYLKO gdy tagi hreflang obecne w HTML
- [x] Page Type Detector: potwierdzono że pageTypeDetector.ts istnieje i jest w pełni zintegrowany z audytem (article, product, product-listing, homepage, landing, service, generic)
- [x] Email powitalny po rejestracji: sendWelcomeEmail() w welcome-email.ts, trigger w oauth.ts gdy isNew=true, upsertUser() zwraca {isNew}
- [x] TypeScript: 0 błędów, 147 testów passing (+6 nowych)

## Homepage Conversion Redesign (2026-03-24)
- [x] Social proof: sekcja z 3 testimonialami z kartami score przed/po
- [x] Competitor comparison table: GEO-Auditor vs Semrush vs Ahrefs vs Profound
- [x] Pricing: toggle miesięcznie/rocznie (-20%), anchor price, money-back 14 dni
- [x] Footer: usunięto martwe linki (Dokumentacja, O nas, Blog) — zastąpiono Funkcje/Cennik/Dashboard/FAQ/Kontakt
- [x] Copyright: zaktualizowano na 2026
- [x] TypeScript: 0 błędów, 147 testów passing

## Content Fixes Homepage (2026-03-26)
- [x] Claim "94%" zastąpiony neutralnym "Twoja strona może być niewidoczna dla AI — sprawdź to teraz"
- [x] Etykiety pod inputem: "30 sekund" → "kilkadziesiąt sekund", "Google AI" → "Gemini · Claude"
- [x] Placeholder: "twojasklepinternetowy.pl/produkt" → "twojadomena.pl/strona"
- [x] Przykładowe URL-e: extradom/z500/murator → strona-1.pl, strona-2.pl, strona-3.pl
- [x] Testimoniale: usunięto konkretne liczby procentowe (340%) z cytatów
- [x] FAQ: zaktualizowano odpowiedź o ChatGPT/Gemini
- [x] TypeScript: 0 błędów

## Homepage Copy & Section Cleanup (2026-03-26)
- [x] Ukryto sekcję Testimonials (display:none, kod zachowany)
- [x] Ukryto sekcję Comparison table (display:none, kod zachowany)
- [x] Stats section zastąpiony 3-kolumnowym Persuasion Strip (AI Search zmienia zasady / Audyt na poziomie URL / Konkretne kroki)
- [x] Hero copy przepisany: nowy headline "AI odpowiada na pytania Twoich klientów. Bez Ciebie.", nowy subheadline i body
- [x] TypeScript: 0 błędów

## Sticky CTA Bar (2026-03-26)
- [x] Sticky bar pojawiający się po przewinięciu >500px z "Sprawdź swoją stronę →" + scroll+focus do inputu, TypeScript: 0 błędów

## AI Visibility Check — 4 Platforms (2026-03-26)
- [x] Perplexity API integration (sonar-pro, ekstrakcja URL-i z citations[], domain match)
- [x] Gemini API integration (gemini-2.0-flash z Google Search grounding, ekstrakcja URL-i z groundingChunks)
- [x] DB schema: engine enum rozszerzony o perplexity i gemini, migracja zastosowana
- [x] Backend: runCitationJob() równolegle sprawdza 4 silniki per zapytanie
- [x] Frontend: EngineChip dla perplexity (teal) i gemini (purple)
- [x] Frontend: idle stats "4 silniki AI", opis 4 platform w sekcji "Co otrzymasz"
- [x] Frontend: summary hero pokazuje aktywne silniki per zapytanie
- [x] Secrets: SONAR_API_KEY i GEMINI_API_KEY ustawione
- [x] TypeScript: 0 błędów, 151 testów passing (+4 nowe testy walidacji kluczy API)

## AI Visibility Check — Smart Query Generator (2026-03-26)
- [x] Analiza aktualnego generatora fraz w citation/worker.ts
- [x] Budowa ENGINE_QUERY_PROFILES: per-engine citation patterns (Google/Perplexity/Gemini/ChatGPT)
- [x] generateEngineQueries(): LLM-powered, per-engine, z pełnym CI context (ciTopics/ciTopQuestions/ciKeywords)
- [x] Inżynieria wsteczna: Google=informational, Perplexity=question-first, Gemini=conversational, ChatGPT=task-oriented
- [x] runCitationJob(): 4 silniki generują frazy równolegle (Promise.all), każdy z własnym profilem
- [x] buildFallbackQueries(): engine-aware fallback z mods per silnik
- [x] TypeScript: 0 błędów, 151 testów passing

## Bug Fix: Google AI Overviews domain matching (2026-03-26)
- [ ] Diagnoza: dlaczego domena była cytowana ale system zwrócił "nie znaleziono"
- [ ] Naprawa: rozszerzona ekstrakcja URL-i z SerpApi response (sources, inline_links, organic)
- [ ] Naprawa: robust domain matching (www/non-www, subdomain, path-agnostic)
- [ ] TypeScript: 0 błędów, testy passing

## AI Visibility Check: Disclaimer + Per-Engine Breakdown + Live Counter (2026-03-26)
- [x] Disclaimer metodologiczny w AICitationPanel: Google AI Overviews vs AI Mode, zmienność wyników
- [x] Nowa sekcja "Wyniki per silnik AI" (EngineBreakdownTable): per-silnik stats + lista sprawdzonych zapytań
- [x] Zastąpiono hardcoded 12847 prawdziwym licznikiem z DB (trpc.audit.getGlobalStats, publicProcedure)
- [x] Fallback: "Bądź wśród pierwszych użytkowników GEO-Auditor" gdy 0 audytów w DB
- [x] TypeScript: 0 błędów, 151 testów passing

## AI Visibility Check: UI Refactor (2026-03-26)
- [x] Disclaimer przeniesiony na koniec modułu (po "Kto dominuje zamiast Ciebie")
- [x] Usunięto listę zapytań z sekcji "Wyniki per silnik AI" (EngineBreakdownTable)
- [x] Usunięto podział na rundy w widoku szczegółów — zastąpiono globalną listą fraz (QueriesCheckedPanel)
- [x] QueriesCheckedPanel: copywriting "Jak AI widzi Twoją stronę?" + opis metodologii + rozwijana lista fraz
- [x] Uproszczone summary hero: tylko wynik (widoczny/niewidoczny), bez siatki rundy/silniki/konkurenci
- [x] Widok "Running": usunięto "Runda X/5", zastąpiono krokami procesu (analiza → frazy → sprawdzanie)
- [x] Etykieta per-engine: "Cytowane zamiast Ciebie" → "[Nazwa silnika] zacytowało:"
- [x] TypeScript: 0 błędów, 151 testów passing

## AI Visibility Check: Cleanup idle screen + usuń EngineBreakdownTable (2026-03-26)
- [x] Usunięto EngineBreakdownTable z widoku wyników
- [x] Przeprojektowano idle screen: 3 karty benefit-first (Analiza jak LLM / 4 silniki AI / Konkretny wynik) zamiast siatki liczb
- [x] TypeScript: 0 błędów, 151 testów passing

## Home.tsx: copy + animowany pas silników AI (2026-03-26)
- [x] Zmień copy pod paskiem adresu: ✓ Bezpłatnie · ✓ Jeden klik — zaloguj się kontem Google · ✓ Wynik w 60 sekund
- [x] Zastąpiono statyczny blok animowanym pasem logotypów AI (fade-in z opóźnieniem per silnik)
- [x] Usunięto "Wyniki po polsku" z trust badges

## Morfologiczne warianty fraz — AI Visibility Check (2026-03-26)
- [x] Nowy moduł server/citation/morphologicalVariants.ts: 5 transformacji semantycznych + LLM
- [x] Integracja w generateEngineQueries(): warianty jako dodatkowe zapytania per engine
- [x] Deduplikacja + limit (max 8 zapytań per engine per runda)
- [x] Testy jednostkowe: 27 testów (178 łącznie), 100% passing

## AI Visibility: Top5 competitors + engine badge (2026-03-27)
- [x] CompetitorSummary: top 5 widoczne, reszta za przyciskiem "Pokaż X więcej domen" + "Zwiń listę"
- [x] Per-competitor: engine badges "cytowane przez: [Google AI] [Perplexity]"
- [x] Summary hero: zdanie + engine badges "Wykryto w: [Google AI] [ChatGPT]" gdy cytowanie znalezione

## AI Exposure: copy rewrite + SEO↔AI insight (2026-03-27)
- [x] Nowy nagłówek sekcji: "Widoczność domeny w Google AI Overviews" + badge "Bonus: Kontekst domenowy"
- [x] Nowy podtytuł: "Dodatkowy rzut na całą domenę — jak Google AI Overviews postrzega Twój autorytet organiczny"
- [x] Tier descriptions: przepisane na język korzyści + powiązanie SEO↔AI dla każdego poziomu
- [x] Insight SEO↔AI: nowa karta "Dlaczego SEO ma znaczenie dla AI Search?" z wyjaśnieniem korelacji
- [x] Loading copy: zaktualizowane na spójne z nowym framingiem

## AIEnginesStrip: oficjalne loga + Google AI Overviews badge (2026-03-27)
- [x] Pobrano i zaimplementowano oficjalne SVG: Perplexity (asterisk), Gemini (4-pointed star z gradientem), Claude (6-line starburst)
- [x] Zastąpiono nieprawidłowe loga oficjalnymi SVG inline
- [x] Dodano "Google AI Overviews" jako osobny badge (zastąpił "Google AI")
- [x] TypeScript: 0 błędów, 178 testów passing

## Wymuszona rejestracja Google przed audytem (2026-03-27)
- [x] getLoginUrl() przyjmuje opcjonalny returnPath (state payload: base64(redirectUri|returnPath))
- [x] OAuth callback parseStateOrigin() — wyodrębnia origin z state, przekierowuje na origin/
- [x] Home.tsx handleSubmit: gate na auth → sessionStorage.setItem + toast + redirect do OAuth
- [x] Hook usePendingAudit: po zalogowaniu odczytuje sessionStorage, mutuje audit, czyści storage
- [x] Sticky bar copy: "bez rejestracji" → "jeden klik Google"
- [x] Testy: 11 nowych testów (189 łącznie), 0 błędów TypeScript

## robots.txt: precyzyjna interpretacja (2026-03-28)
- [x] Znaleziono i przepisano server/audit/aiCrawlers.ts (v3)
- [x] Nowa logika: 3 precyzyjne sprawdzenia (audytowana URL, pełny blok AI search, boty treningowe jako info)
- [x] Usunięto fałszywe alarmy: częściowe wykluczenia (/admin/, /cart/) NIE są flagowane
- [x] Boty treningowe (GPTBot, ClaudeBot, Google-Extended) zawsze info, nigdy fail/warning
- [x] Zaktualizowano opis kategorii w Results.tsx
- [x] 213 testów passing (24 nowych), TypeScript: 0 błędów

## Scoring refactor: psychologiczna kalibracja (2026-03-28)
- [ ] Audyt scorer.ts i wszystkich modułów kategorii
- [ ] Nowy model wag kategorii (AI Visibility first)
- [ ] Kalibracja: typowa strona MŚP powinna lądować w 45-65/100
- [ ] Psychologiczne zakresy: etykiety i komunikaty motywacyjne
- [ ] Zaktualizuj UI: progress bar, score hero, etykiety
- [ ] Testy kalibracji na przykładowych stronach

## Scoring Refactor v4 — Growth Psychology Framework (2026-03-28)
- [x] Nowe wagi kategorii: contentStructure ↑ (24%), structuredData ↑ (20%), brandAuthority ↓ (10%)
- [x] Krzywa kalibracji 8-punktowa: typowa strona MŚP ląduje 38–52/100
- [x] 5 poziomów: Niewidoczny (0–35) / Startujący (36–54) / Rozwijający się (55–69) / Widoczny (70–82) / Dominujący (83+)
- [x] Ceiling bez Content Intelligence: ~72 — motywuje do upgrade'u
- [x] UI: nowe etykiety, sublabels z językiem korzyści, progress nudge "+X pkt do następnego poziomu"
- [x] Zaktualizowano typy: scoreLabel w shared/auditTypes.ts, server/audit/types.ts, server/audit/index.ts
- [x] Testy: 229 passing, TypeScript: 0 błędów

## brandAuthority w mini-grid ScoreHero (2026-03-28)
- [x] Dodano brandAuthority do shared/auditTypes.ts AuditFindings (opcjonalne)
- [x] Mini-grid: catData jako CategoryResult | undefined, fallback "brak danych" dla starych audytów
- [x] Nowe audyty zawsze zawierają brandAuthority (index.ts już to robi)
- [x] TypeScript: 0 błędów, 229 testów passing

## Upsell Modal Pro + Report Tier Badge (2026-03-28)
- [x] UpsellProModal komponent: dwa warianty copy (Niewidoczny vs Startujący), 4 funkcje Pro, social proof
- [x] Trigger w Results.tsx: useEffect + 1.5s delay, guard hasPaidPlan + upsellTriggeredRef
- [x] Modal nie pojawia się dla użytkowników z planem Pro/Business/Agency
- [x] Tier badge na /report/:id: nowe etykiety v4 (Dominujący/Widoczny/Rozwijający się/Startujący/Niewidoczny) + getTierSubtitle
- [x] TypeScript: 0 błędów, 229 testów passing

## BUG FIX: UpsellProModal crash (2026-03-28)
- [x] UpsellProModal: COPY lookup przeniesiony po early return guard; fallback na "Startujący" dla bezpieczeństwa
- [x] Wydzielono _UpsellProModalInner — hooks wywoływane tylko gdy isOpen=true
- [x] Results.tsx: upsellTier w useState, setUpsellTier przed setTimeout, usunięto unsafe cast
- [x] TypeScript: 0 błędów, 229 testów passing

## Testy regresyjne: UpsellProModal + Results scoring (2026-03-28)
- [x] Testy UpsellProModal: 26 testów w server/upsellModal.test.ts
- [x] Testy getScoreLabel: wszystkie progi scoringowe + exact boundary checks
- [x] Testy upsellTier logic: Rozwijający się/Widoczny/Dominujący MUST NOT trigger modal (regression)
- [x] Exhaustive sweep: każda liczba całkowita 0–100 mapuje na znany tier
- [x] COPY dictionary coverage: invariant że 2 tiery w COPY = 2 tiery triggering modal
- [x] TypeScript: 0 błędów, 255 testów passing (11 plików)

## BUG FIX: Runtime crash na stronie wyników (2026-03-28)
- [x] Root cause: `react-syntax-highlighter/dist/esm/styles/hljs` nie może rozwizywać wewnętrznych importów w prod bundle (znany ESM bug)
- [x] Fix: zmieniono import na `/dist/cjs/styles/hljs` — CJS path działa poprawnie (35 kluczy w atomOneDark)
- [x] Potwierdzono: `pnpm build` bez błędów, TypeScript: 0 błędów, 255 testów passing

## ErrorBoundary + Lazy SyntaxHighlighter (2026-03-28)
- [x] Zaktualizowano ErrorBoundary.tsx: context prop, Polski UI, dev details panel, componentDidCatch logging
- [x] App.tsx: per-route ErrorBoundary z context labels dla Results, PublicReport, Dashboard, Sandbox, PageCreator
- [x] Results.tsx: React.lazy + Suspense dla SyntaxHighlighter; fallback = plain <pre> z tym samym kodem
- [x] Główny bundle zmniejszony z 3354 kB → 1616+2447 kB (split na 2 chunki, syntax-highlighter w osobnym)
- [x] TypeScript: 0 błędów, 255 testów passing, pnpm build bez błędów

## Tab-Based Results Refactor (Two-Score Product)

- [x] Sticky Dual Score Bar: AI-Readiness score + Citation status w nagłówku
- [x] Tab 1 "Optymalizacja": ScoreHero, CompetitorDecayCard, TopPriorityBanner, IssuesAndFixes, MonitorCTA, ContentIntelligencePanel, WhatIfSection, PassingChecks, SharePanel, ScoreHistoryTeaser, PLGUpgradeBanner
- [x] Tab 2 "Widoczność AI": CitationStatusBanner + AICitationPanel + AiExposurePanel + CompetitorAnalysisTeaser
- [x] CitationStatusBanner: kompaktowy widget w Tab 1 z CTA "Sprawdź widoczność" linkującym do Tab 2
- [x] Auto-start citation przy pierwszym wejściu w Tab 2 (jeśli nie uruchomiony)
- [x] AICitationPanel: forwardRef + useImperativeHandle (startCheck) + onStatusChange callback
- [x] Dashboard: CitationBadge w AuditRow (ikona Eye + X/Y AI)
- [x] Backend: citation.getStatusBatch — batch query bez N+1 dla Dashboardu

## Full Rewrite → Content Creator Migration
- [ ] Nowy typ "rewrite" w PAGE_TYPES w PageCreator.tsx
- [ ] Backend endpoint pageCreator.createRewrite z auditId + auto-fill z ContentIntelligence
- [ ] Auto-fill briefu w PageCreator gdy ?auditId=X w URL
- [ ] Widget akwizycji w Results.tsx (Tab 1) — CTA do Content Creator z auditId
- [ ] WhatIfSection zachowany jako widget w Tab 1 dla paid users (uproszczony)

## Citation Visibility Monitoring (Retention Engine)

- [x] DB: Add citedEnginesCount, totalEnginesChecked, citationJobId to score_snapshots
- [x] DB: Add lastCitedEngines, lastTotalEngines, lastCitationAt to monitored_pages
- [x] Monitoring worker: auto-trigger citation job after each monitoring audit (fire-and-forget)
- [x] Monitoring worker: updateMonitoredPageCitationStatus + updateScoreSnapshotCitation helpers
- [x] Monitoring worker: sendCitationChangeEmail when visibility changes significantly (0→1 or ±2 engines)
- [x] Dashboard: CitationSparkline component (0-4 scale, color-coded)
- [x] Dashboard: Citation sparkline trend in MonitoredPageCard history panel
- [x] Dashboard: Dual-metric header (AI Score + AI Visibility badge) in MonitoredPageCard
- [x] Dashboard: Tooltip with engine list and last check date
- [x] Monitoring email: Add AI Visibility section with citation count, color-coded status, CTA
- [x] Monitoring email: Dedicated citation change email (improvement/decline)
- [x] Tests: 19 new citation monitoring tests (284 total, all passing)
- [ ] Paywall: Citation trend history = Pro, current status = Starter+ (future iteration)

## PLG Retention Sprint (2026-03-29)

### Task 1: Paywall — Citation Trend Sparkline (Pro only)
- [x] MonitoredPageCard: citation sparkline in history panel locked for Starter/Free
- [x] Locked state: blurred sparkline + "Odblokuj trend widoczności AI" CTA → /pricing
- [x] Pro users: full citation sparkline visible as before
- [x] TypeScript: 0 errors

### Task 2: AI Visibility StatCard in Dashboard
- [x] Backend: getAuditUsageStats extended with avgCitedEngines, citationTotal, pagesWithCitationCount
- [x] Dashboard: 5th StatCard "Widoczność AI" — shows X/4 or "–" if no data, color-coded
- [x] Tooltip: "Średnio X z 4 silników AI cytuje Twoje monitorowane strony"
- [x] Grid: 2-col mobile → 3-col md → 5-col lg (responsive)
- [x] TypeScript: 0 errors

### Task 3: Weekly Digest Email
- [x] DB: weekly_digest_log table (userId, weekStart, sentAt + metric snapshots) — migration 0022
- [x] Backend: getWeeklyDigestData(userId) — dual-metric trend from score_snapshots + monitored_pages
- [x] Email template: dark HTML, dual-metric cards (AI Score ±X pkt, Widoczność AI ±Y silników), top page block, insight nudge
- [x] Cron worker: runs every Monday 09:00 UTC, iterates eligible users with dedup
- [x] tRPC: system.triggerWeeklyDigest (admin-only, single-user test + full cron run)
- [x] Tests: 22 weekly digest tests (HTML template + edge cases), 306 total passing
- [x] TypeScript: 0 errors

## AI Visibility UX Redesign (2026-03-29)

### Change 1: AI Visibility Score (0-100)
- [x] shared/visibilityScore.ts: shared formula + tier labels (Dominująca/Widoczna/Rozwijająca się/Niewidoczna) + ENGINE_CONFIG + ALL_ENGINES
- [x] server/db.ts: getEngineBreakdownForPage(monitoredPageId) helper
- [x] server/db.ts: getAuditUsageStats extended with avgVisibilityScore
- [x] server/routers.ts: monitoring.getEngineBreakdown tRPC procedure
- [x] MonitoredPageCard: AIVisibilityScoreBadge (large score + tier label + color-coded)
- [x] StatCard “Widoczność AI”: shows avgVisibilityScore/100 with color-coded tier

### Change 2: AIVisibilityTimeline dual-line chart
- [x] Dashboard: AIVisibilityTimeline recharts AreaChart (AI Score purple + AI Visibility Score green)
- [x] MonitoredPageCard: AIVisibilityTimeline in history panel (Pro gate on AI Visibility line)
- [x] Tooltip: date + both values

### Change 3: Dashboard AI Visibility Hub
- [x] Dashboard: AI Visibility Hub section above audit history with aggregated score + engine badges
- [x] Hub: shown when user has ≥1 monitored page with citation data
- [x] Hub: empty state with CTA to add monitoring

### Change 4: Per-engine breakdown
- [x] MonitoredPageCard: EngineBreakdownRow with 4 color-coded engine icons + status per engine
- [x] AICitationPanel summary hero: full per-engine 4-column grid + AI Visibility Score badge
- [x] AICitationPanel: import ENGINE_CONFIG, ALL_ENGINES, getVisibilityScoreResult from shared/visibilityScore.ts

## AI Visibility Command Center (2026-03-29) — COMPLETED

### Zmiana 1: Dashboard — AI Visibility Overview Hero
- [x] Dashboard: AIVisibilityCommandCenter hero sekcja na górze (przed StatCards i historią)
- [x] Dashboard: StatCards uproszczone do 3 (Audyty, Śr. AI Score, Widoczność AI)
- [x] Dashboard: Historia audytów zwinięta domyślnie (collapsible z licznikiem) + id="audits" anchor
- [x] Dashboard: AI Visibility Hub z agregowanym score + per-engine breakdown + weakest page CTA
- [x] Dashboard: Stary AI Visibility Hub (duplikat) usunięty — jedna sekcja widoczności

### Zmiana 2: Results — CTA "Śledź widoczność" w tab Widoczność AI
- [x] Results: CitationMonitoringCTA banner po AICitationPanel
- [x] Results: CTA pre-wypełnia URL z audit.url
- [x] Results: CTA ukryty gdy strona już jest monitorowana (normalise URL comparison)
- [x] Results: monitoring.list query + monitoring.add mutation dodane do Results.tsx

### Zmiana 3: DashboardTopNav — nawigacja AI Visibility Command Center
- [x] DashboardTopNav: "Widoczność AI" jako główny punkt nawigacji z ikoną Eye
- [x] DashboardTopNav: "Audyty" jako osobny punkt nawigacji (hash link #audits)
- [x] DashboardTopNav: AI Sandbox, Page Creator, Plany w nawigacji
- [x] TypeScript: 0 errors, 306 tests passing

## Competitor Intelligence — AI Score rywali (2026-03-29) — COMPLETED

### Architektura
- [x] shared/visibilityScore.ts: ENGINE_CONFIG + ALL_ENGINES (reused)
- [x] DB: competitor_audits table — 85 granular columns (migration 0023)
- [x] server/competitor/engine.ts: extractTopCompetitorUrls() + mapFindingsToColumns() + runCompetitorAudits()
- [x] server/competitor/db.ts: insertCompetitorAudit(), updateCompetitorAuditStatus(), getCompetitorAuditsForAudit()

### Backend Integration
- [x] server/monitoring/worker.ts: auto-trigger runCompetitorAudits() after citation job completes (fire-and-forget)
- [x] server/routers.ts: competitor.getCompetitors tRPC procedure (by auditId)

### Frontend
- [x] AICitationPanel.tsx: CompetitorIntelPanel component — score table with per-category bars
- [x] CompetitorIntelPanel: ScoreBar mini-component for visual comparison
- [x] CompetitorIntelPanel: status handling (loading/empty/data states)
- [x] CompetitorIntelPanel: Pro paywall for full breakdown (Starter sees top-3, Pro sees all + details)

### Tests
- [x] server/competitor/competitor.test.ts: 19 tests (extractTopCompetitorUrls + mapFindingsToColumns)
- [x] Full test suite: 325 tests passing, TypeScript: 0 errors

## Bug Fix + Competitor Intelligence v2 (2026-03-29)

### Bug Fix: CompetitorIntelPanel nie wyświetla danych
- [x] Diagnoza: trigger w citation worker brakował dla jednorazowych audytów
- [x] Fix: trigger dodany do citation/worker.ts (fire-and-forget async, dedup guard)
- [x] Fix: isPro poprawiony — używa user.plan (pro/business) + user.role=admin

### Krok 2: Competitor audit dla jednorazowych audytów
- [x] citation/worker.ts: fire-and-forget trigger po zakończeniu citation job
- [x] Dedup guard: competitorAuditsExist() zapobiega podwójnemu audytowi
- [x] Paywall: Free = top-2 wyniki (blur), Pro = wszystkie 5 + szczegóły

### Krok 3: Gap Analysis
- [x] server/competitor/gapAnalysis.ts: computeGapAnalysis() — 34 checks, 7 kategorii
- [x] tRPC: competitor.getGapAnalysis(auditId) — zwraca listę różnic z priorytetem
- [x] GapAnalysisPanel.tsx: "Co mają rywale, czego Ty nie masz" z category bars
- [x] GapAnalysisPanel: grupowanie po kategorii + priorytet (critical/high/medium/low)
- [x] GapAnalysisPanel: filter pills + expand/collapse per gap item
- [x] GapAnalysisPanel: Pro paywall (Free = top-3 gaps, Pro = wszystkie)
- [x] Tests: 15 unit testów dla gap analysis (340 total, TypeScript: 0 errors)
- [ ] GapAnalysisPanel: link do konkretnej rekomendacji w audycie (future)
- [ ] Competitor trend w weekly digest email (future)

## Bug Fix: setState-in-render w AICitationPanel (2026-03-29)

- [x] Diagnoza: onStatusChange inline w JSX wywoływało setCitationStatus podczas renderowania
- [x] Fix: wyodrębniono handleCitationStatusChange jako useCallback + queueMicrotask do odroczenia setState

## Bug Fix: setState-in-render w AICitationPanel — root cause wewnątrz komponentu (2026-03-29)

- [x] Trace: root cause = startCheck() wywoływany wewnątrz setState updater (setCitationStatus(prev => { startCheck() }))
- [x] Fix: citationStatusRef — ref zsynchronizowany ze state, czytany w setTimeout zamiast setState updater
- [x] Fix: setCitationStatus opakowuje setCitationStatusRaw + aktualizuje ref (useCallback)
- [x] 340 testów, TypeScript: 0 błędów

## Feature: Deep-link auto-start + Competitor status indicator (2026-03-29)

- [x] Deep-link auto-start: useEffect w Results.tsx wywołuje handleSwitchToVisibility gdy ?tab=visibility w URL (deepLinkFiredRef guard, 200ms delay)
- [x] Competitor audit status indicator: latestCompletedAt + isFresh badge (zielony <24h / żółty >24h) + tooltip z dokładną datą

## Bug Fix: 3 krytyczne błędy (2026-03-29)

- [x] Bug 1+2: AICitationPanel zawsze pyta DB (enabled:true, staleTime:0) — wyniki widoczne po remount
- [x] Bug 1+2: jobStarted = userStartedJob || !!job — istniejący job z DB inicjalizuje panel poprawnie
- [x] Bug 3: handleSwitchToVisibility(autoStart) — autoStart=false dla running/done/error, =true tylko dla idle
- [x] Bug 3: CitationStatusBanner onGoToTab przekazuje autoStart=false gdy status != idle
- [x] Bug 3: usunięto citationAutoStartRef (niepotrzebny po refaktorze) — 340 testów, TS: 0 błędów

## Bug Fix: Fałszywe 0 cytowań w audycie 3420005 (2026-03-29)

- [x] Diagnoza: root cause = cache z poprzedniego joba miał perplexity:0 i gemini:0 (quota 429 w poprzednim jobie)
- [x] Diagnoza: getCached("perplexity") zwracało [] — system pomijał te silniki zamiast generować świeże zapytania
- [x] Fix: getCachedOrFresh() — jeśli engine ma 0 zapytań w cache, generuje świeże zamiast pomijać
- [x] Fix: dotyczy wszystkich silników (google, chatgpt, perplexity, gemini) — 340 testów, TS: 0 błędów

## Bug Fix: Anglojęzyczne zapytania dla polskich stron (2026-03-30)

- [x] Diagnoza: 4 warstwy problemu — has Polish skanował tylko 5000 znaków, brak TLD detection, ciTopQuestions w złym języku, brak walidacji po generacji
- [x] Fix: TLD_LANG_MAP (.pl→pl, .de→de, .fr→fr itd.) — priorytet: html[lang] > TLD > content heuristic
- [x] Fix: hasPolish skanuje pełny HTML (nie tylko 5000 znaków)
- [x] Fix: ciTopQuestions filtrowanie — tylko pytania w języku strony trafiają do promptu
- [x] Fix: CRITICAL langNote w prompcie z przykładami zapytań po polsku
- [x] Fix: post-generation validation — jeśli <50% zapytań w języku strony, użyj buildFallbackQueries
- [x] Fix: LOCALE_MAP rozszerzony o 10 języków (nl, pt, cs, sk, hu, ro, sv, no, da, fi)
- [x] 340 testów, TypeScript: 0 błędów
## Feature: Content Intelligence language enforcement (2026-03-30)

- [x] Diagnoza: system prompt był hardcoded po polsku — angielskie strony dostały polskie opisy, polskie strony anglojęzyczne pytania
- [x] Fix: detectPageLanguageForCI() — html[lang] > TLD > polskie znaki > "en"
- [x] Fix: buildSystemPrompt(lang) — dynamiczny prompt w języku strony (pl = pełny polski prompt, inne = angielski + CRITICAL note)
- [x] Fix: buildLangEnforcementNote(lang) — CRITICAL marker + przykłady zapytań po polsku
- [x] Fix: validateLanguageOfStrings() — post-generation validation dla top_questions, page_topics, semantic_gaps, missing_subtopics
- [x] Fix: ContentIntelligenceResult.detectedLanguage — nowe pole z wykrytym językiem
- [x] 340 testów, TypeScript: 0 błędów

## Bug Fix: Competitor audit nie uruchomił się dla audytu 3450003 (2026-03-30)

- [x] Diagnoza: DB ma 5 completed competitor audits dla 3450003 — problem był w UI (brak pollingu)
- [x] Diagnoza: CompetitorIntelPanel miał { retry: false } bez refetchInterval — jeśli dane nie były gotowe przy mount, nie odwieżał się
- [x] Fix: CompetitorIntelPanel — smart polling co 5s (max 3 min) gdy citationJobStatus=completed i brak danych
- [x] Fix: GapAnalysisPanel — ten sam smart polling z useEffect + citationJobStatus prop
- [x] Fix: loading indicator "Trwa analiza konkurencji…" podczas oczekiwania na dane
- [x] 340 testów, TypeScript: 0 błędów

## Feature: Citation Opportunity Finder (2026-03-30)

### Backend
- [x] server/citation/opportunityFinder.ts: Level 1 structural diff (34 checks, 7 categories, zero LLM cost)
- [x] server/citation/opportunityFinder.ts: Level 2 LLM semantic analysis (intent, responseType, winningFragment, contentBrief)
- [x] tRPC: citation.getOpportunities(auditId) — 5min cache, sorted by priority
- [x] Tests: 340 unit tests passing, TypeScript: 0 błędów

### Frontend
- [x] CitationOpportunityPanel.tsx: per-query breakdown, aha-moment design, content brief cards
- [x] CitationOpportunityPanel: ScoreParadoxExplainer — "Masz 92/100 ale 0 cytowań — dlaczego?"
- [x] CitationOpportunityPanel: "Dlaczego warto dążyć do 100/100" educational section
- [x] CitationOpportunityPanel: Pro paywall (Free = 1 opportunity preview, Pro = all + content briefs)
- [x] AICitationPanel: CitationOpportunityPanel po GapAnalysisPanel, overallScore przekazywany z Results.tsx
- [x] Fix psychological paradox: ScoreParadoxExplainer aktywowany gdy score>=60 i citedCount=0

## Bug Fix: Dashboard "Rendered more hooks" (2026-03-30)

- [x] Diagnoza: useState(auditHistoryExpanded) wywoływany po early returns (linia 1212 > 1183)
- [x] Fix: przeniesiono useState przed if(authLoading)/if(!isAuthenticated) — 340 testów, TS: 0 błędów

## Audit Engine Improvements — v5 (Perplexity Ranking Patterns)

- [x] a) contentStructure.ts: add first_paragraph_answer check (page-type-aware, advisory for non-article types)
- [x] b) contentStructure.ts: add intent_blocks check (definition/steps/comparison — context-aware, not rigid)
- [x] c) structuredData.ts: extend date_signals with freshness scoring (age warnings for time-sensitive content only)
- [x] d) eeat.ts: remove duplicate external_citations check (already present in contentStructure.ts)
- [x] e) technical.ts: enhance js_rendering to check H1 and first paragraph presence in HTML source
- [x] f) contentStructure.ts: replace naive regex semantic_triples with NLP-quality SPO density algorithm

## Monitoring Platform v2 — Stable Phrase Management + Citation Pulse (2026-03-31)

### Phase 1 — Stable Phrase Architecture
- [x] DB: monitored_page_phrases table (phrase, source, aiRationale, intentType, sortOrder, isActive, citationStreakDays)
- [x] server/stripe/products.ts: maxAiPhrasesPerPage + maxCustomPhrasesPerPage per plan
- [x] server/monitoring/phraseGenerator.ts: CI-aware phrase generation with rationale (url + DB lookup + LLM)
- [x] server/monitoring/phrases.ts: CRUD helpers (getPhrasesForPage, initializePhrases, addCustomPhrase, togglePhrase, deletePhrase, getPlanLimits)
- [x] server/routers.ts: monitoring.getPhrases, initializePhrases, addPhrase, togglePhrase, deletePhrase procedures
- [x] client/src/components/PhraseManager.tsx: phrase list with rationale, add/toggle/delete, plan-aware upsell
- [x] Dashboard.tsx: PhraseManager integrated into MonitoredPageCard

### Phase 2 — Citation Pulse Board + Alert System
- [x] client/src/pages/CitationPulse.tsx: per-phrase performance board with engine breakdown table
- [x] Dashboard.tsx: "Citation Pulse" link in DashboardTopNav
- [x] App.tsx: /pulse route registered
- [x] server/monitoring/alerts.ts: evaluateAndSendAlerts() — new_citation / lost_citation / competitor alerts with cooldown
- [x] server/monitoring/worker.ts: alert system integrated after citation job completion (fire-and-forget)
- [x] Tests: 372 tests passing, TypeScript: 0 errors

## Monitoring UX: Auto-init phrases + Per-phrase sparkline (2026-03-31)

- [x] monitoring.add router: fire-and-forget initializePhrasesForPage after page is created
- [x] monitoring.add: pass userId, url, plan to initializePhrasesForPage
- [x] DB: add phrase_citation_history table for per-phrase per-run citation tracking
- [x] monitoring worker: record per-phrase citation result per run into phrase_citation_history
- [x] tRPC: monitoring.getPhraseHistory(monitoredPageId, phraseId, limit) procedure
- [x] CitationPulse: PhraseTrendSparkline SVG component (7-run mini chart per phrase)
- [x] CitationPulse: per-phrase row shows sparkline + last citation status per engine

## Citation Pulse visibility fixes (2026-03-31)

- [x] getEngineBreakdownForPage: fallback to last completed citation job (not just lastAuditId)
- [x] Citation Pulse: show last run date + status clearly per page
- [x] Citation Pulse: show "running" state when citation job is in progress
- [ ] Dashboard: ensure add-to-monitoring button is visible and accessible for additional pages

## Unified Phrase Architecture (2026-04-01)

- [x] monitoring router: add getPhrasesForUrl(url) — looks up monitoredPageId by URL+userId, returns canonical phrases
- [x] AICitationPanel: show canonical phrases (from monitoring) before/during citation check — idle + completed states
- [x] AICitationPanel QueriesCheckedPanel: show monitoring phrases as authoritative set with per-phrase citation status
- [x] Results.tsx ContentIntelligencePanel: add url prop + fetch getPhrasesForUrl — show monitoring phrases instead of CI top_questions
- [x] Results.tsx: remove query_coverage top_questions display from Content Intelligence section (backend data preserved)
- [ ] citation router startCheck: use canonical phrases from monitored_page_phrases as seed queries in round 1 (if page is monitored) [future]
- [ ] citation router startCheck: if not monitored, generate phrases via phraseGenerator and pass as seed (fire-and-forget store) [future]

## Three Phrase Unification Follow-ups (2026-04-01)

- [x] Feature 1: citation startCheck seeds monitoring phrases into round 1 (worker uses them as first query set)
- [x] Feature 1: worker: inject seedPhrases from job.prompts into round 1 queries per engine (cacheTag=SEED_PHRASES)
- [x] Feature 2: AICitationPanel — "Zarządzaj" button opens inline PhraseManager in idle state
- [x] Feature 3: monitoring router — getPhraseCoverage(monitoredPageId) procedure added
- [x] Feature 3: MonitoredPageCard — phrase coverage pill X/N with color coding (zinc/amber/emerald)

## Workflow Closure — Full Loop (2026-04-01)

### Phase A — Results page: 3-step workflow bar + Tab 3 Content Creator
- [x] Results.tsx: WorkflowProgressBar (Audyt → Widoczność → Treść) at top of all tabs
- [x] Results.tsx: Tab 3 "Treść AI" — WhatIfSection + ContentCreatorRewriteWidget + workflow context banner
- [x] Tab 3: monitoring phrases as target queries, cited competitors as context (via WhatIfSection)
- [x] Tab 3: one-click "Przepisz z AI" → createRewrite with full enriched context

### Phase B — Per-phrase competitor comparison in Tab 2
- [x] server: getPhraseCitationMatrix(auditId) — per canonical phrase: your status + cited competitor domains per engine
- [x] Results.tsx: PhraseCitationComparisonTable component in Tab 2 between AiExposurePanel and Monitoring CTA

### Phase C — Content Creator enrichment + feedback loop
- [x] createRewrite enrichment: fetch latest citation job → extract cited competitors + missed phrases → add to LLM context
- [x] PageCreatorResult: 3-step workflow CTA (Treść → Audyt → Monitoring) with pre-filled URL
- [x] PageCreatorResult: "Dodaj do monitoringu" CTA for the created page

### Phase D — Dashboard workflow status per page
- [x] MonitoredPageCard: 3-krokowy workflow status mini-bar (Audyt · score → Widoczność · X/N → Treść AI link)
- [x] Dashboard: "Stwórz treść" button per monitored page → PageCreator with auditId context

## UI Rebuild — Workflow Loop (2026-04-01)

- [x] Home.tsx: new workflow-loop narrative hero ("Twoja strona jest niewidoczna w AI Search. Naprawiamy to w 4 krokach.")
- [x] Home.tsx: simplified navigation (no AI Sandbox), 4-step workflow section with animated cards
- [x] Home.tsx: social proof strip, FAQ, pricing CTA, trust signals
- [x] Results.tsx: numbered tab labels (01 · Audyt / 02 · Widoczność / 03 · Treść AI)
- [x] Results.tsx: "Nowy audyt" back button (was "New Audit")
- [x] Dashboard.tsx: removed AI Sandbox from nav + quick actions
- [x] Dashboard.tsx: simplified nav (Monitoring / Widoczność / Kreator treści / Plany)
- [x] index.css: Plus Jakarta Sans for headings, antialiasing, hero-glow, workflow-step-active, animate-pulse-ring utilities

## Sprint inwestorski — 8 poprawek

- [ ] Anonimowy audyt bez logowania — uruchomić audyt bez konta, login zaproponować po wynikach
- [ ] Demo Audit — publiczny przykładowy raport dla wymyślonej domeny (statyczny, bez API)
- [ ] Timer wow — animowany countdown podczas analizy, zawsze szybszy niż zapowiedź
- [ ] Pricing: Starter $59/mies. + Pro $99/mies. — usunąć Agency, usunąć trial, naprawić niespójność Agency/business
- [ ] Usunąć "Bądź wśród pierwszych" z hero (traction counter)
- [ ] Naprawić "Centrum Widoczności AI" → spójne z naming systemem
- [ ] Usunąć "Zacznij 7-dniowy trial" z Pricing CTA
- [ ] Naprawić martwe linki Polityka prywatności / Regulamin w stopce

## Sprint inwestorski — ukończone

- [x] #1 Anonimowy audyt bez logowania — usunięto wymóg logowania przed uruchomieniem
- [x] #2 Demo Audit — stworzono DemoAudit.tsx z przykładowym raportem velora-fashion.pl
- [x] #3 Usunąć trial — usunięto "7-dniowy trial" z Pricing i copy
- [x] #4 Privacy /privacy i Terms /terms — nowe strony z pełną treścią
- [x] #5 Naming — "Centrum Widoczności AI" → "Citation Intelligence" w Dashboard
- [x] #6 Usunąć traction counter — usunięto "Bądź wśród pierwszych"
- [x] #7 Wow timer — animowany timer podczas analizy, zawsze szybszy niż zapowiedź
- [x] #8 Pricing 2 plany — Starter $59/$79 i Pro $99/$129, usunięto Free i Agency
- [x] #9 Footer linki — /privacy i /terms działają, dodano /demo i /pricing
- [x] #10 Usunąć Agency CTA — usunięto plan Agency i "Skontaktuj się"

## Algorithm v4 — Expert Simulation Improvements (Mike King / Metehan / Dan Petrovic)

- [x] Task 1: WikiData NER entity richness — hybrid regex+Wikidata batch API, weight 8→15, QID mapping
- [x] Task 2: Continuous 0-100 scoring — add `score` field to AuditCheck, update all contentStructure checks
- [x] Task 3: Cosine similarity via OpenAI text-embedding-3-large — H1+first150w vs full content
- [x] Task 4: CI weight rebalance — cosine_similarity:0.25, entity_richness:0.20, answer_density:0.12, freshness:0.15
- [x] Task 5: Intelligent content length/density — reward density at 600-1200w, penalty >3000w without density
- [x] Task 6: Freshness decay with page-type context — time-based scoring, evergreen vs time-sensitive logic
- [x] Task 7: Semantic structured data validation — completeness depth, speakable, mainEntity quality
- [x] Tests: vitest coverage for all new scoring functions (35 tests, all passing)
- [x] TypeScript check: zero errors

## Profound Monitoring Upgrades — Layer 1+2+3 (Partial)
### DB Layer
- [ ] 1.1 score_snapshots: add visibilityRate, avgMentionPosition, sentimentScore, prominenceRate, shareOfVoice, competitorCitationCount columns
- [ ] 1.2 visibility_snapshots: new table as independent entity (decoupled from audit cycle)
### Backend Layer
- [ ] 2.4 sentimentAnalyzer.ts: LLM-based sentiment analysis of citation responseText (score, label, themes, prominencePosition)
- [ ] 2.4 Integration: hook sentimentAnalyzer into monitoring/worker.ts after citation job completes
- [ ] 2.4 Integration: write sentiment data to visibility_snapshots and citation_checks
### Frontend Layer
- [x] 3.1 Visibility Score KPI panel in monitoring section (% normalized, trend delta, tier badge)
- [x] 3.4 Sentiment Dashboard: per-engine sentiment chart, themes list, example AI responses
- [x] 3.3 Competitive Benchmarking UI: Share of Voice vs competitors, reusing existing competitorDomains data

## Citation ↔ Monitor Data Bridge Fixes

- [x] Fix 1: After citation.startCheck completes, update monitored_pages.lastCitedEngines if URL is monitored
- [x] Fix 2: Backfill score_snapshots with citation data after runCitationJob completes
- [x] Fix 3: Unify phrase sources — fix URL normalization so monitoring phrases always seed Citation Intelligence

## UX Improvements — Pulse Monitor v2

- [ ] Task A: Citation spinner in monitored page bar — show spinner when citation job is running for this URL
- [ ] Task B: "Run Citation Intelligence" button directly in Pulse Monitor panel (no need to go to audit results)
- [ ] Task C: Wire real competitorDomains from citation_checks into getCompetitorBenchmark procedure + update CompetitorBenchmark UI
- [x] Fix 3: Inject Citation Opportunities (contentBrief) into Signal Rewrite system prompt via citationOpportunities field

## Signal Rewrite Enhancements — Unicorn-level UX

- [x] Feature A: Signal Rewrite Readiness Dashboard — mini-dashboard in Tab 3 showing loaded context (audit score, citation status, N opportunities injected, N competitor URLs)
- [x] Feature B: Before/After Diff — side-by-side view after rewrite, with highlighted sentences that address Citation Opportunities
- [x] Feature C: Citation Intelligence Gate — if citationStatus is idle/not run, show CTA block instead of WhatIfSection form

## Signal Rewrite — AI-Readiness Re-Scoring

- [ ] Backend: contentRescore tRPC procedure — LLM scores rewritten content on 7 GEO dimensions, returns estimated score delta vs original
- [ ] Frontend: ScoreImpactPanel — animated score delta display after rewrite completes, with per-dimension breakdown

## Celebration Moments — Per-Signal (Anton Osika / Lovable)

- [x] Signal Audit celebration: confetti burst + banner on every score reveal (not just delta)
- [x] Citation Intelligence celebration: confetti + banner when citationStatus running→done
- [x] Signal Rewrite celebration: confetti burst + banner after pushVersion (new version generated)

## Algorithm v4 Expert Simulation — Mike King + Metehan Yeşilyurt + Dan Petrovic

- [x] Knowledge Graph Readiness Score — KnowledgeGraphReadinessPanel (Tab 1, after IssuesAndFixes)
  - [x] KG Score 0–100 with 3 tiers: Not Ready / Partial / KG Verified
  - [x] Confirmed WikiData entities list with QID links and entity type icons
  - [x] Unconfirmed entity candidates (collapsible)
  - [x] Entity type distribution (person/org/product/place/concept)
  - [x] JSON-LD sameAs snippet generator with copy button
  - [x] Improvement tip for low scores
  - [x] entityData returned from analyzeContentStructure via ContentStructureResult
  - [x] WikiDataEntity + EntityRecognitionResult + ContentStructureResult types added to shared/auditTypes.ts
- [x] Answer-First Opening Score — AnswerFirstOpeningCard (Tab 1, after KG panel)
  - [x] LLM-based analysis of first paragraph (structured JSON output)
  - [x] Score 0–100 blended (60% LLM + 40% regex)
  - [x] Before/after comparison with current opening vs. LLM rewrite
  - [x] Copy button for suggested rewrite
  - [x] Fallback to regex-only score when LLM unavailable
  - [x] metadata field added to AuditCheck type (backward-compatible)
  - [x] vi.mock for invokeLLM in audit.v5.test.ts (474/474 tests passing)

## Polish Heading Capitalisation Fix
- [x] Add applyPolishSentenceCase() to textNormalization.ts
- [x] Add normalizePolishHeadings() for plain-text and Markdown headings
- [x] Add normalizePolishContent() combining headings + punctuation normalisation
- [x] Add normalizePageCreatorResultFull() for deep object normalisation
- [x] Update Signal Rewrite post-processor to use normalizePolishContent()
- [x] Update pageCreator to use normalizePageCreatorResultFull()
- [x] Add explicit Polish sentence case rule to Signal Rewrite LLM prompt
- [x] Add explicit Polish sentence case rule to PageCreator system prompt
- [x] Fix isPolishText() false positives for English text containing 'to'
- [x] Write 30+ tests for all new normalisation functions

## Warstwa 2 — Server-Sent Events (SSE) zamiast pollingu

- [x] Backend: server/citation/sseRegistry.ts — CitationSSERegistry (job-scoped EventEmitter, TTL eviction, typed events)
- [x] Backend: server/citation/sseHandler.ts — GET /api/citation/stream/:jobId (W3C SSE, heartbeat 15s, reconnect retry 3s)
- [x] Backend: server/_core/index.ts — rejestracja trasy SSE przed express.json()
- [x] Backend: server/citation/worker.ts — onResult callback emituje result+progress per-engine; done/error na końcu
- [x] Frontend: client/src/hooks/useCitationStream.ts — EventSource hook z deduplication, reconnect backoff, fallback flag
- [x] Frontend: AICitationPanel — zastąpienie pollingu SSE streamem; progressive per-engine grid; live query feed
- [x] Tests: server/citation/sse.test.ts — 24 testy (registry, event contract, worker integration, memory safety, fallback)
- [x] Fix: sseRegistry.ts — domyślny listener "error" na EventEmitter (Node.js unhandled error prevention)
- [x] Wszystkie 540 testów przechodzi

## SSE Follow-up Steps (A, B, C)

### Step A — Citation Spinner in Pulse Monitor
- [x] CitationPulse.tsx: PagePulsePanel subscribes to useCitationStream when active job exists
- [x] CitationPulse.tsx: per-engine live grid visible in card header (not just expanded state)
- [x] CitationPulse.tsx: "Sprawdzam…" badge with engine name when streaming active

### Step B — SSE Streaming for Signal Rewrite
- [x] server/rewrite/rewriteSSERegistry.ts — RewriteSSERegistry (job-scoped, typed events: step, section, done, error)
- [x] server/rewrite/rewriteSSEHandler.ts — GET /api/rewrite/stream/:jobId
- [x] server/_core/index.ts — register rewrite SSE route
- [x] server/routers.ts — rewrite procedure emits SSE events via registry (step changes, section progress, done)
- [x] client/src/hooks/useRewriteStream.ts — EventSource hook for rewrite progress
- [x] Results.tsx — replace setTimeout fake progress with real SSE stream events

### Step C — Last-Event-ID Replay Buffer
- [x] sseRegistry.ts — bounded ring buffer (max 200 events per job, FIFO eviction)
- [x] sseRegistry.ts — each stored event has seq ID + timestamp
- [x] sseHandler.ts — read Last-Event-ID header, replay missed events on reconnect
- [x] useCitationStream.ts — pass Last-Event-ID on reconnect via EventSource URL param

## Warstwa 3 — Progressive Disclosure UI: Emotional Tension Sequence

- [x] EmotionalTensionFeed.tsx — standalone, pure presentational, zero side effects
- [x] LiveQueryTicker — "Pytam ChatGPT: 'kurtka zimowa damska'" (Zasada 3: konkretność)
- [x] NarrativeEventCard — competitor reveal PRZED wynikiem (Zasada 1: ból przed rozwiązaniem)
- [x] buildNarrativeLine — human-readable narrative per result event (Zasada 2: nowa info, nie licznik)
- [x] EngineStatusCard — per-engine live grid z cited/total
- [x] Auto-scroll feed z max-h i overflow-y-auto (smart: tylko gdy user jest blisko dołu)
- [x] CSS keyframes: animate-slide-in-up (cubic-bezier spring) w index.css
- [x] SSEProgressPayload.currentQuery — dodane do sseRegistry.ts + worker.ts emit
- [x] StreamProgress.currentQuery — dodane do useCitationStream.ts
- [x] AICitationPanel running state — zastąpiony EmotionalTensionFeed
- [x] 574 testów przechodzi, 0 błędów TypeScript

## Warstwa 4 — Instant First Signal (3-sekundowy aha moment)

- [x] server/citation/quickSignal.ts — getQuickSignal(url): single Google AI Overview check on page title/H1
- [x] server/routers.ts — citation.quickSignal tRPC mutation (publicProcedure, input: auditId)
- [x] client/src/components/QuickSignalCard.tsx — emotional reveal card: cited/not cited + top competitor
- [x] AICitationPanel — wire quickSignal: fire on handleStart, show QuickSignalCard before full job results
- [x] AICitationPanel — QuickSignalCard persists during running state (stays visible above EmotionalTensionFeed)
- [x] AICitationPanel — QuickSignalCard fades out gracefully when full results arrive
- [x] server/citation/quickSignal.test.ts — unit tests for quickSignal

## Visibility First — 3 kroki (P0/P1)

- [x] Step 1 (P0): Zmień domyślny tab z "optimization" na "visibility" w Results.tsx
- [x] Step 1 (P0): Przenieś Citation Intelligence na pozycję 01 w nawigacji zakładek
- [x] Step 1 (P0): Zaktualizuj numerację pozostałych zakładek (Signal Audit → 02, Signal Rewrite → 03)
- [x] Step 2 (P1): CitationZeroState.tsx — karta "Żaden silnik AI nie cytuje tej strony" z top-3 konkurentami- [x] Step 2 (P1): Podcłącz CitationZeroState do AICitationPanel gdy isCompleted && !foundCitation
- [x] Step 2 (P1): CTA w CitationZeroState → Pulse Monitor (nawigacja do /pulse)
- [x] Step 3 (P1): Landing page hero CTA zmień na "Czy AI poleca Twoją stronę?"
- [x] Step 3 (P1): Subtext pod przyciskiem: "Twoja widoczność w AI Search w 60 sekund"
- [x] Step 3 (P1): Zaktualizuj opis produktu w hero section

## Score Reveal — count-up emocjonalny payoff

- [x] client/src/hooks/useCountUp.ts — hook animujący licznik 0→target, ease-out, 1.2s
- [x] client/src/components/ScoreReveal.tsx — animowany reveal: ring SVG + count-up + engine breakdown + emotional copy
- [x] AICitationPanel — wstrzyknij ScoreReveal po EmotionalTensionFeed gdy isDone, z 400ms delay
- [x] ScoreReveal — warianty emocjonalne: 0/4 (krytyczny), 1-2/4 (szansa), 3-4/4 (lider)
- [x] ScoreReveal — fade-in + slide-up animacja przy pierwszym render
- [x] ScoreReveal — nie duplikuje istniejącego hero score w completed state

## Visibility First — Gaps Fix

- [ ] Warunek 1: CitationLoadingBridge — pokazuj Signal Audit jako "wstępna diagnoza" gdy citation running
- [ ] Warunek 3: Nav header CTA zmień z "Analizuj stronę" na "Sprawdź widoczność w AI"
- [ ] Auto-start: Citation Intelligence startuje automatycznie po załadowaniu /results (default tab = visibility)

## Session: Full Platform Identity Transformation (Landing Page)

- [x] Hero badge: zmieniono na "Platforma AI Search Visibility · GEO / AEO" z Radio pulse icon
- [x] Hero right card: zastąpiono LiveCitationDemoCard — animowana sekwencja competitor reveal (zalando.pl, answear.com, modivo.pl) z auto-loop
- [x] LiveCitationDemoCard: 4 engine status row, live query feed, score reveal, CTA button
- [x] Nowa sekcja AI Visibility Score (HubSpot Website Grader concept): Citation Score + Signal Score + benchmark branżowy (SVG gauge)
- [x] Sekcja Social proof strip: 87% stron nie cytowanych, 4 silniki, 60s, 40+ sprawdzeń
- [x] How it works: zmieniono narrację na platformę ("Nie narzędzie. Platforma."), zaktualizowano opis flow (Citation Intelligence → Signal Audit → Signal Rewrite → Pulse Monitor)
- [x] Final CTA: zmieniono headline na "Czy AI poleca Twoją stronę? Odpowiedź w 60 sekund.", dodano drugi przycisk "Zobacz przykładowy raport"
- [x] 619 testów, 0 błędów TypeScript

## Session: ErrorState + Landing Page Visibility First Fixes

- [x] ErrorState redesign — WAF/Cloudflare/terminated errors show actionable diagnosis (Shield icon, amber color, 3 tips, technical details collapsible)
- [x] ErrorState — 404/Not Found: specific copy with URL validation tips
- [x] ErrorState — generic errors: fallback with retry button
- [x] ErrorState — two action buttons: "Wróć" (back) + "Spróbuj ponownie" (navigate home)
- [x] Landing page WORKFLOW_CARDS reorder — Citation Intelligence as 01 (featured), Signal Audit as 02
- [x] Landing page WORKFLOW_PREVIEW (hero card) reorder — Citation Intelligence first
- [x] Puppeteer fallback confirmed implemented in scraper.ts (terminated/aborted → headless Chromium bypass)
- [x] 619 tests passing, 0 TypeScript errors

## Session: Parallel Execution — Signal Audit + Citation Intelligence

- [x] audit.start procedure: zwraca auditId natychmiast, audit działa w tle (fire-and-forget)
- [x] Home.tsx: używa audit.start zamiast audit.run, nawiguje do /results natychmiast po otrzymaniu auditId
- [x] Results.tsx: usunieto early return dla running/pending — strona renderuje się natychmiast
- [x] Results.tsx: isAuditRunning flag — findings/score/llmRecs są null gdy audit running (null-safe)
- [x] Results.tsx: bgCitation useEffect — startuje Citation Intelligence po 800ms od mount (nie czeka na audit.status === "completed")
- [x] Results.tsx: Tab 02 Signal Audit — inline loading state z krokami gdy isAuditRunning, z linkiem do Citation Intelligence
- [x] AICitationPanel: idle CTA dla anonimowych — emotional teaser "Kto pojawia się zamiast Ciebie?" z 4 engine badges
- [x] Polling: audit.getById co 2s gdy status running/pending — automatyczne odświeżenie po zakończeniu audytu
- [x] 619 testów, 0 błędów TypeScript

## Redesign: Citation Intelligence Tab + Dashboard (Srinivas + Osika)

- [ ] Citation Intelligence: nowa architektura informacji — 5 sekcji zamiast 9+4
- [ ] Citation Intelligence: usunięcie duplikatu "Kto dominuje zamiast Ciebie" vs "Competitor Intelligence"
- [ ] Citation Intelligence: ujednolicenie "Analiza luk vs. konkurenci" z Competitor Intelligence
- [ ] Citation Intelligence: konsolidacja 4 bannerów akwizycyjnych w 1 spójny CTA na końcu
- [ ] Citation Intelligence: nowa kolejność: Score Reveal → Diagnoza AI → Competitor Intelligence (unified) → Citation Opportunities → Monitoring CTA
- [ ] Dashboard: zmiana nazwy na "AI Visibility Command Center" — ujednolicenie nazewnictwa
- [ ] Dashboard: nowy widok oparty na platformie AI Search (nie narzędzie SEO)
- [ ] Dashboard: sekcje: Visibility Overview → Pulse Monitor → Recent Audits → Quick Actions

## Session: Citation Intelligence Redesign + Dashboard Naming (Srinivas + Osika Analysis)

- [x] Citation Intelligence tab: usunięto CompetitorSummary jako duplikat (zastąpiony przez CompetitorIntelPanel)
- [x] Citation Intelligence tab: naprawiono kolejność sekcji (1: Score Reveal → 2: Diagnoza AI → 3: Jak AI widzi → 4: Kto dominuje + Competitor Intel → 5: Analiza luk → 6: Citation Opportunities → 7: Metodologia)
- [x] Citation Intelligence tab: 4 osobne bannery akwizycji zastąpione 1 unified "Co dalej?" blokiem (3 karty: Pulse Monitor + Analiza konkurencji Pro + Signal Rewrite)
- [x] Dashboard: nawigacja - /dashboard zmieniono z "Pulse Monitor" na "AI Visibility Hub" (LayoutDashboard icon)
- [x] Dashboard: /pulse zmieniono z "Citation Intelligence" na "Pulse Monitor" (Eye icon)
- [x] Dashboard: sekcja monitorowanych stron zmieniona z "Pulse Monitor" na "AI Visibility Monitor"
- [x] Dashboard: greeting subtitle zmieniono na platformowy ("Twoja platforma AI Search Visibility...")
- [x] 619 testów, 0 błędów TypeScript

## FULL REDESIGN + COPYWRITING PLAN (Spotkanie Perplexity × Lovable)

### Phase A — Design
- [ ] Color palette: --background #080810, --accent #6366f1, update CSS variables in index.css
- [ ] Geist font: install via Google Fonts CDN in index.html
- [ ] Sticky score bar in Citation Intelligence tab
- [ ] Competitor Intelligence consolidation (already done — verify)

### Phase B — Design
- [x] ScoreOrb count-up animation (0 → score in 800ms)
- [ ] IssueCard severity bar redesign (left border color accent)
- [x] Landing page hero asymmetric layout (60/40 split)
- [ ] Unified CTA block "Co dalej?" at bottom of Citation Intelligence (already done — verify)
- [ ] Emotional loading state for Citation Intelligence (live engine feed)

### Phase C — Design
- [ ] Before/After Quick Wins with diff view
- [ ] AI Visibility Trend chart in Dashboard
- [ ] Mobile responsive fixes across all views

### Wave 1 — Copy
- [ ] Landing page: subheadline, CTA button, trust text, problem strip, how it works, before/after labels, pricing names
- [ ] Citation Intelligence: tab name, score reveal messages, section names, competitor section, opportunities, co dalej block
- [ ] Signal Audit: tab name, score name, sub-scores, issues section names, filter tabs, quick wins

### Wave 2 — Copy
- [x] Dashboard: sidebar nav + ScoreOrb hero + AI Visibility Hub layout
- [ ] Signal Rewrite: headline, loading state, readiness panel, result view, page types 8→6

### Wave 3 — Copy
- [ ] FAQ: all answers rewritten
- [ ] Error states: WAF, 404, timeout
- [ ] Toast messages: success, error
- [ ] Empty states
- [ ] Auth gate messages
- [ ] Plan upgrade gate messages

## Konsolidacja Citation Intelligence / Pulse Monitor

- [x] Zmiana nazwy "Citation Intelligence" → "AI Visibility Check" we wszystkich komponentach
- [x] Zmiana nazwy "Pulse Monitor" → "AI Visibility Monitor" we wszystkich komponentach i na stronie /pulse
- [x] Usunięcie zakładki "Widoczność AI" z karty monitorowanej strony w Dashboard, zastąpienie linkiem do /pulse
- [x] Aktualizacja sidebara: "Sprawdź teraz" (jednorazowy) vs "śledź zmiany" (monitoring)
