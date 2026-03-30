# Citation Opportunity Finder — Analiza Architektoniczna

## 1. Ocena Wykonalności: TAK, i to z istniejących danych

### Co już mamy w systemie (bez żadnych zmian)

| Dane | Gdzie | Jakość |
|------|-------|--------|
| `responseText` w `citation_checks` | DB | Pełna odpowiedź LLM z markdown, inline citations, strukturą |
| `allCitedUrls` w `citation_checks` | DB | Lista URL-i cytowanych przez AI dla każdego zapytania |
| `query` w `citation_checks` | DB | Dokładne zapytanie które wygenerowało odpowiedź |
| `isCited` w `citation_checks` | DB | `no` = AI cytuje rywali ale nie nas — to jest dokładnie trigger |
| `engine` w `citation_checks` | DB | ChatGPT / Google / Perplexity / Gemini |
| `competitor_audits` | DB | 34 checksy strukturalne dla każdego cytowanego URL |
| `audits.findings` | DB | Pełne wyniki audytu strony audytowanej |

**Kluczowy insight:** Dla każdego `citation_check` gdzie `isCited = 'no'` i `allCitedUrls.length > 0` mamy:
- Zapytanie (`query`)
- Pełną odpowiedź AI (`responseText`) — wiemy CO AI powiedziało i DLACZEGO zacytowało rywala
- URL-e cytowanych rywali (`allCitedUrls`) — wiemy KOGO zacytowało
- Dane strukturalne rywali (`competitor_audits`) — wiemy JAK zbudowane są ich strony
- Dane audytu naszej strony (`audits.findings`) — wiemy czego nam brakuje

To jest kompletny zestaw danych do "anatomii odpowiedzi LLM".

---

## 2. Architektura: Citation Opportunity Finder

### Przepływ danych (zero nowych API calls w happy path)

```
citation_checks (isCited='no', allCitedUrls.length > 0)
        ↓
  [QUERY ANATOMY ENGINE]
  Analizuje responseText LLM:
  - Jakie pytanie odpowiedział AI? (intent extraction)
  - Jakie elementy odpowiedzi są "cytowalne"? (answer patterns)
  - Dlaczego cytowany URL "wygrał"? (competitor_audits diff)
        ↓
  [GAP DETECTOR]
  Porównuje z audytem strony:
  - Czy strona audytowana ma odpowiedź na to pytanie?
  - Jakich konkretnych elementów brakuje?
  - Jak duża jest luka (słowa, struktura, schema)?
        ↓
  [RECOMMENDATION GENERATOR]
  Generuje konkretną rekomendację:
  - "Dodaj sekcję X z Y słowami odpowiadającą na pytanie Z"
  - Gotowy szkielet treści (opcjonalnie przez Content Creator)
  - Priorytet: ile zapytań traci przez tę lukę
```

### Trzy poziomy analizy (od tańszego do droższego)

**Poziom 1 — Strukturalny (bez LLM, tylko dane z DB):**
Dla każdego `isCited='no'` sprawdź różnicę w `competitor_audits` vs `audits`:
- Rywal ma `cs_faq_section=1`, my mamy `cs_faq_section=0` → "Dodaj FAQ"
- Rywal ma `cs_answer_patterns=1`, my mamy `0` → "Dodaj bezpośrednią odpowiedź w pierwszym akapicie"
- Rywal ma `cs_tldr_summary=1`, my mamy `0` → "Dodaj podsumowanie TL;DR"
- Rywal ma `sd_howto_schema=1`, my mamy `0` → "Dodaj HowTo schema"

To jest deterministyczne, tanie, natychmiastowe. Daje 60-70% wartości.

**Poziom 2 — Semantyczny (1 LLM call per query, ~$0.001):**
Analizuj `responseText` LLM dla danego zapytania:
```
Prompt: "Przeanalizuj odpowiedź AI na zapytanie '{query}'. 
Zidentyfikuj: (1) główny intent zapytania, (2) typ odpowiedzi (lista/poradnik/porównanie/definicja), 
(3) kluczowe elementy które sprawiły że AI zacytowało {competitor_url}, 
(4) czego brakuje na stronie {target_url} żeby AI ją zacytowało.
Odpowiedź w JSON."
```
Koszt: ~$0.001 per zapytanie, ~$0.01-0.05 per pełny audyt (5-50 zapytań bez cytowania).

