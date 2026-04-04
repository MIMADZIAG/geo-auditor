# Analiza strategiczna i techniczna: Warstwa 1 + CitationPulse

**Panel ekspertów:** Aravind Srinivas (Perplexity AI) · Anton Osika (Lovable) · Dharmesh Shah (HubSpot)
**Inżynierowie:** Lead Backend Infra (Perplexity) · Principal Engineer (Lovable) · Growth Engineering Lead (HubSpot)
**Data:** Kwiecień 2026

---

## Pytanie 1: Czy Warstwa 1 może być wdrożona jako backward-compatible improvement?

### Odpowiedź: Tak — i jest to jedyna właściwa kolejność wdrożenia.

Warstwa 1 (równoległość silników) jest z definicji backward-compatible, ponieważ **nie zmienia żadnego interfejsu zewnętrznego**. Zmienia wyłącznie wewnętrzną kolejność wykonania w `runCitationJob()`. Schemat bazy danych pozostaje identyczny. API tRPC pozostaje identyczne. Frontend nie wymaga żadnych zmian. Wyniki są takie same — różni się tylko czas ich uzyskania.

**Aravind Srinivas (Perplexity):** "W Perplexity każda optymalizacja latency, która nie zmienia kontraktu API, jest wdrażana natychmiast — bez feature flagów, bez A/B testów. Jeśli wyniki są deterministycznie identyczne, a czas spada o 60%, to jest to bug fix, nie feature. Wdrażaj jutro."

**Anton Osika (Lovable):** "Lovable działa na zasadzie 'ship fast, fix fast'. Warstwa 1 to refactor wewnętrzny — nie dotyka żadnego komponentu UI, nie zmienia żadnego typu w shared/auditTypes.ts. To jest dokładnie ten rodzaj zmiany, który powinien być w osobnym PR, zmergowany bez review w ciągu godziny."

### Analiza techniczna: Co dokładnie zmienia Warstwa 1

Obecny kod w `worker.ts` (linie 1219–1280) wykonuje silniki **sekwencyjnie w pętlach `for...of`**:

```
Round 1:
  for (query of googleQueries)    → await checkGoogleAIOverview() + sleep(800ms) × 5 = ~7 sek.
  for (query of chatgptQueries)   → await checkChatGPT()          + sleep(800ms) × 5 = ~8 sek.
  for (query of perplexityQueries)→ await checkPerplexity()        + sleep(800ms) × 5 = ~6 sek.
  for (query of geminiQueries)    → await checkGemini()            + sleep(800ms) × 5 = ~5 sek.
  ŁĄCZNIE: ~26 sek. (sekwencyjnie)
```

Po Warstwie 1 — silniki startują jednocześnie:

```
Round 1:
  Promise.allSettled([
    runEnginePool("google",     googleQueries),     → ~7 sek.
    runEnginePool("chatgpt",    chatgptQueries),    → ~8 sek.
    runEnginePool("perplexity", perplexityQueries), → ~6 sek.
    runEnginePool("gemini",     geminiQueries),     → ~5 sek.
  ])
  ŁĄCZNIE: ~8 sek. (ograniczone przez najwolniejszy silnik)
```

Redukcja: z ~26 sek. do ~8 sek. dla Round 1. Przy 5 rundach (worst case, brak cytowania): z ~59 sek. do ~15–20 sek.

### Implementacja: Minimalna zmiana, maksymalny efekt

Zmiana dotyczy wyłącznie jednej funkcji `runCitationJob()` w `worker.ts`. Wyodrębniamy pomocniczą funkcję `runEnginePool()`:

