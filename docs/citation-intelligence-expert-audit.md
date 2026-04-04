# Expert Audit: Citation Intelligence Module
## GEO-Auditor — Analiza techniczna i UX

**Autorzy symulacji eksperckich:** Dejan Petrovic (Dixon Jones / Majestic), Metehan Yeşilyurt (AI Visibility Research), Mike King (iPullRank)
**Data audytu:** Kwiecień 2026
**Zakres:** Moduł 02 — Citation Intelligence (Tab 2 w Results.tsx) + Competitor Gap Analysis

---

## Streszczenie wykonawcze

Citation Intelligence to architektonicznie najambitniejszy moduł GEO-Auditora. Łączy w sobie cztery silniki AI (ChatGPT, Google AI Overviews, Perplexity, Gemini), wielorundowy system fan-out queries, analizę konkurencji i gap analysis oparty na 34 checkach. Fundamenty są solidne — ale produkt cierpi na trzy systemowe problemy, które obniżają jego wartość dla użytkownika końcowego: (1) fałszywe alarmy w gap analysis wynikające z błędnych mapowań ID, (2) brak kontekstualizacji wyników — użytkownik widzi liczby bez narracji, (3) architektoniczne rozproszenie danych — informacje zebrane w jednym module nie przepływają do drugiego.

---

## 1. Dejan Petrovic — Architektura danych i integralność systemu

### 1.1 Krytyczny błąd: 12 z 34 checkId w CHECK_DEFS nie mapowało na rzeczywiste ID

**Status po naprawie:** Naprawiono 6 kluczowych mismatchy (`sitemap`, `organization`, `breadcrumb`, `ai_url_access`, `ai_full_block`, `ai_llms_txt`). Pozostałe 6 (`title_tag`, `meta_description`, `og_title`, `lang_attribute`, `social_proof`, `niche_authority`) były poprawne — ich ID w `metaTags.ts` i `brandAuthority.ts` zgadzają się z CHECK_DEFS.

**Konsekwencja błędu:** `computeGapAnalysis()` szukał `targetPassStatus["ai_url_access"]` w mapie zbudowanej z `aiCrawlers.checks`, gdzie check ma id `"audited_url_access"`. Wynik: `targetPasses = false` zawsze → gap zawsze się pojawiał niezależnie od rzeczywistego stanu robots.txt. To nie był "statyczny zestaw rekomendacji" — to był dynamiczny system z błędnymi kluczami.

**Rekomendacja architektoniczna:** Wprowadź test integracyjny, który weryfikuje że każdy `checkId` w `CHECK_DEFS` istnieje w odpowiednim module audytowym. Taki test powinien być uruchamiany przy każdym `pnpm db:push` jako guard.

```typescript
// Przykład testu integracyjnego
it("all CHECK_DEFS checkIds exist in audit modules", () => {
  const allAuditIds = new Set([...technicalIds, ...structuredDataIds, ...aiCrawlerIds]);
  for (const def of CHECK_DEFS) {
    expect(allAuditIds.has(def.checkId), `Missing: ${def.checkId}`).toBe(true);
  }
});
```

### 1.2 Problem: Competitor engine nie przekazuje `entityData` do gap analysis

`analyzeContentStructure()` zwraca teraz `entityData` (WikiData NER), ale `mapFindingsToColumns()` w `engine.ts` nie ma kolumny dla KG score. Oznacza to, że Knowledge Graph Readiness Score nie jest porównywany między stroną docelową a konkurentami. To jest pominięta okazja — jeśli konkurent ma 5 potwierdzonych encji WikiData, a strona docelowa 0, ta luka powinna pojawić się w gap analysis.

**Rekomendacja:** Dodaj `cs_kg_score` kolumnę do `competitor_audits` i zmapuj ją z `entityData.kgScore` w `mapFindingsToColumns()`.

### 1.3 Problem: `ai_url_access` kolumna w competitor_audits vs check `audited_url_access`

Kolumna w bazie danych nazywa się `ai_url_access`, ale check w `aiCrawlers.ts` ma id `audited_url_access`. Ta asymetria jest myląca. Rekomendacja: ujednolicić nazewnictwo — albo zmień kolumnę na `ai_audited_url_access`, albo zmień check id na `ai_url_access`. Obecna konwencja (kolumna = `ai_url_access`, check = `audited_url_access`) jest niespójna i będzie źródłem kolejnych bugów.

### 1.4 Problem: Brak cache invalidation po ponownym uruchomieniu Citation Intelligence

