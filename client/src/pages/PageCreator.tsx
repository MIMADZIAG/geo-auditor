import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Sparkles, FileText, ShoppingBag, Rocket, Package,
  HelpCircle, LayoutGrid, BarChart2, MapPin,
  ArrowRight, ArrowLeft, Loader2, Lock, CheckCircle2,
  ChevronRight, Zap, Globe, Brain, RefreshCw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageType = "article" | "listing" | "landing" | "product" | "faq" | "category" | "comparison" | "local" | "rewrite";
type ToneOfVoice = "professional" | "friendly" | "expert" | "conversational";

interface PageTypeOption {
  id: PageType;
  label: string;
  description: string;
  icon: React.ReactNode;
  example: string;
  aiTip: string;
}

const PAGE_TYPES: PageTypeOption[] = [
  {
    id: "article",
    label: "Artykuł / Poradnik",
    description: "Treść informacyjna, poradnik, przewodnik",
    icon: <FileText className="w-6 h-6" />,
    example: "Jak wybrać okulary dla dziecka?",
    aiTip: "Najczęściej cytowany typ przez Google AI Overviews",
  },
  {
    id: "product",
    label: "Karta produktu",
    description: "Strona produktu w sklepie internetowym",
    icon: <Package className="w-6 h-6" />,
    example: "Okulary przeciwsłoneczne Dooky Hawaii",
    aiTip: "Wysoka widoczność dla zapytań zakupowych",
  },
  {
    id: "listing",
    label: "Listing / Kategoria produktów",
    description: "Strona z listą produktów lub ofert",
    icon: <ShoppingBag className="w-6 h-6" />,
    example: "Okulary przeciwsłoneczne dla dzieci",
    aiTip: "Dominacja w zapytaniach kategorycznych",
  },
  {
    id: "landing",
    label: "Landing Page",
    description: "Strona sprzedażowa lub lead generation",
    icon: <Rocket className="w-6 h-6" />,
    example: "Kurs fotografii online — zapisy",
    aiTip: "Widoczność dla fraz intencji zakupowej",
  },
  {
    id: "faq",
    label: "Strona FAQ",
    description: "Baza wiedzy, najczęstsze pytania",
    icon: <HelpCircle className="w-6 h-6" />,
    example: "FAQ — opieka nad niemowlęciem",
    aiTip: "Najwyższy CTR z AI Overviews",
  },
  {
    id: "category",
    label: "Strona kategorii",
    description: "Dział, kategoria, sekcja serwisu",
    icon: <LayoutGrid className="w-6 h-6" />,
    example: "Akcesoria dla niemowląt",
    aiTip: "Widoczność nawigacyjna i kategoryczna",
  },
  {
    id: "comparison",
    label: "Porównanie / Ranking",
    description: "Zestawienie produktów lub usług",
    icon: <BarChart2 className="w-6 h-6" />,
    example: "Najlepsze wózki dziecięce 2025",
    aiTip: "Cytowania dla zapytań 'najlepszy', 'ranking'",
  },
  {
    id: "local",
    label: "Strona lokalna",
    description: "Wizytówka, usługa w konkretnej lokalizacji",
    icon: <MapPin className="w-6 h-6" />,
    example: "Fryzjer Kraków — centrum",
    aiTip: "Dominacja w lokalnych AI Overviews",
  },
  {
    id: "rewrite",
    label: "Aktualizacja treści",
    description: "Ulepsz istniejącą stronę na podstawie audytu AI",
    icon: <RefreshCw className="w-6 h-6" />,
    example: "Zaktualizuj stronę produktu wg rekomendacji AI",
    aiTip: "Najszybsza droga do poprawy widoczności",
  },
];

