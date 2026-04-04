/**
 * Entity Recognizer — WikiData-backed Named Entity Recognition
 *
 * Architecture (Hybrid, Precision-First):
 *  Layer 1 — Regex NER: extract candidate named entities from text using
 *             linguistic patterns (multi-word proper nouns, acronyms, orgs).
 *  Layer 2 — WikiData Batch API: validate top-N candidates against
 *             Wikidata's wbsearchentities endpoint (free, no auth required).
 *  Layer 3 — Precision Filter: strict validation pipeline that rejects
 *             common words, ambiguous matches, and low-quality descriptions.
 *             Only proper named entities (brands, people, places, products)
 *             pass through — never generic nouns or concepts.
 *
 * Design principles:
 *  - Precision over recall: a false positive destroys user trust; a missed
 *    entity is invisible. Aravind Srinivas principle: "show nothing rather
 *    than show something wrong."
 *  - Fail-safe: if Wikidata is unreachable, returns empty confirmed list
 *  - Deduplication: Set-based dedup before API calls to minimise requests
 *  - Batch efficiency: single Promise.all for parallel Wikidata lookups
 *  - Timeout: 4s hard timeout per Wikidata request to never block an audit
 *  - Language-aware: passes detected page language to Wikidata for better matching
 *  - Rate-limit friendly: max 20 candidates sent to Wikidata per audit
 */

export interface WikiDataEntity {
  /** Surface form as found in the text */
  surfaceForm: string;
  /** Wikidata QID (e.g. "Q95") — null if not confirmed by Wikidata */
  qid: string | null;
  /** Human-readable label from Wikidata */
  label: string | null;
  /** Short description from Wikidata */
  description: string | null;
  /** Entity type inferred from Wikidata description */
  entityType: "person" | "organization" | "product" | "place" | "concept" | "unknown";
  /** Direct link to Wikidata entity page */
  wikidataUrl: string | null;
  /** Whether this entity was confirmed by Wikidata (vs regex-only) */
  confirmed: boolean;
}

export interface EntityRecognitionResult {
  /** All confirmed WikiData entities (mapped to Knowledge Graph) */
  confirmedEntities: WikiDataEntity[];
  /** Regex-only candidates that didn't match Wikidata */
  unconfirmedEntities: WikiDataEntity[];
  /** Total unique entity signals (confirmed + unconfirmed + numeric facts) */
  totalEntitySignals: number;
  /** Number of entities confirmed in Wikidata Knowledge Graph */
  knowledgeGraphAnchors: number;
  /** Numeric facts count (statistics, measurements, percentages) */
  numericFactsCount: number;
  /** Whether Wikidata lookup succeeded */
  wikidataAvailable: boolean;
}

// ─── Wikidata API ─────────────────────────────────────────────────────────────

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIDATA_TIMEOUT_MS = 4000;
const MAX_CANDIDATES_TO_LOOKUP = 20;

/**
 * Infer entity type from a Wikidata description string.
 * Uses keyword matching on the description — fast and reliable for common types.
 * Returns null for descriptions that indicate a generic concept/common noun —
 * these should be REJECTED as false positives.
 */
