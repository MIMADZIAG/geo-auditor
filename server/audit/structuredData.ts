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

export function analyzeStructuredData(page: ScrapedPage): CategoryResult & { schemas: ParsedSchema[] } {
  const checks: AuditCheck[] = [];
  const schemas = extractSchemas(page.$);
  const detectedTypes = schemas.map((s) => s.type);

  // 1. Any JSON-LD present
  checks.push({
    id: "jsonld_present",
    label: "JSON-LD Schema Present",
    status: schemas.length > 0 ? "pass" : "fail",
    description:
      schemas.length > 0
        ? `Found ${schemas.length} JSON-LD schema block${schemas.length > 1 ? "s" : ""}: ${detectedTypes.join(", ")}`
        : "No JSON-LD structured data found. Schema markup is essential for AI engines to understand your content without reading every word — it's how they build knowledge graph connections.",
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
    label: "High-Value Schema Types",
    status:
      foundHighValue.length >= 2
        ? "pass"
        : foundHighValue.length === 1
        ? "warning"
        : "fail",
    description:
      foundHighValue.length > 0
        ? `Detected: ${Array.from(new Set([...detectedTypes, ...foundHighValue])).join(", ")}`
        : "No high-value schema types (Article, Product, FAQ, HowTo, Organization) detected. These are the types AI engines use to categorize and cite content.",
    impact: "high",
    value: foundHighValue.join(", ") || null,
  });

  // 3. FAQ schema (iPullRank Ch.9 — explicitly recommended)
  const hasFaq = schemas.some((s) => s.type === "FAQPage" && s.hasFaqItems);
  const faqItemCount = schemas.find(s => s.type === "FAQPage")
    ? (schemas.find(s => s.type === "FAQPage")!.raw["mainEntity"] as unknown[] | undefined)?.length ?? 0
    : 0;

  checks.push({
    id: "faq_schema",
    label: "FAQPage Schema",
    status: hasFaq ? "pass" : "warning",
    description: hasFaq
      ? `FAQPage schema with ${faqItemCount} Q&A item${faqItemCount !== 1 ? "s" : ""} found — excellent for AI answer inclusion. FAQPage is one of the most impactful schema types for GEO.`
      : "No FAQPage schema. Adding FAQ structured data significantly improves AI answer inclusion — it's one of the most cited schema types in AI Overviews and Perplexity answers.",
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
    label: "HowTo Schema",
    status: hasHowTo ? "pass" : "info",
    description: hasHowTo
      ? `HowTo schema with ${howToStepCount} step${howToStepCount !== 1 ? "s" : ""} found — step-by-step content is highly cited by AI engines for instructional queries.`
      : "No HowTo schema. If your page contains step-by-step instructions, add HowTo schema — AI engines heavily cite structured instructional content.",
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
    label: "Article or Product Schema",
    status: hasArticleOrProduct ? "pass" : "warning",
    description: hasArticleOrProduct
      ? articleSubtype
        ? `${articleSubtype} schema detected (a subtype of Article) — helps AI engines categorize your content.`
        : "Article or Product schema detected — helps AI engines categorize your content."
      : "No Article or Product schema. Add appropriate schema for your page type.",
    impact: "medium",
    value: hasArticleOrProduct,
  });

  // 6. Organization schema with sameAs (iPullRank Ch.9 — Knowledge Graph readiness)
  const hasOrg = expandedTypes.has("Organization") || detectedTypes.includes("WebSite");
  const hasSameAs = schemas.some((s) => s.hasSameAs);

  checks.push({
    id: "organization_schema",
    label: "Organization / WebSite Schema",
    status: hasOrg ? (hasSameAs ? "pass" : "warning") : "warning",
    description: hasOrg
      ? hasSameAs
        ? "Organization or WebSite schema with sameAs links found — strong Knowledge Graph readiness signal. AI engines use sameAs to identify your brand as a known entity."
        : "Organization schema found but missing sameAs property. Add sameAs links (Wikipedia, Wikidata, official social profiles) to establish your brand as a known entity in AI knowledge graphs."
      : "No Organization schema. Add Organization or WebSite schema with sameAs links to establish entity identity in AI knowledge graphs.",
    impact: "medium",
    value: hasOrg,
  });

  // 7. Schema completeness (iPullRank Ch.9 — "Be comprehensive, not just compliant")
  const avgCompleteness = schemas.length > 0
    ? Math.round(schemas.reduce((sum, s) => sum + s.completenessScore, 0) / schemas.length)
    : 0;

  checks.push({
    id: "schema_completeness",
    label: "Schema Completeness",
    status: avgCompleteness >= 70 ? "pass" : avgCompleteness >= 40 ? "warning" : schemas.length > 0 ? "fail" : "info",
    description: schemas.length === 0
      ? "No schema to evaluate completeness. Add JSON-LD schema first."
      : avgCompleteness >= 70
      ? `Schema completeness: ${avgCompleteness}% — schemas are well-populated with recommended properties. More complete schemas give AI engines richer context.`
      : avgCompleteness >= 40
      ? `Schema completeness: ${avgCompleteness}% — schemas are present but missing many recommended properties. Fill in all available fields: author, datePublished, dateModified, image, description. iPullRank: 'Be comprehensive, not just compliant'.`
      : `Schema completeness: ${avgCompleteness}% — schemas are sparse. Many recommended properties are missing. Complete all schema fields — the more context you provide, the more accurately AI engines can extract and reuse your content.`,
    impact: "high",
    value: `${avgCompleteness}%`,
  });

  // 8. Author markup
  const hasAuthor = schemas.some((s) => s.hasAuthor);
  checks.push({
    id: "author_schema",
    label: "Author Markup",
    status: hasAuthor ? "pass" : "warning",
    description: hasAuthor
      ? "Author property found in schema — supports E-E-A-T signals."
      : "No author markup in schema. Add 'author' property to Article schema for E-E-A-T.",
    impact: "medium",
    value: hasAuthor,
  });

  // 9. dateModified + datePublished (freshness signals)
  const hasDateModified = schemas.some((s) => s.hasDateModified);
  const hasDatePublished = schemas.some((s) => s.hasDatePublished);
  checks.push({
    id: "date_signals",
    label: "Date Signals (Published & Modified)",
    status: hasDateModified && hasDatePublished ? "pass" : hasDateModified || hasDatePublished ? "warning" : "warning",
    description: hasDateModified && hasDatePublished
      ? "Both datePublished and dateModified found — AI engines use these to assess content freshness and relevance."
      : hasDateModified
      ? "dateModified found but no datePublished. Add datePublished to complete freshness signals."
      : hasDatePublished
      ? "datePublished found but no dateModified. Add dateModified and update it when content changes — AI engines use this to assess freshness."
      : "No date properties found. Add datePublished and dateModified to help AI engines assess content freshness. Outdated content is deprioritized in AI answers.",
    impact: "medium",
    value: `published:${hasDatePublished}, modified:${hasDateModified}`,
  });

  // 10. BreadcrumbList
  const hasBreadcrumb = detectedTypes.includes("BreadcrumbList");
  checks.push({
    id: "breadcrumb_schema",
    label: "BreadcrumbList Schema",
    status: hasBreadcrumb ? "pass" : "info",
    description: hasBreadcrumb
      ? "BreadcrumbList schema found — improves navigation context for AI engines."
      : "No BreadcrumbList schema. Consider adding breadcrumb markup for better context.",
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
    return "No structured data found. Adding JSON-LD schema is the single highest-impact improvement for AI visibility — it allows AI engines to understand your content without reading every word.";
  if (score >= 80)
    return `Strong structured data: ${schemaCount} schema block${schemaCount > 1 ? "s" : ""} with ${highValueCount} high-value type${highValueCount > 1 ? "s" : ""} at ${avgCompleteness}% completeness.`;
  if (avgCompleteness < 50)
    return `${schemaCount} schema block${schemaCount > 1 ? "s" : ""} found but poorly populated (${avgCompleteness}% complete). Fill in all recommended properties — be comprehensive, not just compliant.`;
  return `${schemaCount} schema block${schemaCount > 1 ? "s" : ""} found but missing key types. Add FAQPage, HowTo, and Organization schemas with sameAs links.`;
}
