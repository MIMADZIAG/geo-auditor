# INTENT-MATRIX v4 — Architecture Document

**GEO-Auditor · Citation Query Prediction Engine**
**Date:** 2026-04-07 · **Author:** Engineering Team

---

## 1. Problem Statement

The original phrase generator produced generic SEO keyword phrases (e.g., "kredyt gotówkowy") that:
1. Were **not actual user queries** typed into AI engines
2. Had **no citation probability rationale** — users couldn't understand why a phrase was selected
3. Used a **round-based fan-out model** (5 rounds × 4 engines) that was slow and expensive
4. Generated **per-engine phrase variants** despite AI engines processing the same natural language

The core insight from research: **AI engines don't index keywords — they index answers to questions.** A page gets cited when its content is the best answer to a specific user question. Therefore, the monitoring system must predict those exact questions.

---

## 2. Research Basis

### 2.1 How Perplexity Selects Citations

Perplexity uses a RAG (Retrieval-Augmented Generation) pipeline:
1. **Indexing**: Pages are chunked into semantic segments (typically 512-token windows)
2. **Retrieval**: User query is embedded → cosine similarity search against chunk embeddings
3. **Ranking**: Top-k chunks are re-ranked by relevance + freshness + authority
4. **Citation**: Chunks with similarity > threshold are cited with source attribution

**Implication for GEO**: A page is cited when its content chunk closely matches the semantic embedding of the user's question. The best predictor of citation is: *does the page directly answer a question that users actually ask?*

**Optimal query patterns for Perplexity citation**:
- Full questions starting with question words: "Jak/Co/Dlaczego/Który/Ile"
- Specific enough to have 3-5 good sources (not too broad)
- Matching the page's "answer pattern" (question → direct answer in first paragraph)

### 2.2 How Google AI Overviews Selects Citations

Google AI Overviews (formerly SGE) is strongly correlated with:
1. **Top-10 organic position** for the query (necessary but not sufficient)
2. **Featured snippet eligibility** — content must be directly answerable
3. **Informational intent** — AI Overviews appear primarily for "how/what/why" queries
4. **Structured content** — lists, tables, headers increase citation probability

**Implication for GEO**: Queries must match the page's organic ranking potential. The best queries are those where the page already ranks (or could rank) in top-10 for an informational query.

**Optimal query patterns for AI Overviews**:
- "jak [działanie]", "co to jest [temat]", "dlaczego [zjawisko]"
- "ile kosztuje [produkt/usługa]" (commercial informational)
- "jak wybrać [produkt]", "jak zrobić [czynność]"

### 2.3 How ChatGPT Search Selects Citations

ChatGPT Search (Bing-powered) focuses on:
1. **Task-oriented queries** — user asks ChatGPT to DO something
2. **Research queries** — user wants a comprehensive answer with sources
3. **Recommendation queries** — "jakie są najlepsze X", "polecasz X czy Y"

**Implication for GEO**: ChatGPT cites sources when answering research or recommendation queries. The page must be an authoritative source for the topic.

**Optimal query patterns for ChatGPT citation**:
- "pomóż mi wybrać [produkt]", "jakie są najlepsze [kategoria]"
- "porównaj [X] i [Y]", "wyjaśnij [temat] prostymi słowami"
- "co powinienem wiedzieć o [temacie]"

### 2.4 How Gemini Selects Citations

