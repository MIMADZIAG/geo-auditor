/**
 * Schema Semantic Validator — Task 7 (Dan Petrovic / Grounding Budget methodology)
 *
 * Goes beyond "schema is present" to evaluate:
 *  1. COMPLETENESS — required + recommended properties filled
 *  2. CORRECTNESS — values are semantically valid (not empty strings, not placeholders)
 *  3. SEMANTIC VALUE — properties that carry meaning for AI Knowledge Graph grounding
 *
 * Design principles:
 *  - Schema.org vocabulary as ground truth (no external API calls needed)
 *  - Per-type validation rules derived from Google's Rich Results requirements
 *    and schema.org specification
 *  - Continuous 0–100 scoring (not binary pass/fail)
 *  - Actionable, specific error messages
 *
 * Reference:
 *  - https://schema.org/docs/full.html
 *  - https://developers.google.com/search/docs/appearance/structured-data
 *  - Dan Petrovic: "Grounding Budget" — AI systems allocate a fixed budget to
 *    ground entities. Semantically rich schema reduces this budget, increasing
 *    the probability of being cited.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchemaValidationIssue {
  severity: "error" | "warning" | "suggestion";
  property: string;
  message: string;
}

export interface SchemaValidationResult {
  type: string;
  /** 0–100 completeness score */
  completenessScore: number;
  /** 0–100 correctness score (values are semantically valid) */
  correctnessScore: number;
  /** 0–100 semantic value score (grounding-relevant properties) */
  semanticValueScore: number;
  /** Combined 0–100 score (weighted average) */
  overallScore: number;
  issues: SchemaValidationIssue[];
  /** Properties present and valid */
  validProperties: string[];
  /** Properties missing that are required by Google Rich Results */
  missingRequired: string[];
  /** Properties missing that are recommended for AI grounding */
  missingRecommended: string[];
}

// ─── Schema.org Property Definitions ─────────────────────────────────────────

/**
 * Per-type validation rules.
 * required: Google Rich Results required properties (absence = error)
 * recommended: Strongly recommended for AI grounding (absence = warning)
 * grounding: Properties that directly help AI systems ground this entity
 *             in the Knowledge Graph (absence = suggestion)
 */
const SCHEMA_RULES: Record<string, {
  required: string[];
  recommended: string[];
  grounding: string[];
}> = {
  Article: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "description", "image", "publisher", "url"],
    grounding: ["sameAs", "about", "keywords", "articleSection", "wordCount"],
  },
  NewsArticle: {
    required: ["headline", "author", "datePublished", "image"],
    recommended: ["dateModified", "description", "publisher", "url", "articleSection"],
    grounding: ["sameAs", "about", "keywords", "dateline", "printEdition"],
  },
  BlogPosting: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "description", "image", "publisher", "url"],
    grounding: ["sameAs", "about", "keywords", "articleSection"],
  },
  Product: {
    required: ["name", "offers"],
    recommended: ["description", "image", "brand", "aggregateRating", "sku"],
    grounding: ["gtin", "mpn", "category", "color", "material", "model", "identifier"],
  },
  FAQPage: {
    required: ["mainEntity"],
    recommended: ["name", "description", "url"],
    grounding: ["about", "keywords", "speakable"],
  },
  HowTo: {
    required: ["name", "step"],
    recommended: ["description", "image", "totalTime", "estimatedCost"],
    grounding: ["tool", "supply", "yield", "performTime", "prepTime"],
  },
  Organization: {
    required: ["name"],
    recommended: ["url", "logo", "description", "address", "contactPoint"],
    grounding: ["sameAs", "foundingDate", "numberOfEmployees", "legalName", "taxID", "vatID"],
  },
  LocalBusiness: {
    required: ["name", "address"],
    recommended: ["telephone", "url", "openingHours", "geo", "image"],
    grounding: ["sameAs", "priceRange", "paymentAccepted", "currenciesAccepted", "hasMap"],
  },
  Person: {
    required: ["name"],
    recommended: ["url", "image", "jobTitle", "worksFor"],
    grounding: ["sameAs", "knowsAbout", "alumniOf", "award", "honorificSuffix"],
  },
  Event: {
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "description", "image", "organizer", "offers"],
    grounding: ["sameAs", "about", "eventStatus", "eventAttendanceMode", "performer"],
  },
  Recipe: {
    required: ["name", "recipeIngredient", "recipeInstructions"],
    recommended: ["image", "author", "description", "prepTime", "cookTime", "recipeYield"],
    grounding: ["nutrition", "suitableForDiet", "aggregateRating", "keywords", "recipeCategory"],
  },
  VideoObject: {
    required: ["name", "description", "thumbnailUrl", "uploadDate"],
    recommended: ["contentUrl", "embedUrl", "duration", "author"],
    grounding: ["transcript", "keywords", "about", "hasPart"],
  },
  BreadcrumbList: {
    required: ["itemListElement"],
    recommended: [],
    grounding: [],
  },
  WebSite: {
    required: ["name", "url"],
    recommended: ["description", "publisher"],
    grounding: ["sameAs", "potentialAction", "inLanguage"],
  },
  WebPage: {
    required: ["name", "url"],
    recommended: ["description", "dateModified", "author"],
    grounding: ["speakable", "about", "keywords", "breadcrumb", "mainEntity"],
  },
  Review: {
    required: ["itemReviewed", "reviewRating", "author"],
    recommended: ["description", "datePublished", "publisher"],
    grounding: ["about", "reviewBody"],
  },
};