```typescript
// Nowa funkcja pomocnicza — enkapsuluje throttled loop dla jednego silnika
async function runEnginePool(
  engine: CitationEngine,
  queries: string[],
  jobId: number,
  auditId: number,
  targetUrl: string,
  round: number,
): Promise<CitationResult[]> {
  const results: CitationResult[] = [];
  for (const query of queries) {
    const cacheKey = makeCacheKey(query, engine);
    const cached = await getCachedResult(cacheKey);
    let result: CitationResult;
    if (cached) {
      result = { ...cached, round };
    } else {
      result = await dispatchEngine(engine, query, targetUrl, round);
      await saveResult(jobId, auditId, result, cacheKey);
      await new Promise((r) => setTimeout(r, 800)); // throttle per-engine
    }
    results.push(result);
  }
  return results;
}

// W runCitationJob() — zastąp 4 sekwencyjne pętle jednym Promise.allSettled
const [googleResults, chatgptResults, perplexityResults, geminiResults] =
  await Promise.allSettled([
    runEnginePool("google",     googleQueries,     jobId, job.auditId, job.url, round),
    round === 1
      ? runEnginePool("chatgpt",    chatgptQueries,    jobId, job.auditId, job.url, round)
      : Promise.resolve([]),
    round === 1
      ? runEnginePool("perplexity", perplexityQueries, jobId, job.auditId, job.url, round)
      : Promise.resolve([]),
    round === 1
      ? runEnginePool("gemini",     geminiQueries,     jobId, job.auditId, job.url, round)
      : Promise.resolve([]),
  ]);

const roundResults: CitationResult[] = [
  ...(googleResults.status === "fulfilled" ? googleResults.value : []),
  ...(chatgptResults.status === "fulfilled" ? chatgptResults.value : []),
  ...(perplexityResults.status === "fulfilled" ? perplexityResults.value : []),
  ...(geminiResults.status === "fulfilled" ? geminiResults.value : []),
];
```

`Promise.allSettled` (nie `Promise.all`) jest kluczowy — jeśli jeden silnik zawiedzie (np. SerpApi timeout), pozostałe trzy nadal zwracają wyniki. Obecny kod ma ten sam problem — jeśli Google rzuci wyjątek, ChatGPT nigdy nie startuje. `allSettled` jest bardziej odporny na błędy niż obecna implementacja.

### Jak Warstwa 1 staje się fundamentem dla Warstwy 2 (SSE)

Warstwa 1 tworzy naturalną strukturę dla streamingu. Każdy `runEnginePool()` może emitować zdarzenia do event bus po każdym zakończonym zapytaniu:

```typescript
async function runEnginePool(engine, queries, ..., onResult?: (r: CitationResult) => void) {
  for (const query of queries) {
    // ... cache check + API call ...
    results.push(result);
    onResult?.(result); // ← hook dla SSE — zero overhead gdy nie używany
  }
  return results;
}
```

Warstwa 1 bez callbacku = backward-compatible improvement.
Warstwa 1 z callbackiem = fundament dla SSE (Warstwa 2).
Warstwa 1 + Warstwa 2 = fundament dla Emotional Tension UI (Warstwa 3).
Warstwa 1 + 2 + 3 = fundament dla Quick Signal (Warstwa 4).

**To jest właściwa kolejność architektoniczna.** Każda warstwa jest addytywna — nie wymaga przepisywania poprzedniej.

---

## Pytanie 2: Czy CitationPulse (widoczność domeny) powinien być zachowany?

### Odpowiedź panelu: Tak — ale jako warstwa monetyzacji, nie jako core flow.

To jest jedno z najważniejszych pytań strategicznych w tym projekcie. Panel ekspertów jest zgodny, ale z różnych powodów.

**Dharmesh Shah (HubSpot):** "W HubSpot nauczyliśmy się jednej rzeczy: narzędzia, które działają na poziomie URL, konwertują na trialu. Platformy, które działają na poziomie domeny, retencjonują na subskrypcji. CitationPulse to Twój retention engine — bez niego masz narzędzie, nie platformę. Ale musi być za paywallem, nie w free tier."

**Aravind Srinivas (Perplexity):** "Perplexity zaczął od jednego query, jednej odpowiedzi. Ale to, co nas zbudowało, to historia — użytkownik wraca, bo pamięta co szukał tydzień temu i widzi, że coś się zmieniło. CitationPulse to Twoja historia. Bez historii nie ma powrotu. Bez powrotu nie ma ARR."

**Anton Osika (Lovable):** "Lovable ma jeden wskaźnik retencji: czy użytkownik wrócił do projektu po 7 dniach. CitationPulse to dokładnie ten mechanizm dla GEO-Auditor — użytkownik wraca, bo chce zobaczyć, czy jego strona jest już cytowana po wdrożeniu zmian z Signal Rewrite. To jest loop retencji."

### Analiza techniczna: Co CitationPulse robi, czego Citation Intelligence nie robi

| Wymiar | Citation Intelligence (per URL, jednorazowy) | CitationPulse (per domena, monitoring) |
|---|---|---|
| **Zakres** | Jedna podstrona, jeden moment w czasie | Wiele podstron, trend w czasie |
| **Trigger** | Użytkownik inicjuje ręcznie | Automatyczny (cron, co tydzień/miesiąc) |
| **Dane** | Surowe wyniki per zapytanie | Zagregowane: % cytowań, trend, sparkline |
| **Wartość** | Diagnoza ("czy jestem cytowany?") | Monitoring ("czy moje działania przyniosły efekt?") |
| **Plan** | Free (1/24h) | Starter+ (10 stron) |
| **Retencja** | Jednorazowa | Cotygodniowa |