Użytkownik może uruchomić Citation Intelligence wielokrotnie dla tego samego URL. `getGapAnalysis` zawsze bierze `competitors` z bazy — ale jeśli nowy run competitor auditu zwrócił inne wyniki niż poprzedni, stare dane nadal siedzą w `competitor_audits`. Brak mechanizmu "latest run wins" powoduje, że gap analysis może operować na przestarzałych danych konkurencji.

---

## 2. Metehan Yeşilyurt — UX i wartość dla użytkownika końcowego

### 2.1 Krytyczny problem UX: Gap analysis bez kontekstu "dlaczego"

Użytkownik widzi:
```
Dostęp AI do URL
Krytyczny
Rywale spełniają: 5/5
Co zrobić: Upewnij się, że strona jest dostępna...
```

Ale nie widzi: **czy jego strona faktycznie ma problem z dostępem**. Po naprawie checkId, jeśli strona ma `audited_url_access = pass`, ten gap w ogóle nie powinien się pojawić. Problem był w kodzie, nie w UX — ale UX powinien być zabezpieczony przed podobnymi sytuacjami przez wyświetlanie aktualnego stanu strony docelowej obok rekomendacji.

**Rekomendacja:** Dodaj do każdego `GapCard` wiersz "Stan Twojej strony: ✅ Spełnione / ❌ Niespełnione" oparty na `gap.targetValue`. Teraz `targetValue` jest dostępne w `GapItem`, ale nie jest wyświetlane w `GapAnalysisPanel.tsx`.

### 2.2 Problem: Brak narracji łączącej Citation Intelligence z Gap Analysis

Użytkownik przechodzi przez:
1. AICitationPanel (czy jestem cytowany?)
2. AiExposurePanel (jak duża jest moja ekspozycja?)
3. PhraseCitationComparisonTable (per-phrase matrix)
4. AuditCompetitorBenchmarkPanel (gap analysis)

Każdy z tych komponentów jest wyspą. Brak zdania łączącego: "Twoja strona nie jest cytowana przez Perplexity. Analiza 5 cytowanych konkurentów pokazuje, że 4/5 ma FAQ schema, której Tobie brakuje. To jest najprawdopodobniejsza przyczyna."

**Rekomendacja:** Dodaj `CitationNarrativeCard` — komponent generowany przez LLM (structured output) na podstawie: (a) wyników citation job, (b) top 3 gaps z gap analysis. Jeden akapit, konkretna diagnoza, jedno działanie. To jest "aha moment" który zamienia dane w decyzję.

### 2.3 Problem: `CompetitorAnalysisTeaser` blokuje gap analysis dla Free tier za wcześnie

Free tier widzi teaser "Odblokuj analizę konkurencji" zanim w ogóle zobaczy jakiekolwiek wyniki. Dla PLG (Product-Led Growth) to jest antywzorzec — użytkownik powinien zobaczyć wartość przed paywallem. Rekomendacja: pokaż top 3 krytyczne gaps dla Free (tak jak robi to `GapAnalysisPanel` z `isLocked`), a dopiero potem teaser "Odblokuj pozostałe X gaps".

### 2.4 Problem: `PhraseCitationComparisonTable` nie wyjaśnia co znaczą kolory

Tabela pokazuje zielone/czerwone/szare kropki per silnik per fraza, ale nie ma legendy inline. Użytkownik bez kontekstu nie wie, że zielony = cytowany, szary = brak AI Overview dla tej frazy, czerwony = nie cytowany. Legenda jest ukryta lub nieobecna.

### 2.5 Problem: Brak "zero state" dla użytkownika z 0 cytowań

Gdy Citation Intelligence kończy się z wynikiem "0/4 silników AI Cię cytuje", użytkownik widzi puste listy i liczby. Brakuje empatycznego komunikatu: "To normalne — większość stron zaczyna od zera. Oto 3 konkretne zmiany, które zwiększają szansę na cytowanie w ciągu 30 dni."

---

## 3. Mike King — Jakość algorytmu i trafność rekomendacji

### 3.1 Problem: Fan-out query generation nie uwzględnia intent diversity

`generateEngineQueries()` generuje 5 queries per engine per round, ale wszystkie queries dla danego silnika mają ten sam profil intencji (np. Google = "informational/comparison"). Brakuje diversyfikacji intencji w obrębie jednego silnika — dla tej samej strony powinny być generowane zarówno pytania informacyjne ("jak wybrać..."), jak i transakcyjne ("najlepszy... ranking") i definicyjne ("co to jest...").