function inferEntityType(description: string | null): WikiDataEntity["entityType"] | null {
  if (!description) return null; // No description = reject (ambiguous)
  const d = description.toLowerCase();

  // ── REJECT GATE: descriptions that indicate generic concepts, not named entities ──
  // These are WikiData entries for common nouns, abstract concepts, or disambiguation pages.
  // They should NEVER appear as "confirmed entities" in a page audit.
  const REJECT_PATTERNS = [
    // Generic financial/legal/administrative concepts
    /\b(financial product|financial service|banking product|payment method|credit product|loan type|type of loan|type of credit|form of credit|form of payment|financial instrument|debt instrument|banking service|insurance product)\b/,
    // Generic Polish administrative/legal terms
    /\b(rodzaj|typ|forma|kategoria|pojęcie|termin|definicja|klasyfikacja)\b/,
    // Disambiguation pages
    /\b(disambiguation|ujednoznacznienie|może odnosić się|może dotyczyć)\b/,
    // Generic "list of" entries
    /\b(list of|lista|wykaz|zbiór|kategoria)\b/,
    // Generic concepts without proper noun markers
    /^(the |a |an )?(act|law|regulation|rule|policy|system|process|method|practice|concept|term|word|phrase|expression)\b/,
    // Serial/TV show characters (e.g. "Pozostałe postacie serialu")
    /\b(serial|sitcom|television series|tv series|film|movie|book|novel|song|album|character|postać|bohater)\b/,
    // Generic nouns that happen to have WikiData entries
    /^(account|card|loan|credit|debit|payment|transfer|deposit|withdrawal|interest|fee|tax|invoice|receipt|bill|contract|agreement|policy|plan|scheme|program|project|initiative|campaign|event|conference|meeting|session)\b/,
  ];

  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(d)) return null; // Reject
  }

  // ── ACCEPT GATE: only accept descriptions that clearly indicate a named entity ──
  if (/\b(person|politician|actor|actress|musician|author|scientist|athlete|ceo|founder|director|journalist|researcher|philosopher|artist|writer|poet|singer|player|coach|manager|president|minister|general|admiral|doctor|professor|engineer|designer|entrepreneur|businessperson|businessman|businesswoman|osoba|polityk|aktor|muzyk|pisarz|naukowiec|sportowiec|prezes|założyciel|reżyser|dziennikarz)\b/.test(d)) return "person";

  if (/\b(company|corporation|organization|organisation|institution|university|school|government|agency|foundation|association|group|team|club|party|ministry|department|bureau|authority|council|committee|bank|firm|enterprise|startup|brand|manufacturer|retailer|publisher|broadcaster|network|airline|hotel|chain|conglomerate|firma|spółka|przedsiębiorstwo|korporacja|instytucja|uczelnia|stowarzyszenie|fundacja|agencja|urząd|ministerstwo|bank|marka)\b/.test(d)) return "organization";

  if (/\b(product|software|application|app|platform|tool|service|device|gadget|system|framework|library|programming language|database|website|search engine|social network|operating system|video game|vehicle|drug|medication|clothing brand|product line|produkt|oprogramowanie|aplikacja|platforma|narzędzie|urządzenie|system operacyjny|gra wideo|marka produktu)\b/.test(d)) return "product";

  if (/\b(city|town|village|country|nation|state|province|region|district|county|municipality|island|mountain|river|lake|ocean|sea|continent|territory|capital|suburb|neighborhood|borough|commune|prefecture|miasto|wieś|kraj|państwo|województwo|powiat|gmina|dzielnica|wyspa|góra|rzeka|jezioro|ocean|morze|kontynent|stolica)\b/.test(d)) return "place";

  // Concepts only if they are clearly named/branded concepts (not generic nouns)
  if (/\b(named concept|scientific concept|mathematical concept|programming concept|named algorithm|named theory|named method|named technique|named phenomenon|named movement|named period|named award|named prize|named standard|named protocol)\b/.test(d)) return "concept";

  // If description exists but doesn't match any known type → reject (too ambiguous)
  return null;
}

/**
 * Validate that a WikiData hit is a genuine named entity and not a common noun.
 *
 * Precision rules (Aravind principle: show nothing rather than show something wrong):
 * 1. Label must closely match the candidate (no fuzzy substring matching for single words)
 * 2. Description must exist and pass the entity type gate (not a generic concept)
 * 3. Single-word candidates require EXACT label match (case-insensitive)
 * 4. Multi-word candidates require that the label shares significant overlap
 * 5. The candidate must not be in the Polish common-noun blocklist
 */
