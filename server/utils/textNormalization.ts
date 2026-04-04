/**
 * textNormalization.ts
 *
 * NIEZMIENIALNĄ ZASADA (Polish language rule):
 * W języku polskim słowa po znakach interpunkcyjnych takich jak:
 *   : (dwukropek), - (dywiz/myślnik), – (półpauza), — (pauza),
 *   / (ukośnik), | (kreska pionowa), • (punktor)
 * ZAWSZE zaczynają się od małej litery.
 *
 * ZASADA NAGŁÓWKÓW (Polish language rule):
 * W języku polskim nagłówki/śródtytuły pisane są sentence case:
 *   - Tylko pierwsze słowo z dużej litery
 *   - Nazwy własne (imiona, nazwiska, nazwy firm, marki, miejsca) z dużej litery
 *   - Skróty (AI, SEO, FAQ, HTML, GEO, CTA) zachowują wielkie litery
 *   - ŻADNE inne słowo nie zaczyna się z dużej litery
 * Reguła NIE obowiązuje dla języka angielskiego (title case jest poprawny).
 *
 * Wyjątki (nie normalizujemy):
 *   - Skróty wieloliterowe (AI, SEO, FAQ, HTML, URL, E-E-A-T, GEO, CTA)
 *   - Nagłówki Markdown (# ## ###) — normalizowane osobno przez normalizeMarkdownHeadings
 *   - Bloki kodu (``` ... ```)
 *   - Linie JSON-LD ({ })
 */

// Polish uppercase letters (including diacritics)
const PL_UPPER = "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ";
const PL_LOWER = "aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż";

// Punctuation signs after which Polish words should start with lowercase
// Using explicit unicode escapes for en-dash (U+2013) and em-dash (U+2014)
const PUNCT_CHARS = `[:\\-\u2013\u2014/|\u2022]`;

// Regex: punctuation sign, optional spaces, then an uppercase letter followed by lowercase letters
// We capture: (punct)(spaces)(uppercase_letter)(rest_of_word)
// rest_of_word includes Polish lowercase diacritics: ą ć ę ł ń ó ś ź ż
const PL_LOWERCASE_AFTER = new RegExp(
  `(${PUNCT_CHARS})(\\s+)([${PL_UPPER}])([a-z\u00e0-\u017e\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]*)`,
  "g"
);

/**
 * Checks if the matched word (capital + rest) is an acronym that should be preserved.
 * Acronyms: 2+ uppercase letters, optionally separated by hyphens (AI, SEO, E-E-A-T).
 */
function isAcronym(capital: string, rest: string): boolean {
  const word = capital + rest;
  // Pure uppercase word (no lowercase letters) — e.g. "SEO", "AI", "FAQ", "HTML"
  if (rest.length === 0) return true; // single capital letter followed by space/punct = likely acronym
  // Word has no lowercase letters at all → acronym
  if (!/[a-z\u00e0-\u017e]/.test(word)) return true;
  // Hyphenated acronym like E-E-A-T
  if (/^[A-Z](-[A-Z])+$/.test(word)) return true;
  return false;
}

/**
 * Lowercases the first character of a string, handling Polish diacritics.
 */
function lcFirst(char: string): string {
  const idx = PL_UPPER.indexOf(char);
  if (idx !== -1) return PL_LOWER[idx];
  return char.toLowerCase();
}

/**
 * Uppercases the first character of a string, handling Polish diacritics.
 */
function ucFirst(char: string): string {
  const idx = PL_LOWER.indexOf(char);
  if (idx !== -1) return PL_UPPER[idx];
  return char.toUpperCase();
}

/**
 * Detects if the text is primarily Polish.
 */
export function isPolishText(text: string): boolean {
  // Polish diacritics
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return true;
  // Common Polish function words (only unambiguous ones — avoid 'to', 'ta', 'a', 'i', 'w'
  // which also appear frequently in English text)
  if (/\b(jest|są|się|że|lub|oraz|przez|przy|jako|więc|jednak|tylko|już|też|tego|tej|ten|ich|jej|jego|nam|nas|pani|czy)\b/i.test(text)) return true;
  return false;
}

