import type { ScrapedPage } from "./scraper";

export type PageType =
  | "article"         // Blog posts, news, guides, how-tos
  | "product"         // Single product page
  | "product-listing" // Category/listing with multiple products
  | "homepage"        // Root domain or /index
  | "landing"         // Marketing/conversion page
  | "service"         // Service page (agency, SaaS, B2B)
  | "generic";        // Fallback

export interface PageTypeResult {
  type: PageType;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

/**
 * Detects the type of a web page based on structured data, URL patterns,
 * HTML structure, and content signals. Used to adapt audit criteria per page type.
 */
export function detectPageType(page: ScrapedPage): PageTypeResult {
  const $ = page.$;
  const url = page.url.toLowerCase();
  const signals: string[] = [];
  const scores: Record<PageType, number> = {
    article: 0,
    product: 0,
    "product-listing": 0,
    homepage: 0,
    landing: 0,
    service: 0,
    generic: 0,
  };

  // ── 1. JSON-LD schema signals (strongest signal) ──────────────────────────
  const jsonldBlocks: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() ?? "{}");
      jsonldBlocks.push(parsed);
    } catch {
      // ignore malformed JSON-LD
    }
  });

  const allTypes = collectAllTypes(jsonldBlocks);

  if (allTypes.has("Product") && !allTypes.has("ItemList")) {
    scores.product += 40;
    signals.push("JSON-LD: Product schema");
  }
  if (allTypes.has("ItemList") || allTypes.has("CollectionPage")) {
    scores["product-listing"] += 40;
    signals.push("JSON-LD: ItemList/CollectionPage schema");
  }
  if (allTypes.has("Article") || allTypes.has("BlogPosting") || allTypes.has("NewsArticle") || allTypes.has("TechArticle")) {
    scores.article += 45;
    signals.push(`JSON-LD: Article-type schema (${Array.from(allTypes).filter(t => ["Article","BlogPosting","NewsArticle","TechArticle"].includes(t)).join(", ")})`);
  }
  if (allTypes.has("WebSite") || allTypes.has("Organization")) {
    scores.homepage += 20;
    signals.push("JSON-LD: WebSite/Organization schema");
  }
  if (allTypes.has("Service") || allTypes.has("ProfessionalService") || allTypes.has("LocalBusiness")) {
    scores.service += 30;
    signals.push("JSON-LD: Service/LocalBusiness schema");
  }
  if (allTypes.has("FAQPage") || allTypes.has("HowTo")) {
    scores.article += 15;
    signals.push("JSON-LD: FAQPage/HowTo schema");
  }

  // ── 2. URL pattern signals ────────────────────────────────────────────────
  const urlPath = new URL(page.url).pathname.toLowerCase();

  // Homepage detection
  if (urlPath === "/" || urlPath === "" || urlPath === "/index" || urlPath === "/index.html") {
    scores.homepage += 50;
    signals.push("URL: root path (homepage)");
  }

  // Article/blog URL patterns
  if (/\/(blog|article|post|news|guide|tutorial|poradnik|artykul|wpis|aktualnosci|wiedza)\//i.test(urlPath)) {
    scores.article += 35;
    signals.push("URL: blog/article path pattern");
  }

  // Product listing / category URL patterns
  if (/\/(category|kategoria|cat|shop|sklep|collection|kolekcja|produkty|products|listing)\//i.test(urlPath)) {
    scores["product-listing"] += 35;
    signals.push("URL: category/listing path pattern");
  }

  // Single product URL patterns
  if (/\/(product|produkt|item|p\/|dp\/|towar)\//i.test(urlPath)) {
    scores.product += 30;
    signals.push("URL: product path pattern");
  }

  // ── 3. HTML structure signals ─────────────────────────────────────────────
  const h1Text = $("h1").first().text().toLowerCase();
  const bodyText = $("body").text().toLowerCase().replace(/\s+/g, " ");

  // Article signals: date, author, reading time
  const hasDateMeta =
    !!$('meta[property="article:published_time"]').length ||
    !!$('time[datetime]').length ||
    !!$('[class*="date"], [class*="published"], [class*="posted"]').length;
  if (hasDateMeta) {
    scores.article += 20;
    signals.push("HTML: publication date element detected");
  }

  const hasAuthorMeta =
    !!$('[rel="author"], [class*="author"], [itemprop="author"]').length ||
    !!$('meta[name="author"]').length;
  if (hasAuthorMeta) {
    scores.article += 20;
    signals.push("HTML: author element detected");
  }

  // Product listing signals: multiple product cards, price elements, filters
  const productCardCount = $(
    '[class*="product"], [class*="item"], [class*="card"], [data-product-id], [data-sku]'
  ).length;
  if (productCardCount >= 6) {
    scores["product-listing"] += 30;
    signals.push(`HTML: ${productCardCount} product card elements`);
  } else if (productCardCount >= 2) {
    scores["product-listing"] += 15;
    signals.push(`HTML: ${productCardCount} product card elements`);
  }

  const hasPriceElements = $('[class*="price"], [itemprop="price"], [data-price]').length >= 3;
  if (hasPriceElements) {
    scores["product-listing"] += 15;
    signals.push("HTML: multiple price elements (listing)");
  }

  const hasFilters = !!$('[class*="filter"], [class*="facet"], [class*="sort"]').length;
  if (hasFilters) {
    scores["product-listing"] += 10;
    signals.push("HTML: filter/facet elements detected");
  }

  // Single product signals: add-to-cart, single price, product images
  const hasAddToCart = !!$(
    '[class*="add-to-cart"], [class*="buy"], [class*="kup"], [class*="dodaj"], button[type="submit"]'
  ).length;
  const singlePriceCount = $('[itemprop="price"], [class*="price--main"], [class*="product-price"]').length;
  if (hasAddToCart && singlePriceCount >= 1 && singlePriceCount <= 3) {
    scores.product += 25;
    signals.push("HTML: add-to-cart button + single price");
  }

  // Homepage signals: hero section, navigation prominence, multiple CTAs
  const hasCta = $('[class*="hero"], [class*="banner"], [class*="cta"]').length >= 2;
  if (hasCta) {
    scores.homepage += 15;
    signals.push("HTML: hero/banner/CTA elements");
  }

  // Service page signals
  const serviceKeywords = /(usługa|usługi|oferta|cennik|pricing|services?|solutions?|how it works)/i;
  if (serviceKeywords.test(bodyText.slice(0, 2000))) {
    scores.service += 15;
    signals.push("Content: service/pricing keywords");
  }

  // Landing page signals: single CTA, form, no navigation
  const hasForm = !!$('form[action], form[method]').length;
  const navLinkCount = $("nav a, header a").length;
  if (hasForm && navLinkCount <= 3) {
    scores.landing += 25;
    signals.push("HTML: form with minimal navigation (landing page)");
  }

  // ── 4. Content length signal ──────────────────────────────────────────────
  $("script, style, nav, footer, header, aside").remove();
  const wordCount = $("body").text().replace(/\s+/g, " ").trim().split(/\s+/).length;

  if (wordCount > 600 && scores.article > 0) {
    scores.article += 10;
    signals.push(`Content: ${wordCount} words (article-length)`);
  }

  // ── 5. Determine winner ───────────────────────────────────────────────────
  let winner: PageType = "generic";
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      winner = type as PageType;
    }
  }

  // Confidence based on score gap
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const gap = sortedScores[0] - (sortedScores[1] ?? 0);
  const confidence: "high" | "medium" | "low" =
    maxScore >= 40 && gap >= 20 ? "high" :
    maxScore >= 20 ? "medium" :
    "low";

  // If no strong signal, fall back to generic
  if (maxScore < 15) {
    winner = "generic";
  }

  return { type: winner, confidence, signals };
}

/**
 * Recursively collect all @type values from a JSON-LD document tree.
 */
function collectAllTypes(nodes: any[], found: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      collectAllTypes(node, found);
      continue;
    }
    if (node["@type"]) {
      const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
      for (const t of types) found.add(String(t));
    }
    if (node["@graph"]) collectAllTypes(Array.isArray(node["@graph"]) ? node["@graph"] : [node["@graph"]], found);
    for (const key of Object.keys(node)) {
      if (key.startsWith("@")) continue;
      const val = node[key];
      if (val && typeof val === "object") {
        collectAllTypes(Array.isArray(val) ? val : [val], found);
      }
    }
  }
  return found;
}

/**
 * Human-readable label for a page type.
 */
export function getPageTypeLabel(type: PageType): string {
  const labels: Record<PageType, string> = {
    article: "Article / Blog Post",
    product: "Product Page",
    "product-listing": "Product Listing / Category",
    homepage: "Homepage",
    landing: "Landing Page",
    service: "Service Page",
    generic: "Web Page",
  };
  return labels[type];
}