function validateWikidataHit(
  candidate: string,
  hit: { qid: string; label: string; description: string }
): { valid: boolean; entityType: WikiDataEntity["entityType"] } {
  const hitLabel = (hit.label ?? "").toLowerCase().trim();
  const candidateLower = candidate.toLowerCase().trim();
  const words = candidate.split(/\s+/);

  // ── Rule 1: Label match strictness ──
  if (words.length === 1) {
    // Single-word: EXACT match only (case-insensitive)
    // "Karty" → hitLabel "karty" → exact match BUT will be rejected by entity type gate
    if (hitLabel !== candidateLower) return { valid: false, entityType: "unknown" };
  } else {
    // Multi-word: require substantial overlap
    // Accept: exact, label starts with candidate, candidate starts with label
    // Reject: only substring match (too loose)
    const exactMatch = hitLabel === candidateLower;
    const labelStartsWithCandidate = hitLabel.startsWith(candidateLower);
    const candidateStartsWithLabel = candidateLower.startsWith(hitLabel);
    // For multi-word, also allow if label contains the full candidate as a phrase
    const labelContainsCandidate = hitLabel.includes(candidateLower);

    if (!exactMatch && !labelStartsWithCandidate && !candidateStartsWithLabel && !labelContainsCandidate) {
      return { valid: false, entityType: "unknown" };
    }
  }

  // ── Rule 2: Entity type gate (rejects generic concepts/nouns) ──
  const entityType = inferEntityType(hit.description);
  if (entityType === null) {
    // Description indicates a generic concept or common noun — reject
    return { valid: false, entityType: "unknown" };
  }

  // ── Rule 3: Polish common noun blocklist ──
  // These words appear capitalised in Polish text (mid-sentence, after colon, etc.)
  // but are NOT named entities. WikiData has entries for them as generic concepts.
  if (POLISH_COMMON_NOUN_BLOCKLIST.has(candidateLower)) {
    return { valid: false, entityType: "unknown" };
  }

  // ── Rule 4: Minimum description quality ──
  // Description must be at least 10 chars and not just repeat the label
  if (!hit.description || hit.description.length < 10) {
    return { valid: false, entityType: "unknown" };
  }
  if (hit.description.toLowerCase().trim() === hitLabel) {
    return { valid: false, entityType: "unknown" };
  }

  return { valid: true, entityType };
}

/**
 * Polish common nouns that appear capitalised in text but are NOT named entities.
 * WikiData has entries for these as generic concepts — we must block them explicitly.
 *
 * Includes: financial terms, legal terms, administrative terms, product categories,
 * common verbs/nouns used as headings, UI navigation labels.
 */
const POLISH_COMMON_NOUN_BLOCKLIST = new Set([
  // Financial / banking
  "karta", "karty", "kartę", "kartą",
  "konto", "konta", "koncie", "kontem",
  "kredyt", "kredyty", "kredytu", "kredytem",
  "pożyczka", "pożyczki", "pożyczkę", "pożyczką",
  "lokata", "lokaty", "lokatę", "lokatą",
  "przelew", "przelewy", "przelewu", "przelewem",
  "płatność", "płatności", "płatnością",
  "faktura", "faktury", "fakturę", "fakturą",
  "rachunek", "rachunki", "rachunku", "rachunkiem",
  "ubezpieczenie", "ubezpieczenia", "ubezpieczeniu",
  "inwestycja", "inwestycje", "inwestycji",
  "oszczędności", "oszczędność",
  "oprocentowanie", "oprocentowania",
  "prowizja", "prowizje", "prowizji",
  "hipoteka", "hipoteki", "hipotekę",
  "leasing", "leasingu", "leasingiem",
  // E-commerce / product categories
  "produkt", "produkty", "produktu", "produktem",
  "kategoria", "kategorie", "kategorii",
  "kolekcja", "kolekcje", "kolekcji",
  "oferta", "oferty", "ofertę", "ofertą",
  "promocja", "promocje", "promocji",
  "wyprzedaż", "wyprzedaże", "wyprzedaży",
  "rabat", "rabaty", "rabatu", "rabatem",
  "cena", "ceny", "cenę", "ceną",
  "dostawa", "dostawy", "dostawę", "dostawą",
  "zwrot", "zwroty", "zwrotu", "zwrotem",
  "zamówienie", "zamówienia", "zamówieniu",
  "koszyk", "koszyki", "koszyka", "koszykiem",
  "sklep", "sklepy", "sklepu", "sklepem",
  "sprzedaż", "sprzedaży",
  "zakup", "zakupy", "zakupu", "zakupem",
  // Navigation / UI labels
  "strona", "strony", "stronę", "stroną",
  "menu", "nawigacja", "nawigacji",
  "kontakt", "kontaktu", "kontaktem",
  "regulamin", "regulaminu", "regulaminem",
  "polityka", "polityki", "politykę",
  "pomoc", "pomocy",
  "faq", "pytania", "pytanie",
  "blog", "bloga", "blogiem",
  "artykuł", "artykuły", "artykułu",
  "poradnik", "poradniki", "poradnika",
  // Generic verbs / action words used as headings
  "polecaj", "polecamy", "polecane",
  "sprawdź", "sprawdzamy", "sprawdzenie",
  "zobacz", "zobaczysz", "zobaczyć",
  "dowiedz", "dowiedz się", "dowiedzieć",
  "kup", "kupuj", "kupujesz", "kupowanie",
  "wybierz", "wybieramy", "wybrać",
  "porównaj", "porównanie", "porównania",
  "oblicz", "obliczenie", "obliczenia",
  "zarejestruj", "rejestracja", "rejestracji",
  "zaloguj", "logowanie", "logowania",
  // Common adjectives used as headings
  "nowy", "nowe", "nowa", "nowych",
  "najlepszy", "najlepsze", "najlepsza",
  "tani", "tanie", "tania", "tanich",
  "drogi", "drogie", "droga", "drogich",
  "popularny", "popularne", "popularna",
  "darmowy", "darmowe", "darmowa",
  "szybki", "szybkie", "szybka",
  // Generic content words
  "informacje", "informacja", "informacji",
  "szczegóły", "szczegół", "szczegółu",
  "opis", "opisu", "opisem",
  "wyniki", "wynik", "wyniku",
  "dane", "danych",
  "warunki", "warunek", "warunku",
  "zasady", "zasada", "zasadzie",
  "usługa", "usługi", "usługę", "usługą",
  "firma", "firmy", "firmę", "firmą",
  "pozostałe", "pozostały", "pozostała",
  "inne", "inny", "inna",
  "więcej", "mniej",
  "wszystkie", "wszystko", "wszystkich",
  // English common words that appear in Polish pages
  "home", "about", "contact", "services", "products", "blog", "news",
  "login", "register", "search", "cart", "checkout", "account",
  "privacy", "terms", "cookies", "settings", "profile",
]);