**Rekomendacja:** Zmodyfikuj `ENGINE_QUERY_PROFILES` żeby każdy silnik miał 3 intent slots (informational, comparison, how-to) i generował minimum 1 query per slot. To zwiększy recall — strona może być cytowana dla "jak wybrać kurtkę zimową" ale nie dla "kurtka zimowa ranking".

### 3.2 Problem: Competitor audit nie używa LLM — ale gap analysis traktuje go jak pełnowartościowy audit

`engine.ts` celowo nie używa LLM (komentarz: "No LLM calls — fast, cheap, repeatable"). To jest właściwa decyzja dla szybkości. Ale konsekwencja jest taka, że `cs_answer_patterns`, `cs_semantic_triples`, `cs_information_gain` — wszystkie checki które wymagają LLM — są zawsze `null` dla konkurentów. W gap analysis te checki nigdy nie generują gaps, bo `competitorValues.length === 0` → `continue`. To jest **systematyczne niedoszacowanie luk contentowych**.

**Rekomendacja:** Dodaj do `engine.ts` opcjonalny tryb "deep competitor audit" (uruchamiany asynchronicznie, po zakończeniu głównego auditu) który wykonuje LLM-based checki dla top-1 konkurenta. Wynik: gap analysis może pokazać "Twój główny konkurent ma answer_patterns score 85, Ty masz 20 — to wyjaśnia dlaczego jest cytowany zamiast Ciebie."

### 3.3 Problem: `opportunityFinder.ts` generuje `SemanticInsight` ale nie jest on wyświetlany w Tab 2

`computeSemanticInsight()` wywołuje LLM żeby wyjaśnić "dlaczego konkurent wygrał" (`whyCompetitorWon`, `winningFragment`, `contentBrief`). Te dane są przechowywane w `CitationOpportunity.semanticInsight`. Ale w `GapAnalysisPanel.tsx` i `AICitationPanel.tsx` te pola nie są renderowane. Użytkownik nie widzi "Twój konkurent wygrał bo ma 300-słowną sekcję FAQ z pytaniami 'jak' — Ty masz tylko listę produktów."

**Rekomendacja:** W `GapCard` dodaj opcjonalną sekcję "Dlaczego konkurent wygrywa" renderującą `semanticInsight.whyCompetitorWon` i `semanticInsight.winningFragment` gdy są dostępne.

### 3.4 Problem: `selectorHealth.ts` — health check dla selektorów CSS nie jest widoczny dla użytkownika

`runAndCacheHealthCheck()` sprawdza czy selektory CSS dla Google AI Overviews nadal działają. Jeśli Google zmieni DOM, cały moduł Google Citations przestaje działać bez żadnego alertu dla użytkownika. Brakuje widocznego wskaźnika "ostatni health check: 2h temu, status: OK" w UI.

### 3.5 Ocena ogólna algorytmu: B+

Architektura fan-out z 5 rundami i 4 silnikami jest solidna. Morphological variants (`morphologicalVariants.ts`) to rzadko spotykana funkcja w narzędziach GEO — duży plus. Główna słabość to brak LLM-based competitor content analysis i brak narracji łączącej dane w actionable insights.

---

## Podsumowanie: Priorytety zmian

| Priorytet | Problem | Wpływ | Złożoność |
|---|---|---|---|
| **P0** | ~~12 błędnych checkId w CHECK_DEFS~~ | Krytyczny (fałszywe alerty) | Niska — **NAPRAWIONE** |
| **P1** | Brak `targetValue` w GapCard UI | Wysoki (brak kontekstu) | Niska |
| **P1** | CitationNarrativeCard (LLM diagnosis) | Wysoki (PLG conversion) | Średnia |
| **P2** | `semanticInsight` nie renderowany | Średni (missed value) | Niska |
| **P2** | Intent diversity w query generation | Średni (recall) | Średnia |
| **P2** | Zero-state dla 0 cytowań | Średni (UX) | Niska |
| **P3** | Deep competitor audit (LLM) | Średni (precision) | Wysoka |
| **P3** | `selectorHealth` status w UI | Niski (ops) | Niska |
| **P3** | KG score w competitor_audits | Niski (completeness) | Średnia |

---

*Raport wygenerowany na podstawie analizy kodu źródłowego: `server/competitor/gapAnalysis.ts`, `server/competitor/engine.ts`, `server/citation/worker.ts`, `server/citation/opportunityFinder.ts`, `client/src/components/AICitationPanel.tsx`, `client/src/components/GapAnalysisPanel.tsx`, `client/src/pages/Results.tsx` (Tab 2).*
