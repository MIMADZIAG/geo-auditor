/**
 * AI Page Creator — core pipeline
 *
 * Pipeline:
 *   1. Query Fan-Out: generate 6-10 search queries from brief
 *   2. Grounding: scrape top results for each query (SERP + direct fetch)
 *   3. Research Synthesis: condense scraped content into a structured brief
 *   4. Content Generation: produce full page blueprint via LLM
 *   5. Technical Spec: generate meta, OG, schema.org, heading structure
 */

import { invokeLLM } from "../_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageCreatorBrief {
  pageType: string;
  topic: string;
  targetKeywords?: string[];
  toneOfVoice?: string;
  targetAudience?: string;
  additionalContext?: string;
  language?: string;
}

export interface GroundingSource {
  url: string;
  title: string;
  snippet: string;
  fullContent?: string;
}

export interface HeadingStructure {
  level: "H1" | "H2" | "H3";
  text: string;
  purpose: string;  // why this heading helps AI visibility
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SchemaOrgSpec {
  type: string;           // e.g. "Article", "Product", "FAQPage", "LocalBusiness"
  jsonLd: string;         // ready-to-paste JSON-LD
}

export interface TechnicalSpec {
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogType: string;
  canonicalUrl: string;   // placeholder pattern
  schemaOrg: SchemaOrgSpec[];
  robotsDirective: string;
  hreflang?: string;
  internalLinkingSuggestions: string[];
  wordCountTarget: number;
  readabilityTarget: string;
}

export interface PageSection {
  heading: string;
  headingLevel: "H1" | "H2" | "H3";
  content: string;
  aiVisibilityNote?: string;  // why this section helps AI citations
}

export interface PageCreationResult {
  // Research
  queryFanOut: string[];
  groundingSources: GroundingSource[];
  researchSummary: string;

  // Content
  pageTitle: string;
  sections: PageSection[];
  faq: FAQItem[];
  callToAction: string;

  // Technical
  technicalSpec: TechnicalSpec;
  headingStructure: HeadingStructure[];

  // AI Readiness
  aiReadinessScore: number;        // 0-100 predicted score
  aiReadinessTips: string[];       // top 5 tips to maximize AI visibility
  keyEntities: string[];           // named entities to include
  answerFirstParagraph: string;    // direct answer to main query (for AI snippets)