/**
 * Look up a single entity candidate in Wikidata.
 * Returns null if not found, on timeout/error, or if the hit fails precision validation.
 */
async function lookupWikidata(
  candidate: string,
  language: string
): Promise<{ qid: string; label: string; description: string; entityType: WikiDataEntity["entityType"] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      action: "wbsearchentities",
      search: candidate,
      language,
      uselang: language,
      format: "json",
      limit: "3", // Get top 3 results to allow disambiguation
      type: "item",
    });

    const res = await fetch(`${WIKIDATA_API}?${params.toString()}`, {
      headers: {
        "User-Agent": "GEO-Auditor/1.0 (https://geoauditor.app; audit@geoauditor.app)",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      search?: Array<{ id: string; label?: string; description?: string; match?: { type: string } }>;
    };

    if (!data.search || data.search.length === 0) return null;

    // Try each result in order — accept the FIRST one that passes precision validation
    for (const hit of data.search) {
      const hitData = {
        qid: hit.id,
        label: hit.label ?? candidate,
        description: hit.description ?? "",
      };

      const validation = validateWikidataHit(candidate, hitData);
      if (validation.valid) {
        return { ...hitData, entityType: validation.entityType };
      }
    }

    // No result passed validation
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Layer 1: Regex NER ───────────────────────────────────────────────────────

/**
 * Extract named entity candidates from text using linguistic patterns.
 * Returns a deduplicated list of candidate strings, sorted by frequency.
 *
 * Precision-first: only extracts candidates that have a reasonable chance
 * of being genuine named entities. Single capitalised words are only included
 * if they appear multiple times (frequency ≥ 2) — this filters out
 * sentence-starting words which are capitalised by grammar, not by being proper nouns.
 */
function extractCandidates(text: string): string[] {
  const candidateFreq = new Map<string, number>();

  const addCandidate = (raw: string) => {
    const c = raw.trim().replace(/\s+/g, " ");
    if (c.length < 2) return;
    if (/^\d+$/.test(c)) return;
    if (STOP_WORDS.has(c.toLowerCase())) return;
    if (POLISH_COMMON_NOUN_BLOCKLIST.has(c.toLowerCase())) return;
    candidateFreq.set(c, (candidateFreq.get(c) ?? 0) + 1);
  };

  // Pattern 1: Multi-word proper nouns (e.g. "Google Search Console", "Jan Kowalski")
  // Require at least 2 capitalised words — strong signal of a named entity
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+(?:\s+[A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+){1,4})\b/g))
    .forEach(m => addCandidate(m[1]));

  // Pattern 2: Single capitalised words
  // No lookbehind filtering here — we capture ALL capitalised words and rely on:
  //   (a) STOP_WORDS + BLOCKLIST to filter common nouns
  //   (b) freq>=2 filter below to eliminate sentence-starting common nouns
  // This ensures brands like "Ahrefs" that appear at line start are captured.
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g))
    .forEach(m => addCandidate(m[1]));

  // Pattern 3: Known acronyms / tech brands (2-6 uppercase letters)
  Array.from(text.matchAll(/\b([A-Z]{2,6})\b/g))
    .forEach(m => { if (!COMMON_ACRONYM_STOP.has(m[1])) addCandidate(m[1]); });

  // Pattern 4: Company name patterns with legal suffixes
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń\s]+(?:Inc\.|Ltd\.|GmbH|S\.A\.|sp\.\s*z\s*o\.o\.|LLC|Corp\.|Co\.))\b/g))
    .forEach(m => addCandidate(m[1].trim()));

  // ── Precision filter: single-word candidates must appear ≥2 times ──
  // A word that appears only once mid-sentence is likely a sentence-starting common noun.
  // A proper noun (brand, person, place) typically appears multiple times in a page.
  const filtered = new Map<string, number>();
  candidateFreq.forEach((freq, candidate) => {
    const isMultiWord = candidate.split(/\s+/).length > 1;
    const isAcronym = /^[A-Z]{2,6}$/.test(candidate);
    const hasLegalSuffix = /(?:Inc\.|Ltd\.|GmbH|S\.A\.|sp\. z o\.o\.|LLC|Corp\.|Co\.)$/.test(candidate);
    if (isMultiWord || isAcronym || hasLegalSuffix) {
      filtered.set(candidate, freq);
    } else if (freq >= 2) {
      filtered.set(candidate, freq);
    }
    // Single-word appearing only once: DISCARD
  });
  const filteredArr: Array<[string, number]> = [];
  filtered.forEach((freq, candidate) => filteredArr.push([candidate, freq]));
  return filteredArr
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

