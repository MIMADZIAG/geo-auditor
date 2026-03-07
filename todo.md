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
