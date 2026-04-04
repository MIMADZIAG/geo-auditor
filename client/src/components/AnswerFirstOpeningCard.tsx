/**
 * AnswerFirstOpeningCard
 *
 * Displays:
 *  - Answer-First Opening Score (0–100) with LLM analysis
 *  - Current opening paragraph (what AI sees first)
 *  - LLM-generated rewrite that starts with a direct answer
 *  - Before/after comparison with visual diff
 *  - Explanation of why the rewrite is better for AI citation
 *
 * Data source: findings.contentStructure.checks[first_paragraph_answer].metadata
 */
import React, { useState } from "react";
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { AuditCheck } from "../../../shared/auditTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnswerFirstMetadata {
  answerFirstScore: number;
  currentOpening: string;
  suggestedRewrite: string;
  currentOpeningIssue: string;
  rewriteReason: string;
}

interface AnswerFirstOpeningCardProps {
  check: AuditCheck | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTierConfig(score: number): {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
} {
  if (score >= 70) {
    return {
      label: "Answer-First",
      color: "oklch(0.72 0.18 145)",
      bg: "oklch(0.72 0.18 145 / 0.12)",
      border: "oklch(0.72 0.18 145 / 0.35)",
      icon: <CheckCircle2 className="h-5 w-5" style={{ color: "oklch(0.72 0.18 145)" }} />,
    };
  }
  if (score >= 40) {
    return {
      label: "Częściowy",
      color: "oklch(0.78 0.18 75)",
      bg: "oklch(0.78 0.18 75 / 0.12)",
      border: "oklch(0.78 0.18 75 / 0.35)",
      icon: <AlertTriangle className="h-5 w-5" style={{ color: "oklch(0.78 0.18 75)" }} />,
    };
  }
  return {
    label: "Wymaga poprawy",
    color: "oklch(0.65 0.22 25)",
    bg: "oklch(0.65 0.22 25 / 0.12)",
    border: "oklch(0.65 0.22 25 / 0.35)",
    icon: <XCircle className="h-5 w-5" style={{ color: "oklch(0.65 0.22 25)" }} />,
  };
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-sm font-black tabular-nums w-10 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AnswerFirstOpeningCard({ check }: AnswerFirstOpeningCardProps) {
  const [showRewrite, setShowRewrite] = useState(false);
  const [copiedRewrite, setCopiedRewrite] = useState(false);

  if (!check) return null;

  const score = check.score ?? 0;
  const tier = getTierConfig(score);

  // Extract LLM metadata
  const meta = check.metadata as AnswerFirstMetadata | undefined;
  const hasLLMData = !!(meta?.suggestedRewrite && meta.suggestedRewrite.length > 10);

  const currentOpening = meta?.currentOpening ?? (typeof check.value === "string" ? check.value : "");
  const suggestedRewrite = meta?.suggestedRewrite ?? "";
  const currentOpeningIssue = meta?.currentOpeningIssue ?? check.description;
  const rewriteReason = meta?.rewriteReason ?? "";

  const handleCopyRewrite = () => {
    void navigator.clipboard.writeText(suggestedRewrite).then(() => {
      setCopiedRewrite(true);
      setTimeout(() => setCopiedRewrite(false), 2000);
    });
  };

  // Don't render for product pages (score=70, status=info, no metadata)
  if (check.status === "info" && !hasLLMData && score === 70) return null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: tier.border,
        background: "oklch(0.13 0.01 260 / 0.6)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: tier.border, background: tier.bg }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: `${tier.color}20`, border: `1px solid ${tier.color}40` }}
          >
            <MessageSquare className="h-5 w-5" style={{ color: tier.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Answer-First Opening Score
              </h3>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: tier.color, background: `${tier.color}20` }}
              >
                {tier.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Czy pierwsze zdanie strony od razu odpowiada na pytanie użytkownika?
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums" style={{ color: tier.color }}>
            {score}
          </div>
          <div className="text-[10px] text-muted-foreground">/ 100</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-4">
        {/* Score bar */}
        <ScoreBar score={score} color={tier.color} />

        {/* Issue description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {currentOpeningIssue || check.description}
        </p>

        {/* What Answer-First means */}
        {score < 70 && (
          <div
            className="rounded-lg border px-4 py-3 text-xs leading-relaxed space-y-1"
            style={{
              borderColor: "oklch(0.72 0.18 260 / 0.25)",
              background: "oklch(0.72 0.18 260 / 0.08)",
              color: "oklch(0.8 0.12 260)",
            }}
          >
          <div className="font-semibold mb-1">Dlaczego to ważne?</div>
            <div>
              Pierwsze zdanie strony powinno <strong>bezpośrednio odpowiadać</strong> na główne pytanie
              użytkownika. Bez wstępów, bez „W tym artykule omówimy...”. Perplexity, ChatGPT i Gemini
              priorytetyzują pierwsze 150 słów przy wyborze fragmentów do cytowania.
            </div>
          </div>
        )}

        {/* Current opening */}
        {currentOpening && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: "oklch(0.65 0.22 25)" }}
              />
              <span className="text-xs font-semibold text-foreground/70">
                Aktualny akapit otwierający
              </span>
            </div>
            <div
              className="rounded-lg border px-4 py-3 text-sm text-muted-foreground leading-relaxed italic"
              style={{
                borderColor: "oklch(1 0 0 / 0.10)",
                background: "oklch(1 0 0 / 0.03)",
              }}
            >
              „{currentOpening.slice(0, 280)}{currentOpening.length > 280 ? "…" : "‟"}"
            </div>
          </div>
        )}