// ─── Value Validators ─────────────────────────────────────────────────────────

/** Common placeholder values that indicate empty/invalid schema */
const PLACEHOLDER_PATTERNS = [
  /^(n\/a|n\.a\.|none|null|undefined|unknown|placeholder|todo|tbd|example|test|lorem ipsum)/i,
  /^https?:\/\/example\.(com|org|net)/i,
  /^https?:\/\/(www\.)?your-?domain/i,
];

/** Minimum meaningful string length for text properties */
const MIN_TEXT_LENGTH = 3;

/** URL-valued properties */
const URL_PROPERTIES = new Set(["url", "sameAs", "image", "logo", "contentUrl", "embedUrl", "thumbnailUrl"]);

/** Date-valued properties */
const DATE_PROPERTIES = new Set(["datePublished", "dateModified", "startDate", "endDate", "uploadDate", "foundingDate"]);

/**
 * Validate a single property value.
 * Returns true if the value is semantically valid.
 */
function isValidValue(property: string, value: unknown): boolean {
  if (value === null || value === undefined) return false;

  // Arrays: valid if non-empty and at least one element is valid
  if (Array.isArray(value)) {
    return value.length > 0 && value.some(v => isValidValue(property, v));
  }

  // Objects: valid if they have meaningful content
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Must have at least @type or name or text
    return !!(obj["@type"] || obj["name"] || obj["text"] || obj["@id"]);
  }

  // Strings: check for empty, too short, or placeholder values
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length < MIN_TEXT_LENGTH) return false;
    if (PLACEHOLDER_PATTERNS.some(p => p.test(trimmed))) return false;

    // URL properties: must look like a URL
    if (URL_PROPERTIES.has(property)) {
      try {
        new URL(trimmed);
        return true;
      } catch {
        // Allow relative URLs and Wikidata QIDs
        return trimmed.startsWith("/") || trimmed.startsWith("Q") || trimmed.length > 5;
      }
    }

    // Date properties: must be parseable
    if (DATE_PROPERTIES.has(property)) {
      const parsed = new Date(trimmed);
      return !isNaN(parsed.getTime());
    }

    return true;
  }

  // Numbers: valid if positive
  if (typeof value === "number") {
    return !isNaN(value) && value >= 0;
  }

  // Booleans: always valid
  if (typeof value === "boolean") return true;

  return false;
}

// ─── Semantic Value Scorer ────────────────────────────────────────────────────

/**
 * Score the "semantic value" of a schema object — how much it helps AI systems
 * ground this entity in the Knowledge Graph.
 *
 * Key insight (Dan Petrovic / Grounding Budget):
 *   AI systems allocate a fixed computational budget to ground entities.
 *   Properties like sameAs (Wikidata/Wikipedia links), identifier, and
 *   structured nested entities dramatically reduce this budget.
 *
 * Returns 0–100.
 */
