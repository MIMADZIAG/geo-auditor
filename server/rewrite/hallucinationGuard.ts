import { safeParseLLMJson } from "../utils/jsonSanitizer";
/**
 * Hallucination Guard — post-generation validator
 *
 * Scans generated content for patterns that indicate hallucinated facts:
 *   - Fabricated expert quotes (e.g. "Dr Anna Kowalska, specjalista...")
 *   - Fake statistics not present in the original content
 *   - Invented citations, studies, or institutional references
 *
 * Two-stage approach:
 *   1. Fast regex scan — catches obvious patterns without LLM call
 *   2. LLM verification — for ambiguous cases, asks model to flag invented facts
 *
 * Returns cleaned content + a list of detected issues for logging.
 */

export interface HallucinationIssue {
  type: "fake_quote" | "fake_statistic" | "fake_institution" | "suspicious_fact";
  excerpt: string;        // the problematic text snippet
  reason: string;         // human-readable explanation
}

export interface GuardResult {
  content: string;                    // cleaned content (issues removed or flagged)
  issues: HallucinationIssue[];       // list of detected issues
  wasModified: boolean;               // true if content was changed
}

// ─── Regex patterns for obvious hallucination markers ────────────────────────

/** Matches fabricated expert quotes: "Dr/Prof/mgr Name Surname, title" */
const FAKE_EXPERT_QUOTE_PATTERNS = [
  // Polish titles
  /(?:dr|prof|mgr|lek|inż|spec)\.?\s+[A-ZŁŚŻŹ][a-złśżź]+\s+[A-ZŁŚŻŹ][a-złśżź]+\s*[,\n]/gi,
  // English titles
  /(?:Dr|Prof|MD|PhD|MSc)\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s*[,\n]/g,
  // Quote attribution patterns: "— Jan Kowalski, ekspert" or '" — Jan Kowalski"
  /["""„]\s*[^"""„]{20,300}\s*["""„]\s*[-—–]\s*[A-ZŁŚŻŹ][a-złśżź]+\s+[A-ZŁŚŻŹ][a-złśżź]+/gi,
  // "Opinia eksperta: Name Surname" pattern
  /opinia\s+eksperta\s*:\s*[A-ZŁŚŻŹ][a-złśżź]+\s+[A-ZŁŚŻŹ][a-złśżź]+/gi,
  // "Expert opinion: Name" pattern
  /expert\s+opinion\s*:\s*[A-Z][a-z]+\s+[A-Z][a-z]+/gi,
];

/** Matches fake statistics that weren't in the original */
const FAKE_STATISTIC_PATTERNS = [
  // "according to research/studies" without source
  /(?:wed\u0142ug\s+bada\u0144|badania\s+pokazuj\u0105|naukowcy\s+udowodnili|eksperci\s+twierdz\u0105|specjali\u015bci\s+zalecaj\u0105)\s+(?:że|iż)/gi,
  /(?:according\s+to\s+(?:research|studies|experts|scientists)|research\s+shows|studies\s+prove)/gi,
  // Percentages with no source context: "X% of users" type claims
  /\b(?:a\u017c\s+)?\d{1,3}%\s+(?:os\u00f3b|u\u017cytkownik\u00f3w|konsument\u00f3w|pacjent\u00f3w|dzieci|doros\u0142ych)\b/gi,
];

/**
 * Stage 1: Fast regex-based detection.
 * Returns list of issues found in the generated text.
 */
function detectWithRegex(content: string): HallucinationIssue[] {
  const issues: HallucinationIssue[] = [];

  for (const pattern of FAKE_EXPERT_QUOTE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      issues.push({
        type: "fake_quote",
        excerpt: match[0].trim().slice(0, 120),
        reason: "Detected fabricated expert quote or named attribution",
      });
    }
  }

  for (const pattern of FAKE_STATISTIC_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      issues.push({
        type: "fake_statistic",
        excerpt: match[0].trim().slice(0, 120),
        reason: "Detected unsourced statistic or unverifiable claim",
      });
    }
  }

  return issues;
}

/**
 * Stage 2: LLM-based verification for ambiguous content.
 * Asks the model to identify and flag any invented facts.
 */
async function verifyWithLLM(
  generatedContent: string,
  originalContent: string
): Promise<HallucinationIssue[]> {
  const { invokeLLM } = await import("../_core/llm");

  const result = await invokeLLM({
    model: "gpt-5.4",
    messages: [
      {
        role: "system",
        content:
          "You are a strict fact-checking AI. Your job is to compare generated content against the original source " +
          "and identify any fabricated facts, invented quotes, fake statistics, or unverifiable claims that " +
          "appear in the generated content but are NOT present in the original. " +
          "Return a JSON array of issues. If no issues found, return an empty array [].",
      },
      {
        role: "user",
        content:
          `ORIGINAL CONTENT (source of truth):\n${originalContent.slice(0, 3000)}\n\n` +
          `GENERATED CONTENT (to verify):\n${generatedContent.slice(0, 3000)}\n\n` +
          `Find any facts, quotes, statistics, expert names, or institutional references in the GENERATED CONTENT ` +
          `that are NOT present in the ORIGINAL CONTENT. ` +
          `Return JSON array: [{"type": "fake_quote"|"fake_statistic"|"fake_institution"|"suspicious_fact", "excerpt": "<snippet>", "reason": "<explanation>"}]`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 800,
  } as any);

  try {
    const raw = result.choices[0]?.message?.content ?? "{}";
    const parsed = safeParseLLMJson<{ issues?: unknown[]; findings?: unknown[] } | unknown[]>(typeof raw === "string" ? raw : JSON.stringify(raw), []);
    // Handle both {issues: [...]} and direct array
    const arr = Array.isArray(parsed) ? parsed : ((parsed as { issues?: unknown[]; findings?: unknown[] }).issues ?? (parsed as { issues?: unknown[]; findings?: unknown[] }).findings ?? []);
    return (arr as HallucinationIssue[]).filter((i) => i.type && i.excerpt).slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * Remove or neutralize detected hallucination patterns from content.
 * Strategy: remove entire paragraphs/sentences containing fake quotes.
 */
function removeHallucinatedContent(
  content: string,
  issues: HallucinationIssue[]
): string {
  let cleaned = content;

  for (const issue of issues) {
    if (issue.type === "fake_quote" && issue.excerpt.length > 10) {
      // Find and remove the paragraph containing the fake quote
      const lines = cleaned.split("\n");
      const filteredLines = lines.filter((line) => {
        const lowerLine = line.toLowerCase();
        const lowerExcerpt = issue.excerpt.toLowerCase().slice(0, 40);
        return !lowerLine.includes(lowerExcerpt);
      });
      cleaned = filteredLines.join("\n");
    }
  }

  // Clean up multiple blank lines left after removal
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

/**
 * Main guard function.
 * Run after content generation, before returning to user.
 *
 * @param generatedContent  - The AI-generated text
 * @param originalContent   - The original page content (source of truth)
 * @param useLLMVerification - Whether to run the slower LLM verification pass (default: true)
 */
export async function guardAgainstHallucinations(
  generatedContent: string,
  originalContent: string,
  useLLMVerification = true
): Promise<GuardResult> {
  console.log("[HallucinationGuard] Scanning generated content...");

  // Stage 1: Fast regex scan
  const regexIssues = detectWithRegex(generatedContent);

  // Stage 2: LLM verification (only if regex found issues OR content is long enough to warrant it)
  let llmIssues: HallucinationIssue[] = [];
  if (useLLMVerification && generatedContent.length > 200) {
    try {
      llmIssues = await verifyWithLLM(generatedContent, originalContent);
    } catch (e) {
      console.warn("[HallucinationGuard] LLM verification failed (non-fatal):", (e as Error).message);
    }
  }

  const allIssues = [...regexIssues, ...llmIssues];

  if (allIssues.length === 0) {
    console.log("[HallucinationGuard] ✅ No hallucinations detected.");
    return { content: generatedContent, issues: [], wasModified: false };
  }

  console.warn(
    `[HallucinationGuard] ⚠️ ${allIssues.length} issue(s) detected:`,
    allIssues.map((i) => `[${i.type}] ${i.excerpt.slice(0, 60)}`).join(" | ")
  );

  // Remove hallucinated content
  const cleaned = removeHallucinatedContent(generatedContent, allIssues);
  const wasModified = cleaned !== generatedContent;

  if (wasModified) {
    console.log("[HallucinationGuard] 🔧 Hallucinated content removed from output.");
  }

  return { content: cleaned, issues: allIssues, wasModified };
}
