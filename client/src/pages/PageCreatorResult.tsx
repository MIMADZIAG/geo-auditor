import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Sparkles, Copy, CheckCircle2, ArrowRight, Code2,
  FileText, Search, Globe, Zap, ChevronDown, ChevronUp,
  ExternalLink, BarChart2, Tag, Link2, BookOpen,
  HelpCircle, Loader2, AlertCircle, Plus
} from "lucide-react";

// ─── Types (mirror server/pageCreator/index.ts) ────────────────────────────

interface PageSection {
  heading: string;
  headingLevel: "H1" | "H2" | "H3";
  content: string;
  aiVisibilityNote?: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface TechnicalSpec {
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogType: string;
  canonicalUrl: string;
  schemaOrg: Array<{ type: string; jsonLd: string }>;
  robotsDirective: string;
  internalLinkingSuggestions: string[];
  wordCountTarget: number;
  readabilityTarget: string;
}

interface HeadingStructure {
  level: "H1" | "H2" | "H3";
  text: string;
  purpose: string;
}

interface PageCreationResult {
  queryFanOut: string[];
  groundingSources: Array<{ url: string; title: string; snippet: string }>;
  researchSummary: string;
  pageTitle: string;
  sections: PageSection[];
  faq: FAQItem[];
  callToAction: string;
  technicalSpec: TechnicalSpec;
  headingStructure: HeadingStructure[];
  aiReadinessScore: number;
  aiReadinessTips: string[];
  keyEntities: string[];
  answerFirstParagraph: string;
  estimatedWordCount: number;
  generatedAt: string;
}

// ─── Copy helper ──────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast.success("Skopiowano do schowka");
      setTimeout(() => setCopied(null), 2000);
    });
  };
  return { copy, copied };
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
        <circle
          cx="56" cy="56" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="text-center z-10">
        <div className="text-3xl font-bold text-white">{score}</div>
        <div className="text-xs text-zinc-500">/100</div>
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section, index, copy, copied }: {
  section: PageSection;
  index: number;
  copy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const key = `section-${index}`;
  const headingColor = section.headingLevel === "H1" ? "text-violet-400" :
    section.headingLevel === "H2" ? "text-indigo-400" : "text-blue-400";

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`text-xs border-zinc-700 ${headingColor} font-mono`}>
            {section.headingLevel}
          </Badge>
          <span className="font-semibold text-white">{section.heading}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-800/50">
          {section.aiVisibilityNote && (
            <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 mt-4 mb-4">
              <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-400/80 text-xs">{section.aiVisibilityNote}</p>
            </div>
          )}
          <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap mt-4">
            {section.content}
          </div>
          <div className="flex justify-end mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(`${section.heading}\n\n${section.content}`, key)}
              className="border-zinc-700 text-zinc-400 hover:text-white text-xs"
            >
              {copied === key ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              Kopiuj sekcję
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PageCreatorResult() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { copy, copied } = useCopy();
  const [activeTab, setActiveTab] = useState<"content" | "technical" | "research">("content");

  const { data, isLoading, error } = trpc.pageCreator.getStatus.useQuery(
    { id: Number(id) },
    { enabled: !!id }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Nie znaleziono wyników</h2>
          <Button onClick={() => navigate("/page-creator")} variant="outline" className="border-zinc-700 text-zinc-300">
              Wróć do Signal Rewrite
          </Button>
        </div>
      </div>
    );
  }

  if (data.status !== "completed" || !data.result) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Strona jest jeszcze generowana…</p>
        </div>
      </div>
    );
  }

  const result = data.result as unknown as PageCreationResult;
  const tech = result.technicalSpec;
  // Extract URL from topic field (format: "Aktualizacja treści strony: <title>\nURL: <url>" or just topic)
  const extractedUrl = (() => {
    const topic = data.topic ?? "";
    const urlMatch = topic.match(/URL:\s*(https?:\/\/[^\s]+)/);
    return urlMatch ? urlMatch[1] : null;
  })();

  const allContent = [
    result.pageTitle,
    result.answerFirstParagraph,
    ...result.sections.map(s => `${s.heading}\n\n${s.content}`),
    result.faq.length > 0 ? "FAQ\n\n" + result.faq.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") : "",
  ].filter(Boolean).join("\n\n");

  const TABS = [
    { id: "content", label: "Treść strony", icon: <FileText className="w-4 h-4" /> },
    { id: "technical", label: "Wytyczne techniczne", icon: <Code2 className="w-4 h-4" /> },
    { id: "research", label: "Badania AI", icon: <Search className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="sticky top-0 z-20">
        <div className="glass-strong border-b border-border/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">Signal Rewrite</p>
                <h1 className="text-foreground font-semibold text-sm truncate">{result.pageTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(allContent, "all")}
                className="text-xs h-8"
              >
                {copied === "all" ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                Kopiuj całość
              </Button>
              <Button
                size="sm"
                onClick={() => navigate(`/?url=${encodeURIComponent("https://example.com")}`)}
                className="text-xs h-8 shadow-md shadow-primary/20"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Uruchom Signal Audit
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Score + summary row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* AI Readiness Score */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center">
            <p className="text-zinc-400 text-sm mb-4 font-medium">Predicted AI Readiness Score</p>
            <ScoreRing score={result.aiReadinessScore} />
            <p className="text-zinc-500 text-xs mt-3">
              {result.aiReadinessScore >= 85 ? "Doskonała widoczność w AI Search" :
               result.aiReadinessScore >= 70 ? "Dobra widoczność — drobne poprawki" :
               "Wymaga optymalizacji"}
            </p>
          </div>

          {/* Stats */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
            <p className="text-zinc-400 text-sm mb-4 font-medium">Statystyki strony</p>
            <div className="space-y-3">
              {[
                { label: "Szacowana liczba słów", value: `~${result.estimatedWordCount.toLocaleString()}`, icon: <BookOpen className="w-4 h-4" /> },
                { label: "Sekcje treści", value: result.sections.length, icon: <FileText className="w-4 h-4" /> },
                { label: "Pytania FAQ", value: result.faq.length, icon: <HelpCircle className="w-4 h-4" /> },
                { label: "Źródła badań", value: result.groundingSources.length, icon: <Globe className="w-4 h-4" /> },
                { label: "Kluczowe encje", value: result.keyEntities.length, icon: <Tag className="w-4 h-4" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    <span className="text-zinc-600">{icon}</span>
                    {label}
                  </div>
                  <span className="text-white font-semibold text-sm">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Tips */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
            <p className="text-zinc-400 text-sm mb-4 font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Top wskazówki GEO
            </p>
            <div className="space-y-2">
              {result.aiReadinessTips.slice(0, 5).map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
                  <p className="text-zinc-300 text-xs leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Answer-first paragraph */}
        {result.answerFirstParagraph && (
          <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-400" />
                <span className="text-violet-300 text-sm font-semibold">Answer-First Paragraph</span>
                <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 text-xs">Dla AI snippets</Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(result.answerFirstParagraph, "answer-first")}
                className="text-zinc-400 hover:text-white text-xs"
              >
                {copied === "answer-first" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-zinc-200 text-sm leading-relaxed">{result.answerFirstParagraph}</p>
            <p className="text-zinc-500 text-xs mt-3">
              Ten akapit powinien pojawić się jako pierwszy na stronie — bezpośrednio odpowiada na główne zapytanie i jest najczęściej cytowany przez Google AI Overviews.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 mb-6 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Content */}
        {activeTab === "content" && (
          <div className="space-y-4">
            {/* Heading structure overview */}
            {result.headingStructure.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 mb-6">
                <h3 className="text-zinc-300 text-sm font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-zinc-500" />
                  Struktura nagłówków
                </h3>
                <div className="space-y-1.5">
                  {result.headingStructure.map((h, i) => (
                    <div key={i} className={`flex items-start gap-3 ${
                      h.level === "H1" ? "" : h.level === "H2" ? "ml-4" : "ml-8"
                    }`}>
                      <Badge variant="outline" className={`text-xs border-zinc-700 font-mono flex-shrink-0 ${
                        h.level === "H1" ? "text-violet-400" : h.level === "H2" ? "text-indigo-400" : "text-blue-400"
                      }`}>
                        {h.level}
                      </Badge>
                      <div>
                        <span className="text-zinc-200 text-sm">{h.text}</span>
                        {h.purpose && <p className="text-zinc-600 text-xs mt-0.5">{h.purpose}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sections */}
            {result.sections.map((section, i) => (
              <SectionCard key={i} section={section} index={i} copy={copy} copied={copied} />
            ))}

            {/* FAQ */}
            {result.faq.length > 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-semibold text-white">FAQ — {result.faq.length} pytań</h3>
                    <Badge className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 text-xs">FAQPage schema</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(result.faq.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"), "faq")}
                    className="text-zinc-400 hover:text-white text-xs"
                  >
                    {copied === "faq" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {result.faq.map((item, i) => (
                    <div key={i} className="p-5">
                      <p className="font-medium text-white text-sm mb-2">Q: {item.question}</p>
                      <p className="text-zinc-400 text-sm leading-relaxed">A: {item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key entities */}
            {result.keyEntities.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5">
                <h3 className="text-zinc-300 text-sm font-semibold mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-zinc-500" />
                  Kluczowe encje do uwzględnienia
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.keyEntities.map((entity, i) => (
                    <Badge key={i} variant="outline" className="border-zinc-700 text-zinc-300 text-xs">
                      {entity}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Technical */}
        {activeTab === "technical" && (
          <div className="space-y-4">
            {/* Meta tags */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-zinc-800/50">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-violet-400" />
                  Meta Tags SEO
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { label: "Meta Title", value: tech.metaTitle, key: "meta-title", note: `${tech.metaTitle.length}/60 znaków` },
                  { label: "Meta Description", value: tech.metaDescription, key: "meta-desc", note: `${tech.metaDescription.length}/155 znaków` },
                  { label: "Canonical URL (wzorzec)", value: tech.canonicalUrl, key: "canonical", note: "" },
                  { label: "Robots", value: tech.robotsDirective, key: "robots", note: "" },
                ].map(({ label, value, key, note }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-zinc-400 text-xs font-medium">{label}</label>
                      <div className="flex items-center gap-2">
                        {note && <span className="text-zinc-600 text-xs">{note}</span>}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy(value, key)}
                          className="h-6 w-6 p-0 text-zinc-500 hover:text-white"
                        >
                          {copied === key ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-zinc-200">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* OG Tags */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-zinc-800/50">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Open Graph Tags
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { label: "og:title", value: tech.ogTitle, key: "og-title" },
                  { label: "og:description", value: tech.ogDescription, key: "og-desc" },
                  { label: "og:type", value: tech.ogType, key: "og-type" },
                ].map(({ label, value, key }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-zinc-400 text-xs font-medium font-mono">{label}</label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(value, key)}
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-white"
                      >
                        {copied === key ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-zinc-200">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schema.org */}
            {tech.schemaOrg?.length > 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-zinc-800/50 flex items-center justify-between">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-emerald-400" />
                    Schema.org JSON-LD
                    {tech.schemaOrg.map(s => (
                      <Badge key={s.type} className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-xs">{s.type}</Badge>
                    ))}
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(tech.schemaOrg.map(s => `<script type="application/ld+json">\n${s.jsonLd}\n</script>`).join("\n\n"), "schema")}
                    className="text-zinc-400 hover:text-white text-xs"
                  >
                    {copied === "schema" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">Kopiuj JSON-LD</span>
                  </Button>
                </div>
                {tech.schemaOrg.map((schema, i) => (
                  <div key={i} className="p-5">
                    <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs text-emerald-300 overflow-x-auto font-mono leading-relaxed">
                      {`<script type="application/ld+json">\n${
                        (() => { try { return JSON.stringify(JSON.parse(schema.jsonLd), null, 2); } catch { return schema.jsonLd; } })()
                      }\n</script>`}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* Internal linking */}
            {tech.internalLinkingSuggestions?.length > 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                  <Link2 className="w-4 h-4 text-blue-400" />
                  Sugestie linkowania wewnętrznego
                </h3>
                <div className="space-y-2">
                  {tech.internalLinkingSuggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-blue-400 text-xs mt-0.5">→</span>
                      <p className="text-zinc-300 text-sm">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content targets */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 text-center">
                <p className="text-zinc-500 text-xs mb-1">Docelowa liczba słów</p>
                <p className="text-2xl font-bold text-white">{tech.wordCountTarget?.toLocaleString()}</p>
                <p className="text-zinc-600 text-xs mt-1">słów</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 text-center">
                <p className="text-zinc-500 text-xs mb-1">Czytelność</p>
                <p className="text-sm font-semibold text-white mt-2">{tech.readabilityTarget}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Research */}
        {activeTab === "research" && (
          <div className="space-y-4">
            {/* Query fan-out */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
              <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                <Search className="w-4 h-4 text-violet-400" />
                Query Fan-Out — {result.queryFanOut.length} zapytań badawczych
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {result.queryFanOut.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3">
                    <span className="text-violet-400 text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
                    <p className="text-zinc-300 text-sm">{q}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Grounding sources */}
            {result.groundingSources.length > 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Źródła badań — {result.groundingSources.length} stron
                </h3>
                <div className="space-y-3">
                  {result.groundingSources.map((source, i) => (
                    <div key={i} className="flex items-start gap-3 bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-indigo-400 text-xs font-bold">{i + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-zinc-200 text-sm font-medium mb-1">{source.title}</p>
                        <p className="text-zinc-500 text-xs mb-2 truncate">{source.url}</p>
                        {source.snippet && (
                          <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">{source.snippet}</p>
                        )}
                      </div>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-600 hover:text-zinc-400 flex-shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Research summary */}
            {result.researchSummary && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  Synteza badań
                </h3>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{result.researchSummary}</p>
              </div>
            )}
          </div>
        )}

        {/* CTA — 3-step workflow loop */}
        <div className="mt-10 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-8 h-8 text-violet-400 shrink-0" />
            <div>
              <h3 className="text-xl font-bold text-white">Treść gotowa. Zamknij pętlę sygnałów.</h3>
              <p className="text-zinc-400 text-sm mt-0.5">Wdroż treść, uruchom Signal Audit i dodaj stronę do AI Visibility Monitor.</p>
            </div>
          </div>
          {/* Workflow steps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xs font-semibold text-white">01 · Wdrożenie</div>
              <div className="text-[11px] text-zinc-500 mt-1">Wdroż wygenerowane sygnały na stronie</div>
            </div>
            <div className="bg-zinc-900/60 border border-violet-500/20 rounded-xl p-4 text-center">
              <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto mb-2">
                <Search className="w-4 h-4 text-violet-400" />
              </div>
              <div className="text-xs font-semibold text-white">02 · Signal Audit</div>
              <div className="text-[11px] text-zinc-500 mt-1">Sprawdź AI Readiness Score po wdrożeniu</div>
            </div>
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto mb-2">
                <Globe className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xs font-semibold text-white">03 · AI Visibility Monitor</div>
              <div className="text-[11px] text-zinc-500 mt-1">Śledź cytowania w ChatGPT, Gemini, Perplexity</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => {
                if (extractedUrl) {
                  navigate(`/?url=${encodeURIComponent(extractedUrl)}`);
                } else {
                  navigate("/");
                }
              }}
              className="bg-violet-600 hover:bg-violet-500 text-white px-6 flex-1 sm:flex-none"
            >
              <Search className="w-4 h-4 mr-2" />
              {extractedUrl ? "Uruchom Signal Audit" : "Signal Audit po wdrożeniu"}
            </Button>
            {extractedUrl && (
              <Button
                onClick={() => navigate("/hub")}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-6 flex-1 sm:flex-none"
              >
                <Globe className="w-4 h-4 mr-2" />
                Dodaj do AI Visibility Monitor
              </Button>
            )}
            <Button
              onClick={() => navigate("/page-creator")}
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-6 flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nowy Signal Rewrite
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