// Common words that appear capitalised but are NOT named entities
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "this", "that", "these", "those", "it", "its", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need", "dare",
  "i", "we", "you", "he", "she", "they", "me", "us", "him", "her", "them",
  "my", "our", "your", "his", "their", "its", "mine", "ours", "yours",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "as", "until", "while", "although", "though", "since",
  // Polish stop words
  "się", "nie", "tak", "jak", "ale", "czy", "że", "co", "po", "na", "do",
  "ze", "za", "przy", "pod", "nad", "przed", "między", "przez", "bez",
  "już", "też", "tylko", "jeszcze", "więc", "oraz", "albo", "ani",
  "który", "która", "które", "tego", "tej", "temu", "tym", "ich", "im",
  "jego", "jej", "nam", "nas", "was", "wam", "sobie", "siebie",
  // Common content words that appear capitalised
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
]);

// Acronyms that are common English words or generic metrics (not named entities)
const COMMON_ACRONYM_STOP = new Set([
  "A", "I", "OK", "NO", "YES", "THE", "AND", "OR", "BUT", "FOR", "NOT",
  "ARE", "WAS", "IS", "BE", "DO", "DID", "HAS", "HAD", "CAN", "MAY",
  "TO", "IN", "ON", "AT", "OF", "BY", "UP", "AS", "IF", "SO", "IT",
  "US", "WE", "HE", "SHE", "MY", "OUR", "HIS", "HER",
  "NEW", "OLD", "BIG", "ALL", "ANY", "ITS", "OWN", "HOW", "WHY",
  "WHAT", "WHO", "WHEN", "WHERE", "WHICH",
  // Generic marketing/analytics metrics — not named entities
  "CPM", "CPC", "CTR", "CPA", "CPL", "CPV", "CPS", "ROI", "ROAS", "AOV",
  "KPI", "OKR", "SLA", "NPS", "MRR", "ARR", "LTV", "CAC", "GMV",
  // Generic financial terms
  "BIK", "PKB", "NBP", "GUS", "ZUS", "NFZ", "VAT", "PIT", "CIT",
  // Generic tech/web terms
  "HTTP", "HTTPS", "HTML", "CSS", "PHP", "SQL", "XML", "JSON", "PDF",
  "URL", "URI", "API", "SDK", "CDN", "DNS", "SSL", "TLS", "IP",
  // Generic content/media terms
  "FAQ", "TOS", "GDPR", "RODO", "UX", "UI", "CMS", "CRM", "ERP",
]);

