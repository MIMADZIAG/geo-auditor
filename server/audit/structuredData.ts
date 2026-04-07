/**
 * Structured Data Module — v2 (iPullRank AI Search Manual aligned)
 *
 * Key upgrades based on iPullRank Chapters 7, 9:
 *  - Added HowTo schema as high-value type (Ch.9 explicitly recommends it)
 *  - Added sameAs property check (Knowledge Graph readiness — Ch.9)
 *  - Added schema completeness scoring (not just presence but richness — Ch.9)
 *  - Added custom ontology signals (beyond Schema.org — Ch.9)
 *  - Improved FAQPage validation: checks for actual Q&A items
 *  - Added Product schema completeness (price, availability, reviews)
 *  - Added datePublished alongside dateModified for freshness signals
 *  - Penalize misuse: generic markup misapplied to wrong content types
 */

import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";
import { validateAllSchemas } from "./schemaSemanticValidator";
import type { PageType } from "./pageTypeDetector";

const HIGH_VALUE_TYPES = [
  "Article",
  "NewsArticle",
  "BlogPosting",
  "Product",
  "FAQPage",
  "HowTo",           // Added — iPullRank Ch.9 explicitly recommends HowTo
  "Organization",
  "LocalBusiness",
  "Person",
  "Review",
  "AggregateRating",
  "BreadcrumbList",
  "WebPage",
  "WebSite",
  "Event",
  "Recipe",
  "VideoObject",
  "ImageObject",
  "ItemList",        // Added — useful for product listings and step-by-step content
  "SpeakableSpecification", // Added — voice search / AI assistant optimization
];

interface ParsedSchema {
  type: string;
  raw: Record<string, unknown>;
  hasAuthor: boolean;
  hasDateModified: boolean;
  hasDatePublished: boolean;
  hasDescription: boolean;
  hasName: boolean;
  hasImage: boolean;
  hasFaqItems: boolean;
  hasHowToSteps: boolean;    // NEW
  hasSameAs: boolean;        // NEW — Knowledge Graph readiness
  hasUrl: boolean;           // NEW — entity disambiguation
  hasPrice: boolean;         // NEW — Product completeness
  hasRating: boolean;        // NEW — Review/trust signals
  completenessScore: number; // NEW — 0-100 schema richness
}

/**
 * Recursively collect all nodes that have an @type from a JSON-LD object.
 * Handles: top-level, @graph arrays, itemListElement[].item, nested arrays, etc.
 */
function collectNodes(
  node: unknown,
  depth = 0
): Record<string, unknown>[] {
  if (depth > 6 || node === null || typeof node !== "object") return [];

  const obj = node as Record<string, unknown>;
  const results: Record<string, unknown>[] = [];

  // If this node itself has @type, collect it
  if (obj["@type"]) {
    results.push(obj);
  }

  // Recurse into @graph
  if (Array.isArray(obj["@graph"])) {
    for (const child of obj["@graph"] as unknown[]) {
      results.push(...collectNodes(child, depth + 1));
    }
  }

  // Recurse into itemListElement (ListItem → item)
  if (Array.isArray(obj["itemListElement"])) {
    for (const listItem of obj["itemListElement"] as unknown[]) {
      results.push(...collectNodes(listItem, depth + 1));
      if (listItem && typeof listItem === "object") {
        const li = listItem as Record<string, unknown>;
        if (li["item"]) results.push(...collectNodes(li["item"], depth + 1));
      }
    }
  }

  // Recurse into mainEntity (FAQPage)
  if (Array.isArray(obj["mainEntity"])) {
    for (const child of obj["mainEntity"] as unknown[]) {
      results.push(...collectNodes(child, depth + 1));
    }
  }

  // Recurse into step (HowTo)
  if (Array.isArray(obj["step"])) {
    for (const child of obj["step"] as unknown[]) {
      results.push(...collectNodes(child, depth + 1));
    }
  }

  // Recurse into any array-valued property that contains objects with @type
  for (const key of Object.keys(obj)) {
    if (["@graph", "itemListElement", "mainEntity", "step"].includes(key)) continue;
    const val = obj[key];
    if (Array.isArray(val)) {
      for (const child of val as unknown[]) {
        if (child && typeof child === "object" && (child as Record<string, unknown>)["@type"]) {
          results.push(...collectNodes(child, depth + 1));
        }
      }
    } else if (val && typeof val === "object" && (val as Record<string, unknown>)["@type"]) {
      results.push(...collectNodes(val, depth + 1));
    }
  }

  return results;
}