  // Meta
  estimatedWordCount: number;
  generatedAt: string;
}

// ─── Step 1: Query Fan-Out ────────────────────────────────────────────────────

export async function generateQueryFanOut(brief: PageCreatorBrief): Promise<string[]> {
  const pageTypeLabels: Record<string, string> = {
    article: "artykuł informacyjny / poradnik",
    listing: "strona listingu produktów / ofert",
    landing: "landing page / strona sprzedażowa",
    product: "karta produktu / strona produktu",
    faq: "strona FAQ / baza wiedzy",
    category: "strona kategorii / działu",
    comparison: "porównanie produktów / ranking",
    local: "strona lokalna / wizytówka",
  };

  const pageTypeLabel = pageTypeLabels[brief.pageType] || brief.pageType;
  const lang = brief.language === "pl" ? "polskim" : "angielskim";

  const response = await invokeLLM({
    model: "gpt-4.5-preview",
    messages: [
      {
        role: "system",
        content:
          `Jesteś ekspertem SEO i GEO (Generative Engine Optimization). ` +
          `Generujesz zapytania wyszukiwarkowe, które użytkownicy wpisują w Google, ChatGPT i Perplexity. ` +
          `Twoje zapytania muszą pokrywać intencje informacyjne, transakcyjne i nawigacyjne. ` +
          `Odpowiadaj WYŁĄCZNIE w formacie JSON.`,
      },
      {
        role: "user",
        content:
          `Wygeneruj 8 zapytań wyszukiwarkowych dla następującej strony:\n\n` +
          `Typ strony: ${pageTypeLabel}\n` +
          `Temat: ${brief.topic}\n` +
          `${brief.targetKeywords?.length ? `Słowa kluczowe: ${brief.targetKeywords.join(", ")}\n` : ""}` +
          `${brief.targetAudience ? `Grupa docelowa: ${brief.targetAudience}\n` : ""}` +
          `Język: ${lang}\n\n` +
          `Zwróć JSON:\n{"queries": ["zapytanie1", "zapytanie2", ...]}\n\n` +
          `Zapytania muszą być różnorodne: ogólne, szczegółowe, pytające (jak?, co?, dlaczego?), porównawcze.`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 600,
  } as any);

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
  return Array.isArray(parsed.queries) ? parsed.queries.slice(0, 10) : [];
}

// ─── Step 2: Grounding — scrape top results ───────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEOAuditorBot/1.0; +https://geoauditor.ai/bot)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Strip HTML tags, scripts, styles — keep text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 3000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function searchAndScrape(query: string): Promise<GroundingSource[]> {
  // Use DuckDuckGo HTML search as grounding source (no API key needed)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=pl-pl`;
  const html = await fetchWithTimeout(searchUrl, 10000);

  // Extract result URLs and snippets from DDG HTML
  const results: GroundingSource[] = [];
  const linkRegex = /class="result__url"[^>]*>([^<]+)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const titleRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  const titles: Array<{ url: string; title: string }> = [];
  let m;
  while ((m = titleRegex.exec(html)) !== null && titles.length < 5) {
    const rawUrl = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").trim();
    if (rawUrl && title && rawUrl.startsWith("http")) {
      titles.push({ url: rawUrl, title });
    }
  }

  // Fetch content from top 3 URLs
  for (const { url, title } of titles.slice(0, 3)) {
    try {
      const content = await fetchWithTimeout(url, 6000);
      if (content.length > 100) {
        results.push({
          url,
          title,
          snippet: content.slice(0, 300),
          fullContent: content.slice(0, 2000),
        });
      }
    } catch {
      // skip failed URLs
    }
  }

  return results;
}

export async function groundResearch(
  queries: string[],
  onProgress?: (done: number, total: number) => void
): Promise<GroundingSource[]> {
  const allSources: GroundingSource[] = [];
  const seenUrls = new Set<string>();

  // Process top 4 queries for grounding (balance quality vs speed)
  const groundingQueries = queries.slice(0, 4);

  for (let i = 0; i < groundingQueries.length; i++) {
    const sources = await searchAndScrape(groundingQueries[i]);
    for (const s of sources) {
      if (!seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        allSources.push(s);
      }
    }
    onProgress?.(i + 1, groundingQueries.length);
  }

  return allSources.slice(0, 10); // max 10 unique sources
}

// ─── Step 3: Research Synthesis ───────────────────────────────────────────────

export async function synthesizeResearch(
  brief: PageCreatorBrief,
  sources: GroundingSource[]
): Promise<string> {
  if (sources.length === 0) {
    return `Brak danych z groundingu. Temat: ${brief.topic}. Typ strony: ${brief.pageType}.`;
  }

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\nTreść: ${s.fullContent ?? s.snippet}`)
    .join("\n\n---\n\n");

  const response = await invokeLLM({
    model: "gpt-4.5-preview",
    messages: [
      {
        role: "system",
        content:
          `Jesteś analitykiem treści i ekspertem GEO. ` +
          `Analizujesz zebrane materiały i tworzysz syntetyczne podsumowanie badań, ` +
          `które posłuży jako baza wiedzy do stworzenia doskonałej strony internetowej. ` +
          `Identyfikujesz kluczowe fakty, encje, pytania użytkowników i luki treściowe.`,
      },
      {
        role: "user",
        content:
          `Przeanalizuj poniższe materiały i stwórz syntetyczne podsumowanie badań dla:\n\n` +
          `Typ strony: ${brief.pageType}\n` +
          `Temat: ${brief.topic}\n\n` +
          `ZEBRANE MATERIAŁY:\n${sourcesText.slice(0, 12000)}\n\n` +
          `Podsumowanie powinno zawierać:\n` +
          `1. Kluczowe fakty i dane o temacie\n` +
          `2. Najczęstsze pytania użytkowników\n` +
          `3. Kluczowe encje (osoby, miejsca, produkty, pojęcia)\n` +
          `4. Luki treściowe — czego brakuje w istniejących materiałach\n` +
          `5. Rekomendacje struktury treści\n\n` +
          `Pisz zwięźle, konkretnie, po polsku.`,
      },
    ],
    max_tokens: 2000,
  } as any);

  return String(response.choices[0]?.message?.content ?? "");
}

// ─── Step 4: Full Page Blueprint Generation ───────────────────────────────────

const PAGE_TYPE_INSTRUCTIONS: Record<string, string> = {
  article:
    `Tworzysz kompletny artykuł informacyjny / poradnik. ` +
    `Struktura: H1 (główne pytanie/temat), wprowadzenie z answer-first, ` +
    `3-6 sekcji H2 z podsekcjami H3, sekcja FAQ (8 pytań), podsumowanie z CTA. ` +
    `Cel: być cytowanym przez Google AI Overviews jako autorytatywne źródło.`,

  listing:
    `Tworzysz stronę listingu produktów/ofert. ` +
    `Struktura: H1 (kategoria + główna fraza), wprowadzenie z opisem kategorii (150-200 słów), ` +
    `sekcja filtrów/kryteriów wyboru, opis top produktów/ofert, FAQ (6 pytań), ` +
    `sekcja "Jak wybrać" z poradami. Cel: rankingi w AI Search dla fraz kategorycznych.`,

  landing:
    `Tworzysz landing page / stronę sprzedażową. ` +
    `Struktura: H1 (propozycja wartości), hero copy, sekcja problemu, rozwiązanie, ` +
    `korzyści (3-5 punktów), social proof, FAQ (6 pytań), silne CTA. ` +
    `Cel: konwersje + widoczność w AI Search dla fraz intencji zakupowej.`,

  product:
    `Tworzysz kartę produktu. ` +
    `Struktura: H1 (nazwa produktu + kluczowy benefit), opis produktu (answer-first), ` +
    `specyfikacja techniczna, sekcja "Dla kogo jest ten produkt", korzyści, ` +
    `FAQ (8 pytań o produkt), recenzje/opinie (placeholder), CTA. ` +
    `Cel: cytowania w AI Search dla zapytań produktowych i porównawczych.`,

  faq:
    `Tworzysz dedykowaną stronę FAQ / bazę wiedzy. ` +
    `Struktura: H1 (temat FAQ), krótkie wprowadzenie, 12-15 pytań pogrupowanych w 3-4 kategorie (H2), ` +
    `każde pytanie jako H3 z wyczerpującą odpowiedzią (3-5 zdań). ` +
    `Cel: dominacja w AI Overviews dla pytań informacyjnych.`,

  category:
    `Tworzysz stronę kategorii / działu. ` +
    `Struktura: H1 (nazwa kategorii), opis kategorii (200-300 słów z answer-first), ` +
    `podkategorie (H2), sekcja "Popularne produkty/usługi", ` +
    `sekcja "Jak wybrać" (H2), FAQ (6 pytań). ` +
    `Cel: widoczność dla fraz nawigacyjnych i kategorycznych w AI Search.`,

  comparison:
    `Tworzysz stronę porównawczą / ranking. ` +
    `Struktura: H1 (porównanie + główna fraza), wprowadzenie z verdict (answer-first), ` +
    `tabela porównawcza, szczegółowy opis każdej opcji (H2), ` +
    `sekcja "Który wybrać?" z rekomendacją, FAQ (6 pytań). ` +
    `Cel: cytowania w AI Search dla zapytań "najlepszy", "porównanie", "ranking".`,

  local:
    `Tworzysz stronę lokalną / wizytówkę. ` +
    `Struktura: H1 (usługa + lokalizacja), opis usługi lokalnej (answer-first), ` +
    `sekcja "Dlaczego my" (3-4 korzyści), obszar działania, ` +
    `FAQ (6 pytań lokalnych), dane kontaktowe, CTA. ` +
    `Cel: widoczność w Google AI Overviews dla zapytań lokalnych.`,
};

export async function generatePageBlueprint(
  brief: PageCreatorBrief,
  researchSummary: string,
  queryFanOut: string[],
  groundingSources: GroundingSource[]
): Promise<PageCreationResult> {
  const pageTypeInstruction = PAGE_TYPE_INSTRUCTIONS[brief.pageType] || PAGE_TYPE_INSTRUCTIONS.article;
  const lang = brief.language === "pl" ? "polskim" : "angielskim";
  const primaryQuery = queryFanOut[0] || brief.topic;

  const systemPrompt =
    `Jesteś mistrzowskim copywriterem i ekspertem GEO (Generative Engine Optimization) klasy światowej. ` +
    `Tworzysz treści, które są cytowane przez Google AI Overviews, ChatGPT, Perplexity i Claude. ` +
    `Twoje treści są zawsze: faktyczne (tylko weryfikowalne fakty), wyczerpujące, ` +
    `napisane językiem eksperta ale zrozumiałym dla użytkownika, ` +
    `zoptymalizowane pod AI Search (answer-first, encje, FAQ, struktura semantyczna).\n\n` +
    `🚨 BEZWZGLĘDNE ZAKAZY:\n` +
    `- NIE wymyślaj cytatów, opinii ekspertów, statystyk ani danych, których nie ma w materiałach badawczych\n` +
    `- NIE twórz fikcyjnych nazw osób, firm, produktów\n` +
    `- NIE podawaj nieweryfikowalnych liczb jako faktów\n` +
    `- Jeśli brakuje danych — napisz ogólnie lub zaznacz "[uzupełnij dane]"\n` +
    `- Każde zdanie musi być kompletne i zakończone\n\n` +
    `Odpowiadaj WYŁĄCZNIE w formacie JSON zgodnym ze schematem.`;

  const userPrompt =
    `Stwórz kompletny blueprint strony internetowej.\n\n` +
    `BRIEF:\n` +
    `- Typ strony: ${brief.pageType}\n` +
    `- Temat: ${brief.topic}\n` +
    `${brief.targetKeywords?.length ? `- Słowa kluczowe: ${brief.targetKeywords.join(", ")}\n` : ""}` +
    `${brief.toneOfVoice ? `- Ton komunikacji: ${brief.toneOfVoice}\n` : ""}` +
    `${brief.targetAudience ? `- Grupa docelowa: ${brief.targetAudience}\n` : ""}` +
    `${brief.additionalContext ? `- Dodatkowy kontekst: ${brief.additionalContext}\n` : ""}` +
    `- Język: ${lang}\n\n` +
    `INSTRUKCJA STRUKTURY:\n${pageTypeInstruction}\n\n` +
    `GŁÓWNE ZAPYTANIA DOCELOWE:\n${queryFanOut.slice(0, 6).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
    `PODSUMOWANIE BADAŃ:\n${researchSummary.slice(0, 4000)}\n\n` +
    `Zwróć JSON w dokładnie tym formacie:\n` +
    `{\n` +
    `  "pageTitle": "string — tytuł strony (H1)",\n` +
    `  "answerFirstParagraph": "string — 2-3 zdania bezpośredniej odpowiedzi na główne zapytanie (dla AI snippets)",\n` +
    `  "sections": [\n` +
    `    {\n` +
    `      "heading": "string",\n` +
    `      "headingLevel": "H1|H2|H3",\n` +
    `      "content": "string — pełna treść sekcji (min. 150-300 słów), kompletne zdania",\n` +
    `      "aiVisibilityNote": "string — dlaczego ta sekcja pomaga w AI Search"\n` +
    `    }\n` +
    `  ],\n` +
    `  "faq": [\n` +
    `    {"question": "string", "answer": "string — pełna odpowiedź (2-4 zdania)"}\n` +
    `  ],\n` +
    `  "callToAction": "string — tekst CTA",\n` +
    `  "keyEntities": ["string"],\n` +
    `  "aiReadinessTips": ["string — konkretna wskazówka GEO"],\n` +
    `  "aiReadinessScore": number,\n` +
    `  "estimatedWordCount": number\n` +
    `}`;

  const response = await invokeLLM({
    model: "gpt-4.5-preview",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 16000,
  } as any);

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

  // ─── Step 5: Technical Spec Generation ────────────────────────────────────
  const techSpec = await generateTechnicalSpec(brief, parsed, primaryQuery, lang);

  // ─── Build heading structure ───────────────────────────────────────────────
  const headingStructure: HeadingStructure[] = (parsed.sections || []).map((s: PageSection) => ({
    level: s.headingLevel || "H2",
    text: s.heading,
    purpose: s.aiVisibilityNote || "Sekcja treściowa",
  }));

  return {
    queryFanOut,
    groundingSources: groundingSources.map(s => ({
      url: s.url,
      title: s.title,
      snippet: s.snippet,
    })),
    researchSummary,
    pageTitle: parsed.pageTitle || brief.topic,
    sections: parsed.sections || [],
    faq: parsed.faq || [],
    callToAction: parsed.callToAction || "Skontaktuj się z nami",
    technicalSpec: techSpec,
    headingStructure,
    aiReadinessScore: Math.min(100, Math.max(0, Number(parsed.aiReadinessScore) || 82)),
    aiReadinessTips: parsed.aiReadinessTips || [],
    keyEntities: parsed.keyEntities || [],
    answerFirstParagraph: parsed.answerFirstParagraph || "",
    estimatedWordCount: Number(parsed.estimatedWordCount) || 1500,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Step 5: Technical Spec ───────────────────────────────────────────────────

async function generateTechnicalSpec(
  brief: PageCreatorBrief,
  content: Record<string, unknown>,
  primaryQuery: string,
  lang: string
): Promise<TechnicalSpec> {
  const schemaTypeMap: Record<string, string> = {
    article: "Article",
    listing: "CollectionPage",
    landing: "WebPage",
    product: "Product",
    faq: "FAQPage",
    category: "CollectionPage",
    comparison: "Article",
    local: "LocalBusiness",
  };

  const schemaType = schemaTypeMap[brief.pageType] || "WebPage";
  const pageTitle = String(content.pageTitle || brief.topic);
  const faqItems = (content.faq as FAQItem[]) || [];

  const response = await invokeLLM({
    model: "gpt-4.5-preview",
    messages: [
      {
        role: "system",
        content:
          `Jesteś ekspertem technicznego SEO i GEO. ` +
          `Generujesz kompletne specyfikacje techniczne dla stron internetowych. ` +
          `Odpowiadaj WYŁĄCZNIE w formacie JSON.`,
      },
      {
        role: "user",
        content:
          `Wygeneruj specyfikację techniczną dla strony:\n\n` +
          `Tytuł: ${pageTitle}\n` +
          `Typ: ${brief.pageType}\n` +
          `Temat: ${brief.topic}\n` +
          `Główne zapytanie: ${primaryQuery}\n` +
          `Język: ${lang}\n` +
          `Schema.org typ: ${schemaType}\n` +
          `FAQ items: ${faqItems.length}\n\n` +
          `Zwróć JSON:\n` +
          `{\n` +
          `  "metaTitle": "string — max 60 znaków, zawiera główną frazę",\n` +
          `  "metaDescription": "string — 140-155 znaków, zachęcająca, z CTA",\n` +
          `  "ogTitle": "string — tytuł dla social media",\n` +
          `  "ogDescription": "string — opis dla social media (max 200 znaków)",\n` +
          `  "ogType": "article|website|product",\n` +
          `  "canonicalUrl": "string — wzorzec URL np. /blog/temat-artykulu",\n` +
          `  "robotsDirective": "string — np. index, follow",\n` +
          `  "internalLinkingSuggestions": ["string — sugestia linkowania wewnętrznego"],\n` +
          `  "wordCountTarget": number,\n` +
          `  "readabilityTarget": "string — np. Flesch-Kincaid Grade 8-10",\n` +
          `  "schemaOrgJsonLd": "string — gotowy JSON-LD dla ${schemaType}${faqItems.length > 0 ? " + FAQPage" : ""}"\n` +
          `}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 3000,
  } as any);

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

  return {
    metaTitle: parsed.metaTitle || pageTitle.slice(0, 60),
    metaDescription: parsed.metaDescription || "",
    ogTitle: parsed.ogTitle || pageTitle,
    ogDescription: parsed.ogDescription || "",
    ogType: parsed.ogType || "website",
    canonicalUrl: parsed.canonicalUrl || "/",
    schemaOrg: [
      {
        type: schemaType,
        jsonLd: parsed.schemaOrgJsonLd || `{"@context":"https://schema.org","@type":"${schemaType}","name":"${pageTitle}"}`,
      },
    ],
    robotsDirective: parsed.robotsDirective || "index, follow",
    internalLinkingSuggestions: parsed.internalLinkingSuggestions || [],
    wordCountTarget: Number(parsed.wordCountTarget) || 1500,
    readabilityTarget: parsed.readabilityTarget || "Flesch-Kincaid Grade 8-10",
  };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export interface PipelineProgress {
  stage: "fan_out" | "researching" | "synthesizing" | "generating" | "technical" | "done";
  message: string;
  progress: number;  // 0-100
}

export async function runPageCreatorPipeline(
  brief: PageCreatorBrief,
  onProgress?: (p: PipelineProgress) => void
): Promise<PageCreationResult> {
  // Stage 1: Query Fan-Out
  onProgress?.({ stage: "fan_out", message: "Generuję zapytania badawcze...", progress: 5 });
  const queries = await generateQueryFanOut(brief);
  console.log(`[PageCreator] Fan-out: ${queries.length} queries`);

  // Stage 2: Grounding Research
  onProgress?.({ stage: "researching", message: "Analizuję najlepsze materiały w sieci...", progress: 15 });
  const sources = await groundResearch(queries, (done, total) => {
    onProgress?.({
      stage: "researching",
      message: `Pobieram dane z sieci (${done}/${total})...`,
      progress: 15 + Math.round((done / total) * 25),
    });
  });
  console.log(`[PageCreator] Grounding: ${sources.length} sources`);

  // Stage 3: Research Synthesis
  onProgress?.({ stage: "synthesizing", message: "Syntezuję zebrane dane...", progress: 45 });
  const researchSummary = await synthesizeResearch(brief, sources);

  // Stage 4: Content Generation
  onProgress?.({ stage: "generating", message: "Tworzę treść strony (to może potrwać 30-60s)...", progress: 55 });
  const result = await generatePageBlueprint(brief, researchSummary, queries, sources);

  onProgress?.({ stage: "done", message: "Gotowe!", progress: 100 });
  console.log(`[PageCreator] Done — ${result.estimatedWordCount} words, score: ${result.aiReadinessScore}`);

  return result;
}
