import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

const HIGH_VALUE_TYPES = [
  "Article",
  "NewsArticle",
  "BlogPosting",
  "Product",
  "FAQPage",
  "HowTo",
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
      // Also recurse into ListItem.item
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

  // Recurse into any array-valued property that contains objects with @type
  for (const key of Object.keys(obj)) {
    if (["@graph", "itemListElement", "mainEntity"].includes(key)) continue;
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

function extractSchemas($: ScrapedPage["$"]): ParsedSchema[] {
  const schemas: ParsedSchema[] = [];
  // Deduplicate by reference to avoid counting the same node twice
  const seen = new WeakSet<Record<string, unknown>>();

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() ?? "{}") as Record<string, unknown>;
      const nodes = collectNodes(raw);

      for (const item of nodes) {
        if (seen.has(item)) continue;
        seen.add(item);

        // Normalise @type — can be a string or an array of strings
        const rawType = item["@type"];
        const type = Array.isArray(rawType)
          ? (rawType as string[]).join(", ")
          : String(rawType ?? "Unknown");

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
        : "No JSON-LD structured data found. Schema markup is essential for AI engines to understand your content.",
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
        : "No high-value schema types (Article, Product, FAQ, Organization) detected.",
    impact: "high",
    value: foundHighValue.join(", ") || null,
  });

  // 3. FAQ schema
  const hasFaq = schemas.some((s) => s.type === "FAQPage" && s.hasFaqItems);
  checks.push({
    id: "faq_schema",
    label: "FAQPage Schema",
    status: hasFaq ? "pass" : "warning",
    description: hasFaq
      ? "FAQPage schema with mainEntity items found — excellent for AI citation."
      : "No FAQPage schema. Adding FAQ structured data significantly improves AI answer inclusion.",
    impact: "high",
    value: hasFaq,
  });

  // 4. Article / Product schema (use expandedTypes to catch subtypes like NewsArticle, BlogPosting)
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

  // 5. Organization schema (use expandedTypes: catches LocalBusiness subtypes + publisher-embedded Org)
  const hasOrg = expandedTypes.has("Organization") || detectedTypes.includes("WebSite");
  checks.push({
    id: "organization_schema",
    label: "Organization / WebSite Schema",
    status: hasOrg ? "pass" : "warning",
    description: hasOrg
      ? "Organization or WebSite schema found — establishes entity identity for AI engines."
      : "No Organization schema. Add Organization or WebSite schema to establish entity identity.",
    impact: "medium",
    value: hasOrg,
  });

  // 6. Author markup
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

  // 7. dateModified
  const hasDateModified = schemas.some((s) => s.hasDateModified);
  checks.push({
    id: "date_modified",
    label: "dateModified Property",
    status: hasDateModified ? "pass" : "warning",
    description: hasDateModified
      ? "dateModified property found — helps AI engines assess content freshness."
      : "No dateModified property. Add dateModified to signal content freshness to AI crawlers.",
    impact: "medium",
    value: hasDateModified,
  });

  // 8. BreadcrumbList
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
    summary: buildSummary(score, schemas.length, foundHighValue.length),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    jsonld_present: 25,
    high_value_schema: 20,
    faq_schema: 20,
    article_product_schema: 15,
    organization_schema: 10,
    author_schema: 5,
    date_modified: 3,
    breadcrumb_schema: 2,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.4;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  score: number,
  schemaCount: number,
  highValueCount: number
): string {
  if (schemaCount === 0)
    return "No structured data found. Adding JSON-LD schema is the single highest-impact improvement for AI visibility.";
  if (score >= 80)
    return `Strong structured data with ${schemaCount} schema block${schemaCount > 1 ? "s" : ""} including ${highValueCount} high-value type${highValueCount > 1 ? "s" : ""}.`;
  return `${schemaCount} schema block${schemaCount > 1 ? "s" : ""} found but missing key types. Add FAQPage, Article, and Organization schemas.`;
}
