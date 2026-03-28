import type { AuditFindings, AuditResult, Recommendation } from "./types";

/**
 * GEO-Auditor Scoring Model v4 — Growth Psychology Framework
 *
 * Design principles:
 * 1. CALIBRATION: Typical SMB page (HTTPS + basic meta + no schema) lands 38–52/100.
 *    This creates a "progress illusion" — user sees room to grow, not a ceiling.
 * 2. CONTENT-FIRST: contentIntelligence (LLM analysis) carries the highest weight (28%).
 *    Without it, the ceiling is ~72 — motivating upgrade to paid plans.
 * 3. BRAND AUTHORITY DAMPENED: brandAuthority weight reduced from 20% → 10%.
 *    It was inflating scores for legacy domains with social presence but poor GEO signals.
 * 4. STRUCTURED DATA ELEVATED: Most impactful single improvement for AI citation.
 *    Weight: 20% (was 18%).
 * 5. CONTENT STRUCTURE ELEVATED: Semantic chunking, FAQ, TL;DR are the core GEO tactics.
 *    Weight: 24% (was 22%).
 *
 * Score distribution targets:
 *   0–35   → "Niewidoczny"   — critical issues, needs immediate action
 *   36–54  → "Startujący"    — typical SMB without GEO optimization
 *   55–69  → "Rozwijający się" — some GEO signals, clear next steps
 *   70–82  → "Widoczny"      — solid GEO foundation, optimizing details
 *   83–100 → "Dominujący"    — requires Content Intelligence (paid) to reach
 */
const CATEGORY_WEIGHTS_BASE = {
  technical: 11,
  structuredData: 20,      // ↑ most impactful single improvement
  contentStructure: 24,    // ↑ core GEO tactics (FAQ, TL;DR, chunking)
  eeat: 14,
  aiCrawlers: 8,
  metaTags: 5,
  brandAuthority: 10,      // ↓ dampened — was inflating scores for legacy domains
  // Note: without CI, max achievable score is ~72–75 for a well-optimized page
};

// With Content Intelligence: adds 28% weight — the "unlock" for 83+ scores
// This creates a natural ceiling at ~72 without CI, motivating paid plan upgrade
const CATEGORY_WEIGHTS_WITH_CI = {
  technical: 8,
  structuredData: 14,
  contentStructure: 17,
  eeat: 10,
  aiCrawlers: 6,
  metaTags: 4,
  brandAuthority: 7,
  contentIntelligence: 28, // ← highest weight: unlocks 83+ scores
  // Without CI, ceiling is ~72. With CI, ceiling is 100.
};

/**
 * No calibration — the overall score is the pure weighted average of category scores.
 * This ensures mathematical consistency: a page scoring 92, 90, 100, 75, 72, 71, 49
 * across categories gets an overall score proportional to those values.
 * Retention is driven by Competitive Decay, AI Volatility, and Benchmark Percentile
 * mechanics — not by artificially deflating scores.
 */
function calibrateScore(raw: number): number {
  return Math.round(raw); // identity — no compression
}

export function computeOverallScore(findings: AuditFindings): number {
  const weights = findings.contentIntelligence
    ? CATEGORY_WEIGHTS_WITH_CI
    : CATEGORY_WEIGHTS_BASE;

  let total = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (key === "contentIntelligence") {
      if (findings.contentIntelligence) {
        total += (findings.contentIntelligence.overallScore / 100) * weight;
        totalWeight += weight;
      }
    } else {
      const category = findings[key as keyof typeof CATEGORY_WEIGHTS_BASE];
      if (!category) continue;
      total += ((category as { score: number }).score / 100) * weight;
      totalWeight += weight;
    }
  }

  const rawScore = totalWeight > 0 ? (total / totalWeight) * 100 : 0;
  return calibrateScore(Math.round(rawScore));
}

/**
 * Score labels — "Gap Anxiety" framework:
 * Each label names the current state AND implies distance to the next level.
 * Thresholds are calibrated to the target distribution above.
 */