Gemini (Google's conversational AI) excels at:
1. **Comparative queries** — "X vs Y", nuanced comparisons
2. **Conversational follow-ups** — "a co z [aspektem]?"
3. **Explanation queries** — "wyjaśnij [temat] dla kogoś bez wiedzy technicznej"

**Implication for GEO**: Gemini is particularly strong at comparative and explanatory content. Pages with clear comparison tables, pros/cons, or step-by-step explanations get cited more.

### 2.5 Profound 10M Study Key Findings

Analysis of 10 million AI citations across ChatGPT, Perplexity, Gemini, and Google AI Overviews reveals:
1. **Direct answer in first paragraph**: Pages with a direct answer to the query in the first 100 words are cited 3.2× more often
2. **Structured content**: Lists, tables, and headers increase citation probability by 2.1×
3. **E-E-A-T signals**: Author attribution, external citations, and expertise signals increase citation by 1.8×
4. **Query-answer alignment**: Pages where the H1/title directly matches the query pattern have highest citation probability

---

## 3. INTENT-MATRIX Model

### 3.1 Core Principle

> **One question = one query.** The same question typed into ChatGPT, Perplexity, Gemini, or Google AI Overviews is semantically equivalent. Per-engine differentiation belongs in the query FRAMING (question words, conversational tone), not in topic selection.

### 3.2 Architecture Layers

```
Page Content Signals
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: ANCHOR QUERIES (highest citation probability)     │
│  Source: URL slug + page title                              │
│  Method: slug → human-readable → direct query              │
│  Example: /kredyt-gotowkowy → "kredyt gotówkowy ranking"   │
│  P(citation): HIGH — exact match to page's primary topic   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: QUESTION QUERIES (validated by CI analysis)       │
│  Source: ContentIntelligence.query_coverage.top_questions  │
│  Method: CI already identified questions users ask          │
│  Example: "jak wybrać najlepszy kredyt gotówkowy"          │
│  P(citation): HIGH — questions validated by LLM analysis   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: INTENT-MATRIX QUERIES (LLM-generated)             │
│  Source: LLM + page signals (topics, entities, type)        │
│  Method: 5 intent types × 2-3 queries each = 10-15 total   │
│  Filtered to 12 highest-probability queries                 │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Intent Types

| Intent | Polish Pattern | Example | Best Engine |
|--------|---------------|---------|-------------|
| `informational` | "co to jest X", "jak działa X" | "co to jest kredyt hipoteczny" | Google AI, Perplexity |
| `comparative` | "X vs Y", "najlepszy X ranking" | "kredyt gotówkowy vs hipoteczny" | Gemini, ChatGPT |
| `commercial` | "ile kosztuje X", "cena X" | "ile kosztuje kredyt gotówkowy" | Google AI, Perplexity |
| `how_to` | "jak wybrać X", "jak zrobić X" | "jak wybrać kredyt gotówkowy" | All engines |
| `problem_solving` | "dlaczego X nie działa", "co zrobić gdy X" | "co zrobić gdy bank odmówi kredytu" | ChatGPT, Perplexity |
| `navigational` | brand + action | "PKO BP kredyt kalkulator" | Google AI |
| `transactional` | "kup X", "zamów X online" | "złóż wniosek o kredyt online" | ChatGPT |

### 3.4 Quality Filters

Each generated query must pass ALL filters:
1. **Full question** — not a keyword phrase (must contain a verb or question word)
2. **Specific** — narrow enough that this page could be one of 3-5 cited sources
3. **No domain/URL** — queries must be generic, not brand-specific
4. **Language-native** — all queries in the page's detected language
5. **Rationale-backed** — each query includes citation probability explanation

### 3.5 Output Schema

```typescript
interface GeneratedPhrase {
  phrase: string;           // Full question (not keyword)
  rationale: string;        // Why this page would be cited for this query
  intentType: IntentType;   // One of 7 intent types
  engineAffinity: Engine[]; // Which engines are most likely to cite
  citationProbability: "high" | "medium" | "low";
  sortOrder: number;        // High-probability queries first
}
```

---

## 4. Key Design Decisions

### Decision 1: Shared Queries Across All Engines

**Decision**: Generate ONE set of queries for all 4 engines, not per-engine variants.

**Rationale**: A user asking "jak wybrać kredyt gotówkowy" in ChatGPT vs Perplexity is asking the same question. The AI engine's selection algorithm differs, but the query semantics are identical. Per-engine differentiation adds complexity without improving precision.

**Trade-off**: We lose some engine-specific optimization (e.g., Gemini's preference for comparative framing). Mitigated by `engineAffinity` field which indicates which engines are most likely to cite for each query.

### Decision 2: Quality Over Quantity (12 Queries Max)

**Decision**: Generate maximum 12 high-precision queries per page.

**Rationale**: The Profound 10M study shows diminishing returns after 10-15 queries. Running 50 generic queries produces noise, not signal. 12 high-precision queries provide:
- Complete coverage of all 5 intent types
- Manageable monitoring cost (12 queries × 4 engines = 48 API calls per check)
- Clear, understandable monitoring set for users

### Decision 3: CI-First Enrichment

**Decision**: Use ContentIntelligence data as primary signal source before falling back to LLM generation.

**Rationale**: CI analysis already extracts `top_questions`, `page_topics`, and `semantic_gaps` from the actual page content. These are more reliable than LLM-generated queries because they're grounded in the page's real content.

**Fallback**: If no CI data exists (page not yet audited), fall back to LLM-only generation using URL slug + live page scrape.

### Decision 4: Language-Native Queries

**Decision**: All queries generated in the page's detected language.

**Rationale**: AI engines are language-specific. A Polish page should be monitored with Polish queries. Mixing languages produces false negatives (page not cited for English queries) and false positives (page cited for irrelevant queries).

---

## 5. Integration Points

### 5.1 Phrase Initialization Flow

```
User adds page to monitoring
        │
        ▼
initializePhrases() called
        │
        ├─ extractCISignals(url) → CI data from last audit
        │         │
        │         ├─ CI exists → ci_enriched mode
        │         └─ CI missing → llm_only mode
        │
        ▼
generatePhrasesForPage()
        │
        ├─ Layer 1: slug query (1 phrase)
        ├─ Layer 2: top_questions from CI (up to 4 phrases)
        └─ Layer 3: LLM INTENT-MATRIX (remaining slots, max 12 total)
        │
        ▼
insertPhrases() → monitored_page_phrases table
        │
        ▼
PhraseManager UI shows generated phrases with rationale
```

### 5.2 Citation Worker Integration

The citation worker uses the stored phrases as the query set for each monitoring run:

```
runCitationJob(jobId)
        │
        ├─ If job.prompts.length > 0 → use as round 1 queries
        └─ If job.prompts.length === 0 → generate via fanOutQueries()
```

For monitoring jobs (triggered by cron), phrases from `monitored_page_phrases` are passed as `prompts` to `createCitationJob`. This ensures the same stable phrase set is used across all monitoring runs, enabling reliable trend tracking.

### 5.3 DB Schema

```sql
monitored_page_phrases (
  id, monitoredPageId, userId,
  phrase VARCHAR(512),
  source ENUM('ai_generated', 'user_added', 'user_modified'),
  aiRationale TEXT,
  intentType ENUM('informational', 'navigational', 'commercial', 'transactional',
                  'comparative', 'how_to', 'problem_solving'),
  isActive BOOLEAN,
  sortOrder INT,
  lastCitedEngines INT,
  lastCheckedAt TIMESTAMP,
  citationStreakDays INT
)
```

---

## 6. Future Improvements

### 6.1 Semantic Deduplication
Before inserting phrases, run cosine similarity check to remove near-duplicate queries (e.g., "jak wybrać kredyt" and "jak wybrać najlepszy kredyt" are 95% similar).

### 6.2 Citation Feedback Loop
After each monitoring run, update `citationStreakDays` and `lastCitedEngines`. Phrases with 0 citations after 3+ runs should be flagged for replacement. Phrases with consistent citations should be prioritized.

### 6.3 Competitive Gap Analysis
For each query where the page is NOT cited, identify which competitor is cited instead. This creates a prioritized list of content improvements.

### 6.4 Query Freshness
AI engines update their indexes frequently. Queries that were relevant 6 months ago may not be relevant today. Implement quarterly phrase refresh triggered by significant content changes.

---

## 7. Performance Characteristics

| Metric | Value |
|--------|-------|
| Phrase generation time | 3-8 seconds (LLM call) |
| Phrases per page | 8-12 (quality-filtered) |
| Citation check time | 45-120 seconds (12 queries × 4 engines) |
| DB storage per page | ~5KB (phrases + rationale) |
| API cost per check | ~$0.08 (12 queries × 4 engines × $0.002/query) |

---

*This document reflects the INTENT-MATRIX v4 implementation as of 2026-04-07.*
*Architecture decisions are based on research into Perplexity RAG pipeline, Google AI Overviews ranking factors, ChatGPT Search behavior, and Gemini citation patterns.*