**Poziom 3 — Generatywny (Content Creator integration):**
Na podstawie analizy z Poziomu 2, generuj gotowy szkielet treści:
```
"Dla zapytania 'jak wybrać kredyt gotówkowy':
AI cytuje money.pl bo ma sekcję z 5 krokami + tabelę porównawczą + FAQ.
Twoja strona ma tylko ogólny opis produktu.
→ [Generuj szkielet sekcji] → Content Creator"
```

---

## 3. Integracja z istniejącym flow (kluczowe dla UX)

```
Audyt URL → Widoczność AI → [Citation Opportunities] → Content Creator
    ↑              ↑                    ↑                      ↑
  Już jest      Już jest          TO BUDUJEMY              Już jest
```

### Gdzie w UI umieścić

**Opcja A (preferowana): Nowa zakładka w wynikach audytu**
`/results/:id` → zakładka "Szanse Cytowania" (obok "Optymalizacja", "Widoczność AI")
- Pojawia się TYLKO gdy citation job jest `completed` i `isCited='no'` dla ≥1 zapytania
- Pokazuje listę zapytań gdzie AI cytuje rywali + anatomię każdej odpowiedzi

**Opcja B: Inline w Widoczność AI**
Pod każdym zapytaniem z `isCited='no'` → rozwijany panel "Dlaczego AI nie cytuje Twojej strony?"

**Opcja C: Osobna strona `/opportunities/:auditId`**
Deep-link z emaila monitoringowego: "Znaleźliśmy 3 nowe szanse cytowania dla Twojej strony"

---

## 4. Monetyzacja (PLG-native)

| Plan | Dostęp |
|------|--------|
| Free | 1 szansa cytowania (preview, blur na resztę) |
| Starter | Wszystkie szanse, Poziom 1 (strukturalny) |
| Pro | Poziom 1 + 2 (semantyczny), eksport do Content Creator |
| Business | Poziom 1 + 2 + 3 (generatywny), API, monitoring szans |

**Viral loop:** Użytkownik dostaje konkretną rekomendację → poprawia stronę → uruchamia ponowny audyt → widzi poprawę w cytowaniach → płaci za monitoring.

---

## 5. Koszt implementacji

### Backend (server-side)
- `server/citation/opportunityFinder.ts` — silnik analizy (~200 linii)
- `server/routers.ts` — 1 nowy endpoint `citation.getOpportunities(auditId)` (~30 linii)
- Brak nowych tabel DB — wszystkie dane już są

### Frontend
- `client/src/components/CitationOpportunityPanel.tsx` — nowy panel (~250 linii)
- `client/src/pages/Results.tsx` — dodanie nowej zakładki (~20 linii)

### Szacowany czas implementacji: 4-6h

---

## 6. Krytyczna ocena vs. alternatywy

### Dlaczego TO jest właściwa kolejność

Obecny flow GEO-Auditor:
1. **Audyt techniczny** → "Co jest zepsute na Twojej stronie"
2. **AI Citations** → "Czy AI Cię widzi"
3. **Competitor Intel** → "Kogo AI widzi zamiast Ciebie"
4. **Gap Analysis** → "Czego Ci brakuje vs. rywale (strukturalnie)"
5. **Citation Opportunity Finder** → "Dla KONKRETNEGO ZAPYTANIA: co napisać żeby AI Cię zacytowało"

To jest naturalna eskalacja od diagnozy do konkretnej akcji. Każdy krok jest bardziej actionable niż poprzedni.

### Ryzyko

- `responseText` dla Google AI Overviews może być krótki (snippet, nie pełna odpowiedź) — Poziom 2 będzie mniej dokładny dla Google
- ChatGPT i Perplexity mają pełne odpowiedzi — tam analiza będzie najlepsza
- Gemini: zależy od zapytania

### Mitygacja
Poziom 1 (strukturalny) nie zależy od `responseText` — zawsze działa.
Poziom 2 uruchamiaj tylko gdy `responseText.length > 200`.

---

## 7. Rekomendacja: Implementuj w tej kolejności

1. **Poziom 1** (strukturalny diff) — 2h, zero kosztów API, natychmiastowa wartość
2. **UI** (CitationOpportunityPanel) — 2h, zakładka w wynikach
3. **Poziom 2** (semantyczny LLM) — 2h, największa wartość dla Pro users
4. **Integracja z Content Creator** — 1h, viral loop

Łącznie: ~7h implementacji, potencjalnie największy differentiator produktu.
