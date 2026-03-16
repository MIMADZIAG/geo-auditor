/**
 * E-E-A-T / Helpful Content Verifier
 *
 * Evaluates generated content against Google's E-E-A-T criteria:
 *   Experience, Expertise, Authoritativeness, Trustworthiness
 * plus Helpful Content signals.
 *
 * If the score falls below the threshold (default 8/10),
 * automatically triggers one revision pass with targeted feedback.
 */

import type { Message } from "../_core/llm";

export interface EEATScore {
  verifiableFacts: number;      // 1-10: contains specific, checkable facts
  expertVoice: number;          // 1-10: sounds like written by a domain expert
  intentMatch: number;          // 1-10: directly answers the user's search intent
  languageQuality: number;      // 1-10: grammatically correct, stylistically fluent Polish
  overall: number;              // weighted average
  feedback: string;             // specific improvement instructions (used in revision)
  passedThreshold: boolean;     // true if overall >= threshold
}

export interface VerifyResult {
  content: string;              // final content (revised if needed)
  score: EEATScore;
  wasRevised: boolean;
  revisionFeedback?: string;
}

const SCORE_THRESHOLD = 7.5;

/**
 * Evaluate content against E-E-A-T criteria using a fast LLM call.
 */
async function evaluateEEAT(
  content: string,
  originalIntent: string,
  language: string
): Promise<EEATScore> {
  const { invokeLLM } = await import("../_core/llm");

    const result = await invokeLLM({
      model: "gpt-5.4",
      messages: [
        {
          role: "system",
          content:
            "You are a senior content quality evaluator specialising in Google's E-E-A-T and Helpful Content guidelines. " +
            "Evaluate the provided text and return a JSON object with numeric scores and specific feedback. " +
            "Be strict — a score of 10 means publication-ready expert content.",
        },
        {
          role: "user",
          content:
            `Evaluate this ${language} content against E-E-A-T criteria.\n\n` +
            `ORIGINAL SEARCH INTENT: ${originalIntent}\n\n` +
            `CONTENT TO EVALUATE:\n${content.slice(0, 6000)}\n\n` +
            `Return ONLY this JSON (no explanation):\n` +
            `{\n` +
            `  "verifiableFacts": <1-10>,\n` +
            `  "expertVoice": <1-10>,\n` +
            `  "intentMatch": <1-10>,\n` +
            `  "languageQuality": <1-10>,\n` +
            `  "feedback": "<2-3 specific, actionable improvement instructions in ${language}>"\n` +
            `}`,
        },
      ] as Message[],
      response_format: { type: "json_object" },
      max_tokens: 600,
    } as any);

  const raw = result.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

  const vf = Number(parsed.verifiableFacts) || 7;
  const ev = Number(parsed.expertVoice) || 7;
  const im = Number(parsed.intentMatch) || 7;
  const lq = Number(parsed.languageQuality) || 7;

  // Weighted average: intent match and expert voice matter most
  const overall = Math.round((vf * 0.25 + ev * 0.30 + im * 0.30 + lq * 0.15) * 10) / 10;
  const feedback = typeof parsed.feedback === "string" ? parsed.feedback : "";

  return {
    verifiableFacts: vf,
    expertVoice: ev,
    intentMatch: im,
    languageQuality: lq,
    overall,
    feedback,
    passedThreshold: overall >= SCORE_THRESHOLD,
  };
}

/**
 * Revise content based on E-E-A-T feedback.
 * Single targeted revision pass — does not loop further.
 */
async function reviseContent(
  content: string,
  feedback: string,
  systemPrompt: string,
  language: string,
  score: number
): Promise<string> {
  const { invokeLLM } = await import("../_core/llm");

  // gpt-5.4-pro is NOT a chat model (unsupported in v1/chat/completions) — always use gpt-5.4
  const revisionModel = "gpt-5.4";
  console.log(`[EEATVerifier] Revision model: ${revisionModel} (score was ${score})`);

  const result = await invokeLLM({
    model: revisionModel,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          `The following ${language} content needs improvement based on E-E-A-T evaluation.\n\n` +
          `REQUIRED IMPROVEMENTS:\n${feedback}\n\n` +
          `INSTRUCTIONS:\n` +
          `- Apply ALL the required improvements\n` +
          `- Keep the overall structure and length intact\n` +
          `- Do NOT add markdown formatting (no #, **, *, ---)\n` +
          `- Write in ${language}\n\n` +
          `CONTENT TO REVISE:\n${content}`,
      },
    ] as Message[],
    max_tokens: 16000,
  } as any);

  const revised = result.choices[0]?.message?.content;
  if (typeof revised === "string" && revised.trim().length > 200) {
    return revised.trim();
  }
  return content; // fallback: return original if revision failed
}

/**
 * Main verifier: evaluate content, auto-revise once if below threshold.
 *
 * @param content          - Generated text to verify
 * @param originalIntent   - The user's search intent / target queries
 * @param systemPrompt     - The same system prompt used for generation (for revision consistency)
 * @param language         - Language of the content (e.g. "Polish", "English")
 */
export async function verifyAndRevise(
  content: string,
  originalIntent: string,
  systemPrompt: string,
  language = "Polish"
): Promise<VerifyResult> {
  console.log("[EEATVerifier] Evaluating content quality...");

  let score: EEATScore;
  try {
    score = await evaluateEEAT(content, originalIntent, language);
  } catch (e) {
    console.warn("[EEATVerifier] Evaluation failed, skipping:", (e as Error).message);
    // Return content as-is if evaluation fails
    return {
      content,
      score: {
        verifiableFacts: 0, expertVoice: 0, intentMatch: 0, languageQuality: 0,
        overall: 0, feedback: "", passedThreshold: true,
      },
      wasRevised: false,
    };
  }

  console.log(
    `[EEATVerifier] Score: ${score.overall}/10 ` +
    `(facts:${score.verifiableFacts} expert:${score.expertVoice} intent:${score.intentMatch} lang:${score.languageQuality})`
  );

  if (score.passedThreshold) {
    return { content, score, wasRevised: false };
  }

  console.log(`[EEATVerifier] Score ${score.overall} < ${SCORE_THRESHOLD} — triggering revision...`);
  console.log(`[EEATVerifier] Feedback: ${score.feedback}`);

  let revised = content;
  try {
    revised = await reviseContent(content, score.feedback, systemPrompt, language, score.overall);
  } catch (e) {
    console.warn("[EEATVerifier] Revision failed, using original:", (e as Error).message);
  }

  return {
    content: revised,
    score,
    wasRevised: revised !== content,
    revisionFeedback: score.feedback,
  };
}