/**
 * Checks if a word is a proper noun / acronym that should keep its capital letter
 * in a Polish heading (sentence case context).
 *
 * Preserved:
 *   - Pure uppercase acronyms: AI, SEO, FAQ, HTML, GEO, CTA, URL, API, E-E-A-T
 *   - Mixed-case brand names / CamelCase: ChatGPT, WordPress, WooCommerce
 *     (must have uppercase letter at position ≥ 2, not just position 1)
 *
 * NOT preserved (should be lowercased):
 *   - Regular Polish words that happen to start with uppercase: Szybki, Tani, Dobry
 *   - Single capital letters that are Polish conjunctions: I (=and), A (=and/but), W (=in)
 *   - Words like "Search", "Best" — start with uppercase but are regular words
 */
function isProperNounOrAcronym(word: string): boolean {
  if (!word) return false;

  // Pure uppercase (all caps, 2+ chars): SEO, AI, FAQ, HTML, GEO, CTA, URL, API
  // Also handles hyphenated acronyms: E-E-A-T
  if (/^[A-ZĄĆĘŁŃÓŚŹŻ]{2,}(-[A-ZĄĆĘŁŃÓŚŹŻ]+)*$/.test(word)) return true;

  // CamelCase brand names: ChatGPT, WordPress, WooCommerce, iPhone
  // Requirement: must have an uppercase letter at position >= 2 (not just position 0 or 1)
  // This prevents treating "Search", "Best", "The" as proper nouns
  if (word.length >= 3 && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word.slice(2))) return true;

  // Starts with lowercase (like iPhone, eCommerce)
  if (word.length >= 2 && /^[a-z]/.test(word) && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word.slice(1))) return true;

  return false;
}

/**
 * Applies Polish sentence case to a heading string.
 *
 * Rules:
 *   1. First word: always capitalised (already is, or we ensure it)
 *   2. Subsequent words: lowercased UNLESS they are proper nouns or acronyms
 *   3. Acronyms (ALL_CAPS) are preserved
 *   4. CamelCase / mixed-case brand names are preserved
 *
 * Examples:
 *   "Jak Wybrać Najlepszy Produkt" → "Jak wybrać najlepszy produkt"
 *   "Optymalizacja Pod AI Search" → "Optymalizacja pod AI Search"
 *   "Zalety Kurtki Zimowej — Porównanie" → "Zalety kurtki zimowej — porównanie"
 *   "Zobacz Obrazy Juliusza Kossaka" → "Zobacz obrazy Juliusza Kossaka" (proper nouns preserved)
 */
export function applyPolishSentenceCase(heading: string): string {
  if (!heading.trim()) return heading;

  // Split preserving whitespace tokens between words
  // We tokenize by word boundaries, keeping punctuation attached to words
  const tokens = heading.split(/(\s+)/);

  let wordIndex = 0; // counts actual word tokens (not whitespace)

  return tokens.map((token) => {
    // Whitespace token — pass through unchanged
    if (/^\s+$/.test(token)) return token;

    wordIndex++;

    // First word: always keep capitalised (ensure first char is uppercase)
    if (wordIndex === 1) {
      if (token.length === 0) return token;
      return ucFirst(token[0]) + token.slice(1);
    }

    // Subsequent words: lowercase unless proper noun / acronym
    if (isProperNounOrAcronym(token)) return token;

    // Regular word — lowercase the first character
    if (token.length === 0) return token;
    const firstChar = token[0];
    // Only lowercase if it's actually an uppercase letter
    const isUpper = PL_UPPER.includes(firstChar) || (firstChar >= "A" && firstChar <= "Z");
    if (!isUpper) return token;

    return lcFirst(firstChar) + token.slice(1);
  }).join("");
}