function computeSemanticValueScore(
  item: Record<string, unknown>,
  type: string
): number {
  const rules = SCHEMA_RULES[type] ?? SCHEMA_RULES["WebPage"];
  let score = 0;
  let maxScore = 0;

  // sameAs: highest semantic value — directly links to Knowledge Graph
  const sameAsWeight = 30;
  maxScore += sameAsWeight;
  const sameAs = item["sameAs"];
  if (sameAs) {
    const urls = Array.isArray(sameAs) ? sameAs : [sameAs];
    const validUrls = urls.filter(u => typeof u === "string" && u.length > 5);
    if (validUrls.length > 0) {
      // Bonus for Wikidata/Wikipedia links (highest grounding value)
      const hasWikidata = validUrls.some(u => String(u).includes("wikidata.org") || String(u).includes("wikipedia.org"));
      score += hasWikidata ? sameAsWeight : sameAsWeight * 0.7;
    }
  }

  // identifier / gtin / mpn: entity disambiguation
  const identifierWeight = 15;
  maxScore += identifierWeight;
  if (item["identifier"] || item["gtin"] || item["gtin13"] || item["gtin8"] || item["mpn"] || item["sku"]) {
    score += identifierWeight;
  }

  // Nested entities (author, publisher, brand, organization)
  const nestedEntityWeight = 20;
  maxScore += nestedEntityWeight;
  const nestedProps = ["author", "publisher", "brand", "organizer", "provider", "creator"];
  const hasRichNested = nestedProps.some(prop => {
    const val = item[prop];
    if (!val || typeof val !== "object") return false;
    const obj = val as Record<string, unknown>;
    // Rich nested entity: has @type AND (sameAs OR url OR identifier)
    return !!(obj["@type"] && (obj["sameAs"] || obj["url"] || obj["identifier"]));
  });
  if (hasRichNested) score += nestedEntityWeight;
  else {
    const hasAnyNested = nestedProps.some(prop => item[prop] && typeof item[prop] === "object");
    if (hasAnyNested) score += nestedEntityWeight * 0.5;
  }

  // about / keywords: topical grounding
  const topicalWeight = 15;
  maxScore += topicalWeight;
  if (item["about"] || item["keywords"]) {
    score += topicalWeight;
  }

  // speakable: voice/AI assistant optimisation
  const speakableWeight = 10;
  maxScore += speakableWeight;
  if (item["speakable"]) {
    score += speakableWeight;
  }

  // mainEntity / hasPart: content structure for AI extraction
  const structureWeight = 10;
  maxScore += structureWeight;
  if (item["mainEntity"] || item["hasPart"]) {
    score += structureWeight;
  }

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

// ─── Main Validator ───────────────────────────────────────────────────────────

/**
 * Validate a single schema object against its type rules.
 * Returns a comprehensive validation result with scores and issues.
 */
export function validateSchema(
  item: Record<string, unknown>,
  type: string
): SchemaValidationResult {
  // Normalise type (handle multi-type like "Article, NewsArticle")
  const primaryType = type.split(",")[0].trim();
  const rules = SCHEMA_RULES[primaryType];

  const issues: SchemaValidationIssue[] = [];
  const validProperties: string[] = [];
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  if (!rules) {
    // Unknown type — basic validation only
    return {
      type: primaryType,
      completenessScore: 50, // neutral
      correctnessScore: 50,
      semanticValueScore: computeSemanticValueScore(item, "WebPage"),
      overallScore: 50,
      issues: [{
        severity: "suggestion",
        property: "@type",
        message: `Schema type "${primaryType}" is not in the standard validation ruleset. Basic validation applied.`,
      }],
      validProperties: Object.keys(item).filter(k => !k.startsWith("@")),
      missingRequired: [],
      missingRecommended: [],
    };
  }

  // ── 1. Completeness check ─────────────────────────────────────────────────

  // Required properties
  for (const prop of rules.required) {
    if (isValidValue(prop, item[prop])) {
      validProperties.push(prop);
    } else {
      missingRequired.push(prop);
      issues.push({
        severity: "error",
        property: prop,
        message: `Required property "${prop}" is missing or empty. This is required by Google Rich Results for ${primaryType}.`,
      });
    }
  }

  // Recommended properties
  for (const prop of rules.recommended) {
    if (isValidValue(prop, item[prop])) {
      validProperties.push(prop);
    } else {
      missingRecommended.push(prop);
      issues.push({
        severity: "warning",
        property: prop,
        message: `Recommended property "${prop}" is missing. Adding it improves AI grounding for ${primaryType}.`,
      });
    }
  }

  // Grounding properties (suggestions)
  for (const prop of rules.grounding) {
    if (isValidValue(prop, item[prop])) {
      validProperties.push(prop);
    } else {
      issues.push({
        severity: "suggestion",
        property: prop,
        message: `Grounding property "${prop}" is missing. This helps AI systems identify and cite this ${primaryType} entity.`,
      });
    }
  }

  // ── 2. Correctness check ──────────────────────────────────────────────────

  // Check all present properties for semantic validity
  let correctCount = 0;
  let totalPresent = 0;

  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("@")) continue; // skip @type, @context, @id
    if (value === null || value === undefined) continue;

    totalPresent++;
    if (isValidValue(key, value)) {
      correctCount++;
    } else {
      issues.push({
        severity: "warning",
        property: key,
        message: `Property "${key}" has an invalid or placeholder value: "${String(value).slice(0, 50)}". Replace with a real, meaningful value.`,
      });
    }
  }

  // ── 3. Compute scores ─────────────────────────────────────────────────────

  const allRequired = rules.required.length;
  const allRecommended = rules.recommended.length;
  const totalExpected = allRequired + allRecommended;

  const completenessScore = totalExpected > 0
    ? Math.round(
        ((allRequired - missingRequired.length) / Math.max(allRequired, 1)) * 60 +
        ((allRecommended - missingRecommended.length) / Math.max(allRecommended, 1)) * 40
      )
    : 50;

  const correctnessScore = totalPresent > 0
    ? Math.round((correctCount / totalPresent) * 100)
    : 100; // no properties = no errors

  const semanticValueScore = computeSemanticValueScore(item, primaryType);

  // Weighted overall: completeness 40%, correctness 30%, semantic value 30%
  const overallScore = Math.round(
    completenessScore * 0.40 +
    correctnessScore * 0.30 +
    semanticValueScore * 0.30
  );

  return {
    type: primaryType,
    completenessScore,
    correctnessScore,
    semanticValueScore,
    overallScore,
    issues,
    validProperties: Array.from(new Set(validProperties)),
    missingRequired,
    missingRecommended,
  };
}

