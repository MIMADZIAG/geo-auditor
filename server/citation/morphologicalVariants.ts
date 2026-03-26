/**
 * Morphological & Semantic Query Variants
 * =========================================
 * Generates linguistically precise variants of a base query to maximise
 * coverage of AI search citation results and reduce false negatives.
 *
 * Strategy mirrors Google's internal query understanding pipeline:
 *   1. Aspect transformation   — "jak wybrać X" → "jak wybierać X" (imperfective ↔ perfective)
 *   2. Syntactic reframing     — verb-phrase → noun-phrase → question
 *   3. Interrogative expansion — inject question words (jaki/który/co/ile/czy)
 *   4. Temporal / specificity  — add year, "2025", "online", "w Polsce"
 *   5. Synonym substitution    — swap high-frequency verbs/adjectives with semantic equivalents
 *
 * For Polish the module applies rule-based transformations first (deterministic, zero-latency),
 * then uses LLM to generate 3 additional high-quality variants that rules cannot produce.
 * For other languages only LLM is used.
 *
 * The caller is responsible for deduplication and final slot allocation.
 */

import { invokeLLM } from "../_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MorphVariantResult {
  variants: string[];
  source: "rules" | "llm" | "mixed";
}

// ─── Polish rule-based transformations ───────────────────────────────────────

/**
 * Aspect pairs: [imperfective, perfective] for the most common GEO query verbs.
 * Covers the core false-negative scenario: user types "jak wybrać" but page is
 * indexed under "jak wybierać" (or vice versa).
 */
const ASPECT_PAIRS_PL: [string, string][] = [
  ["wybrać", "wybierać"],
  ["kupić", "kupować"],
  ["znaleźć", "znajdować"],
  ["sprawdzić", "sprawdzać"],
  ["porównać", "porównywać"],
  ["ocenić", "oceniać"],
  ["wybrać", "wybierać"],
  ["zrozumieć", "rozumieć"],
  ["nauczyć się", "uczyć się"],
  ["zacząć", "zaczynać"],
  ["zmienić", "zmieniać"],
  ["poprawić", "poprawiać"],
  ["zwiększyć", "zwiększać"],
  ["zmniejszyć", "zmniejszać"],
  ["obliczać", "obliczyć"],
  ["liczyć", "policzyć"],
  ["skonfigurować", "konfigurować"],
  ["zainstalować", "instalować"],
  ["wdrożyć", "wdrażać"],
  ["zoptymalizować", "optymalizować"],
  ["zabezpieczyć", "zabezpieczać"],
  ["zarejestrować", "rejestrować"],
  ["założyć", "zakładać"],
  ["ustawić", "ustawiać"],
  ["wyłączyć", "wyłączać"],
  ["włączyć", "włączać"],
  ["usunąć", "usuwać"],
  ["dodać", "dodawać"],
  ["pobrać", "pobierać"],
  ["wysłać", "wysyłać"],
];

/**
 * High-frequency adjective/adverb synonyms for Polish GEO queries.
 * Swap the key with any of the values to generate a semantic variant.
 */
const SYNONYM_MAP_PL: Record<string, string[]> = {
  "tani": ["niedrogi", "budżetowy", "ekonomiczny", "przystępny cenowo"],
  "tanie": ["niedrogie", "budżetowe", "ekonomiczne", "przystępne cenowo"],
  "najlepszy": ["optymalny", "rekomendowany", "polecany", "topowy"],
  "najlepsza": ["optymalna", "rekomendowana", "polecana", "topowa"],
  "najlepsze": ["optymalne", "rekomendowane", "polecane", "topowe"],
  "dobry": ["solidny", "sprawdzony", "godny polecenia", "wartościowy"],
  "dobra": ["solidna", "sprawdzona", "godna polecenia", "wartościowa"],
  "dobre": ["solidne", "sprawdzone", "godne polecenia", "wartościowe"],
  "szybki": ["ekspresowy", "błyskawiczny", "natychmiastowy"],
  "bezpieczny": ["pewny", "zaufany", "wiarygodny"],
  "prosty": ["łatwy", "nieskomplikowany", "intuicyjny"],
  "skuteczny": ["efektywny", "wydajny", "sprawny"],
  "popularny": ["znany", "ceniony", "wiodący", "czołowy"],
  "nowy": ["aktualny", "nowoczesny", "najnowszy", "świeży"],
  "jak wybrać": ["jak dobrać", "jak zdecydować się na", "jak znaleźć odpowiedni", "kryteria wyboru"],
  "jak kupić": ["jak nabyć", "gdzie kupić", "jak zakupić"],
  "co to jest": ["czym jest", "co oznacza", "definicja", "co to znaczy"],
  "ranking": ["zestawienie", "porównanie", "lista", "przegląd"],
  "poradnik": ["przewodnik", "instrukcja", "tutorial", "jak to zrobić"],
};