/**
 * Calculate schema completeness score (0-100) based on how many
 * recommended properties are filled in. More complete = better AI understanding.
 * Based on iPullRank Ch.9: "Be comprehensive, not just compliant"
 */
function calculateCompletenessScore(item: Record<string, unknown>, type: string): number {
  const baseFields = ["name", "description", "url", "image"];
  const typeSpecificFields: Record<string, string[]> = {
    Article: ["author", "datePublished", "dateModified", "headline", "publisher"],
    BlogPosting: ["author", "datePublished", "dateModified", "headline", "publisher"],
    NewsArticle: ["author", "datePublished", "dateModified", "headline", "publisher", "articleSection"],
    Product: ["brand", "offers", "aggregateRating", "sku", "category"],
    FAQPage: ["mainEntity"],
    HowTo: ["step", "totalTime", "estimatedCost"],
    Organization: ["sameAs", "logo", "contactPoint", "address", "foundingDate"],
    LocalBusiness: ["address", "telephone", "openingHours", "geo", "priceRange"],
    Person: ["sameAs", "jobTitle", "worksFor", "knowsAbout"],
    WebSite: ["sameAs", "potentialAction", "publisher"],
    Event: ["startDate", "endDate", "location", "organizer", "offers"],
  };

  const normalizedType = type.split(",")[0].trim(); // Handle multi-type
  const relevantFields = [...baseFields, ...(typeSpecificFields[normalizedType] ?? [])];
  const filledFields = relevantFields.filter(f => {
    const val = item[f];
    if (val === null || val === undefined) return false;
    if (typeof val === "string" && val.trim() === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  return Math.round((filledFields.length / relevantFields.length) * 100);
}

function extractSchemas($: ScrapedPage["$"]): ParsedSchema[] {
  const schemas: ParsedSchema[] = [];
  const seen = new WeakSet<Record<string, unknown>>();

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() ?? "{}") as Record<string, unknown>;
      const nodes = collectNodes(raw);

      for (const item of nodes) {
        if (seen.has(item)) continue;
        seen.add(item);

        const rawType = item["@type"];
        const type = Array.isArray(rawType)
          ? (rawType as string[]).join(", ")
          : String(rawType ?? "Unknown");

        // Check for sameAs (Knowledge Graph readiness)
        const hasSameAs =
          (Array.isArray(item["sameAs"]) && (item["sameAs"] as unknown[]).length > 0) ||
          (typeof item["sameAs"] === "string" && (item["sameAs"] as string).length > 0);

        // Check for HowTo steps
        const hasHowToSteps =
          type.includes("HowTo") &&
          Array.isArray(item["step"]) &&
          (item["step"] as unknown[]).length > 0;

        // Check for Product-specific fields
        const hasPrice = !!(item["offers"] || item["price"]);
        const hasRating = !!(item["aggregateRating"] || item["review"]);

        schemas.push({
          type,
          raw: item,
          hasAuthor: !!item["author"],
          hasDateModified: !!item["dateModified"],
          hasDatePublished: !!item["datePublished"],
          hasDescription: !!item["description"],
          hasName: !!item["name"],
          hasImage: !!item["image"],
          hasFaqItems:
            type === "FAQPage" &&
            Array.isArray(item["mainEntity"]) &&
            (item["mainEntity"] as unknown[]).length > 0,
          hasHowToSteps,
          hasSameAs,
          hasUrl: !!item["url"],
          hasPrice,
          hasRating,
          completenessScore: calculateCompletenessScore(item, type),
        });
      }
    } catch {
      // Malformed JSON-LD — skip block
    }
  });

  return schemas;
}

