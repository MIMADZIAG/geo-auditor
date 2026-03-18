import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { runSimulation, estimateTotalImprovement } from "@/geo-sandbox/engine/simulator";
import type { SimulationResult } from "@/geo-sandbox/types/simulator";
import ScoreGauge from "@/geo-sandbox/components/ScoreGauge";
import EngineBreakdown from "@/geo-sandbox/components/EngineBreakdown";
import IssuesList from "@/geo-sandbox/components/IssuesList";
import WhatIfEditor from "@/geo-sandbox/components/WhatIfEditor";
import RRFVisualizer from "@/geo-sandbox/components/RRFVisualizer";
import CitationProbabilityChart from "@/geo-sandbox/components/CitationProbabilityChart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Cpu, Lock } from "lucide-react";

// Patch AISandbox to use tRPC fetchPage instead of the built-in mock
// We do this by providing a custom fetchPageData function via a wrapper component

export default function SandboxPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // Read ?url= from query string
  const searchParams = new URLSearchParams(window.location.search);
  const initialUrl = searchParams.get("url") || "";

  // WhatIfEditor is unlocked for all users in this version
  const isPremium = true;

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Top nav */}
      <header className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-2 ml-2">
            <div className="w-6 h-6 rounded-md bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <span className="text-sm font-semibold text-foreground">AI Sandbox Simulator</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-medium">
              BETA
            </span>
          </div>
          {!user && (
            <div className="ml-auto flex items-center gap-2">
              <a
                href={getLoginUrl()}
                className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
              >
                Sign in
              </a>
              <span className="text-xs text-muted-foreground">to save simulation history</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Intro banner */}
        <div className="mb-8 rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground mb-1">
                Predict Your Citation Probability
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Our engine simulates how <strong className="text-foreground">ChatGPT</strong>,{" "}
                <strong className="text-foreground">Perplexity</strong>, and{" "}
                <strong className="text-foreground">Google AI Overviews</strong> rank and cite your
                page — based on reverse-engineered algorithms (RRF, L3 XGBoost, Query Fan-Out).
                Use the{" "}
                <span className="text-violet-400">
                  ⚡ What-If Editor
                </span>{" "}
                to test content changes before publishing.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <AlgorithmBadge label="ChatGPT" sublabel="RRF k=60" color="blue" />
              <AlgorithmBadge label="Perplexity" sublabel="L3 XGBoost" color="green" />
              <AlgorithmBadge label="Google AIO" sublabel="Fan-Out" color="orange" />
            </div>
          </div>
        </div>

        {/* The actual sandbox — wired to real tRPC backend */}
        <SandboxWithTRPC
          initialUrl={initialUrl}
          isPremium={isPremium}
          onUpgradeClick={() => navigate("/pricing")}
        />
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Wrapper that replaces AISandbox's built-in mock with tRPC fetchPage
// ──────────────────────────────────────────────────────────────────────────────
function SandboxWithTRPC({
  initialUrl,
  isPremium,
  onUpgradeClick,
}: {
  initialUrl: string;
  isPremium: boolean;
  onUpgradeClick: () => void;
}) {
  const fetchPageMutation = trpc.sandbox.fetchPage.useMutation();

  // We pass a custom fetchPageData function to AISandbox via a prop override
  // Since AISandbox uses its own internal fetchPageData, we instead use a
  // controlled state approach: intercept the URL and run the simulation ourselves.
  const [url, setUrl] = useState(initialUrl);
  const [queries, setQueries] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(null);
  const [currentResult, setCurrentResult] = useState<SimulationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "chatgpt" | "perplexity" | "google" | "whatif">("overview");
  const [whatIfContent, setWhatIfContent] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);

  // Auto-run if initialUrl is provided
  useEffect(() => {
    if (initialUrl) {
      handleAnalyze(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze(targetUrl?: string) {
    const urlToAnalyze = targetUrl || url;
    if (!urlToAnalyze.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const { html, robotsTxt } = await fetchPageMutation.mutateAsync({ url: urlToAnalyze });
      const targetQueries = queries
        .split("\n")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
      const result = runSimulation(
        { url: urlToAnalyze, targetQueries, mode: "analyze" },
        html,
        robotsTxt
      );
      setBaselineResult(result);
      setCurrentResult(result);
      setWhatIfContent(result.contentAnalysis.rawText.slice(0, 2000));
      setActiveTab("overview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch URL";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleWhatIfSimulate() {
    if (!baselineResult || !whatIfContent.trim()) return;
    setIsSimulating(true);
    try {
      const { html, robotsTxt } = await fetchPageMutation.mutateAsync({ url });
      const targetQueries = queries
        .split("\n")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
      const result = runSimulation(
        { url, targetQueries, contentOverride: whatIfContent, mode: "simulate" },
        html,
        robotsTxt,
        baselineResult
      );
      setCurrentResult(result);
    } catch {
      setError("Simulation failed. Please try again.");
    } finally {
      setIsSimulating(false);
    }
  }

  function handleReset() {
    setCurrentResult(baselineResult);
    if (baselineResult) {
      setWhatIfContent(baselineResult.contentAnalysis.rawText.slice(0, 2000));
    }
  }

  const result = currentResult;
  const isWhatIfMode = result && baselineResult && result !== baselineResult;

  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: "16px",
        border: "1px solid #1f1f1f",
        padding: "32px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#e5e5e5",
      }}
    >
      {/* URL Input */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourwebsite.com/product-page"
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            style={{
              flex: 1,
              background: "#111111",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#e5e5e5",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            onClick={() => handleAnalyze()}
            disabled={isLoading || !url.trim()}
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: isLoading || !url.trim() ? "not-allowed" : "pointer",
              opacity: isLoading || !url.trim() ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {isLoading ? "Analyzing…" : "Run Simulation"}
          </button>
        </div>
        <textarea
          value={queries}
          onChange={(e) => setQueries(e.target.value)}
          placeholder={"Target queries (one per line)\ne.g.: best coffee maker under $100\nhow to choose coffee maker"}
          rows={3}
          style={{
            width: "100%",
            background: "#111111",
            border: "1px solid #2a2a2a",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#6b7280",
            fontSize: "13px",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#ef4444",
              fontSize: "14px",
              marginTop: "12px",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Score Row */}
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <ScoreGauge score={result.overallScore} label="Overall AI Score" size="large" delta={isWhatIfMode ? result.deltaFromBaseline?.overallDelta : undefined} />
            <ScoreGauge score={result.chatgptScore} label="ChatGPT" engine="chatgpt" delta={isWhatIfMode ? result.deltaFromBaseline?.chatgptDelta : undefined} />
            <ScoreGauge score={result.perplexityScore} label="Perplexity" engine="perplexity" delta={isWhatIfMode ? result.deltaFromBaseline?.perplexityDelta : undefined} />
            <ScoreGauge score={result.googleAIOScore} label="Google AIO" engine="google_aio" delta={isWhatIfMode ? result.deltaFromBaseline?.googleAIODelta : undefined} />
          </div>

          {/* Citation Probability Banner */}
          <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(79,70,229,0.1) 100%)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "12px", padding: "20px 24px", display: "flex", alignItems: "center", gap: "32px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "48px", fontWeight: 800, color: "#a78bfa", lineHeight: 1 }}>{result.citationProbability.overall}%</span>
              <span style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Overall Citation Probability</span>
            </div>
            <div style={{ display: "flex", gap: "24px" }}>
              {[
                { label: "ChatGPT", value: result.citationProbability.chatgpt },
                { label: "Perplexity", value: result.citationProbability.perplexity },
                { label: "Google AIO", value: result.citationProbability.googleAIO },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "24px", fontWeight: 700, color: "#e5e5e5" }}>{value}%</span>
                  <span style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{label}</span>
                </div>
              ))}
            </div>
            {result.issues.length > 0 && (
              <div style={{ marginLeft: "auto", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", color: "#22c55e" }}>
                Fix {result.issues.filter((i) => i.severity === "critical" || i.severity === "high").length} critical issues →
                potential +{estimateTotalImprovement(result.issues.slice(0, 5))} points
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #1f1f1f" }}>
            {[
              { id: "overview", label: "Overview" },
              { id: "chatgpt", label: "ChatGPT RRF" },
              { id: "perplexity", label: "Perplexity L3" },
              { id: "google", label: "Google AIO" },
              { id: "whatif", label: isPremium ? "⚡ What-If Editor" : "🔒 What-If Editor" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid #a78bfa" : "2px solid transparent",
                  color: activeTab === tab.id ? "#a78bfa" : "#6b7280",
                  padding: "10px 16px",
                  fontSize: "13px",
                  cursor: "pointer",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ paddingTop: "8px" }}>
            {activeTab === "overview" && <IssuesList issues={result.issues} />}
            {activeTab === "chatgpt" && (
              <EngineBreakdown engine="chatgpt" score={result.chatgptScore} analysis={result.rrfAnalysis} recommendation={result.rrfAnalysis.recommendation}>
                <RRFVisualizer rrfAnalysis={result.rrfAnalysis} />
              </EngineBreakdown>
            )}
            {activeTab === "perplexity" && (
              <EngineBreakdown engine="perplexity" score={result.perplexityScore} analysis={result.perplexityAnalysis} recommendation={result.perplexityAnalysis.recommendation} />
            )}
            {activeTab === "google" && (
              <EngineBreakdown engine="google_aio" score={result.googleAIOScore} analysis={result.googleAIOAnalysis} recommendation={result.googleAIOAnalysis.recommendation}>
                <CitationProbabilityChart data={result.citationProbability} />
              </EngineBreakdown>
            )}
            {activeTab === "whatif" && (
              <WhatIfEditor
                isPremium={isPremium}
                content={whatIfContent}
                onContentChange={setWhatIfContent}
                onSimulate={handleWhatIfSimulate}
                onReset={handleReset}
                isSimulating={isSimulating}
                delta={result.deltaFromBaseline}
                onUpgradeClick={onUpgradeClick}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Small badge component
// ──────────────────────────────────────────────────────────────────────────────
function AlgorithmBadge({
  label,
  sublabel,
  color,
}: {
  label: string;
  sublabel: string;
  color: "blue" | "green" | "orange";
}) {
  const colors = {
    blue: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", text: "#60a5fa" },
    green: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", text: "#4ade80" },
    orange: { bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)", text: "#fb923c" },
  }[color];

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "8px 12px",
        textAlign: "center",
        minWidth: "80px",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 700, color: colors.text }}>{label}</div>
      <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>{sublabel}</div>
    </div>
  );
}