// ─── Layer 3: Numeric Facts ───────────────────────────────────────────────────

function countNumericFacts(text: string): number {
  const patterns = [
    /\b\d+(?:[.,]\d+)?\s*%/g,                        // percentages
    /\b\d+(?:[.,]\d+)?\s*(?:zł|PLN|USD|EUR|GBP)\b/g, // currencies
    /\b\d+(?:[.,]\d+)?\s*(?:kg|km|m²|m³|ms|s|h|GB|TB|MB)\b/g, // measurements
    /\b\d{1,3}(?:[.,]\d{3})+\b/g,                    // large numbers (1,000+)
    /\b\d+\s*(?:million|billion|mln|mld|tys\.?)\b/gi, // scale words
    /\b(?:Q[1-4]|H[12])\s*\d{4}\b/g,                 // quarters/halves
    /\b\d{4}\s*(?:rok|year|r\.)\b/gi,                 // years in context
  ];

  const matches = new Set<string>();
  for (const pattern of patterns) {
    Array.from(text.matchAll(pattern)).forEach(m => matches.add(m[0].trim()));
  }
  return matches.size;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Perform full entity recognition on a text body.
 *
 * @param text          Plain text content of the page (noise-stripped)
 * @param language      ISO 639-1 language code for Wikidata lookup (e.g. "pl", "en")
 * @param skipWikidata  If true, skip Wikidata API calls (for testing / offline)
 */
export async function recognizeEntities(
  text: string,
  language = "en",
  skipWikidata = false
): Promise<EntityRecognitionResult> {
  const numericFactsCount = countNumericFacts(text);
  const candidates = extractCandidates(text);

  // Cap at MAX_CANDIDATES_TO_LOOKUP — take the most frequent ones
  const topCandidates = candidates.slice(0, MAX_CANDIDATES_TO_LOOKUP);

  const confirmedEntities: WikiDataEntity[] = [];
  const unconfirmedEntities: WikiDataEntity[] = [];
  let wikidataAvailable = false;

  if (skipWikidata || topCandidates.length === 0) {
    // Fallback: treat all regex candidates as unconfirmed
    for (const c of topCandidates) {
      unconfirmedEntities.push({
        surfaceForm: c,
        qid: null,
        label: null,
        description: null,
        entityType: "unknown",
        wikidataUrl: null,
        confirmed: false,
      });
    }
  } else {
    // Parallel Wikidata lookups — all at once for speed
    const lookupResults = await Promise.all(
      topCandidates.map(c => lookupWikidata(c, language))
    );

    wikidataAvailable = lookupResults.some(r => r !== null);

    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i];
      const hit = lookupResults[i];

      if (hit) {
        confirmedEntities.push({
          surfaceForm: candidate,
          qid: hit.qid,
          label: hit.label,
          description: hit.description,
          entityType: hit.entityType,
          wikidataUrl: `https://www.wikidata.org/wiki/${hit.qid}`,
          confirmed: true,
        });
      } else {
        unconfirmedEntities.push({
          surfaceForm: candidate,
          qid: null,
          label: null,
          description: null,
          entityType: "unknown",
          wikidataUrl: null,
          confirmed: false,
        });
      }
    }
  }

  const totalEntitySignals =
    confirmedEntities.length + unconfirmedEntities.length + numericFactsCount;

  return {
    confirmedEntities,
    unconfirmedEntities,
    totalEntitySignals,
    knowledgeGraphAnchors: confirmedEntities.length,
    numericFactsCount,
    wikidataAvailable,
  };
}