export function analyzeStructuredData(page: ScrapedPage, pageType: PageType = "generic"): CategoryResult & { schemas: ParsedSchema[] } {
  const checks: AuditCheck[] = [];
  const schemas = extractSchemas(page.$);
  const detectedTypes = schemas.map((s) => s.type);

  // 1. Any JSON-LD present
  checks.push({
    id: "jsonld_present",
    label: "Schema JSON-LD obecna",
    status: schemas.length > 0 ? "pass" : "fail",
    description:
      schemas.length > 0
        ? `Znaleziono ${schemas.length} blok${schemas.length > 1 ? "i" : ""} schematu JSON-LD: ${detectedTypes.join(", ")}`
        : "Brak danych strukturalnych JSON-LD. Markup schematu jest niezbędny, aby silniki AI mogły zrozumieć Twoją treść bez czytania każdego słowa — tak budują połączenia grafu wiedzy.",
    impact: "high",
    value: schemas.length,
  });

  // Subtype normalisation map: child → parent
  const PARENT_MAP: Record<string, string> = {
    NewsArticle: "Article",
    BlogPosting: "Article",
    TechArticle: "Article",
    SatiricalArticle: "Article",
    ScholarlyArticle: "Article",
    LocalBusiness: "Organization",
    Corporation: "Organization",
    NGO: "Organization",
    GovernmentOrganization: "Organization",
    MedicalOrganization: "Organization",
    SportsOrganization: "Organization",
    EducationalOrganization: "Organization",
    ItemPage: "WebPage",
    AboutPage: "WebPage",
    ContactPage: "WebPage",
    CollectionPage: "WebPage",
    MedicalWebPage: "WebPage",
    SearchResultsPage: "WebPage",
    HowToStep: "HowTo",
    HowToSection: "HowTo",
  };

  // Expand detectedTypes to include parent types
  const expandedTypes = new Set<string>(detectedTypes);
  for (const t of detectedTypes) {
    const parent = PARENT_MAP[t];
    if (parent) expandedTypes.add(parent);
  }

  // Also detect Organization embedded in publisher/author properties
  for (const schema of schemas) {
    const raw = schema.raw as Record<string, unknown>;
    const publisher = raw["publisher"] as Record<string, unknown> | undefined;
    if (publisher && (publisher["@type"] === "Organization" || publisher["@type"] === "LocalBusiness")) {
      expandedTypes.add("Organization");
    }
    const author = raw["author"] as Record<string, unknown> | undefined;
    if (author && author["@type"] === "Organization") {
      expandedTypes.add("Organization");
    }
  }

  // 2. High-value schema types
  const foundHighValue = Array.from(expandedTypes).filter((t) => HIGH_VALUE_TYPES.includes(t));
  checks.push({
    id: "high_value_schema",
    label: "Typy schematu wysokiej wartości",
    status:
      foundHighValue.length >= 2
        ? "pass"
        : foundHighValue.length === 1
        ? "warning"
        : "fail",
    description:
      foundHighValue.length > 0
        ? `Wykryto: ${Array.from(new Set([...detectedTypes, ...foundHighValue])).join(", ")}`
        : "Brak typów schematu wysokiej wartości (Article, Product, FAQ, HowTo, Organization). To typy, których silniki AI używają do kategoryzowania i cytowania treści.",
    impact: "high",
    value: foundHighValue.join(", ") || null,
  });

  // 3. FAQ schema (iPullRank Ch.9 — explicitly recommended)
  const hasFaq = schemas.some((s) => s.type === "FAQPage" && s.hasFaqItems);
  const faqItemCount = schemas.find(s => s.type === "FAQPage")
    ? (schemas.find(s => s.type === "FAQPage")!.raw["mainEntity"] as unknown[] | undefined)?.length ?? 0
    : 0;

  // FAQ schema is critical for article, service, homepage — fail if absent; warning for others
  const faqCritical = ["article", "service", "homepage"].includes(pageType);
  checks.push({
    id: "faq_schema",
    label: "Schema FAQPage",
    status: hasFaq ? "pass" : faqCritical ? "fail" : "warning",
    description: hasFaq
      ? `Znaleziono schemat FAQPage z ${faqItemCount} par${faqItemCount !== 1 ? "ami" : "ą"} Q&A — świetne dla inkluzji odpowiedzi AI. FAQPage to jeden z najbardziej wpływowych typów schematu dla GEO.`
      : faqCritical
      ? "Brak schematu FAQPage. Dla tego typu strony to poważna luka GEO — FAQPage to jeden z najczęściej cytowanych typów schematu w AI Overviews i Perplexity. Dodaj przynajmniej 3 pary Q&A."
      : "Brak schematu FAQPage. Dodanie danych strukturalnych FAQ może poprawić inkluzję odpowiedzi AI.",
    impact: "high",
    value: hasFaq,
  });

  // 4. HowTo schema (iPullRank Ch.9 — newly added, explicitly recommended)
  const hasHowTo = schemas.some((s) => s.type.includes("HowTo") && s.hasHowToSteps) || expandedTypes.has("HowTo");
  const howToStepCount = schemas.find(s => s.type.includes("HowTo"))
    ? (schemas.find(s => s.type.includes("HowTo"))!.raw["step"] as unknown[] | undefined)?.length ?? 0
    : 0;

  checks.push({
    id: "howto_schema",
    label: "Schema HowTo",
    status: hasHowTo ? "pass" : "info",
    description: hasHowTo
      ? `Znaleziono schemat HowTo z ${howToStepCount} krokiem${howToStepCount !== 1 ? "ami" : ""} — treści krok po kroku są chętnie cytowane przez silniki AI dla zapytań instruktarzowych.`
      : "Brak schematu HowTo. Jeśli Twoja strona zawiera instrukcje krok po kroku, dodaj schemat HowTo — silniki AI chętnie cytują ustrukturyzowane treści instruktarzowe.",
    impact: "medium",
    value: hasHowTo,
  });

  // 5. Article / Product schema
  const hasArticleOrProduct = expandedTypes.has("Article") || expandedTypes.has("Product");
  const articleSubtype = detectedTypes.find((t) =>
    ["NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle", "SatiricalArticle"].includes(t)
  );
  checks.push({
    id: "article_product_schema",
    label: "Schema Article lub Product",
    status: hasArticleOrProduct ? "pass" : "warning",
    description: hasArticleOrProduct
      ? articleSubtype
        ? `Wykryto schemat ${articleSubtype} (podtyp Article) — pomaga silnikom AI kategoryzować Twoją treść.`
        : "Wykryto schemat Article lub Product — pomaga silnikom AI kategoryzować Twoją treść."
      : "Brak schematu Article lub Product. Dodaj odpowiedni schemat dla swojego typu strony.",
    impact: "medium",
    value: hasArticleOrProduct,
  });

  // 6. Organization schema with sameAs (iPullRank Ch.9 — Knowledge Graph readiness)
  const hasOrg = expandedTypes.has("Organization") || detectedTypes.includes("WebSite");
  const hasSameAs = schemas.some((s) => s.hasSameAs);

  // Organization schema: fail on homepage/landing (brand identity is critical there), warning elsewhere
  const orgCritical = ["homepage", "landing"].includes(pageType);
  checks.push({
    id: "organization_schema",
    label: "Schema Organization / WebSite",
    status: hasOrg ? (hasSameAs ? "pass" : "warning") : orgCritical ? "fail" : "warning",
    description: hasOrg
      ? hasSameAs
        ? "Znaleziono schemat Organization lub WebSite z linkami sameAs — silny sygnał gotowości do Knowledge Graph. Silniki AI używają sameAs do identyfikacji Twojej marki jako znany podmiot."
        : "Znaleziono schemat Organization, ale brak właściwości sameAs. Dodaj linki sameAs (Wikipedia, Wikidata, oficjalne profile społecznościowe), aby ustanowić markę jako znany podmiot w grafach wiedzy AI."
      : orgCritical
      ? "Brak schematu Organization na stronie głównej/landing. To krytyczna luka — silniki AI nie mogą zidentyfikować Twojej marki jako znany podmiot. Dodaj schemat Organization z sameAs (Wikipedia, Wikidata, profile społecznościowe)."
      : "Brak schematu Organization. Dodaj schemat Organization lub WebSite z linkami sameAs, aby ustanowić tożsamość podmiotu w grafach wiedzy AI.",
    impact: orgCritical ? "high" : "medium",
    value: hasOrg,
  });

  // 7. Schema Semantic Quality — Task 7 (Dan Petrovic / Grounding Budget)
  // Replaces binary completeness check with 3-dimensional semantic validation:
  //   completeness (required + recommended properties)
  //   correctness (values are semantically valid, not placeholders)
  //   semantic value (grounding-relevant properties for AI Knowledge Graph)
  const semanticValidation = validateAllSchemas(
    schemas.map(s => ({ type: s.type, raw: s.raw }))
  );

  // Use the semantic validator's overall score as the new completeness score
  const avgCompleteness = semanticValidation.avgOverallScore;

  let schemaQualityStatus: AuditCheck["status"];
  let schemaQualityDescription: string;

  if (schemas.length === 0) {
    schemaQualityStatus = "info";
    schemaQualityDescription = "Brak schematu do oceny. Najpierw dodaj schemat JSON-LD.";
  } else if (semanticValidation.totalErrors > 0) {
    // Has required property errors — always fail regardless of score
    schemaQualityStatus = "fail";
    const missingList = semanticValidation.criticalMissingProperties.slice(0, 4).join(", ");
    schemaQualityDescription = `Schemat zawiera ${semanticValidation.totalErrors} błąd${semanticValidation.totalErrors > 1 ? "y" : ""} krytyczne: brakuje wymaganych właściwości (${missingList}). ` +
      `Kompletność: ${semanticValidation.avgCompletenessScore}%, Poprawność: ${semanticValidation.avgCorrectnessScore}%, Wartość semantyczna: ${semanticValidation.avgSemanticValueScore}%.`;
  } else if (avgCompleteness >= 75) {
    schemaQualityStatus = "pass";
    schemaQualityDescription = `Wysoka jakość semantyczna schematu (${avgCompleteness}/100). ` +
      `Kompletność: ${semanticValidation.avgCompletenessScore}%, Poprawność: ${semanticValidation.avgCorrectnessScore}%, Wartość semantyczna: ${semanticValidation.avgSemanticValueScore}%. ` +
      `Silniki AI mają bogaty kontekst do grounding encji.`;
  } else if (avgCompleteness >= 45) {
    schemaQualityStatus = "warning";
    const warnings = semanticValidation.totalWarnings;
    const missingRec = semanticValidation.results.flatMap(r => r.missingRecommended).slice(0, 3).join(", ");
    schemaQualityDescription = `Umiarkowana jakość semantyczna schematu (${avgCompleteness}/100). ` +
      `${warnings > 0 ? `${warnings} ostrzeżeń: brakuje zalecanych właściwości (${missingRec}). ` : ""}` +
      `Kompletność: ${semanticValidation.avgCompletenessScore}%, Wartość semantyczna: ${semanticValidation.avgSemanticValueScore}%.`;
  } else {
    schemaQualityStatus = "fail";
    schemaQualityDescription = `Niska jakość semantyczna schematu (${avgCompleteness}/100). ` +
      `Schematy są obecne, ale ubogie w kontekst. Kompletność: ${semanticValidation.avgCompletenessScore}%, ` +
      `Wartość semantyczna: ${semanticValidation.avgSemanticValueScore}%. ` +
      `Dodaj właściwości: sameAs (Wikidata/Wikipedia), author z @type i url, keywords, about.`;
  }

  checks.push({
    id: "schema_completeness",
    label: "Jakość semantyczna schematu",
    status: schemaQualityStatus,
    score: avgCompleteness,
    description: schemaQualityDescription,
    impact: "high",
    value: `completeness:${semanticValidation.avgCompletenessScore}%,correctness:${semanticValidation.avgCorrectnessScore}%,semantic:${semanticValidation.avgSemanticValueScore}%`,
  });

  // 8. Author markup
  const hasAuthor = schemas.some((s) => s.hasAuthor);
  checks.push({
    id: "author_schema",
    label: "Markup autora",
    status: hasAuthor ? "pass" : "warning",
    description: hasAuthor
      ? "Znaleziono właściwość autora w schemacie — wspiera sygnały E-E-A-T."
      : "Brak markup autora w schemacie. Dodaj właściwość 'author' do schematu Article dla E-E-A-T.",
    impact: "medium",
    value: hasAuthor,
  });

  // 9. dateModified + datePublished — with freshness scoring (c)
  // Strategy:
  //  - Presence check: are dates declared at all?
  //  - Freshness check: if declared, how old is the content?
  //  - Context-aware: freshness warnings apply only to time-sensitive schema types
  //    (Article, NewsArticle, BlogPosting). Evergreen types (Product, Organization,
  //    WebSite, FAQPage, HowTo) are NOT penalised for age — absence of dates is also
  //    not a failure for these types.
  const hasDateModified = schemas.some((s) => s.hasDateModified);
  const hasDatePublished = schemas.some((s) => s.hasDatePublished);

  // Determine if any schema type is time-sensitive
  const timeSensitiveTypes = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle"]);
  const hasTimeSensitiveSchema = schemas.some(s =>
    s.type.split(",").map(t => t.trim()).some(t => timeSensitiveTypes.has(t))
  );

  // Extract the most recent date value for freshness scoring
  let contentAgeMonths: number | null = null;
  const dateFields = ["dateModified", "datePublished"];
  for (const schema of schemas) {
    for (const field of dateFields) {
      const raw = schema.raw[field];
      if (typeof raw === "string" && raw.length >= 4) {
        try {
          const parsed = new Date(raw);
          if (!isNaN(parsed.getTime())) {
            const months = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
            if (contentAgeMonths === null || months < contentAgeMonths) {
              contentAgeMonths = Math.round(months);
            }
          }
        } catch { /* ignore unparseable dates */ }
      }
    }
  }

  // Build status and description
  let dateStatus: AuditCheck["status"];
  let dateDescription: string;
  let dateImpact: AuditCheck["impact"] = "medium";

  if (hasDateModified && hasDatePublished) {
    // Dates present — check freshness only for time-sensitive types
    if (hasTimeSensitiveSchema && contentAgeMonths !== null && contentAgeMonths > 24) {
      dateStatus = "fail";
      dateDescription = `Treść ma ${contentAgeMonths} miesięcy (ponad 2 lata). Silniki AI depriorytetyzują przestarzałe artykuły dla zapytań wymagających aktualności. Zaktualizuj treść i zmień dateModified.`;
      dateImpact = "high";
    } else if (hasTimeSensitiveSchema && contentAgeMonths !== null && contentAgeMonths > 12) {
      dateStatus = "warning";
      dateDescription = `Treść ma ${contentAgeMonths} miesięcy. Dla artykułów i poradników Perplexity i Google AI Overviews preferują treści zaktualizowane w ciągu ostatnich 12 miesięcy. Rozważ odświeżenie.`;
    } else {
      dateStatus = "pass";
      dateDescription = contentAgeMonths !== null
        ? `Znaleziono datePublished i dateModified (wiek: ${contentAgeMonths} mies.) — silniki AI mogą ocenić świeżość treści.`
        : "Znaleziono datePublished i dateModified — silniki AI używają ich do oceny świeżości i trafności treści.";
    }
  } else if (hasDateModified || hasDatePublished) {
    dateStatus = "warning";
    dateDescription = hasDateModified
      ? "Znaleziono dateModified, ale brak datePublished. Dodaj datePublished, aby uzupełnić sygnały świeżości."
      : "Znaleziono datePublished, ale brak dateModified. Dodaj dateModified i aktualizuj go przy każdej zmianie treści.";
  } else if (hasTimeSensitiveSchema) {
    // Time-sensitive type but no dates — this is a real gap
    dateStatus = "warning";
    dateDescription = "Brak właściwości dat w schemacie Article/BlogPosting. Dodaj datePublished i dateModified — silniki AI używają ich do oceny świeżości. Treści bez dat mogą być depriorytetyzowane.";
  } else {
    // No dates, but not time-sensitive — informational only, no penalty
    dateStatus = "info";
    dateDescription = "Brak właściwości dat w schemacie. Dla stron evergreen (produkty, organizacje) daty nie są wymagane. Jeśli treść jest regularnie aktualizowana, dodaj dateModified dla lepszego sygnału świeżości.";
    dateImpact = "low";
  }

  checks.push({
    id: "date_signals",
    label: "Sygnały dat i świeżości treści",
    status: dateStatus,
    description: dateDescription,
    impact: dateImpact,
    value: `published:${hasDatePublished}, modified:${hasDateModified}, age:${contentAgeMonths ?? "unknown"}mo`,
  });

  // 10. BreadcrumbList
  const hasBreadcrumb = detectedTypes.includes("BreadcrumbList");
  checks.push({
    id: "breadcrumb_schema",
    label: "Schema BreadcrumbList",
    status: hasBreadcrumb ? "pass" : "info",
    description: hasBreadcrumb
      ? "Znaleziono schemat BreadcrumbList — poprawia kontekst nawigacji dla silników AI."
      : "Brak schematu BreadcrumbList. Rozważ dodanie markup nawigacji okruszkowej dla lepszego kontekstu.",
    impact: "low",
    value: hasBreadcrumb,
  });

  const score = computeScore(checks);

  return {
    score,
    maxScore: 100,
    checks,
    schemas,
    summary: buildSummary(score, schemas.length, foundHighValue.length, avgCompleteness),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    jsonld_present: 20,
    high_value_schema: 15,
    faq_schema: 15,
    howto_schema: 5,           // NEW
    article_product_schema: 10,
    organization_schema: 8,
    schema_completeness: 15,   // NEW — replaces simple presence check
    author_schema: 5,
    date_signals: 5,           // Updated — combines dateModified + datePublished
    breadcrumb_schema: 2,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.4;
    else if (check.status === "info") earned += w * 0.1;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  score: number,
  schemaCount: number,
  highValueCount: number,
  avgCompleteness: number
): string {
  if (schemaCount === 0)
    return "Brak danych strukturalnych. Dodanie schematu JSON-LD to pojedyncza poprawa o najwyższym wpływie na widoczność AI — pozwala silnikom AI zrozumieć Twoją treść bez czytania każdego słowa.";
  if (score >= 80)
    return `Silne dane strukturalne: ${schemaCount} blok${schemaCount > 1 ? "i" : ""} schematu z ${highValueCount} typem${highValueCount > 1 ? "ami" : ""} wysokiej wartości przy ${avgCompleteness}% kompletności.`;
  if (avgCompleteness < 50)
    return `Znaleziono ${schemaCount} blok${schemaCount > 1 ? "i" : ""} schematu, ale słabo wypełnione (${avgCompleteness}% kompletności). Wypełnij wszystkie zalecane właściwości.`;
  return `Znaleziono ${schemaCount} blok${schemaCount > 1 ? "i" : ""} schematu, ale brakuje kluczowych typów. Dodaj schematy FAQPage, HowTo i Organization z linkami sameAs.`;
}
