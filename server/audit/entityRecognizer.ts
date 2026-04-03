/**
 * Entity Recognizer — WikiData-backed Named Entity Recognition
 *
 * Architecture (Hybrid, Opcja C):
 *  Layer 1 — Regex NER: extract candidate named entities from text using
 *             linguistic patterns (multi-word proper nouns, acronyms, orgs).
 *  Layer 2 — WikiData Batch API: validate top-N candidates against
 *             Wikidata's wbsearchentities endpoint (free, no auth required).
 *  Layer 3 — Knowledge Graph Enrichment: each confirmed entity gets a
 *             WikiData QID, entity type (person/org/product/place/concept),
 *             and a direct link to the Knowledge Graph node.
 *
 * Design principles:
 *  - Fail-safe: if Wikidata is unreachable, falls back to regex-only results
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
 */
function inferEntityType(description: string | null): WikiDataEntity["entityType"] {
  if (!description) return "unknown";
  const d = description.toLowerCase();

  if (/\b(person|politician|actor|actress|musician|author|scientist|athlete|ceo|founder|director|journalist|researcher|philosopher|artist|writer|poet|singer|player|coach|manager|president|minister|general|admiral|doctor|professor|engineer|designer|entrepreneur|businessperson|businessman|businesswoman)\b/.test(d)) return "person";
  if (/\b(company|corporation|organization|organisation|institution|university|school|government|agency|foundation|association|group|team|club|party|ministry|department|bureau|authority|council|committee|bank|firm|enterprise|startup|brand|manufacturer|retailer|publisher|broadcaster|network|airline|hotel|chain|conglomerate)\b/.test(d)) return "organization";
  if (/\b(product|software|application|app|platform|tool|service|device|gadget|system|framework|library|language|database|website|search engine|social network|operating system|game|vehicle|drug|medication|food|drink|clothing|brand)\b/.test(d)) return "product";
  if (/\b(city|town|village|country|nation|state|province|region|district|county|municipality|island|mountain|river|lake|ocean|sea|continent|territory|capital|suburb|neighborhood|borough|commune|prefecture)\b/.test(d)) return "place";
  if (/\b(concept|theory|method|technique|process|phenomenon|event|movement|period|era|ideology|religion|language|genre|style|discipline|field|science|art|culture|sport|award|prize|standard|protocol|algorithm|model)\b/.test(d)) return "concept";

  return "unknown";
}

/**
 * Look up a single entity candidate in Wikidata.
 * Returns null if not found or on timeout/error.
 */
async function lookupWikidata(
  candidate: string,
  language: string
): Promise<{ qid: string; label: string; description: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      action: "wbsearchentities",
      search: candidate,
      language,
      uselang: language,
      format: "json",
      limit: "1",
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

    const hit = data.search?.[0];
    if (!hit) return null;

    // Require a reasonable label match to avoid false positives
    // The search must return a result where the label closely matches our candidate
    const hitLabel = (hit.label ?? "").toLowerCase();
    const candidateLower = candidate.toLowerCase();

    // Accept if: exact match, candidate starts with label, or label starts with candidate
    const isRelevant =
      hitLabel === candidateLower ||
      hitLabel.startsWith(candidateLower) ||
      candidateLower.startsWith(hitLabel) ||
      hitLabel.includes(candidateLower) ||
      candidateLower.includes(hitLabel);

    if (!isRelevant && candidate.split(" ").length === 1) {
      // Single-word candidates need exact or very close match
      if (hitLabel !== candidateLower) return null;
    }

    return {
      qid: hit.id,
      label: hit.label ?? candidate,
      description: hit.description ?? "",
    };
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
 */
function extractCandidates(text: string): string[] {
  const candidateFreq = new Map<string, number>();

  const addCandidate = (raw: string) => {
    // Normalise: trim, collapse internal whitespace
    const c = raw.trim().replace(/\s+/g, " ");
    // Filter: skip single-char, pure numbers, common stop-words
    if (c.length < 2) return;
    if (/^\d+$/.test(c)) return;
    if (STOP_WORDS.has(c.toLowerCase())) return;
    candidateFreq.set(c, (candidateFreq.get(c) ?? 0) + 1);
  };

  // Pattern 1: Multi-word proper nouns (e.g. "Google Search Console", "Jan Kowalski")
  // Require at least 2 capitalised words to reduce noise
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+(?:\s+[A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+){1,4})\b/g))
    .forEach(m => addCandidate(m[1]));

  // Pattern 2: Single capitalised words that are likely proper nouns
  // (not at start of sentence — filter those out to reduce false positives)
  Array.from(text.matchAll(/(?<![.!?]\s)(?<!\n)\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g))
    .forEach(m => addCandidate(m[1]));

  // Pattern 3: Known acronyms / tech brands (2-6 uppercase letters)
  // Exclude common English words that happen to be uppercase
  Array.from(text.matchAll(/\b([A-Z]{2,6})\b/g))
    .forEach(m => { if (!COMMON_ACRONYM_STOP.has(m[1])) addCandidate(m[1]); });

  // Pattern 4: Company name patterns
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń\s]+(?:Inc\.|Ltd\.|GmbH|S\.A\.|sp\.\s*z\s*o\.o\.|LLC|Corp\.|Co\.))\b/g))
    .forEach(m => addCandidate(m[1].trim()));

  // Sort by frequency desc, then alphabetically for determinism
  return Array.from(candidateFreq.entries())
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
  "już", "też", "tylko", "jeszcze", "też", "więc", "oraz", "albo", "ani",
  "który", "która", "które", "tego", "tej", "temu", "tym", "ich", "im",
  "jego", "jej", "ich", "nam", "nas", "was", "wam", "sobie", "siebie",
  // Common content words that appear capitalised
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
]);

// Acronyms that are common English words (not entities)
const COMMON_ACRONYM_STOP = new Set([
  "A", "I", "OK", "NO", "YES", "THE", "AND", "OR", "BUT", "FOR", "NOT",
  "ARE", "WAS", "IS", "BE", "DO", "DID", "HAS", "HAD", "CAN", "MAY",
  "TO", "IN", "ON", "AT", "OF", "BY", "UP", "AS", "IF", "SO", "IT",
  "US", "WE", "HE", "SHE", "MY", "OUR", "HIS", "HER",
  "NEW", "OLD", "BIG", "ALL", "ANY", "ITS", "OWN", "HOW", "WHY",
  "WHAT", "WHO", "WHEN", "WHERE", "WHICH",
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
          entityType: inferEntityType(hit.description),
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
