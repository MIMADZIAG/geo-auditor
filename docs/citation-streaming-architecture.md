# Streaming Citation Intelligence — Architektura "Emotional Tension Engine"

**Autorzy symulowanej analizy inżynierskiej:**
Aravind Srinivas (Perplexity AI) + Lead Infra Team, Anton Osika (Lovable) + Frontend Team, Dharmesh Shah (HubSpot) + Growth Engineering

**Data:** Kwiecień 2026
**Kontekst:** GEO-Auditor — Visibility First flow, problem czasu oczekiwania na Citation Intelligence

---

## 1. Diagnoza techniczna — dlaczego teraz jest wolno

Przed zaproponowaniem rozwiązania, musimy zrozumieć dokładnie, co zajmuje czas. Na podstawie kodu `worker.ts`:

| Faza | Czas | Blokuje UI? |
|---|---|---|
| Ekstrakcja treści strony (HTTP GET + cheerio) | 1–3 sek. | Tak |
| Generowanie zapytań LLM (4 silniki × 5 zapytań) | 3–8 sek. | Tak |
| Google AI Overview (SerpApi) × 5 zapytań | 5–15 sek. (800ms throttle między każdym) | Tak |
| ChatGPT Search × 5 zapytań | 5–15 sek. (800ms throttle) | Tak |
| Perplexity Sonar × 5 zapytań | 5–10 sek. (800ms throttle) | Tak |
| Gemini × 5 zapytań | 3–8 sek. (800ms throttle) | Tak |
| **Łącznie (worst case, brak cache)** | **22–59 sek.** | **Tak — cały czas** |

**Kluczowa obserwacja:** Wszystkie 4 silniki są uruchamiane **sekwencyjnie** w pętlach `for...of`. Każde zapytanie czeka na poprzednie. Throttle 800ms między zapytaniami (anti-rate-limit) mnoży czas przez liczbę zapytań. Użytkownik widzi spinner przez cały czas — zero informacji zwrotnej.

**Drugi problem:** Frontend odpytuje `citation.getResults` co 3 sekundy (polling). Nawet gdyby backend miał wyniki po 5 sekundach, frontend zobaczy je dopiero przy następnym poll — dodatkowe 0–3 sekundy latency.

---

## 2. Rozwiązanie: "Emotional Tension Engine" — 4-warstwowa architektura

Rozwiązanie składa się z czterech niezależnych, implementowalnych warstw. Każda warstwa działa samodzielnie — można wdrożyć je kolejno, bez przepisywania całości.

### Warstwa 1 — Równoległe wykonanie silników (Backend, 2–4h)

**Problem:** Silniki są uruchamiane sekwencyjnie. Google czeka na ChatGPT, Perplexity czeka na Google.

**Rozwiązanie:** Uruchom wszystkie 4 silniki równolegle za pomocą `Promise.allSettled()`. Każdy silnik dostaje własną pulę zapytań i działa niezależnie.

```typescript
// PRZED (sekwencyjne — ~40 sek.)
for (const query of googleQueries) {
  const result = await checkGoogleAIOverview(query, ...);
  roundResults.push(result);
  await sleep(800);
}
for (const query of chatgptQueries) { ... }

// PO (równoległe — ~10–15 sek.)
const [googleResults, chatgptResults, perplexityResults, geminiResults] = 
  await Promise.allSettled([
    runEngineWithThrottle("google", googleQueries, ...),
    runEngineWithThrottle("chatgpt", chatgptQueries, ...),
    runEngineWithThrottle("perplexity", perplexityQueries, ...),
    runEngineWithThrottle("gemini", geminiQueries, ...),
  ]);
```

Każdy `runEngineWithThrottle` uruchamia zapytania dla jednego silnika z 800ms throttle wewnętrznie, ale wszystkie 4 silniki startują jednocześnie. Czas spada z ~40 sek. do ~10–15 sek. (ograniczony przez najwolniejszy silnik, nie sumę wszystkich).

**Zysk:** 60–70% redukcja czasu. Żadnych zmian w UI. Żadnych zmian w API. Czysta optymalizacja backendu.

---

### Warstwa 2 — Server-Sent Events (SSE) zamiast pollingu (Backend + Frontend, 4–8h)

**Problem:** Frontend odpytuje co 3 sekundy. Wyniki są dostępne, ale użytkownik czeka na następny poll.

**Rozwiązanie:** Nowy endpoint `/api/citation/stream/:jobId` zwraca SSE stream. Worker emituje zdarzenia po każdym zakończonym zapytaniu. Frontend subskrybuje stream i aktualizuje UI natychmiast.

**Architektura SSE:**