/**
 * Detects if a line of plain text (non-Markdown) is a heading/section title.
 *
 * Heuristics for a plain-text heading (as generated by the rewrite LLM):
 *   - Short line: ≤ 120 characters
 *   - Does NOT end with a period, comma, semicolon, or colon (those are body text)
 *   - Does NOT start with a list marker (- , • , * , 1. , 2. )
 *   - Is not a URL
 *   - Is not a JSON-LD line
 *   - Contains at least 2 words
 *   - Has at least 2 words starting with uppercase (title-case pattern) OR
 *     is surrounded by blank lines (standalone line in the text)
 *
 * Note: This is intentionally conservative — we only normalise lines that are
 * clearly headings to avoid accidentally lowercasing proper nouns in body text.
 */
function isPlainTextHeading(line: string, prevLine: string, nextLine: string): boolean {
  const trimmed = line.trim();

  // Too long to be a heading
  if (trimmed.length > 120) return false;

  // Too short
  if (trimmed.length < 5) return false;

  // Ends with sentence-ending punctuation → body text
  if (/[.,;]$/.test(trimmed)) return false;

  // Ends with question mark or exclamation — could be a heading question
  // Allow these through

  // Starts with list marker
  if (/^[-•*]\s/.test(trimmed)) return false;
  if (/^\d+[.)]\s/.test(trimmed)) return false;

  // URL
  if (/^https?:\/\//.test(trimmed)) return false;

  // JSON-LD line
  if (/^\s*[{}\[\]]/.test(trimmed)) return false;
  if (/^"[\w@]+"\s*:/.test(trimmed)) return false;

  // Must have at least 2 words
  const words = trimmed.split(/\s+/);
  if (words.length < 2) return false;

  // Count words starting with uppercase (excluding first word which is always uppercase)
  const uppercaseWordCount = words.slice(1).filter(w => {
    if (!w) return false;
    const c = w[0];
    return (c >= "A" && c <= "Z") || PL_UPPER.includes(c);
  }).length;

  // Surrounded by blank lines (standalone paragraph = likely heading)
  const isSurroundedByBlanks = prevLine.trim() === "" && nextLine.trim() === "";

  // Strong heading signal: 2+ subsequent words capitalised (title case pattern)
  if (uppercaseWordCount >= 2) return true;

  // Moderate signal: standalone line with at least 1 subsequent uppercase word
  if (isSurroundedByBlanks && uppercaseWordCount >= 1) return true;

  return false;
}

/**
 * Normalizes Polish capitalization:
 * Words after : - – — / | • are lowercased (unless they are acronyms).
 *
 * This function is a no-op for English text.
 */