        {/* LLM Rewrite section */}
        {hasLLMData && (
          <div>
            <button
              className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5"
              style={{
                borderColor: "oklch(0.72 0.18 300 / 0.35)",
                background: showRewrite ? "oklch(0.72 0.18 300 / 0.08)" : "oklch(1 0 0 / 0.03)",
              }}
              onClick={() => setShowRewrite(!showRewrite)}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: "oklch(0.72 0.18 300)" }} />
                <span style={{ color: "oklch(0.85 0.10 300)" }}>
                  Propozycja AI: Answer-First rewrite
                </span>
              </div>
              {showRewrite ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showRewrite && (
              <div
                className="mt-2 rounded-lg border overflow-hidden"
                style={{ borderColor: "oklch(0.72 0.18 300 / 0.25)" }}
              >
                {/* Before → After header */}
                <div
                  className="flex items-center gap-2 px-4 py-2 border-b text-xs font-semibold"
                  style={{
                    borderColor: "oklch(0.72 0.18 300 / 0.20)",
                    background: "oklch(0.72 0.18 300 / 0.08)",
                    color: "oklch(0.85 0.10 300)",
                  }}
                >
                  <span className="text-muted-foreground">Przed</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Po (Answer-First)</span>
                  <div className="flex-1" />
                  <button
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleCopyRewrite}
                  >
                    {copiedRewrite ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-green-400">Skopiowano</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Kopiuj</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Rewrite text */}
                <div
                  className="px-4 py-3 text-sm leading-relaxed"
                  style={{
                    color: "oklch(0.9 0.05 300)",
                    background: "oklch(0.72 0.18 300 / 0.05)",
                  }}
                >
                  {suggestedRewrite}
                </div>

                {/* Why it's better */}
                {rewriteReason && (
                  <div
                    className="flex items-start gap-2 px-4 py-2.5 border-t text-xs"
                    style={{
                      borderColor: "oklch(0.72 0.18 300 / 0.20)",
                      background: "oklch(1 0 0 / 0.02)",
                      color: "oklch(0.7 0.08 260)",
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-400" />
                    <span>{rewriteReason}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No LLM data — show static guidance */}
        {!hasLLMData && score < 70 && (
          <div
            className="rounded-lg border px-4 py-3 text-xs leading-relaxed"
            style={{
              borderColor: "oklch(0.78 0.18 75 / 0.25)",
              background: "oklch(0.78 0.18 75 / 0.08)",
              color: "oklch(0.85 0.12 75)",
            }}
          >
            <span className="font-semibold">Przykład poprawy:</span>{" "}
            Zamiast „W tym artykule dowiesz się, jak..." napisz „[Temat] to [definicja/kluczowy fakt].
            [Konkretna korzyść/odpowiedź na pytanie użytkownika]." Pierwsze zdanie = bezpośrednia
            odpowiedź.
          </div>
        )}
      </div>
    </div>
  );
}
