# INTENT-MATRIX v4 — Audyt Implementacji

**Data:** 2026-04-07 · **Cel:** Weryfikacja, które postanowienia dokumentu architektonicznego zostały wdrożone w kodzie, a które wymagają jeszcze pracy.

---

## Legenda

| Symbol | Znaczenie |
|--------|-----------|
| ✅ | W pełni zaimplementowane |
| ⚠️ | Częściowo zaimplementowane — działa, ale z luką |
| ❌ | Nie zaimplementowane |

---

## Sekcja 2 — Podstawy badawcze (Research Basis)

Sekcja opisowa — nie wymaga implementacji w kodzie. Wiedza jest wbudowana w system prompt `buildSystemPrompt()` w `phraseGenerator.ts`.

| Punkt | Status | Dowód w kodzie |
|-------|--------|----------------|
| Mechanizm Perplexity RAG opisany w komentarzu modułu | ✅ | `phraseGenerator.ts` linie 1–45 (JSDoc) |
| Mechanizm Google AI Overviews w system prompt | ✅ | `buildSystemPrompt()` linia 220–225 |
| Mechanizm ChatGPT Search w system prompt | ✅ | `buildSystemPrompt()` linia 226 |
| Mechanizm Gemini w system prompt | ✅ | `buildSystemPrompt()` linia 227 |
| Wnioski z badania Profound 10M w komentarzu | ✅ | `phraseGenerator.ts` linia 21–24 |

---

## Sekcja 3 — Model INTENT-MATRIX

### 3.1 Zasada podstawowa: jedno pytanie = jedno zapytanie (bez wariantów per silnik)

| Punkt | Status | Dowód w kodzie |
|-------|--------|----------------|
| Jeden zestaw zapytań dla wszystkich silników | ✅ | `worker.ts` linia 1282–1290: seed phrases użyte dla wszystkich 4 silników w round 1 |
| Brak generowania wariantów per silnik | ✅ | `generatePhrasesForPage()` zwraca jeden `GeneratedPhrase[]` bez podziału na silniki |

### 3.2 Warstwy architektury (Layer 1 / 2 / 3)

| Warstwa | Status | Dowód w kodzie |
|---------|--------|----------------|
| **Layer 1 — ANCHOR queries** (URL slug → zapytanie) | ✅ | `extractSlugQuery()` + `contextParts.push(\`URL slug...\`)` linia 278 |
| **Layer 2 — QUESTION queries** (top_questions z CI) | ✅ | `ci.topQuestions` przekazane do LLM jako `## Validated user questions` linia 293 |
| **Layer 3 — INTENT-MATRIX** (LLM generuje per typ intencji) | ✅ | `buildSystemPrompt()` z pełną macierzą intencji |
| Fallback gdy brak CI: URL slug jako jedyna fraza | ✅ | Linia 470–485 w `phraseGenerator.ts` |
| Fallback gdy LLM zawiedzie: top_questions bezpośrednio | ✅ | Linia 455–468 w `phraseGenerator.ts` |

### 3.3 Typy intencji (7 typów)

| Typ intencji | Status w DB | Status w UI | Status w generatorze |
|--------------|-------------|-------------|----------------------|
| `informational` | ✅ | ✅ niebieski | ✅ |
| `commercial` | ✅ | ✅ bursztynowy | ✅ |
| `transactional` | ✅ | ✅ zielony | ✅ |
| `navigational` | ✅ | ✅ fioletowy | ✅ |
| `comparative` | ✅ (migracja 0027) | ✅ pomarańczowy | ✅ |
| `how_to` | ✅ (migracja 0027) | ✅ cyjan | ✅ |
| `problem_solving` | ✅ (migracja 0027) | ✅ czerwony | ✅ |

### 3.4 Filtry jakości

| Filtr | Status | Dowód w kodzie |
|-------|--------|----------------|
| Pełne pytanie (nie fraza kluczowa) | ✅ | System prompt: "Are FULL QUESTIONS (not keyword phrases)" |
| Wystarczająco specyficzne (3–5 źródeł) | ✅ | System prompt: "SPECIFIC enough that this page could be one of 3-5 cited sources" |
| Bez domeny/URL | ✅ | System prompt: "Do NOT contain the domain name or URL" |
| Natywny język strony | ✅ | `buildLanguageInstruction(language)` + `langInstruction` w system prompt |
| Uzasadnienie cytowania (rationale) | ✅ | Pole `rationale` w schemacie JSON + `aiRationale` w DB |

### 3.5 Output Schema

| Pole | Status w generatorze | Status w DB |
|------|----------------------|-------------|
| `phrase` | ✅ | ✅ `varchar(512)` |
| `rationale` | ✅ | ✅ `aiRationale TEXT` |
| `intentType` | ✅ | ✅ enum (7 wartości) |
| `engineAffinity` | ✅ generowane | ❌ **NIE zapisane w DB** — brak kolumny `engineAffinity` w schemacie |
| `citationProbability` | ✅ generowane | ❌ **NIE zapisane w DB** — brak kolumny `citationProbability` w schemacie |
| `sortOrder` | ✅ | ✅ `int sortOrder` |

> **Uwaga:** `engineAffinity` i `citationProbability` są generowane przez LLM i używane do sortowania, ale **nie są persystowane w bazie danych**. Oznacza to, że po zapisaniu fraz do DB informacja o tym, które silniki preferują dane zapytanie i jakie jest prawdopodobieństwo cytowania, jest tracona. PhraseManager nie może wyświetlić tych danych użytkownikowi.

---

## Sekcja 4 — Kluczowe decyzje projektowe