```typescript
// server/citation/eventBus.ts
// Prosty in-process event emitter — wystarczy dla single-instance deploymentu
import { EventEmitter } from "events";
export const citationEventBus = new EventEmitter();
citationEventBus.setMaxListeners(500); // max concurrent jobs

// Typy zdarzeń
export type CitationEvent =
  | { type: "engine_start"; engine: CitationEngine; queryCount: number }
  | { type: "query_result"; engine: CitationEngine; query: string; isCited: "yes" | "domain" | "no"; competitorDomains: string[]; allCitedUrls: string[] }
  | { type: "engine_done"; engine: CitationEngine; cited: boolean }
  | { type: "job_done"; foundCitation: boolean; summary: CitationSummary };
```

```typescript
// server/routes/citationStream.ts — Express route (nie tRPC — SSE wymaga raw HTTP)
app.get("/api/citation/stream/:jobId", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const jobId = parseInt(req.params.jobId);
  
  const handler = (event: CitationEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === "job_done") {
      res.end();
      citationEventBus.off(`job:${jobId}`, handler);
    }
  };
  
  citationEventBus.on(`job:${jobId}`, handler);
  req.on("close", () => citationEventBus.off(`job:${jobId}`, handler));
});
```

```typescript
// W worker.ts — emituj zdarzenia po każdym wyniku
citationEventBus.emit(`job:${jobId}`, {
  type: "query_result",
  engine: result.engine,
  query: result.query,
  isCited: result.isCited,
  competitorDomains: result.competitorDomains,
  allCitedUrls: result.allCitedUrls,
});
```

**Frontend — React hook:**

```typescript
// client/src/hooks/useCitationStream.ts
export function useCitationStream(jobId: number | null) {
  const [events, setEvents] = useState<CitationEvent[]>([]);
  const [isDone, setIsDone] = useState(false);
  
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/citation/stream/${jobId}`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as CitationEvent;
      setEvents(prev => [...prev, event]);
      if (event.type === "job_done") {
        setIsDone(true);
        es.close();
      }
    };
    return () => es.close();
  }, [jobId]);
  
  return { events, isDone };
}
```

**Zysk:** Pierwsze wyniki pojawiają się w UI po 3–5 sekundach (pierwsze zapytanie Google). Użytkownik widzi ruch natychmiast.

---

### Warstwa 3 — Progressive Disclosure UI: "Emotional Tension Sequence" (Frontend, 6–10h)

To jest serce rozwiązania. Nie chodzi o szybkość — chodzi o **emocjonalne doświadczenie oczekiwania**. Każde zdarzenie SSE jest pretekstem do pokazania czegoś, co buduje napięcie.

**Sekwencja emocjonalna (timeline dla typowego audytu):**

```
T+0s   → User wpisuje URL i klika "Sprawdź"
T+1s   → [FAZA 1] "Analizuję stronę..." — spinner z nazwą domeny
T+3s   → [FAZA 2] Pierwsze zapytanie Google wysłane
         UI pokazuje: "Sprawdzam, co Google AI wie o [tytuł strony]..."
         Pojawia się 4 puste karty silników: Google | ChatGPT | Perplexity | Gemini
         Każda karta ma status "Sprawdzam..."
T+5s   → [FAZA 3] Pierwsze wyniki Google wracają
         Jeśli isCited=no: karta Google zmienia się na "❌ Nie cytuje"
         Jeśli są competitor URLs: pojawia się lista "Zamiast Ciebie cytuje:"
           → [competitor1.com] [competitor2.com] [competitor3.com]
         To jest PIERWSZY BOL EMOCJONALNY — użytkownik widzi, kto go wyprzedza
T+8s   → [FAZA 4] ChatGPT wyniki
         Karta ChatGPT: "❌ Nie cytuje" lub "✅ Cytuje!"
         Jeśli nie cytuje — pojawia się pytanie, które ChatGPT dostał
           → "Zapytałem: 'najlepsza kurtka zimowa damska'"
           → "ChatGPT odpowiedział bez Twojej strony"
T+12s  → [FAZA 5] Perplexity + Gemini wyniki
         Wszystkie 4 karty wypełnione
T+15s  → [FAZA 6] "job_done" — finalne podsumowanie
         Animacja: karty "składają się" w jeden wynik
         "0/4 silników AI cytuje Twoją stronę"
         "Oto 5 URL-i, które cytują Twoi konkurenci na Twoje frazy"
         CTA: "Sprawdź, dlaczego → Signal Audit" (przejście do Tab 02)
