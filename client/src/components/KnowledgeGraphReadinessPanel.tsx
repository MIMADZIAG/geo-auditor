/**
 * KnowledgeGraphReadinessPanel — Mike King (iPullRank) recommendation
 *
 * Displays:
 *  - KG Readiness Score (0–100) with 3-tier classification
 *  - Confirmed WikiData entities with QID links
 *  - Unconfirmed entity candidates
 *  - Numeric facts count
 *  - JSON-LD snippet with sameAs recommendations
 *  - Entity type distribution
 *
 * Data source: findings.contentStructure.entityData + entity_richness check
 */
import React, { useState } from "react";
import {
  Network,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Hash,
  Building2,
  User,
  Package,
  MapPin,
  Lightbulb,
  HelpCircle,
  Copy,
  Check,
} from "lucide-react";
import type { EntityRecognitionResult, WikiDataEntity, AuditCheck } from "../../../shared/auditTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeGraphReadinessPanelProps {
  entityData: EntityRecognitionResult | undefined;
  entityRichnessCheck: AuditCheck | undefined;
  pageUrl: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeKGScore(entityData: EntityRecognitionResult | undefined): number {
  if (!entityData) return 0;
  const confirmedScore = Math.min(50, entityData.confirmedEntities.length * 5);
  const unconfirmedScore = Math.min(20, entityData.unconfirmedEntities.length * 2);
  const numericScore = Math.min(15, entityData.numericFactsCount * 1.5);
  const entityTypeSet = new Set(entityData.confirmedEntities.map((e) => e.entityType));
  const diversityBonus = entityTypeSet.size >= 3 ? 10 : entityTypeSet.size >= 2 ? 5 : 0;
  return Math.min(100, Math.round(confirmedScore + unconfirmedScore + numericScore + diversityBonus));
}

function getKGTier(score: number): {
  label: string;
  labelEn: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  description: string;
} {
  if (score >= 70) {
    return {
      label: "KG Verified",
      labelEn: "Zweryfikowany",
      color: "oklch(0.72 0.18 145)",
      bg: "oklch(0.72 0.18 145 / 0.12)",
      border: "oklch(0.72 0.18 145 / 0.35)",
      icon: <CheckCircle2 className="h-5 w-5" style={{ color: "oklch(0.72 0.18 145)" }} />,
      description: "Strona zawiera bogaty zestaw encji potwierdzonych w Knowledge Graph. Silniki AI mogą łatwo zakotwić tę treść.",
    };
  }
  if (score >= 40) {
    return {
      label: "KG Partial",
      labelEn: "Częściowy",
      color: "oklch(0.78 0.18 75)",
      bg: "oklch(0.78 0.18 75 / 0.12)",
      border: "oklch(0.78 0.18 75 / 0.35)",
      icon: <AlertTriangle className="h-5 w-5" style={{ color: "oklch(0.78 0.18 75)" }} />,
      description: "Wykryto część encji KG. Zwiększ liczbę konkretnych nazw własnych — marek, osób, miejsc — z linkami do Wikidata.",
    };
  }
  return {
    label: "KG Not Ready",
    labelEn: "Niegotowy",
    color: "oklch(0.65 0.22 25)",
    bg: "oklch(0.65 0.22 25 / 0.12)",
    border: "oklch(0.65 0.22 25 / 0.35)",
    icon: <XCircle className="h-5 w-5" style={{ color: "oklch(0.65 0.22 25)" }} />,
    description: "Treść jest zbyt ogólna. Brak konkretnych encji możliwych do zakotwienia w Knowledge Graph. Modele AI przydzielają słabe osadzenia.",
  };
}

const ENTITY_TYPE_CONFIG: Record<
  WikiDataEntity["entityType"],
  { icon: React.ReactNode; label: string; color: string }
> = {
  person: {
    icon: <User className="h-3.5 w-3.5" />,
    label: "Osoba",
    color: "oklch(0.72 0.18 260)",
  },
  organization: {
    icon: <Building2 className="h-3.5 w-3.5" />,
    label: "Organizacja",
    color: "oklch(0.72 0.18 200)",
  },
  product: {
    icon: <Package className="h-3.5 w-3.5" />,
    label: "Produkt",
    color: "oklch(0.72 0.18 145)",
  },
  place: {
    icon: <MapPin className="h-3.5 w-3.5" />,
    label: "Miejsce",
    color: "oklch(0.72 0.18 75)",
  },
  concept: {
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    label: "Pojęcie",
    color: "oklch(0.72 0.18 300)",
  },
  unknown: {
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    label: "Inne",
    color: "oklch(0.6 0.05 0)",
  },
};