export function normalizePolishCapitalization(text: string, language?: "pl" | "en"): string {
  // Skip normalization for English
  if (language === "en") return text;

  // Auto-detect language if not specified
  if (language === undefined && !isPolishText(text)) return text;

  // Process line by line to avoid touching Markdown headings and code blocks
  const lines = text.split("\n");
  let inCodeBlock = false;

  const normalized = lines.map((line) => {
    // Toggle code block state
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    // Skip code blocks
    if (inCodeBlock) return line;

    // Skip Markdown headings (# ## ###)
    if (/^#{1,6}\s/.test(line)) return line;

    // Skip JSON-LD / code lines (contain { or })
    if (/^\s*[{}\[\]]/.test(line)) return line;

    // Apply normalization
    return line.replace(PL_LOWERCASE_AFTER, (match, punct, spaces, capital, rest) => {
      if (isAcronym(capital, rest)) {
        return match; // Preserve acronym
      }
      return `${punct}${spaces}${lcFirst(capital)}${rest}`;
    });
  });

  return normalized.join("\n");
}

/**
 * Normalizes headings in plain-text content (non-Markdown) to Polish sentence case.
 *
 * This handles the output of the Signal Rewrite LLM which writes headings as
 * plain text lines (not Markdown ## headings), often in title case.
 *
 * Also normalizes Markdown headings (## Heading) to sentence case for PL content.
 *
 * English content is returned unchanged.
 *
 * @param text - The full content string (may be multi-line)
 * @param language - "pl" | "en" | undefined (auto-detect)
 */
export function normalizePolishHeadings(text: string, language?: "pl" | "en"): string {
  // Skip normalization for English
  if (language === "en") return text;

  // Auto-detect language if not specified
  if (language === undefined && !isPolishText(text)) return text;

  const lines = text.split("\n");
  let inCodeBlock = false;

  const normalized = lines.map((line, idx) => {
    // Toggle code block state
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    // Skip code blocks
    if (inCodeBlock) return line;

    // Skip JSON-LD / code lines
    if (/^\s*[{}\[\]]/.test(line)) return line;
    if (/^"[\w@]+"\s*:/.test(line.trim())) return line;

    // ── Markdown headings (## Heading) ────────────────────────────────────────
    const markdownMatch = line.match(/^(#{1,6}\s+)(.+)$/);
    if (markdownMatch) {
      const prefix = markdownMatch[1];
      const headingText = markdownMatch[2];
      return prefix + applyPolishSentenceCase(headingText);
    }

    // ── Plain-text headings (LLM rewrite output) ──────────────────────────────
    const prevLine = idx > 0 ? lines[idx - 1] : "";
    const nextLine = idx < lines.length - 1 ? lines[idx + 1] : "";

    if (isPlainTextHeading(line, prevLine, nextLine)) {
      return applyPolishSentenceCase(line);
    }

    return line;
  });

  return normalized.join("\n");
}

/**
 * Applies BOTH heading normalisation AND punctuation capitalisation normalisation
 * to Polish content. This is the main entry point for post-processing LLM output.
 *
 * English content is returned unchanged.
 */
export function normalizePolishContent(text: string, language?: "pl" | "en"): string {
  if (language === "en") return text;
  const lang = language ?? (isPolishText(text) ? "pl" : undefined);
  if (!lang) return text;

  // Step 1: Normalize headings to sentence case
  let result = normalizePolishHeadings(text, lang);
  // Step 2: Normalize punctuation capitalization (colon, dash, etc.)
  result = normalizePolishCapitalization(result, lang);
  return result;
}

/**
 * Applies normalization to all string fields in a result object recursively.
 * Used for PageCreator results.
 */
export function normalizePageCreatorResult<T extends Record<string, unknown>>(
  result: T,
  language: "pl" | "en"
): T {
  if (language === "en") return result;

  const normalize = (val: unknown): unknown => {
    if (typeof val === "string") return normalizePolishCapitalization(val, language);
    if (Array.isArray(val)) return val.map(normalize);
    if (val !== null && typeof val === "object") {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, normalize(v)])
      );
    }
    return val;
  };

  return normalize(result) as T;
}

/**
 * Applies FULL normalization (headings + punctuation) to all string fields
 * in a result object recursively. Used for PageCreator results with heading fields.
 */
export function normalizePageCreatorResultFull<T extends Record<string, unknown>>(
  result: T,
  language: "pl" | "en"
): T {
  if (language === "en") return result;

  const normalize = (val: unknown, key?: string): unknown => {
    if (typeof val === "string") {
      // For heading fields: apply sentence case directly
      if (key && /heading|title|h1|h2|h3|nagłówek/i.test(key)) {
        return applyPolishSentenceCase(normalizePolishCapitalization(val, language));
      }
      // For content fields: apply full normalization (headings + punctuation)
      return normalizePolishContent(val, language);
    }
    if (Array.isArray(val)) return val.map(v => normalize(v));
    if (val !== null && typeof val === "object") {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, normalize(v, k)])
      );
    }
    return val;
  };

  return normalize(result) as T;
}