/**
 * Question-word prefixes for Polish — used to generate interrogative variants
 * from declarative or noun-phrase queries.
 */
const QUESTION_PREFIXES_PL = [
  "jak wybrać",
  "jaki jest najlepszy",
  "który jest lepszy",
  "co to jest",
  "ile kosztuje",
  "czy warto",
  "jak działa",
  "dlaczego warto",
  "kiedy wybrać",
  "jakie są zalety",
];

// ─── Rule engine ──────────────────────────────────────────────────────────────

/**
 * Apply deterministic Polish morphological rules to a single query.
 * Returns up to `maxVariants` unique variants (not including the original).
 */
export function applyPolishRules(query: string, maxVariants = 4): string[] {
  const variants = new Set<string>();
  const q = query.trim();
  if (q.length === 0) return [];

  // 1. Aspect swap — perfective ↔ imperfective
  for (const [perf, imperf] of ASPECT_PAIRS_PL) {
    if (q.includes(perf) && !q.includes(imperf)) {
      variants.add(q.replace(perf, imperf));
    }
    if (q.includes(imperf) && !q.includes(perf)) {
      variants.add(q.replace(imperf, perf));
    }
    if (variants.size >= maxVariants) break;
  }

  // 2. Synonym substitution — swap first matching synonym
  for (const [word, synonyms] of Object.entries(SYNONYM_MAP_PL)) {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    if (pattern.test(q)) {
      // Add up to 2 synonym variants
      for (const syn of synonyms.slice(0, 2)) {
        const v = q.replace(pattern, syn);
        if (v !== q) variants.add(v);
        if (variants.size >= maxVariants) break;
      }
    }
    if (variants.size >= maxVariants) break;
  }

  // 3. Interrogative injection — if query is a noun phrase (no question word),
  //    prepend a question prefix that fits semantically
  const hasQuestionWord = /^(jak|jaki|jaka|jakie|który|która|które|co|ile|czy|dlaczego|kiedy|gdzie|czym|czego)\b/i.test(q);
  if (!hasQuestionWord && variants.size < maxVariants) {
    // Pick a prefix that doesn't duplicate existing words
    const prefix = QUESTION_PREFIXES_PL.find(p => !q.toLowerCase().startsWith(p.toLowerCase()));
    if (prefix) variants.add(`${prefix} ${q}`);
  }

  // 4. Temporal specificity — add current year if not present
  if (!/\b202[3-9]\b/.test(q) && variants.size < maxVariants) {
    variants.add(`${q} 2025`);
  }

  return Array.from(variants).slice(0, maxVariants);
}

// ─── LLM-based semantic expansion ────────────────────────────────────────────

/**
 * Use LLM to generate semantically equivalent but lexically diverse variants.
 * This catches transformations that rules cannot handle:
 *   - Colloquial ↔ formal register shifts
 *   - Domain-specific terminology
 *   - Implicit → explicit intent expansion
 *   - Cross-language morphology for non-Polish pages
 */
