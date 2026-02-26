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
