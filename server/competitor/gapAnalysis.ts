/**
 * Competitor Gap Analysis
 *
 * Computes a prioritised list of checks where competitors outperform the
 * target page. Uses the 85-column competitor_audits table as the source of
 * truth for competitor state, and the audit.findings JSON for the target.
 *
 * Design:
 *  - Each check maps to one column in competitor_audits (same as engine.ts).
 *  - A "gap" exists when: target = 0/fail AND majority of competitors = 1/pass.
 *  - Priority is derived from check impact + how many competitors pass.
 *  - Output is grouped by category for UI rendering.
 */

import type { AuditFindings, AuditCheck } from "../audit/types";
import type { CompetitorAudit } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GapPriority = "critical" | "high" | "medium" | "low";

export interface GapItem {
  /** Unique check identifier (matches audit check id) */
  checkId: string;
  /** Human-readable label */
  label: string;
  /** Category key */
  category: GapCategory;
  /** Human-readable category name */
  categoryLabel: string;
  /** How many competitors pass this check (out of total with data) */
  competitorPassCount: number;
  /** Total competitors with data for this check */
  competitorTotal: number;
  /** Target page status: 0=fail, 1=pass, null=unknown */
  targetValue: number | null;
  /** Computed priority */
  priority: GapPriority;
  /** Short actionable recommendation */
  recommendation: string;
  /** Impact description */
  impact: string;
}

export interface GapAnalysisResult {
  /** Ordered list of gaps (highest priority first) */
  gaps: GapItem[];
  /** Category-level summary */
  categorySummary: Record<GapCategory, { gaps: number; total: number; score: number }>;
  /** Total checks analysed */
  totalChecks: number;
  /** Number of gaps found */
  totalGaps: number;
  /** Timestamp of analysis */
  analysedAt: string;
}

export type GapCategory =
  | "technical"
  | "structuredData"
  | "contentStructure"
  | "eeat"
  | "aiCrawlers"
  | "metaTags"
  | "brandAuthority";

// ─── Check Definitions ────────────────────────────────────────────────────────

interface CheckDef {
  checkId: string;
  label: string;
  category: GapCategory;
  /** Column name in competitor_audits */
  column: keyof CompetitorAudit;
  /** true = column value 1 means BAD (inverted), false = 1 means GOOD */
  inverted?: boolean;
  recommendation: string;
  impact: string;
}

const CATEGORY_LABELS: Record<GapCategory, string> = {
  technical:        "Techniczne",
  structuredData:   "Dane strukturalne",
  contentStructure: "Struktura treści",
  eeat:             "E-E-A-T",
  aiCrawlers:       "Dostęp AI",
  metaTags:         "Meta tagi",
  brandAuthority:   "Autorytet marki",
};