export async function generateLLMVariants(
  query: string,
  language: string,
  count = 3
): Promise<string[]> {
  const langNote = language === "pl"
    ? "All variants MUST be in Polish. Use natural, conversational Polish phrasing."
    : `All variants MUST be in ${language}. Use natural phrasing.`;

  const examples = language === "pl"
    ? `Examples of good morphological variants:
- "jak wybrać tanie OC" → "jak wybierać niedrogie ubezpieczenie OC", "który OC jest najtańszy", "tanie OC 2025"
- "ranking kont bankowych" → "najlepsze konta bankowe", "porównanie kont bankowych", "jakie konto bankowe wybrać"
- "co to jest SEO" → "czym jest SEO", "jak działa SEO", "definicja SEO"`
    : `Examples of good morphological variants:
- "how to choose cheap car insurance" → "how to find affordable car insurance", "cheapest car insurance options", "best budget car insurance 2025"
- "best bank accounts" → "top bank accounts comparison", "which bank account should I choose", "recommended bank accounts"`;

  try {
    const result = await invokeLLM({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are a world-class computational linguist and GEO (Generative Engine Optimization) expert.

Your task: Generate exactly ${count} morphological and semantic variants of a search query.

## What makes a good variant
A variant must:
1. Express the SAME search intent as the original query
2. Use DIFFERENT words, morphological forms, or syntactic structure
3. Be something a real user would actually type into an AI search engine
4. Cover different linguistic angles: aspect change, synonym swap, question form, nominal form, specificity level

## What to avoid
- Do NOT change the core topic or intent
- Do NOT add unrelated concepts
- Do NOT simply add/remove punctuation
- Do NOT repeat the original query

${examples}

${langNote}

Return ONLY a JSON object: { "variants": ["variant1", "variant2", "variant3"] }`,
        },
        {
          role: "user",
          content: `Original query: "${query}"\nLanguage: ${language}\nGenerate ${count} variants.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "variants",
          strict: true,
          schema: {
            type: "object",
            properties: {
              variants: { type: "array", items: { type: "string" } },
            },
            required: ["variants"],
            additionalProperties: false,
          },
        },
      },
    });

    const text = result.choices[0]?.message?.content;
    if (!text) return [];

    const parsed = JSON.parse(typeof text === "string" ? text : JSON.stringify(text));
    return Array.isArray(parsed.variants)
      ? parsed.variants
          .filter((v: unknown) => typeof v === "string" && v.trim().length > 3 && v.trim() !== query)
          .map((v: string) => v.trim())
          .slice(0, count)
      : [];
  } catch (e) {
    console.warn("[MorphVariants] LLM generation failed:", e);
    return [];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate morphological + semantic variants for a set of base queries.
 *
 * For Polish: rules first (deterministic, instant), then LLM for remaining slots.
 * For other languages: LLM only.
 *
 * @param queries     Base queries from generateEngineQueries()
 * @param language    Page language ("pl" | "en" | ...)
 * @param maxPerQuery Max variants to generate per base query (default: 2)
 * @returns           Flat, deduplicated list of variant queries (originals excluded)
 */
export async function expandQueriesWithVariants(
  queries: string[],
  language: string,
  maxPerQuery = 2
): Promise<MorphVariantResult> {
  if (queries.length === 0) return { variants: [], source: "rules" };

  const allVariants = new Set<string>();
  // Normalise originals for dedup
  const originals = new Set(queries.map(q => q.toLowerCase().trim()));

  let usedLLM = false;
  let usedRules = false;

  // Process each base query
  for (const query of queries) {
    let ruleVariants: string[] = [];

    if (language === "pl") {
      ruleVariants = applyPolishRules(query, maxPerQuery);
      usedRules = true;
    }

    // Deduplicate rule variants against originals and already-collected variants
    const freshRuleVariants = ruleVariants.filter(v => {
      const norm = v.toLowerCase().trim();
      return !originals.has(norm) && !allVariants.has(norm);
    });

    freshRuleVariants.forEach(v => allVariants.add(v.toLowerCase().trim()));

    // If rules didn't fill the slots (or non-Polish), use LLM for remaining
    const remaining = maxPerQuery - freshRuleVariants.length;
    if (remaining > 0) {
      const llmVariants = await generateLLMVariants(query, language, remaining);
      usedLLM = true;

      for (const v of llmVariants) {
        const norm = v.toLowerCase().trim();
        if (!originals.has(norm) && !allVariants.has(norm)) {
          allVariants.add(norm);
        }
      }
    }
  }

  // Reconstruct proper-case variants from the normalised set
  // (LLM returns proper case; rule-based preserves original case)
  const result = Array.from(allVariants).map(v => {
    // Find the original-case version from rule output or LLM output
    // Since we store lowercase, we need to re-derive — just capitalise first char
    return v.charAt(0).toUpperCase() + v.slice(1);
  });

  const source: MorphVariantResult["source"] = usedLLM && usedRules ? "mixed" : usedLLM ? "llm" : "rules";

  return { variants: result, source };
}