function buildSameAsSnippet(entities: WikiDataEntity[], pageUrl: string): string {
  const sameAsUrls = entities
    .filter((e) => e.wikidataUrl)
    .slice(0, 5)
    .map((e) => e.wikidataUrl as string);

  if (sameAsUrls.length === 0) {
    return JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url: pageUrl,
        sameAs: [
          "https://www.wikidata.org/wiki/QXXXXX",
          "https://en.wikipedia.org/wiki/YourEntity",
        ],
        about: {
          "@type": "Thing",
          name: "Twoja Encja",
          sameAs: "https://www.wikidata.org/wiki/QXXXXX",
        },
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: pageUrl,
      sameAs: sameAsUrls,
      about: {
        "@type": "Thing",
        name: entities[0]?.label ?? entities[0]?.surfaceForm ?? "Encja",
        sameAs: sameAsUrls[0],
      },
    },
    null,
    2
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" className="-rotate-90">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <span
        className="absolute text-lg font-black tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

// ─── Entity Chip ──────────────────────────────────────────────────────────────

function EntityChip({ entity }: { entity: WikiDataEntity }) {
  const config = ENTITY_TYPE_CONFIG[entity.entityType];
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border"
      style={{
        color: config.color,
        borderColor: `${config.color}40`,
        backgroundColor: `${config.color}12`,
      }}
    >
      <span style={{ color: config.color }}>{config.icon}</span>
      <span className="text-foreground/90 font-semibold">
        {entity.label ?? entity.surfaceForm}
      </span>
      {entity.qid && entity.wikidataUrl && (
        <a
          href={entity.wikidataUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-60 hover:opacity-100 transition-opacity"
          title={`WikiData: ${entity.qid} — ${entity.description ?? ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {entity.qid && (
        <span className="text-[10px] opacity-50 font-mono">{entity.qid}</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KnowledgeGraphReadinessPanel({
  entityData,
  entityRichnessCheck,
  pageUrl,
}: KnowledgeGraphReadinessPanelProps) {
  const [showSnippet, setShowSnippet] = useState(false);
  const [showUnconfirmed, setShowUnconfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const kgScore = computeKGScore(entityData);
  const tier = getKGTier(kgScore);
  const snippet = buildSameAsSnippet(entityData?.confirmedEntities ?? [], pageUrl);

  const confirmedEntities = entityData?.confirmedEntities ?? [];
  const unconfirmedEntities = entityData?.unconfirmedEntities ?? [];
  const numericFacts = entityData?.numericFactsCount ?? 0;
  const wikidataAvailable = entityData?.wikidataAvailable ?? false;

  // Entity type distribution
  const typeDistribution = confirmedEntities.reduce<Record<string, number>>((acc, e) => {
    acc[e.entityType] = (acc[e.entityType] ?? 0) + 1;
    return acc;
  }, {});

  const handleCopySnippet = () => {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
            <Network className="h-5 w-5" style={{ color: tier.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Knowledge Graph Readiness
              </h3>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: tier.color, background: `${tier.color}20` }}
              >
                {tier.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rekomendacja: Mike King (iPullRank) · WikiData NER
            </p>
          </div>
        </div>
        <ScoreRing score={kgScore} color={tier.color} />
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-5">
        {/* Tier description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tier.description}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Encje KG",
              value: confirmedEntities.length,
              sub: "potwierdzone",
              color: tier.color,
            },
            {
              label: "Kandydaci",
              value: unconfirmedEntities.length,
              sub: "niepotwierdzeni",
              color: "oklch(0.6 0.05 0)",
            },
            {
              label: "Fakty liczbowe",
              value: numericFacts,
              sub: "statystyki",
              color: "oklch(0.72 0.18 260)",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border px-3 py-2.5 text-center"
              style={{
                borderColor: "oklch(1 0 0 / 0.08)",
                background: "oklch(1 0 0 / 0.03)",
              }}
            >
              <div
                className="text-2xl font-black tabular-nums"
                style={{ color: stat.color }}
              >
                {stat.value}
              </div>
              <div className="text-[11px] font-semibold text-foreground/80 mt-0.5">
                {stat.label}
              </div>
              <div className="text-[10px] text-muted-foreground">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Wikidata availability notice */}
        {!wikidataAvailable && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>WikiData niedostępna podczas audytu — wyniki oparte na rozpoznawaniu wzorców (regex NER). Uruchom ponownie, aby uzyskać pełną walidację KG.</span>
          </div>
        )}

        {/* Confirmed entities */}
        {confirmedEntities.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <CheckCircle2 className="h-4 w-4" style={{ color: "oklch(0.72 0.18 145)" }} />
              <span className="text-xs font-semibold text-foreground/80">
                Encje potwierdzone w Knowledge Graph ({confirmedEntities.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {confirmedEntities.slice(0, 12).map((entity, i) => (
                <EntityChip key={`${entity.qid ?? entity.surfaceForm}-${i}`} entity={entity} />
              ))}
              {confirmedEntities.length > 12 && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs text-muted-foreground border border-white/10">
                  +{confirmedEntities.length - 12} więcej
                </span>
              )}
            </div>
          </div>
        )}

        {/* Entity type distribution */}
        {Object.keys(typeDistribution).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(typeDistribution).map(([type, count]) => {
              const config = ENTITY_TYPE_CONFIG[type as WikiDataEntity["entityType"]];
              return (
                <div
                  key={type}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: config.color }}
                >
                  {config.icon}
                  <span className="font-medium">{config.label}:</span>
                  <span className="font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Unconfirmed entities (collapsible) */}
        {unconfirmedEntities.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowUnconfirmed(!showUnconfirmed)}
            >
              {showUnconfirmed ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>
                Kandydaci bez potwierdzenia KG ({unconfirmedEntities.length}) — potencjalne encje do wzbogacenia
              </span>
            </button>
            {showUnconfirmed && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unconfirmedEntities.slice(0, 20).map((entity, i) => (
                  <span
                    key={`unc-${entity.surfaceForm}-${i}`}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border text-muted-foreground"
                    style={{ borderColor: "oklch(1 0 0 / 0.12)" }}
                  >
                    {entity.surfaceForm}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* sameAs JSON-LD snippet */}
        <div>
          <button
            className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: "oklch(1 0 0 / 0.12)" }}
            onClick={() => setShowSnippet(!showSnippet)}
          >
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span>Rekomendowany snippet JSON-LD z sameAs</span>
            </div>
            {showSnippet ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showSnippet && (
            <div className="mt-2 rounded-lg border overflow-hidden" style={{ borderColor: "oklch(1 0 0 / 0.12)" }}>
              <div
                className="flex items-center justify-between px-3 py-2 border-b"
                style={{ borderColor: "oklch(1 0 0 / 0.12)", background: "oklch(1 0 0 / 0.04)" }}
              >
                <span className="text-[11px] font-mono text-muted-foreground">
                  JSON-LD · sameAs · Knowledge Graph
                </span>
                <button
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleCopySnippet}
                >
                  {copied ? (
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
              <pre
                className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto"
                style={{ color: "oklch(0.8 0.05 260)", background: "oklch(0.08 0.01 260)" }}
              >
                {snippet}
              </pre>
              <div
                className="px-3 py-2 border-t text-[11px] text-muted-foreground"
                style={{ borderColor: "oklch(1 0 0 / 0.12)", background: "oklch(1 0 0 / 0.02)" }}
              >
                Dodaj ten blok do sekcji{" "}
                <code className="font-mono text-foreground/70">&lt;head&gt;</code> lub przed{" "}
                <code className="font-mono text-foreground/70">&lt;/body&gt;</code>. Zastąp
                QID-y właściwymi identyfikatorami WikiData Twojej marki/encji.
              </div>
            </div>
          )}
        </div>

        {/* Improvement tip for low scores */}
        {kgScore < 70 && (
          <div
            className="rounded-lg border px-4 py-3 text-xs leading-relaxed"
            style={{
              borderColor: "oklch(0.72 0.18 260 / 0.25)",
              background: "oklch(0.72 0.18 260 / 0.08)",
              color: "oklch(0.8 0.12 260)",
            }}
          >
            <span className="font-semibold">Jak poprawić wynik KG:</span>{" "}
            Zamiast pisać „to narzędzie" — napisz „Google Search Console". Zamiast „większość
            użytkowników" — „73% użytkowników według raportu Ahrefs 2024". Konkretne nazwy
            własne = encje KG = lepsze osadzenia wektorowe w modelach AI.
          </div>
        )}
      </div>
    </div>
  );
}