/**
 * Validate all schemas on a page and return an aggregate result.
 * Used by structuredData.ts to enrich the schema_completeness check.
 */
export function validateAllSchemas(
  schemas: Array<{ type: string; raw: Record<string, unknown> }>
): {
  avgOverallScore: number;
  avgCompletenessScore: number;
  avgCorrectnessScore: number;
  avgSemanticValueScore: number;
  results: SchemaValidationResult[];
  totalErrors: number;
  totalWarnings: number;
  criticalMissingProperties: string[];
} {
  if (schemas.length === 0) {
    return {
      avgOverallScore: 0,
      avgCompletenessScore: 0,
      avgCorrectnessScore: 0,
      avgSemanticValueScore: 0,
      results: [],
      totalErrors: 0,
      totalWarnings: 0,
      criticalMissingProperties: [],
    };
  }

  const results = schemas.map(s => validateSchema(s.raw, s.type));

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const totalErrors = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === "error").length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === "warning").length, 0);

  // Collect critical missing properties across all schemas
  const criticalMissingProperties = Array.from(new Set(
    results.flatMap(r => r.missingRequired)
  ));

  return {
    avgOverallScore: avg(results.map(r => r.overallScore)),
    avgCompletenessScore: avg(results.map(r => r.completenessScore)),
    avgCorrectnessScore: avg(results.map(r => r.correctnessScore)),
    avgSemanticValueScore: avg(results.map(r => r.semanticValueScore)),
    results,
    totalErrors,
    totalWarnings,
    criticalMissingProperties,
  };
}