const CHECK_DEFS: CheckDef[] = [
  // ── Technical ──────────────────────────────────────────────────────────────
  {
    checkId: "https",
    label: "HTTPS",
    category: "technical",
    column: "tech_https",
    recommendation: "Wdróż certyfikat SSL i przekieruj cały ruch na HTTPS.",
    impact: "AI crawlery preferują bezpieczne strony — brak HTTPS obniża zaufanie.",
  },
  {
    checkId: "canonical",
    label: "Tag canonical",
    category: "technical",
    column: "tech_canonical",
    recommendation: "Dodaj tag <link rel=\"canonical\"> wskazujący na kanoniczną wersję strony.",
    impact: "Canonical eliminuje duplikaty i koncentruje sygnały rankingowe.",
  },
  {
    checkId: "viewport",
    label: "Meta viewport (mobile)",
    category: "technical",
    column: "tech_viewport",
    recommendation: "Dodaj <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
    impact: "Responsywność jest sygnałem jakości dla crawlerów AI.",
  },
  {
    checkId: "sitemap_reference",
    label: "Sitemap XML",
    category: "technical",
    column: "tech_sitemap",
    recommendation: "Utwórz i zgłoś sitemap.xml w Google Search Console.",
    impact: "Sitemap ułatwia indeksowanie przez AI crawlery.",
  },
  {
    checkId: "max_snippet",
    label: "Dyrektywa max-snippet",
    category: "technical",
    column: "tech_max_snippet",
    recommendation: "Dodaj <meta name=\"robots\" content=\"max-snippet:-1\"> aby zezwolić na pełne snippety.",
    impact: "Bez tej dyrektywy AI może skracać cytowane fragmenty.",
  },
  {
    checkId: "noai_directive",
    label: "Brak blokady AI (noai)",
    category: "technical",
    column: "tech_noai_directive",
    inverted: true,
    recommendation: "Usuń dyrektywę noai/noimageai z robots.txt lub meta tagów.",
    impact: "Blokada AI uniemożliwia cytowanie przez ChatGPT, Perplexity i inne.",
  },
  // ── Structured Data ────────────────────────────────────────────────────────
  {
    checkId: "jsonld_present",
    label: "JSON-LD obecny",
    category: "structuredData",
    column: "sd_jsonld_present",
    recommendation: "Dodaj znaczniki JSON-LD z odpowiednim typem schema.org.",
    impact: "JSON-LD to preferowany format danych strukturalnych dla AI.",
  },
  {
    checkId: "high_value_schema",
    label: "Wartościowy typ schema",
    category: "structuredData",
    column: "sd_high_value_schema",
    recommendation: "Zaimplementuj Product, Article, FAQ, HowTo lub Organization schema.",
    impact: "Wysokowartościowe typy schema zwiększają szansę na cytowanie.",
  },
  {
    checkId: "faq_schema",
    label: "FAQ schema",
    category: "structuredData",
    column: "sd_faq_schema",
    recommendation: "Dodaj sekcję FAQ z znacznikami FAQPage schema.",
    impact: "FAQ schema jest bezpośrednio cytowane przez AI jako odpowiedź na pytania.",
  },
  {
    checkId: "organization_schema",
    label: "Organization schema",
    category: "structuredData",
    column: "sd_organization",
    recommendation: "Dodaj Organization lub LocalBusiness schema z pełnymi danymi firmy.",
    impact: "Organization schema buduje autorytet marki w systemach AI.",
  },
  {
    checkId: "author_schema",
    label: "Author schema",
    category: "structuredData",
    column: "sd_author_schema",
    recommendation: "Dodaj Person schema dla autora z linkiem do profilu.",
    impact: "Author schema wzmacnia sygnały E-E-A-T dla AI.",
  },
  {
    checkId: "date_signals",
    label: "Sygnały daty (datePublished/Modified)",
    category: "structuredData",
    column: "sd_date_signals",
    recommendation: "Dodaj datePublished i dateModified do schema Article/BlogPosting.",
    impact: "Daty potwierdzają aktualność treści — kluczowe dla AI.",
  },
  {
    checkId: "breadcrumb_schema",
    label: "BreadcrumbList schema",
    category: "structuredData",
    column: "sd_breadcrumb",
    recommendation: "Zaimplementuj BreadcrumbList schema dla nawigacji.",
    impact: "Breadcrumbs pomagają AI zrozumieć strukturę witryny.",
  },
  // ── Content Structure ──────────────────────────────────────────────────────
  {
    checkId: "h1_present",
    label: "Nagłówek H1",
    category: "contentStructure",
    column: "cs_h1_present",
    recommendation: "Dodaj jeden wyraźny nagłówek H1 opisujący temat strony.",
    impact: "H1 to główny sygnał tematyczny dla crawlerów AI.",
  },
  {
    checkId: "heading_hierarchy",
    label: "Hierarchia nagłówków",
    category: "contentStructure",
    column: "cs_heading_hierarchy",
    recommendation: "Użyj H1 → H2 → H3 w logicznej kolejności bez pomijania poziomów.",
    impact: "Prawidłowa hierarchia ułatwia AI parsowanie struktury treści.",
  },
  {
    checkId: "tldr_summary",
    label: "Podsumowanie TL;DR",
    category: "contentStructure",
    column: "cs_tldr_summary",
    recommendation: "Dodaj krótkie podsumowanie (2-3 zdania) na początku strony.",
    impact: "TL;DR jest często cytowane jako bezpośrednia odpowiedź przez AI.",
  },
  {
    checkId: "faq_section",
    label: "Sekcja FAQ",
    category: "contentStructure",
    column: "cs_faq_section",
    recommendation: "Dodaj sekcję FAQ z pytaniami i odpowiedziami w formacie Q&A.",
    impact: "Sekcje FAQ są najczęściej cytowanym formatem przez AI Search.",
  },
  {
    checkId: "answer_patterns",
    label: "Wzorce odpowiedzi (definicje, listy)",
    category: "contentStructure",
    column: "cs_answer_patterns",
    recommendation: "Używaj wzorców \"X to...\", \"Aby..., należy...\", list numerowanych.",
    impact: "Bezpośrednie wzorce odpowiedzi zwiększają szansę na cytowanie.",
  },
  {
    checkId: "lists_present",
    label: "Listy punktowane/numerowane",
    category: "contentStructure",
    column: "cs_lists_present",
    recommendation: "Przekształć bloki tekstu w listy punktowane lub numerowane.",
    impact: "Listy są łatwe do parsowania i cytowania przez AI.",
  },
  {
    checkId: "external_citations",
    label: "Cytowania zewnętrzne (linki do źródeł)",
    category: "contentStructure",
    column: "cs_external_citations",
    recommendation: "Dodaj linki do wiarygodnych źródeł zewnętrznych (badania, raporty).",
    impact: "Cytowania źródeł budują wiarygodność w oczach AI.",
  },
  // ── E-E-A-T ────────────────────────────────────────────────────────────────
  {
    checkId: "author_byline",
    label: "Podpis autora",
    category: "eeat",
    column: "eeat_author_byline",
    recommendation: "Dodaj widoczny podpis autora z imieniem i nazwiskiem.",
    impact: "Autorytet autora jest kluczowym sygnałem E-E-A-T dla AI.",
  },
  {
    checkId: "contact_info",
    label: "Dane kontaktowe",
    category: "eeat",
    column: "eeat_contact_info",
    recommendation: "Umieść dane kontaktowe (email, telefon, adres) na stronie lub w stopce.",
    impact: "Dane kontaktowe potwierdzają wiarygodność firmy.",
  },
  {
    checkId: "trust_signals",
    label: "Sygnały zaufania",
    category: "eeat",
    column: "eeat_trust_signals",
    recommendation: "Dodaj certyfikaty, nagrody, partnerstwa lub inne sygnały zaufania.",
    impact: "Sygnały zaufania wzmacniają pozycję w AI Search.",
  },
  {
    checkId: "publication_date",
    label: "Data publikacji/aktualizacji",
    category: "eeat",
    column: "eeat_publication_date",
    recommendation: "Wyświetl datę publikacji i ostatniej aktualizacji treści.",
    impact: "Aktualność treści jest ważnym sygnałem dla AI.",
  },
  {
    checkId: "expertise_signals",
    label: "Sygnały ekspertyzy",
    category: "eeat",
    column: "eeat_expertise_signals",
    recommendation: "Dodaj bio autora, kwalifikacje, doświadczenie lub linki do profili.",
    impact: "Ekspertyza autora bezpośrednio wpływa na cytowanie przez AI.",
  },
  // ── AI Crawlers ────────────────────────────────────────────────────────────
  {
    checkId: "audited_url_access",
    label: "Dostęp AI do URL",
    category: "aiCrawlers",
    column: "ai_url_access",
    recommendation: "Upewnij się, że strona jest dostępna dla crawlerów AI (GPTBot, PerplexityBot).",
    impact: "Brak dostępu = brak cytowania. To najwyższy priorytet.",
  },
  {
    checkId: "ai_search_full_block",
    label: "Brak pełnej blokady AI",
    category: "aiCrawlers",
    column: "ai_full_block",
    inverted: true,
    recommendation: "Usuń blokadę GPTBot/PerplexityBot z robots.txt.",
    impact: "Pełna blokada AI uniemożliwia jakiekolwiek cytowanie.",
  },
  {
    checkId: "llms_txt",
    label: "Plik llms.txt",
    category: "aiCrawlers",
    column: "ai_llms_txt",
    recommendation: "Utwórz plik /llms.txt z opisem treści dla modeli językowych.",
    impact: "llms.txt to nowy standard ułatwiający AI zrozumienie witryny.",
  },
  // ── Meta Tags ──────────────────────────────────────────────────────────────
  {
    checkId: "title_tag",
    label: "Tag title",
    category: "metaTags",
    column: "mt_title_tag",
    recommendation: "Dodaj unikalny tag <title> z głównym słowem kluczowym.",
    impact: "Title tag to podstawowy sygnał tematyczny dla AI.",
  },
  {
    checkId: "meta_description",
    label: "Meta description",
    category: "metaTags",
    column: "mt_meta_description",
    recommendation: "Dodaj meta description (150-160 znaków) opisujący wartość strony.",
    impact: "Meta description jest często używana jako snippet przez AI.",
  },
  {
    checkId: "og_title",
    label: "Open Graph title",
    category: "metaTags",
    column: "mt_og_title",
    recommendation: "Dodaj <meta property=\"og:title\"> dla lepszego udostępniania.",
    impact: "OG tagi wpływają na sposób prezentacji w AI Search.",
  },
  {
    checkId: "lang_attribute",
    label: "Atrybut lang HTML",
    category: "metaTags",
    column: "mt_lang_attribute",
    recommendation: "Dodaj atrybut lang do tagu <html>, np. <html lang=\"pl\">.",
    impact: "Atrybut lang pomaga AI dobrać odpowiedni język odpowiedzi.",
  },
  // ── Brand Authority ────────────────────────────────────────────────────────
  {
    checkId: "social_proof",
    label: "Dowód społeczny (recenzje, opinie)",
    category: "brandAuthority",
    column: "ba_social_proof",
    recommendation: "Dodaj recenzje klientów, oceny, testimoniale lub liczby użytkowników.",
    impact: "Dowód społeczny wzmacnia autorytet marki w AI Search.",
  },
  {
    checkId: "niche_authority",
    label: "Autorytet w niszy",
    category: "brandAuthority",
    column: "ba_niche_authority",
    recommendation: "Publikuj eksperckie treści, case studies lub raporty branżowe.",
    impact: "Niszowy autorytet zwiększa szansę na cytowanie w specjalistycznych zapytaniach.",
  },
];

