/**
 * textNormalization.ts
 *
 * NIEZMIENIALNĄ ZASADA (Polish language rule):
 * W języku polskim słowa po znakach interpunkcyjnych takich jak:
 *   : (dwukropek), - (dywiz/myślnik), – (półpauza), — (pauza),
 *   / (ukośnik), | (kreska pionowa), • (punktor)
 * ZAWSZE zaczynają się od małej litery.
 *
 * Reguła NIE obowiązuje dla języka angielskiego.
 *
 * Wyjątki (nie normalizujemy):
 *   - Skróty wieloliterowe (AI, SEO, FAQ, HTML, URL, E-E-A-T, GEO, CTA)
 *   - Nagłówki Markdown (# ## ###)
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
 * Detects if the text is primarily Polish.
 */
export function isPolishText(text: string): boolean {
  // Polish diacritics
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return true;
  // Common Polish function words
  if (/\b(jest|są|nie|się|że|jak|ale|lub|oraz|przez|dla|przy|jako|więc|jednak|tylko|już|też|tego|tej|ten|ta|to|ich|jej|jego|nam|nas|pan|pani|czy)\b/i.test(text)) return true;
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