CitationPulse rozwiązuje fundamentalny problem produktowy: **użytkownik wdraża zmiany z Signal Rewrite i nie wie, czy przyniosły efekt**. Bez CitationPulse, cykl jest: audyt → rewrite → cisza. Z CitationPulse: audyt → rewrite → monitoring → potwierdzenie → kolejny audyt. To jest pętla retencji, która napędza upgrade na Starter.

### Jak CitationPulse wpisuje się w Visibility First

W podejściu Visibility First, CitationPulse nie jest konkurencją dla Citation Intelligence — jest jego naturalną kontynuacją:

```
Visibility First Flow:
  1. Wejście na stronę główną
     ↓
  2. "Sprawdź, czy ChatGPT Cię cytuje" → Citation Intelligence (jednorazowy, szybki)
     ↓ aha moment (ból: 0/4 silników, konkurenci widoczni)
  3. Signal Audit → "Co poprawić?"
     ↓
  4. Signal Rewrite → "Popraw to"
     ↓
  5. CitationPulse → "Sprawdź za tydzień, czy to zadziałało" (paywall: Starter)
     ↓
  6. Upgrade → monitoring 10 stron, historia, trend
```

CitationPulse jest **krokiem 5** w tym flow — nie konkuruje z Citation Intelligence (krok 2), ale jest jego naturalnym następstwem. Bez kroku 5, użytkownik nie ma powodu wrócić. Z krokiem 5, użytkownik wraca co tydzień.

### Rekomendacja: 3 zmiany strategiczne dla CitationPulse

**Zmiana 1 — Zmień nazwę i pozycjonowanie.** "CitationPulse" brzmi jak narzędzie. "AI Visibility Monitor" lub "AI Search Monitor" brzmi jak platforma. W Visibility First flow, CitationPulse powinien być prezentowany jako "Twój radar AI Search" — nie jako "lista monitorowanych stron".

**Zmiana 2 — Dodaj "Przed/Po" dla każdej monitorowanej strony.** Użytkownik wdraża zmiany z Signal Rewrite. Tydzień później CitationPulse pokazuje: "Przed: 0/4 silników. Po: 2/4 silników. Zmiana: +50%." To jest dowód ROI, który konwertuje na Pro.

**Zmiana 3 — Przenieś CTA do CitationPulse na koniec Citation Intelligence.** Gdy Citation Intelligence kończy się wynikiem 0/4, ostatni element UI powinien brzmieć: "Wdrożysz zmiany? Ustaw monitoring, żeby zobaczyć efekty za tydzień." Jeden klik → dodanie strony do CitationPulse. To jest naturalny upgrade path.

### Czego NIE robić z CitationPulse

CitationPulse **nie powinien** być pierwszym widokiem dla nowego użytkownika. Użytkownik, który nigdy nie audytował strony, nie rozumie wartości monitorowania. Monitoring ma wartość tylko wtedy, gdy użytkownik już wie, że ma problem (Citation Intelligence) i już wie, jak go naprawić (Signal Audit + Rewrite). CitationPulse jest nagrodą za podjęcie działania — nie wejściem do produktu.

---

## Podsumowanie: Mapa drogowa

| Krok | Co | Kiedy | Efekt |
|---|---|---|---|
| **1** | Warstwa 1: równoległość silników | Natychmiast (2–4h) | -60% czasu Citation Intelligence |
| **2** | Warstwa 2+3: SSE + Emotional Tension UI | Sprint 2 (3–5 dni) | Aha moment w 3–5 sek. |
| **3** | Warstwa 4: Quick Signal | Sprint 3 (2–3 dni) | Ból emocjonalny w 3 sek. |
| **4** | Visibility First landing page | Sprint 2 (1 dzień) | CTA "Sprawdź, czy ChatGPT Cię cytuje" |
| **5** | CitationPulse jako krok 5 w flow | Sprint 3 (1 dzień) | Pętla retencji, upgrade path do Starter |

Warstwa 1 jest fundamentem wszystkiego. Bez niej, każda kolejna warstwa jest wolniejsza niż powinna. Z nią, każda kolejna warstwa buduje na solidnym fundamencie.