const TONES: { id: ToneOfVoice; label: string; desc: string }[] = [
  { id: "professional", label: "Profesjonalny", desc: "Formalny, ekspercki, biznesowy" },
  { id: "expert", label: "Ekspercki", desc: "Techniczny, szczegółowy, autorytatywny" },
  { id: "friendly", label: "Przyjazny", desc: "Ciepły, przystępny, angażujący" },
  { id: "conversational", label: "Konwersacyjny", desc: "Naturalny, bezpośredni, luźny" },
];

// ─── Progress stages ──────────────────────────────────────────────────────────

const PROGRESS_STAGES = [
  { key: "pending",     label: "Inicjalizacja",       icon: <Zap className="w-4 h-4" />,    pct: 5 },
  { key: "researching", label: "Badanie tematu",       icon: <Globe className="w-4 h-4" />,  pct: 40 },
  { key: "generating",  label: "Generowanie treści",   icon: <Brain className="w-4 h-4" />,  pct: 80 },
  { key: "completed",   label: "Gotowe!",              icon: <CheckCircle2 className="w-4 h-4" />, pct: 100 },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PageCreator() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Parse URL params — ?auditId=X&mode=rewrite
  const urlParams = new URLSearchParams(window.location.search);
  const auditIdParam = urlParams.get("auditId") ? Number(urlParams.get("auditId")) : null;
  const modeParam = urlParams.get("mode");

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<PageType | null>(modeParam === "rewrite" ? "rewrite" : null);
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tone, setTone] = useState<ToneOfVoice>("professional");
  const [audience, setAudience] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [language, setLanguage] = useState<"pl" | "en">("pl");

  // Job polling
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("pending");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch audit data for auto-fill when ?auditId=X&mode=rewrite
  const auditQuery = trpc.audit.getById.useQuery(
    { id: auditIdParam! },
    { enabled: !!auditIdParam && modeParam === "rewrite" }
  );

  // Auto-fill form from ContentIntelligence when audit data arrives
  useEffect(() => {
    if (!auditQuery.data || modeParam !== "rewrite") return;
    const audit = auditQuery.data as any;
    const ci = audit.contentIntelligence as any;
    const pageTitle = audit.pageTitle ?? audit.url;
    const pageTopics: string[] = ci?.pageTopics ?? [];
    const semanticGaps: string[] = ci?.semanticGaps ?? [];
    const topOpportunity: string = ci?.topOpportunity ?? "";
    const topQuestions: string[] = ci?.topQuestions ?? [];
    const ciSummary: string = ci?.summary ?? "";
    setTopic(`Aktualizacja treści strony: ${pageTitle}\nURL: ${audit.url}`);
    setKeywords(pageTopics.join(", "));
    const ctxParts: string[] = [];
    if (ciSummary) ctxParts.push(`Ocena AI: ${ciSummary}`);
    if (semanticGaps.length > 0) ctxParts.push(`Brakujące tematy: ${semanticGaps.join(", ")}`);
    if (topOpportunity) ctxParts.push(`Główna szansa: ${topOpportunity}`);
    if (topQuestions.length > 0) ctxParts.push(`Pytania użytkowników: ${topQuestions.slice(0, 5).join(" | ")}`);
    setAdditionalContext(ctxParts.join("\n"));
    if (pageTitle && pageTopics.length > 0) setStep(2);
  }, [auditQuery.data, modeParam]);

  // createRewrite mutation — used when selectedType === "rewrite" and auditId is available
  const createRewriteMutation = trpc.pageCreator.createRewrite.useMutation({
    onSuccess: (data) => {
      setJobId(data.id);
      setStep(3);
      setJobStatus("pending");
    },
    onError: (err) => {
      if (err.data?.code === "FORBIDDEN") {
        toast.error("Plan płatny wymagany: " + err.message);
      } else {
        toast.error(err.message);
      }
    },
  });

  const createMutation = trpc.pageCreator.create.useMutation({
    onSuccess: (data) => {
      setJobId(data.id);
      setStep(3);
      setJobStatus("pending");
    },
    onError: (err) => {
      if (err.data?.code === "FORBIDDEN") {
        toast.error("Plan płatny wymagany: " + err.message);
      } else {
        toast.error(err.message);
      }
    },
  });

  const statusQuery = trpc.pageCreator.getStatus.useQuery(
    { id: jobId! },
    {
      enabled: jobId !== null && (jobStatus === "pending" || jobStatus === "researching" || jobStatus === "generating"),
      refetchInterval: 3000,
    }
  );

  useEffect(() => {
    if (statusQuery.data) {
      const newStatus = statusQuery.data.status;
      setJobStatus(newStatus);
      if (newStatus === "completed" || newStatus === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
      // Navigate to result page only when completed — MUST be inside useEffect, never in render
      if (newStatus === "completed" && statusQuery.data.result && jobId !== null) {
        navigate(`/page-creator/${jobId}`);
      }
    }
  }, [statusQuery.data, jobId, navigate]);

  // ─── Paywall for Free users ───────────────────────────────────────────────

  const myPlanQuery = trpc.payments.getMyPlan.useQuery(undefined, { enabled: !!user });
  const isPaid = myPlanQuery.data?.plan && myPlanQuery.data.plan !== "free";

  if (user && myPlanQuery.data && !isPaid) {
    return <PageCreatorPaywall />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Lock className="w-12 h-12 text-violet-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Zaloguj się, aby kontynuować</h2>
          <p className="text-zinc-400 mb-6">AI Page Creator wymaga konta i planu płatnego.</p>
          <Button onClick={() => window.location.href = getLoginUrl()} className="bg-violet-600 hover:bg-violet-500">
            Zaloguj się
          </Button>
        </div>
      </div>
    );
  }

  // ─── Step 3: Processing ───────────────────────────────────────────────────

  if (step === 3) {
    const currentStage = PROGRESS_STAGES.find(s => s.key === jobStatus) ?? PROGRESS_STAGES[0];
    const progressPct = currentStage.pct;

    // Navigation to result is handled in useEffect above — never call navigate() in render
    if (jobStatus === "completed" && statusQuery.data?.result) {
      return null; // useEffect will navigate, show nothing briefly
    }

    if (jobStatus === "failed") {
      return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Coś poszło nie tak</h2>
            <p className="text-zinc-400 mb-6">{statusQuery.data?.errorMessage ?? "Spróbuj ponownie."}</p>
            <Button onClick={() => { setStep(2); setJobId(null); setJobStatus("pending"); }} variant="outline" className="border-zinc-700 text-zinc-300">
              Spróbuj ponownie
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-violet-300 text-sm font-medium">AI Page Creator pracuje…</span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Tworzę Twoją stronę</h2>
            <p className="text-zinc-400">Analizuję temat, badam konkurencję i generuję treść klasy premium</p>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-zinc-500 mb-2">
              <span>{currentStage.label}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Stages */}
          <div className="space-y-3">
            {PROGRESS_STAGES.filter(s => s.key !== "completed").map((stage) => {
              const stageIdx = PROGRESS_STAGES.findIndex(s => s.key === stage.key);
              const currentIdx = PROGRESS_STAGES.findIndex(s => s.key === jobStatus);
              const isDone = stageIdx < currentIdx;
              const isCurrent = stage.key === jobStatus;

              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? "bg-violet-500/10 border-violet-500/30"
                      : isDone
                      ? "bg-zinc-900/50 border-zinc-800"
                      : "bg-zinc-900/20 border-zinc-800/50 opacity-40"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCurrent ? "bg-violet-500/20 text-violet-400" :
                    isDone ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                  }`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : isCurrent ? <Loader2 className="w-4 h-4 animate-spin" /> : stage.icon}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isCurrent ? "text-white" : isDone ? "text-zinc-300" : "text-zinc-600"}`}>
                      {stage.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {stage.key === "researching" && "Scrapuję najlepsze materiały w sieci..."}
                        {stage.key === "generating" && "Generuję treść, nagłówki, FAQ i specyfikację techniczną..."}
                        {stage.key === "pending" && "Inicjalizacja pipeline'u..."}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-zinc-600 mt-8">
            Proces trwa zazwyczaj 45–90 sekund. Nie zamykaj tej strony.
          </p>
        </div>
      </div>
    );
  }

  // ─── Step 1: Page Type Selection ──────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-violet-300 text-sm font-medium">AI Page Creator — krok 1 z 2</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">
              Jaki typ podstrony chcesz stworzyć?
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Wybierz typ strony, a AI dopasuje strukturę, treść i wytyczne techniczne,
              żeby zmaksymalizować widoczność w Google AI Overviews, ChatGPT i Perplexity.
            </p>
          </div>

          {/* Page type grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {PAGE_TYPES.map((pt) => (
              <button
                key={pt.id}
                onClick={() => setSelectedType(pt.id)}
                className={`relative text-left p-5 rounded-2xl border transition-all group ${
                  selectedType === pt.id
                    ? "bg-violet-500/15 border-violet-500/60 shadow-lg shadow-violet-500/10"
                    : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900"
                }`}
              >
                {selectedType === pt.id && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-violet-400" />
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                  selectedType === pt.id ? "bg-violet-500/20 text-violet-400" : "bg-zinc-800 text-zinc-400"
                }`}>
                  {pt.icon}
                </div>
                <h3 className="font-semibold text-white text-sm mb-1">{pt.label}</h3>
                <p className="text-zinc-500 text-xs mb-3">{pt.description}</p>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span className="text-amber-400/80 text-xs">{pt.aiTip}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Selected type info */}
          {selectedType && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-8 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 flex-shrink-0">
                {PAGE_TYPES.find(p => p.id === selectedType)?.icon}
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">
                  {PAGE_TYPES.find(p => p.id === selectedType)?.label}
                </h3>
                <p className="text-zinc-400 text-sm mb-2">
                  Przykład: <span className="text-zinc-300 italic">
                    "{PAGE_TYPES.find(p => p.id === selectedType)?.example}"
                  </span>
                </p>
                <p className="text-zinc-500 text-xs">
                  AI dopasuje strukturę nagłówków, schemat FAQ, schema.org i wytyczne techniczne
                  specyficzne dla tego typu strony.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedType}
              className="bg-violet-600 hover:bg-violet-500 text-white px-8 py-3 rounded-xl font-semibold disabled:opacity-40"
            >
              Dalej — Opisz temat
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 2: Brief Form ───────────────────────────────────────────────────

  const selectedTypeInfo = PAGE_TYPES.find(p => p.id === selectedType);

  const handleSubmit = () => {
    if (!selectedType || topic.trim().length < 10) return;
    const kwList = keywords.split(",").map(k => k.trim()).filter(Boolean);
    // Route rewrite type to dedicated mutation
    if (selectedType === "rewrite" && auditIdParam) {
      createRewriteMutation.mutate({
        auditId: auditIdParam,
        toneOfVoice: tone,
        additionalInstructions: additionalInstructions.trim() || undefined,
        language,
      });
      return;
    }
    // Standard page creation for all other types
    const safePageType = selectedType as Exclude<PageType, "rewrite">;
    createMutation.mutate({
      pageType: safePageType,
      topic: topic.trim(),
      targetKeywords: kwList.length > 0 ? kwList : undefined,
      toneOfVoice: tone,
      targetAudience: audience.trim() || undefined,
      additionalContext: additionalContext.trim() || undefined,
      language,
    });
  };
  const isRewriteMode = selectedType === "rewrite" && !!auditIdParam;
  const isSubmitting = createMutation.isPending || createRewriteMutation.isPending;

  return (
    <div className="min-h-screen bg-[#0a0a0f] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-violet-300 text-sm font-medium">AI Page Creator — krok 2 z 2</span>
          </div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400">
              {selectedTypeInfo?.icon}
            </div>
            <span className="text-zinc-400 text-sm">{selectedTypeInfo?.label}</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Opisz swoją stronę</h1>
          <p className="text-zinc-400">
            Im więcej szczegółów podasz, tym lepsza i bardziej trafna będzie wygenerowana treść.
            AI wykorzysta te informacje do stworzenia strony klasy premium.
          </p>
        </div>

        <div className="space-y-6">
          {/* Topic */}
          <div>
            <Label className="text-zinc-200 font-semibold mb-2 block">
              Temat strony <span className="text-red-400">*</span>
            </Label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={`Opisz dokładnie, o czym ma być strona. Na przykład:\n"Strona produktowa okularów przeciwsłonecznych Dooky Hawaii dla dzieci 0-2 lat. Produkt chroni przed UV400, ma polaryzację, jest elastyczny i bezpieczny. Sprzedajemy w sklepie z akcesoriami dla niemowląt."`}
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 min-h-[120px] resize-none focus:border-violet-500"
              maxLength={2000}
            />
            <div className="flex justify-between mt-1.5">
              <p className="text-zinc-600 text-xs">Minimum 10 znaków. Im więcej szczegółów, tym lepsza treść.</p>
              <span className="text-zinc-600 text-xs">{topic.length}/2000</span>
            </div>
          </div>

          {/* Keywords */}
          <div>
            <Label className="text-zinc-200 font-semibold mb-2 block">
              Docelowe słowa kluczowe
              <span className="text-zinc-500 font-normal ml-2 text-xs">(opcjonalne, ale zalecane)</span>
            </Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="okulary dla dzieci, okulary UV400, okulary niemowlę"
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-violet-500"
            />
            <p className="text-zinc-600 text-xs mt-1.5">Oddziel przecinkami. AI wygeneruje dodatkowe frazy na podstawie badań.</p>
          </div>

          {/* Tone */}
          <div>
            <Label className="text-zinc-200 font-semibold mb-3 block">Ton komunikacji</Label>
            <div className="grid grid-cols-2 gap-3">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    tone === t.id
                      ? "bg-violet-500/15 border-violet-500/50 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Target audience */}
          <div>
            <Label className="text-zinc-200 font-semibold mb-2 block">
              Grupa docelowa
              <span className="text-zinc-500 font-normal ml-2 text-xs">(opcjonalne)</span>
            </Label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Rodzice dzieci 0-3 lat, kupujący online"
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-violet-500"
              maxLength={500}
            />
          </div>

          {/* Additional context — rewrite mode shows audit data read-only + user instructions */}
          {isRewriteMode ? (
            <>
              {/* Auto-filled audit context — read-only, collapsible */}
              <div>
                <Label className="text-zinc-200 font-semibold mb-2 block">
                  Dane z audytu
                  <span className="text-emerald-400 font-normal ml-2 text-xs">✔ Auto-wypełnione</span>
                </Label>
                <div className="bg-zinc-900/60 border border-emerald-500/20 rounded-xl p-4 text-zinc-400 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {additionalContext || "Brak danych z audytu"}
                </div>
                <p className="text-zinc-600 text-xs mt-1.5">Wnioski z analizy Content Intelligence — AI użyje ich jako kontekst aktualizacji.</p>
              </div>
              {/* User additional instructions */}
              <div>
                <Label className="text-zinc-200 font-semibold mb-2 block">
                  Twoje wskazówki
                  <span className="text-zinc-500 font-normal ml-2 text-xs">(opcjonalne)</span>
                </Label>
                <Textarea
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Np. zachowaj obecny ton, dodaj sekcję o dostawie, skup się na korzyściach dla kobiet 25-40 lat..."
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 min-h-[80px] resize-none focus:border-violet-500"
                  maxLength={1000}
                />
                <div className="flex justify-between mt-1.5">
                  <p className="text-zinc-600 text-xs">Dodaj własne wytyczne, które AI uwzględni przy aktualizacji.</p>
                  <span className="text-zinc-600 text-xs">{additionalInstructions.length}/1000</span>
                </div>
              </div>
            </>
          ) : (
            <div>
              <Label className="text-zinc-200 font-semibold mb-2 block">
                Dodatkowe informacje
                <span className="text-zinc-500 font-normal ml-2 text-xs">(opcjonalne — bardzo zalecane!)</span>
              </Label>
              <Textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Podaj wszystko, co może pomóc AI: unikalne cechy produktu/usługi, USP, certyfikaty, nagrody, dane techniczne, ceny, obszar działania, konkurenci, specjalne wymagania..."
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 min-h-[100px] resize-none focus:border-violet-500"
                maxLength={3000}
              />
              <div className="flex justify-between mt-1.5">
                <p className="text-zinc-600 text-xs">Każdy szczegół poprawia jakość wygenerowanej treści.</p>
                <span className="text-zinc-600 text-xs">{additionalContext.length}/3000</span>
              </div>
            </div>
          )}

          {/* Language */}
          <div>
            <Label className="text-zinc-200 font-semibold mb-3 block">Język treści</Label>
            <div className="flex gap-3">
              {[{ id: "pl", label: "🇵🇱 Polski" }, { id: "en", label: "🇬🇧 Angielski" }].map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLanguage(l.id as "pl" | "en")}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    language === l.id
                      ? "bg-violet-500/15 border-violet-500/50 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI tip box */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 text-sm font-medium mb-1">Wskazówka AI</p>
              <p className="text-amber-400/70 text-xs">
                {selectedTypeInfo?.aiTip}. AI przebada internet w poszukiwaniu najlepszych materiałów,
                wygeneruje zapytania badawcze i stworzy treść zoptymalizowaną pod cytowania przez modele AI.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-10">
          <Button
            onClick={() => setStep(1)}
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Wróć
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={(isRewriteMode ? false : topic.trim().length < 10) || isSubmitting}
            className="bg-violet-600 hover:bg-violet-500 text-white px-8 py-3 rounded-xl font-semibold disabled:opacity-40"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uruchamiam…
              </>
            ) : isRewriteMode ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Aktualizuj treść AI
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Stwórz stronę AI
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Paywall for Free users ───────────────────────────────────────────────────

function PageCreatorPaywall() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-10 h-10 text-violet-400" />
        </div>
        <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 mb-4 text-xs px-3 py-1">
          Tylko dla planów płatnych
        </Badge>
        <h2 className="text-3xl font-bold text-white mb-3">AI Page Creator</h2>
        <p className="text-zinc-400 mb-8 leading-relaxed">
          Twórz podstrony od zera, zoptymalizowane pod Google AI Overviews, ChatGPT i Perplexity.
          Pełna treść, nagłówki, meta tagi, schema.org i wytyczne techniczne — wszystko w jednym miejscu.
        </p>

        <div className="grid grid-cols-1 gap-3 mb-8 text-left">
          {[
            "Query fan-out — AI bada temat w 8 zapytaniach",
            "Grounding — scraping najlepszych materiałów w sieci",
            "Pełna treść strony (1500–3000 słów)",
            "Nagłówki H1–H3 zoptymalizowane pod AI Search",
            "FAQ z 6–12 pytaniami i pełnymi odpowiedziami",
            "Meta title, description, OG tags gotowe do wklejenia",
            "Schema.org JSON-LD dla Twojego typu strony",
            "Predicted AI Readiness Score 0–100",
          ].map((feat) => (
            <div key={feat} className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-zinc-300 text-sm">{feat}</span>
            </div>
          ))}
        </div>

        <Button
          onClick={() => navigate("/pricing")}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white py-4 rounded-xl font-semibold text-base"
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Przejdź na plan płatny — od $39/mies.
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
        <p className="text-zinc-600 text-xs mt-3">Anuluj w dowolnym momencie</p>
      </div>
    </div>
  );
}
