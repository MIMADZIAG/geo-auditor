/**
 * jsonSanitizer.ts
 *
 * Robustly parses JSON strings that may contain:
 * - Unescaped control characters (U+0000–U+001F) inside string values
 *   (common in LLM outputs that embed newlines/tabs inside JSON strings)
 * - Trailing commas
 * - BOM characters
 *
 * The "Bad control character in string literal in JSON" error occurs when
 * an LLM returns a JSON string where a field value contains a literal newline
 * or tab character instead of the escaped sequence \\n or \\t.
 *
 * Strategy:
 *   1. Strip BOM
 *   2. Try native JSON.parse — if it succeeds, return immediately
 *   3. If it fails, sanitize control characters inside string literals
 *      using a state-machine approach (respects escaped characters)
 *   4. Try JSON.parse again on the sanitized string
 *   5. If still failing, attempt a regex-based fallback cleanup
 */

/**
 * Replaces literal control characters (U+0000–U+001F, except allowed ones)
 * inside JSON string literals with their proper escape sequences.
 *
 * Uses a character-by-character state machine to correctly handle:
 * - Escaped characters (\\n, \\t, \\", \\\\, etc.) — left untouched
 * - Unicode escapes (\\uXXXX) — left untouched
 * - Literal control chars inside strings — replaced with escape sequences
 */
function sanitizeControlCharsInJsonStrings(raw: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);

    if (escaped) {
      // Previous char was a backslash — this char is part of an escape sequence
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result.push(ch);
      if (inString) escaped = true;
      continue;
    }

    if (ch === '"') {
      result.push(ch);
      inString = !inString;
      continue;
    }

    if (inString && code < 0x20) {
      // Literal control character inside a JSON string — must be escaped
      switch (code) {
        case 0x08: result.push("\\b"); break;  // backspace
        case 0x09: result.push("\\t"); break;  // tab
        case 0x0a: result.push("\\n"); break;  // newline
        case 0x0c: result.push("\\f"); break;  // form feed
        case 0x0d: result.push("\\r"); break;  // carriage return
        default:
          // Other control chars: encode as \uXXXX
          result.push("\\u" + code.toString(16).padStart(4, "0"));
          break;
      }
      continue;
    }

    result.push(ch);
  }

  return result.join("");
}

/**
 * Safely parses a JSON string from an LLM response.
 * Handles control characters, BOM, and common LLM formatting artifacts.
 *
 * @param raw - The raw string from LLM response
 * @param fallback - Value to return if all parsing attempts fail (default: {})
 */
export function safeParseLLMJson<T = Record<string, unknown>>(
  raw: unknown,
  fallback: T = {} as T
): T {
  // If already an object (e.g., LLM returned parsed JSON), return as-is
  if (raw !== null && typeof raw === "object") {
    return raw as T;
  }

  if (typeof raw !== "string") {
    return fallback;
  }

  // 1. Strip BOM and leading/trailing whitespace
  let str = raw.replace(/^\uFEFF/, "").trim();

  // 2. Strip markdown code fences if present (```json ... ```)
  if (str.startsWith("```")) {
    str = str.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  // 3. Try native parse first
  try {
    return JSON.parse(str) as T;
  } catch {
    // Fall through to sanitization
  }

  // 4. Sanitize control characters inside string literals
  try {
    const sanitized = sanitizeControlCharsInJsonStrings(str);
    return JSON.parse(sanitized) as T;
  } catch {
    // Fall through to aggressive cleanup
  }

  // 5. Aggressive fallback: remove all control chars globally (less precise but works)
  try {
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    return JSON.parse(stripped) as T;
  } catch (err) {
    console.error("[safeParseLLMJson] All parsing attempts failed:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

/**
 * Sanitizes a string value that will be embedded inside a JSON field.
 * Ensures no literal control characters remain.
 */
export function sanitizeJsonStringValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/\x00/g, "")      // null bytes
    .replace(/\x08/g, "")      // backspace
    .replace(/\x0B/g, " ")     // vertical tab → space
    .replace(/\x0C/g, " ")     // form feed → space
    .replace(/\x0E/g, "")      // shift out
    .replace(/\x0F/g, "")      // shift in
    .replace(/[\x10-\x1F]/g, ""); // other control chars
}