export function getScoreLabel(
  score: number
): "Dominujący" | "Widoczny" | "Rozwijający się" | "Startujący" | "Niewidoczny" {
  if (score >= 83) return "Dominujący";
  if (score >= 70) return "Widoczny";
  if (score >= 55) return "Rozwijający się";
  if (score >= 36) return "Startujący";
  return "Niewidoczny";
}

/**
 * Score sublabels — "Specific Hope" framework:
 * Each message acknowledges the current state, names the gap, and points to the next step.
 * Avoids both false comfort ("you're great!") and demotivating criticism ("you're terrible").
 */
export function getScoreSublabel(score: number): string {
  if (score >= 83) {
    return "Twoja strona dominuje w AI Search — jesteś w czołówce. Monitoruj pozycję, bo konkurenci mogą Cię gonić.";
  }
  if (score >= 70) {
    return "Dobra widoczność w AI Search. Kilka precyzyjnych poprawek (FAQ, dane strukturalne, TL;DR) może wynieść Cię do poziomu Dominującego.";
  }
  if (score >= 55) {
    return "Twoja strona jest zauważalna przez AI, ale traci cytowania na rzecz konkurentów. Masz solidne podstawy — czas na optymalizację treści.";
  }
  if (score >= 36) {
    return "Wyszukiwarki AI rzadko cytują Twoją stronę. Brakuje kluczowych sygnałów GEO — ale to właśnie te zmiany dają największy skok widoczności.";
  }
  return "Twoja strona jest praktycznie niewidoczna dla AI Search. Kilka fundamentalnych zmian może radykalnie zmienić sytuację — zacznij od rekomendacji poniżej.";
}

/**
 * Next-level gap message — shown in ScoreHero to create "progress illusion"
 * Tells user exactly how many points to the next tier and what unlocks it.
 */
export function getNextLevelMessage(score: number): { points: number; action: string } | null {
  if (score >= 83) return null; // already at top
  if (score >= 70) return { points: 83 - score, action: "Dodaj Content Intelligence (analiza LLM)" };
  if (score >= 55) return { points: 70 - score, action: "Dodaj FAQ + dane strukturalne" };
  if (score >= 36) return { points: 55 - score, action: "Dodaj TL;DR, nagłówki i FAQ" };
  return { points: 36 - score, action: "Napraw dostęp techniczny i meta tagi" };
}