```

**Kluczowe zasady UX:**

Pierwsza zasada: **Pokaż ból przed rozwiązaniem.** Competitor URLs muszą pojawić się PRZED wynikiem "0/4". Użytkownik musi najpierw zobaczyć, kto go wyprzedza — dopiero potem dostaje wynik liczbowy. Kolejność ma znaczenie emocjonalne.

Druga zasada: **Każde zdarzenie to nowa informacja, nie tylko aktualizacja licznika.** Nie "Sprawdzono 3/20 zapytań". Zamiast tego: "ChatGPT zapytany o 'kurtka zimowa damska' — Twojej strony nie ma w odpowiedzi."

Trzecia zasada: **Napięcie przez konkretność.** Nie "Analizuję..." — "Pytam ChatGPT: 'gdzie kupić kurtkę zimową damską?'" Użytkownik widzi dokładnie, jakie pytanie zadajemy. To buduje wiarygodność i napięcie jednocześnie.

**Przykładowy komponent React:**

```tsx
// EngineStatusCard — jeden silnik, aktualizuje się w czasie rzeczywistym
function EngineStatusCard({ engine, events }: { engine: CitationEngine; events: CitationEvent[] }) {
  const engineEvents = events.filter(e => 
    (e.type === "query_result" || e.type === "engine_done") && e.engine === engine
  );
  const latestQuery = engineEvents.findLast(e => e.type === "query_result");
  const isDone = engineEvents.some(e => e.type === "engine_done");
  const isCited = engineEvents.some(e => e.type === "query_result" && 
    (e.isCited === "yes" || e.isCited === "domain"));
  
  const competitors = Array.from(new Set(
    engineEvents
      .filter(e => e.type === "query_result")
      .flatMap(e => (e as any).competitorDomains ?? [])
  )).slice(0, 3);

  return (
    <div className={cn("rounded-xl border p-4 transition-all duration-500", 
      isDone && isCited ? "border-green-500 bg-green-950/20" :
      isDone ? "border-red-800 bg-red-950/10" : "border-border"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{ENGINE_LABELS[engine]}</span>
        {!isDone && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {isDone && isCited && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {isDone && !isCited && <XCircle className="h-4 w-4 text-red-500" />}
      </div>
      
      {/* Live query being checked */}
      {!isDone && latestQuery && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Sprawdzam: „{(latestQuery as any).query?.slice(0, 60)}..."
        </p>
      )}
      
      {/* Competitors revealed progressively */}
      {competitors.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-muted-foreground">Zamiast Ciebie cytuje:</p>
          {competitors.map(domain => (
            <div key={domain} className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-400" />
              <span className="text-xs font-mono text-orange-300">{domain}</span>
            </div>
          ))}
        </div>
      )}
      
      {isDone && !isCited && (
        <p className="text-xs text-red-400 mt-2">
          Żadne z {engineEvents.filter(e => e.type === "query_result").length} zapytań nie przyniosło cytowania
        </p>
      )}
    </div>
  );
}
```

---

### Warstwa 4 — "Instant First Signal" — 3-sekundowy aha moment (Backend, 2–4h)

To jest najbardziej zaawansowana warstwa — i najbardziej wartościowa dla konwersji.

**Obserwacja:** Użytkownik nie potrzebuje pełnych wyników, żeby poczuć ból. Potrzebuje **jednego konkretnego faktu** w ciągu 3 sekund.

**Rozwiązanie:** Przed uruchomieniem pełnego citation job, uruchom "Quick Signal" — jedno zapytanie Google AI Overview dla najbardziej oczywistej frazy (tytuł strony lub H1). To zajmuje 2–4 sekundy i daje natychmiastowy wynik.

```typescript
// server/citation/quickSignal.ts
export async function getQuickSignal(url: string): Promise<{
  isCited: boolean;
  topCompetitor: string | null;
  queryUsed: string;
  hasAIOverview: boolean;
}> {
  // 1. Fetch page title (fast — just HEAD + minimal HTML parse)
  const title = await extractPageTitle(url); // ~500ms
  
  // 2. Run ONE Google AI Overview check for the title
  const result = await checkGoogleAIOverview(title, url, "auto", 0); // ~2–3 sek.
  
  return {
    isCited: result.isCited !== "no",
    topCompetitor: result.competitorDomains[0] ?? null,
    queryUsed: title,
    hasAIOverview: result.hasAIOverview ?? false,
  };
}
```

**Frontend flow z Quick Signal:**

```
T+0s  → User wpisuje URL → klik "Sprawdź"
T+0.5s → Strona ładuje się, pokazuje URL + spinner
T+3s  → Quick Signal wraca:
         "Google AI nie cytuje Twojej strony na frazę 'kurtka zimowa damska'"
         "Zamiast Ciebie pojawia się: zalando.pl"
         → PIERWSZY BOL EMOCJONALNY w 3 sekundy
         Poniżej: "Sprawdzam teraz ChatGPT, Perplexity i Gemini..."
         → Pełny citation job kontynuuje w tle
T+15s → Pełne wyniki — wszystkie 4 silniki
```

**Zysk:** Aha moment w 3 sekundy. Użytkownik, który zobaczy "zalando.pl zamiast Ciebie" po 3 sekundach, nie odejdzie — będzie czekał na pełne wyniki z zainteresowaniem, nie z frustracją.

---

## 3. Porównanie architektur

| Warstwa | Czas do pierwszej informacji | Złożoność wdrożenia | Zysk emocjonalny |
|---|---|---|---|
| **Obecny stan** | 22–59 sek. (spinner) | — | Brak |
| **Warstwa 1 tylko** (równoległość) | 10–15 sek. (spinner) | Niska (2–4h) | Brak — nadal spinner |
| **Warstwa 1+2** (SSE) | 3–5 sek. (pierwsze wyniki) | Średnia (6–12h) | Średni |
| **Warstwa 1+2+3** (Emotional Tension) | 3–5 sek. (z napięciem) | Wysoka (12–20h) | **Wysoki** |
| **Warstwa 1+2+3+4** (Quick Signal) | **2–3 sek. (ból emocjonalny)** | Wysoka (16–24h) | **Maksymalny** |

---

## 4. Rekomendacja wdrożenia — kolejność

**Sprint 1 (1 dzień):** Warstwa 1 — równoległość silników. Czysta optymalizacja backendu, zero ryzyka, 60% redukcja czasu. Wdróż natychmiast.

**Sprint 2 (2–3 dni):** Warstwy 2+3 — SSE + Emotional Tension UI. To jest core doświadczenia Visibility First. Wymaga nowego Express route, event bus i przepisania `AICitationPanel` na streaming.

**Sprint 3 (1–2 dni):** Warstwa 4 — Quick Signal. Wymaga nowego endpointu `citation.quickSignal` i zmian w landing page flow.

---

## 5. Odpowiedź na pytanie o "dawkowanie napięcia"

Pomysł dawkowania wyników partiami jest **technicznie słuszny i emocjonalnie skuteczny** — ale tylko jeśli każda "porcja" jest konkretna i emocjonalna, nie tylko aktualizacją licznika.

Złe dawkowanie: "Sprawdzono 3 z 20 zapytań." — to jest progress bar, nie napięcie.

Dobre dawkowanie: "ChatGPT zapytany o 'kurtka zimowa damska' — odpowiedział bez Twojej strony. Oto co powiedział: [snippet]." — to jest ból.

Kluczowa zasada: **każda porcja musi zawierać nazwę konkurenta lub konkretną frazę**. Abstrakcyjny postęp nie boli. Konkretny rywal, który Cię wyprzedza — boli.

---

## 6. Implikacje dla Visibility First

Przy pełnej implementacji (Warstwy 1–4), flow Visibility First wygląda następująco:

- **T+0–3 sek.:** Quick Signal — jeden konkretny fakt (cytuje / nie cytuje + top competitor)
- **T+3–15 sek.:** Streaming wyników — 4 silniki, każdy z live query i competitor reveal
- **T+15 sek.:** Finalne podsumowanie + CTA do Signal Audit

To jest doświadczenie, które **nie ma odpowiednika na rynku**. Profound i Evertune pokazują dashboardy z danymi historycznymi. GEO-Auditor pokazuje w czasie rzeczywistym, jak AI odpowiada na pytania o Twoją stronę — teraz, w tej chwili, na Twoich oczach.

> "The best products don't make you wait for the answer. They make you feel the question." — zasada stosowana przez Perplexity przy projektowaniu streaming search.

---

## 7. Uwagi implementacyjne

**SSE vs WebSockets:** SSE jest właściwym wyborem dla tego przypadku — jednokierunkowy stream serwer→klient, natywnie wspierany przez przeglądarki, działa przez HTTP/1.1 i HTTP/2, nie wymaga dodatkowych bibliotek. WebSockets byłyby over-engineering.

**Event bus w multi-instance deploymencie:** Obecna architektura (in-process EventEmitter) działa dla single-instance. Przy skalowaniu do wielu instancji (np. Railway multi-dyno) należy zastąpić EventEmitter Redis Pub/Sub. To jest prosta zamiana — interfejs pozostaje taki sam.

**Throttle 800ms:** Przy równoległym wykonaniu, każdy silnik ma własny throttle. Łączna liczba requestów na sekundę wzrasta 4x — należy sprawdzić limity SerpApi i Perplexity API przed wdrożeniem Warstwy 1.

**Cache hit rate:** Przy powtórnym audycie tej samej strony, większość zapytań trafia w cache — Quick Signal i Warstwa 1 nie mają znaczenia. Warto pokazać użytkownikowi "wyniki z cache" z timestampem ostatniej weryfikacji, żeby nie sugerować, że analiza jest "stara".