// ─── Priority Computation ─────────────────────────────────────────────────────

/**
 * Derives gap priority from:
 *  - How many competitors pass (more = higher priority)
 *  - Category weight (aiCrawlers/structuredData = critical)
 */
function computePriority(
  category: GapCategory,
  competitorPassCount: number,
  competitorTotal: number
): GapPriority {
  const passRatio = competitorTotal > 0 ? competitorPassCount / competitorTotal : 0;

  // Critical categories: AI access issues
  if (category === "aiCrawlers") return "critical";

  // All or most competitors pass → high priority
  if (passRatio >= 0.8) {
    if (category === "structuredData" || category === "eeat") return "critical";
    return "high";
  }
  if (passRatio >= 0.5) {
    if (category === "structuredData" || category === "contentStructure") return "high";
    return "medium";
  }
  return "low";
}

// ─── Gap Analysis Engine ──────────────────────────────────────────────────────

/**
 * Computes gap analysis given:
 *  - targetFindings: the AuditFindings JSON from the target audit
 *  - competitors: completed competitor_audits rows
 *
 * Returns a prioritised list of gaps where competitors outperform the target.
 */
export function computeGapAnalysis(
  targetFindings: AuditFindings,
  competitors: CompetitorAudit[]
): GapAnalysisResult {
  const completed = competitors.filter(c => c.status === "completed");

  // Build a lookup: checkId → target pass status (true=passes, false=fails, null=unknown)
  // We use the semantic status directly — "pass" means the check passes regardless of
  // whether the underlying column is inverted or not.
  const targetPassStatus: Record<string, boolean | null> = {};
  // Also store raw DB-like value for display (1=pass, 0=fail for non-inverted)
  const targetValues: Record<string, number | null> = {};

  // Flatten all checks from all categories
  const allTargetChecks: AuditCheck[] = [
    ...(targetFindings.technical?.checks ?? []),
    ...(targetFindings.structuredData?.checks ?? []),
    ...(targetFindings.contentStructure?.checks ?? []),
    ...(targetFindings.eeat?.checks ?? []),
    ...(targetFindings.aiCrawlers?.checks ?? []),
    ...(targetFindings.metaTags?.checks ?? []),
    ...(targetFindings.brandAuthority?.checks ?? []),
  ];

  for (const check of allTargetChecks) {
    if (check.status === "pass") {
      targetPassStatus[check.id] = true;
      targetValues[check.id] = 1;
    } else if (check.status === "fail" || check.status === "warning") {
      targetPassStatus[check.id] = false;
      targetValues[check.id] = 0;
    } else {
      targetPassStatus[check.id] = null;
      targetValues[check.id] = null;
    }
  }

  const gaps: GapItem[] = [];

  // Category summary accumulators
  const categorySummary: Record<GapCategory, { gaps: number; total: number; score: number }> = {
    technical:        { gaps: 0, total: 0, score: 0 },
    structuredData:   { gaps: 0, total: 0, score: 0 },
    contentStructure: { gaps: 0, total: 0, score: 0 },
    eeat:             { gaps: 0, total: 0, score: 0 },
    aiCrawlers:       { gaps: 0, total: 0, score: 0 },
    metaTags:         { gaps: 0, total: 0, score: 0 },
    brandAuthority:   { gaps: 0, total: 0, score: 0 },
  };

  for (const def of CHECK_DEFS) {
    categorySummary[def.category].total++;

    // Get competitor values for this column
    const competitorValues = completed
      .map(c => c[def.column] as number | null)
      .filter(v => v !== null) as number[];

    if (competitorValues.length === 0) continue;

    // Count how many competitors "pass" this check
    // For inverted checks: 0 = pass (not blocked), 1 = fail (blocked)
    const competitorPassCount = def.inverted
      ? competitorValues.filter(v => v === 0).length
      : competitorValues.filter(v => v === 1).length;

    const competitorTotal = competitorValues.length;

    // Get target pass status (semantic: true = check passes, false = check fails)
    // This is independent of whether the check is inverted — "pass" always means good.
    const rawTargetValue = targetValues[def.checkId] ?? null;
    const targetPasses = targetPassStatus[def.checkId] ?? false;

    // A gap exists when: target fails AND majority of competitors pass
    const majorityCompetitorsPass = competitorPassCount / competitorTotal >= 0.5;

    if (!targetPasses && majorityCompetitorsPass) {
      const priority = computePriority(def.category, competitorPassCount, competitorTotal);
      gaps.push({
        checkId: def.checkId,
        label: def.label,
        category: def.category,
        categoryLabel: CATEGORY_LABELS[def.category],
        competitorPassCount,
        competitorTotal,
        targetValue: rawTargetValue,
        priority,
        recommendation: def.recommendation,
        impact: def.impact,
      });
      categorySummary[def.category].gaps++;
    }
  }

  // Add category scores from target findings
  const categoryScoreMap: Record<GapCategory, number> = {
    technical:        targetFindings.technical?.score ?? 0,
    structuredData:   targetFindings.structuredData?.score ?? 0,
    contentStructure: targetFindings.contentStructure?.score ?? 0,
    eeat:             targetFindings.eeat?.score ?? 0,
    aiCrawlers:       targetFindings.aiCrawlers?.score ?? 0,
    metaTags:         targetFindings.metaTags?.score ?? 0,
    brandAuthority:   targetFindings.brandAuthority?.score ?? 0,
  };
  for (const cat of Object.keys(categorySummary) as GapCategory[]) {
    categorySummary[cat].score = categoryScoreMap[cat];
  }

  // Sort: critical first, then high, then by competitor pass ratio (desc)
  const PRIORITY_ORDER: Record<GapPriority, number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  gaps.sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (po !== 0) return po;
    // Secondary: more competitors passing = higher up
    return (b.competitorPassCount / b.competitorTotal) - (a.competitorPassCount / a.competitorTotal);
  });

  return {
    gaps,
    categorySummary,
    totalChecks: CHECK_DEFS.length,
    totalGaps: gaps.length,
    analysedAt: new Date().toISOString(),
  };
}