export function generateRecommendations(
  findings: AuditFindings
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Technical recommendations
  for (const check of findings.technical.checks) {
    if (check.status === "fail" || check.status === "warning") {
      if (check.id === "https") {
        recs.push({
          id: "fix_https",
          category: "Technical",
          priority: "critical",
          title: "Włącz HTTPS",
          description: "Strona jest serwowana przez HTTP — crawlery AI nie ufają niezabezpieczonym stronom.",
          howToFix:
            "Zainstaluj certyfikat SSL (bezpłatny przez Let's Encrypt) i przekieruj cały ruch HTTP na HTTPS. Zaktualizuj ustawienia CMS, aby używać adresów HTTPS.",
          impact: "Wymagane do indeksowania przez wszystkie nowoczesne wyszukiwarki i crawlery AI.",
        });
      }
      if (check.id === "noindex") {
        recs.push({
          id: "fix_noindex",
          category: "Technical",
          priority: "critical",
          title: "Usuń dyrektywę noindex",
          description: "Strona jest oznaczona jako noindex — nie może pojawić się w AI Overviews ani wynikach wyszukiwania.",
          howToFix:
            "Usuń 'noindex' z tagu meta robots lub nagłówka X-Robots-Tag. Sprawdź ustawienia CMS — niektóre platformy dodają noindex do stron roboczych lub prywatnych.",
          impact: "Natychmiast umożliwia crawlerom AI i wyszukiwarkom indeksowanie strony.",
        });
      }
      if (check.id === "nosnippet") {
        recs.push({
          id: "fix_nosnippet",
          category: "Technical",
          priority: "high",
          title: "Usuń dyrektywę nosnippet",
          description: "nosnippet blokuje AI Overviews i featured snippets przed używaniem Twojej treści.",
          howToFix:
            "Usuń 'nosnippet' z tagu meta robots. Jeśli chcesz ograniczyć długość fragmentu, użyj 'max-snippet:300' zamiast całkowitego blokowania.",
          impact: "Umożliwia silnikom AI cytowanie Twojej treści w odpowiedziach i przeglądach.",
        });
      }
      if (check.id === "canonical") {
        recs.push({
          id: "add_canonical",
          category: "Technical",
          priority: "medium",
          title: "Dodaj tag canonical",
          description: "Brak tagu canonical może powodować problemy z duplikatem treści.",
          howToFix:
            "Dodaj <link rel='canonical' href='https://twojadomena.pl/ta-strona/'> w sekcji <head>. Większość platform CMS (WordPress, Shopify) ma wtyczki, które robią to automatycznie.",
          impact: "Zapobiega penalizacji za duplikat treści i konsoliduje sygnały rankingowe.",
        });
      }
      if (check.id === "viewport") {
        recs.push({
          id: "add_viewport",
          category: "Technical",
          priority: "medium",
          title: "Dodaj meta tag viewport",
          description: "Brak tagu viewport sugeruje, że strona może nie być przyjazna dla urządzeń mobilnych.",
          howToFix:
            "Dodaj <meta name='viewport' content='width=device-width, initial-scale=1'> w sekcji <head>.",
          impact: "Responsywność mobilna jest czynnikiem rankingowym dla funkcji AI i Google Search.",
        });
      }
    }
  }

  // Structured Data recommendations
  const sdChecks = findings.structuredData.checks;
  if (sdChecks.find((c) => c.id === "jsonld_present" && c.status === "fail")) {
    recs.push({
      id: "add_jsonld",
      category: "Structured Data",
      priority: "critical",
      title: "Dodaj dane strukturalne JSON-LD",
      description: "Brak danych strukturalnych — to pojedyncza poprawa o najwyższym wpływie na widoczność AI.",
      howToFix:
        "Dodaj blok skryptu JSON-LD w sekcji <head> z odpowiednimi typami schematu. Dla strony produktowej użyj schematu Product, dla artykułów — Article, dla strony głównej — Organization + WebSite. Użyj narzędzia Google Rich Results Test do walidacji.",
      impact: "Dane strukturalne to główny sygnał, którego silniki AI używają do rozumienia treści strony i encji.",
    });
  }
  if (sdChecks.find((c) => c.id === "faq_schema" && c.status !== "pass")) {
    recs.push({
      id: "add_faq_schema",
      category: "Structured Data",
      priority: "high",
      title: "Dodaj schemat FAQPage",
      description: "Schemat FAQ dramatycznie zwiększa wskaźniki cytowań przez AI.",
      howToFix:
        'Dodaj blok JSON-LD FAQPage z elementami mainEntity. Każdy element powinien mieć @type: "Question" z acceptedAnswer. Dodaj 3–8 par Q&A dotyczących tematu strony.',
      impact: "Schemat FAQ jest jednym z najskuteczniejszych sposobów pojawiania się w odpowiedziach generowanych przez AI.",
    });
  }
  if (sdChecks.find((c) => c.id === "organization_schema" && c.status !== "pass")) {
    recs.push({
      id: "add_org_schema",
      category: "Structured Data",
      priority: "medium",
      title: "Dodaj schemat Organization",
      description: "Schemat Organization ustanawia tożsamość encji Twojej marki dla silników AI.",
      howToFix:
        "Dodaj schemat Organization z polami name, url, logo, contactPoint i sameAs (profile w mediach społecznościowych). Umieść go na stronie głównej i stronie O nas.",
      impact: "Pomaga silnikom AI rozpoznać Twoją markę jako zaufaną encję.",
    });
  }

  // Content Structure recommendations
  const csChecks = findings.contentStructure.checks;
  if (csChecks.find((c) => c.id === "tldr_summary" && c.status !== "pass")) {
    recs.push({
      id: "add_tldr",
      category: "Content Structure",
      priority: "high",
      title: "Dodaj blok TL;DR / Podsumowanie",
      description: "Krótkie podsumowanie na górze strony to najczęściej cytowany element przez silniki AI.",
      howToFix:
        "Dodaj podsumowanie 2–4 zdań na górze treści, wyraźnie oznaczone 'TL;DR', 'Podsumowanie' lub 'Kluczowe wnioski'. Powinno bezpośrednio odpowiadać na główne pytanie, które strona adresuje.",
      impact: "Silniki AI często cytują podsumowania stron dosłownie w swoich odpowiedziach.",
    });
  }
  if (csChecks.find((c) => c.id === "faq_section" && c.status !== "pass")) {
    recs.push({
      id: "add_faq_section",
      category: "Content Structure",
      priority: "high",
      title: "Dodaj sekcję FAQ",
      description: "Sekcja FAQ z parami Q&A to jedna z najskuteczniejszych taktyk GEO.",
      howToFix:
        "Dodaj sekcję 'Często zadawane pytania' z 5–10 pytaniami, które zadaje Twoja docelowa grupa odbiorców. Pisz jasne, bezpośrednie odpowiedzi po 2–4 zdania. Połącz z schematem FAQPage dla maksymalnego efektu.",
      impact: "Treści FAQ są intensywnie cytowane w odpowiedziach generowanych przez AI i featured snippets.",
    });
  }
  if (csChecks.find((c) => c.id === "content_length" && c.status !== "pass")) {
    recs.push({
      id: "expand_content",
      category: "Content Structure",
      priority: "medium",
      title: "Rozszerz długość treści",
      description: "Cienka treść jest rzadziej cytowana przez silniki AI.",
      howToFix:
        "Rozszerz treść do co najmniej 800 słów. Dodaj więcej kontekstu, przykładów, instrukcji krok po kroku i informacji pomocniczych. Skup się na wyczerpującym odpowiadaniu na intencję użytkownika.",
      impact: "Dłuższa, bardziej wyczerpująca treść jest preferowana przez silniki AI do cytowania.",
    });
  }
  if (csChecks.find((c) => c.id === "heading_hierarchy" && c.status !== "pass")) {
    recs.push({
      id: "fix_headings",
      category: "Content Structure",
      priority: "medium",
      title: "Popraw strukturę nagłówków",
      description: "Właściwa hierarchia H1→H2→H3 pomaga silnikom AI parsować sekcje treści.",
      howToFix:
        "Upewnij się, że masz dokładnie jeden H1 (tytuł strony), następnie używaj H2 dla głównych sekcji i H3 dla podsekcji. Każdy H2 powinien reprezentować odrębny temat, który można niezależnie cytować.",
      impact: "Jasna struktura nagłówków pozwala silnikom AI wyodrębniać i cytować konkretne sekcje.",
    });
  }

  // E-E-A-T recommendations
  const eeatChecks = findings.eeat.checks;
  if (eeatChecks.find((c) => c.id === "author_byline" && c.status !== "pass")) {
    recs.push({
      id: "add_author",
      category: "E-E-A-T",
      priority: "high",
      title: "Dodaj informację o autorze",
      description: "Brak widocznego autora obniża sygnały E-E-A-T (Doświadczenie, Ekspertyza, Autorytet, Zaufanie).",
      howToFix:
        "Dodaj widoczne imię i nazwisko autora oraz krótkie referencje w pobliżu górnej części strony. Dodaj link do strony profilu autora. Dodaj schemat Person z imieniem, referencjami i profilami społecznościowymi autora.",
      impact: "Silniki AI priorytetyzują treści od identyfikowalnych, uwierzytelnionych autorów.",
    });
  }
  if (eeatChecks.find((c) => c.id === "external_citations" && c.status === "fail")) {
    recs.push({
      id: "add_citations",
      category: "E-E-A-T",
      priority: "high",
      title: "Dodaj zewnętrzne cytowania",
      description: "Linkowanie do autorytatywnych źródeł demonstruje jakość badań.",
      howToFix:
        "Dodaj 3–5 linków do autorytatywnych zewnętrznych źródeł (artykuły naukowe, strony rządowe, raporty branżowe), które potwierdzają Twoje twierdzenia. Używaj opisowego tekstu kotwicy.",
      impact: "Zewnętrzne cytowania sygnalizują silnikom AI, że Twoja treść jest dobrze zbadana i godna zaufania.",
    });
  }

  // Semantic chunking recommendation
  if (csChecks.find((c) => c.id === "semantic_chunking" && c.status !== "pass")) {
    recs.push({
      id: "fix_semantic_chunking",
      category: "Content Structure",
      priority: "high",
      title: "Popraw semantyczne chunking treści",
      description: "Akapity są za długie dla ekstrakcji fragmentów przez AI.",
      howToFix:
        "Podziel długie akapity na krótsze bloki 40–80 słów, każdy wyrażający jedną kompletną myśl. Silniki AI jak Gemini i ChatGPT segmentują strony według akapitów i wybierają jeden na raz do podsumowania. Każdy akapit powinien być samodzielny i działać niezależnie po zacytowaniu.",
      impact: "Lepszy chunking bezpośrednio zwiększa prawdopodobieństwo wyboru poszczególnych akapitów do odpowiedzi AI.",
    });
  }

  // Entity richness recommendation
  if (csChecks.find((c) => c.id === "entity_richness" && c.status !== "pass")) {
    recs.push({
      id: "increase_entity_richness",
      category: "Content Structure",
      priority: "high",
      title: "Zwiększ bogactwo encji w treści",
      description: "Treść brakuje nazwanych encji i konkretnych faktów.",
      howToFix:
        "Zastąp niejasne odniesienia konkretnymi nazwanymi encjami: zamiast 'to narzędzie' napisz 'Google Search Console'. Zamiast 'większość użytkowników' napisz '73% użytkowników'. Uwzględnij nazwy marek, produktów, osób, miejsc i konkretne statystyki. Modele AI rozwiązują znaczenie przez nazwane encje — niejasna treść uzyskuje słabe osadzenia wektorowe.",
      impact: "Nazwane encje są budulcem połączeń grafu wiedzy i poprawiają jakość osadzeń.",
    });
  }

  // Information gain recommendation
  if (csChecks.find((c) => c.id === "information_gain" && c.status !== "pass")) {
    recs.push({
      id: "increase_information_gain",
      category: "Content Structure",
      priority: "high",
      title: "Dodaj unikalne dane i oryginalne spostrzeżenia",
      description: "Treść brakuje oryginalnych danych lub unikalnych spostrzeżeń.",
      howToFix:
        "Dodaj treści, które tylko Ty możesz opublikować: oryginalne badania, własne dane, osobiste wyniki testów lub opinie ekspertów. Uwzględnij konkretne statystyki z datami (np. 'stan na Q1 2025, 73% użytkowników...'). LLM filtrują ogólne treści, które odzwierciedlają tysiące innych stron.",
      impact: "Information gain jest kluczowym sygnałem dla selekcji treści przez LLM — unikalne treści są priorytetyzowane nad ogólnymi.",
    });
  }

  // HowTo schema recommendation
  if (sdChecks.find((c) => c.id === "howto_schema" && c.status === "info")) {
    const hasStepContent = findings.contentStructure.checks.some(c =>
      c.id === "lists_present" && c.status === "pass"
    );
    if (hasStepContent) {
      recs.push({
        id: "add_howto_schema",
        category: "Structured Data",
        priority: "medium",
        title: "Dodaj schemat HowTo",
        description: "Strona ma treści krok po kroku, ale brak schematu HowTo.",
        howToFix:
          'Dodaj schemat JSON-LD HowTo z instrukcjami krok po kroku. Każdy krok powinien mieć @type: "HowToStep" z polami name i text. Uwzględnij totalTime i estimatedCost, jeśli dotyczy.',
        impact: "Schemat HowTo jest intensywnie cytowany przez silniki AI dla zapytań instruktażowych.",
      });
    }
  }

  // Schema completeness recommendation
  if (sdChecks.find((c) => c.id === "schema_completeness" && (c.status === "fail" || c.status === "warning"))) {
    recs.push({
      id: "improve_schema_completeness",
      category: "Structured Data",
      priority: "medium",
      title: "Uzupełnij właściwości schematu",
      description: "Znaczniki schematu są obecne, ale brakuje wielu zalecanych właściwości.",
      howToFix:
        "Wypełnij wszystkie dostępne właściwości schematu — bądź wyczerpujący, nie tylko zgodny. Dla Article: dodaj author, datePublished, dateModified, image, publisher. Dla Product: dodaj brand, offers, aggregateRating, sku. Dla Organization: dodaj sameAs, logo, contactPoint, foundingDate. Bardziej kompletne schematy dają silnikom AI bogatszy kontekst.",
      impact: "Kompletność schematu bezpośrednio koreluje z prawdopodobieństwem cytowania przez AI.",
    });
  }

  // nofollow recommendation
  if (findings.technical.checks.find((c) => c.id === "nofollow" && c.status === "warning")) {
    recs.push({
      id: "fix_nofollow",
      category: "Technical",
      priority: "medium",
      title: "Usuń dyrektywę nofollow",
      description: "Dyrektywa nofollow uniemożliwia crawlerom podążanie za linkami na tej stronie, ograniczając dystrybucję link equity i głębokość crawlowania.",
      howToFix:
        "Usuń 'nofollow' z tagu meta robots. Jeśli chcesz zapobiec przekazywaniu equity przez konkretne linki, użyj rel='nofollow' na poszczególnych tagach kotwicy zamiast blokowania całej strony.",
      impact: "Poprawia dystrybucję link equity i zapewnia, że crawlery mogą odkrywać linkowane strony.",
    });
  }

  // robots.txt Disallow for this page
  if (findings.technical.checks.find((c) => c.id === "robots_disallow_page" && c.status === "fail")) {
    recs.push({
      id: "fix_robots_disallow",
      category: "Technical",
      priority: "critical",
      title: "Usuń regułę Disallow dla tej strony w robots.txt",
      description: "Ścieżka tej strony jest zablokowana przez regułę Disallow w robots.txt — crawlery AI i wyszukiwarki nie mogą jej odwiedzić.",
      howToFix:
        "Edytuj plik robots.txt i usuń regułę Disallow, która pasuje do ścieżki tej strony. Jeśli masz 'Disallow: /' dla wszystkich crawlerów, musisz albo ją usunąć, albo dodać konkretne reguły Allow dla stron, które chcesz indeksować.",
      impact: "Natychmiast umożliwia wszystkim crawlerom, w tym silnikom AI, dostęp do tej strony i jej indeksowanie.",
    });
  }

  // max-snippet recommendation
  if (findings.technical.checks.find((c) => c.id === "max_snippet" && (c.status === "fail" || c.status === "warning"))) {
    recs.push({
      id: "fix_max_snippet",
      category: "Technical",
      priority: "critical",
      title: "Usuń ograniczenie max-snippet",
      description: "Dyrektywa max-snippet ogranicza ekstrakcję treści przez AI.",
      howToFix:
        "Zmień max-snippet:0 na max-snippet:-1 (nieograniczony) w tagu meta robots. Pozwala to AI Overviews, Perplexity i ChatGPT cytować pełną treść. Jeśli potrzebujesz pewnego ograniczenia, użyj max-snippet:300 jako minimum.",
      impact: "Usunięcie ograniczeń fragmentów bezpośrednio umożliwia silnikom AI cytowanie Twojej treści w odpowiedziach.",
    });
  }

  // noai directive recommendation
  if (findings.technical.checks.find((c) => c.id === "noai_directive" && c.status === "fail")) {
    recs.push({
      id: "remove_noai",
      category: "Technical",
      priority: "critical",
      title: "Usuń dyrektywę noai",
      description: "Dyrektywa noai jawnie blokuje silnikom AI używanie Twojej treści.",
      howToFix:
        "Usuń 'noai' z tagu meta robots. Ta dyrektywa jawnie informuje systemy AI, aby nie używały Twojej treści. Jeśli chcesz zezwolić na cytowanie przez AI, ale zapobiec trenowaniu, użyj zamiast tego konkretnych reguł robots.txt na poziomie crawlera.",
      impact: "Usunięcie noai natychmiast pozwala silnikom AI cytować i odwoływać się do Twojej treści.",
    });
  }

  // JS rendering recommendation
  if (findings.technical.checks.find((c) => c.id === "js_rendering" && c.status === "warning")) {
    recs.push({
      id: "fix_js_rendering",
      category: "Technical",
      priority: "high",
      title: "Upewnij się, że treść jest w źródle HTML",
      description: "Treść może być ukryta za renderowaniem JavaScript.",
      howToFix:
        "Upewnij się, że wszystkie kluczowe treści (nagłówki, tekst główny, FAQ, opisy produktów) są obecne w surowym źródle HTML, a nie ładowane dynamicznie przez JavaScript. Używaj renderowania po stronie serwera (SSR) lub generowania statycznego. Wiele crawlerów AI nie wykonuje JavaScript.",
      impact: "Treści renderowane przez JS są niewidoczne dla wielu crawlerów AI, poważnie ograniczając indeksowanie.",
    });
  }

  // Experience signals recommendation
  if (findings.eeat.checks.find((c) => c.id === "experience_signals" && c.status === "warning")) {
    recs.push({
      id: "add_experience_signals",
      category: "E-E-A-T",
      priority: "medium",
      title: "Dodaj sygnały osobistego doświadczenia",
      description: "Treść brakuje sygnałów osobistego doświadczenia (pierwsze E w E-E-A-T).",
      howToFix:
        "Dodaj osobiste spostrzeżenia, wyniki testów lub studia przypadków. Używaj języka pierwszoosobowego: 'Przetestowałem to i odkryłem...', 'Z naszego doświadczenia...', 'Nasze dane pokazują...'. Uwzględnij przykłady przed/po, rzeczywiste wyniki klientów lub oryginalne badania. To różnicuje Twoją treść od ogólnych treści generowanych przez AI.",
      impact: "Sygnały doświadczenia są najbardziej różnicującym czynnikiem E-E-A-T — silniki AI nie mogą sfabrykować autentycznego doświadczenia pierwszoosobowego.",
    });
  }

  // AI Crawler recommendations
  const crawlerChecks = findings.aiCrawlers.checks;
  const criticalSearchCrawlers = ["oai_searchbot", "perplexitybot"];
  const blockedSearchCrawlers = crawlerChecks.filter(
    (c) => c.status === "fail" && criticalSearchCrawlers.includes(c.id)
  );
  const blockedTrainingCrawlers = crawlerChecks.filter(
    (c) => c.status === "fail" && ["gptbot", "google_extended"].includes(c.id)
  );

  if (blockedSearchCrawlers.length > 0) {
    recs.push({
      id: "unblock_ai_crawlers",
      category: "AI Crawler Access",
      priority: "critical",
      title: "Odblokuj crawlery AI Search w robots.txt",
      description: `${blockedSearchCrawlers.map((c) => c.label).join(", ")} ${blockedSearchCrawlers.length > 1 ? "są" : "jest"} zablokowany — Twoja treść nie może pojawiać się w cytowaniach AI Search na żywo.`,
      howToFix:
        "Usuń reguły Disallow: / dla OAI-SearchBot i PerplexityBot z pliku robots.txt. Te crawlery zasilają cytowania AI Search w czasie rzeczywistym w ChatGPT Search i Perplexity. Uwaga: GPTBot i Google-Extended to crawlery tylko do trenowania — blokowanie ich jest prawidłowym wyborem, jeśli nie chcesz, aby Twoja treść była używana do trenowania modeli AI.",
      impact: "Zablokowane crawlery wyszukiwania uniemożliwiają pojawianie się Twojej treści w odpowiedziach ChatGPT Search i Perplexity AI.",
    });
  }

  if (blockedTrainingCrawlers.length > 0) {
    recs.push({
      id: "unblock_training_crawlers",
      category: "AI Crawler Access",
      priority: "medium",
      title: "Crawlery treningowe AI zablokowane (opcjonalne)",
      description: `${blockedTrainingCrawlers.map((c) => c.label).join(", ")} ${blockedTrainingCrawlers.length > 1 ? "są" : "jest"} zablokowany. Te crawlery są używane tylko do trenowania modeli AI, nie do cytowań w wyszukiwaniu na żywo.`,
      howToFix:
        "Blokowanie GPTBot i Google-Extended jest prawidłowym wyborem, jeśli nie chcesz, aby Twoja treść była używana do trenowania modeli AI. NIE wpływa to na Twoją widoczność w ChatGPT Search, Google AI Overviews ani Perplexity — te używają oddzielnych crawlerów (OAI-SearchBot, Googlebot, PerplexityBot).",
      impact: "Brak bezpośredniego wpływu na widoczność w AI Search. To decyzja dotycząca licencjonowania treści.",
    });
  }

  // Sitemap for crawlers recommendation
  if (crawlerChecks.find((c) => c.id === "sitemap_for_crawlers" && c.status !== "pass")) {
    recs.push({
      id: "add_sitemap_directive",
      category: "AI Crawler Access",
      priority: "medium",
      title: "Dodaj dyrektywę Sitemap do robots.txt",
      description: "Crawlery AI nie mogą odkryć pełnego inwentarza treści bez odniesienia do sitemapy.",
      howToFix:
        "Dodaj 'Sitemap: https://twojadomena.pl/sitemap.xml' do pliku robots.txt. Upewnij się, że Twoja sitemapa XML jest aktualna i zawiera wszystkie ważne strony. Pomaga to crawlerom AI odkrywać i indeksować pełną treść.",
      impact: "Odkrycie sitemapy pomaga crawlerom AI indeksować wszystkie Twoje strony, nie tylko te linkowane ze strony głównej.",
    });
  }

  // Meta Tags recommendations
  const mtChecks = findings.metaTags.checks;
  if (mtChecks.find((c) => c.id === "title_tag" && c.status === "fail")) {
    recs.push({
      id: "add_title",
      category: "Meta Tags",
      priority: "high",
      title: "Dodaj tag tytułu",
      description: "Brak tagu tytułu — krytyczny dla wszystkich wyszukiwarek i crawlerów AI.",
      howToFix:
        "Dodaj tag <title> w sekcji <head> z opisowym, bogatym w słowa kluczowe tytułem o długości 50–65 znaków.",
      impact: "Tag tytułu jest głównym sygnałem identyfikacji tematu strony.",
    });
  }
  if (mtChecks.find((c) => c.id === "meta_description" && c.status === "fail")) {
    recs.push({
      id: "add_meta_desc",
      category: "Meta Tags",
      priority: "high",
      title: "Dodaj meta opis",
      description: "Brak meta opisu zmniejsza klikalność z wyników zasilanych przez AI.",
      howToFix:
        "Dodaj <meta name='description' content='...'> z przekonującym podsumowaniem 150–160 znaków zawierającym główne słowo kluczowe.",
      impact: "Meta opisy są używane przez silniki AI do rozumienia treści strony.",
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  return recs;
}