| Decyzja | Status | Uwagi |
|---------|--------|-------|
| **Decyzja 1:** Wspólne zapytania dla wszystkich silników | ✅ | Zaimplementowane — `prompts` przekazane do `createCitationJob` są używane dla wszystkich 4 silników w round 1 |
| **Decyzja 2:** Jakość ponad ilość (max 12 zapytań) | ✅ | `maxPhrases = 12` jako domyślna wartość w `generatePhrasesForPage()` |
| **Decyzja 3:** CI-first enrichment | ✅ | `extractCISignals()` wywołane przed LLM; `hasCIData` przełącza tryb `ci_enriched` vs `llm_only` |
| **Decyzja 4:** Natywny język zapytań | ✅ | `buildLanguageInstruction(language)` wstrzykuje instrukcję językową do system prompt |

---

## Sekcja 5 — Punkty integracji

### 5.1 Przepływ inicjalizacji fraz

| Krok | Status | Dowód w kodzie |
|------|--------|----------------|
| `initializePhrases()` wywołane przy dodaniu strony | ✅ | `routers.ts` linia 335–348: fire-and-forget po `addMonitoredPage()` |
| `extractCISignals()` pobiera dane z ostatniego audytu | ✅ | `phraseGenerator.ts` linia 105–120 |
| Tryb `ci_enriched` gdy CI dostępne | ✅ | `hasCIData` flaga + `source: "ci_enriched"` |
| Tryb `llm_only` gdy brak CI | ✅ | Fallback w `generatePhrasesForPage()` |
| Frazy zapisane do `monitored_page_phrases` | ✅ | `insertPhrases(toInsert)` w `phrases.ts` linia 222 |
| PhraseManager wyświetla frazy z rationale | ✅ | `PhraseManager.tsx` — pole `aiRationale` wyświetlane po rozwinięciu |

### 5.2 Integracja z Citation Worker

| Krok | Status | Uwagi |
|------|--------|-------|
| `citation.startCheck` (jednorazowy audyt) używa fraz z DB | ✅ | `routers.ts` linia 1022–1031: `getActivePhrasesForPage()` → `seedPhrases` → `prompts` |
| `monitoring.startCitationCheck` (ręczne uruchomienie) używa fraz z DB | ✅ | `routers.ts` linia 919–929: `getActivePhrasesForPage()` → `seedPhrases` |
| **Automatyczny monitoring (cron)** używa fraz z DB | ⚠️ | `worker.ts` linia 140: `prompts: []` — **cron NIE przekazuje fraz z DB!** Worker korzysta z cache zapytań z poprzedniego runu zamiast z `monitored_page_phrases` |
| Frazy seed używane dla wszystkich silników w round 1 | ✅ | `citation/worker.ts` linia 1282–1290 |

> **Krytyczna luka:** Automatyczny monitoring (cron) tworzy job z `prompts: []`. Oznacza to, że cron nie korzysta z INTENT-MATRIX fraz wygenerowanych przez nowy generator — zamiast tego używa starych zapytań z cache lub generuje nowe przez LLM. Frazy z `monitored_page_phrases` są używane tylko gdy użytkownik ręcznie kliknie "Sprawdź teraz" lub gdy uruchamia jednorazowy audyt.

### 5.3 Schemat DB

| Pole | Status |
|------|--------|
| Wszystkie pola z sekcji 5.3 dokumentu | ✅ — z wyjątkiem `engineAffinity` i `citationProbability` (patrz sekcja 3.5) |

---

## Sekcja 6 — Przyszłe ulepszenia (Future Improvements)

Sekcja opisuje planowane funkcje — żadna z nich nie jest jeszcze zaimplementowana. Są to sugerowane kolejne kroki.

| Ulepszenie | Status |
|------------|--------|
| 6.1 Semantic deduplication (cosine similarity przed zapisem) | ❌ Nie zaimplementowane |
| 6.2 Citation feedback loop (flagi fraz z 0 cytowań po 3+ runach) | ❌ Nie zaimplementowane |
| 6.3 Competitive gap analysis (kto cytowany zamiast nas) | ❌ Nie zaimplementowane |
| 6.4 Query freshness (kwartalne odświeżanie fraz) | ❌ Nie zaimplementowane |

---

## Podsumowanie: Co wymaga naprawy

### Priorytet WYSOKI

1. **Cron nie używa fraz INTENT-MATRIX** (`worker.ts` linia 140: `prompts: []`)
   - Naprawa: przed `createCitationJob()` pobrać `getActivePhrasesForPage(pageId)` i przekazać jako `prompts`
   - Bez tej naprawy automatyczny monitoring nie korzysta z nowego generatora

2. **`engineAffinity` i `citationProbability` nie są zapisywane w DB**
   - Naprawa: dodać kolumny do schematu `monitored_page_phrases`, zapisać przy `insertPhrases()`
   - Bez tego PhraseManager nie może pokazać "najlepiej dla ChatGPT" ani "wysokie prawdopodobieństwo"

### Priorytet ŚREDNI

3. **`engineAffinity` nie jest wyświetlane w PhraseManager UI**
   - Zależy od naprawy #2
   - Wartość dla użytkownika: "ta fraza najlepiej działa w Perplexity i Google AI"

### Priorytet NISKI (Future Improvements)

4. Semantic deduplication przed zapisem fraz
5. Citation feedback loop (auto-flagi słabych fraz)
6. Competitive gap analysis
7. Query freshness (kwartalne odświeżanie)

---

## Ogólna ocena

**~85% dokumentu jest zaimplementowane.** Rdzeń algorytmu (generowanie zapytań, 3-warstwowa architektura, 7 typów intencji, filtry jakości, integracja z citation worker dla ręcznych uruchomień) działa poprawnie. Dwie krytyczne luki to: brak przekazania fraz przez cron do citation worker oraz brak persystencji `engineAffinity`/`citationProbability` w DB.
