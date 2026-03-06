import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeEEAT(page: ScrapedPage, pageType: PageType = "generic"): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;
  const fullHtml = $.html()?.toLowerCase() ?? "";
  const fullText = $("body").text().toLowerCase();

  // ── 1. Author byline ──────────────────────────────────────────────────────
  // Only penalized for articles/blogs. For e-commerce, it's informational only.
  const hasAuthor =
    $('[rel="author"]').length > 0 ||
    $('[class*="author"]').length > 0 ||
    $('[itemprop="author"]').length > 0 ||
    $('meta[name="author"]').length > 0 ||
    $('[class*="byline"]').length > 0 ||
    /\b(written\s+by|author:|by\s+[a-z]+\s+[a-z]+|autor:|napisał|napisała)\b/.test(fullText);

  const authorAdaptive = (() => {
    if (["article", "service"].includes(pageType)) {
      return {
        label: "Author Byline",
        status: (hasAuthor ? "pass" : "fail") as AuditCheck["status"],
        description: hasAuthor
          ? "Author byline detected — strong E-E-A-T signal for AI engines."
          : "No author byline found. Named authorship is a critical trust signal for articles and guides. Add an author name with credentials and link to an author profile page.",
        impact: "high" as const,
      };
    } else if (["homepage", "landing"].includes(pageType)) {
      return {
        label: "Team / Brand Attribution",
        status: (hasAuthor ? "pass" : "warning") as AuditCheck["status"],
        description: hasAuthor
          ? "Author or team attribution detected."
          : "No team attribution found. Consider adding a 'Meet the Team' or 'About Us' section.",
        impact: "medium" as const,
      };
    } else {
      // product, product-listing, generic — author not expected
      return {
        label: "Seller / Brand Attribution",
        status: (hasAuthor ? "pass" : "info") as AuditCheck["status"],
        description: hasAuthor
          ? "Brand attribution detected."
          : "No author byline — not required for this page type. Focus on seller information and trust badges instead.",
        impact: "low" as const,
      };
    }
  })();

  checks.push({ id: "author_byline", value: hasAuthor, ...authorAdaptive });

  // ── 2. About page link ────────────────────────────────────────────────────
  // Broad multi-language detection: Polish, English, German, French, Spanish, Czech
  // Also checks footer specifically (most sites put About in footer nav)
  const aboutHrefPatterns = [
    'a[href*="about"]', 'a[href*="o-nas"]', 'a[href*="o-firmie"]',
    'a[href*="about-us"]', 'a[href*="kim-jestesmy"]', 'a[href*="our-story"]',
    'a[href*="company"]', 'a[href*="wspolpraca"]', 'a[href*="uber-uns"]',
    'a[href*="a-propos"]', 'a[href*="sobre-nosotros"]', 'a[href*="o-spolecnosti"]',
    'a[href*="firma"]', 'a[href*="zespol"]', 'a[href*="team"]',
    'a[href*="who-we-are"]', 'a[href*="our-company"]', 'a[href*="historia"]',
  ];
  const aboutTextPhrases = [
    "o nas", "o firmie", "kim jesteśmy", "nasza historia", "o spółce", "o sklepie",
    "nasz zespół", "poznaj nas", "o marce",
    "about us", "about", "our story", "who we are", "our team", "company",
    "über uns", "à propos", "sobre nosotros",
  ];
  const hasAboutLink =
    $(aboutHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return aboutTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check (most sites put About in footer)
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return aboutTextPhrases.some(p => text.includes(p))
        || href.includes("o-nas") || href.includes("about") || href.includes("firma");
    });

  checks.push({
    id: "about_page",
    label: "About Page Link",
    status: hasAboutLink ? "pass" : "warning",
    description: hasAboutLink
      ? "About page link found — helps AI engines establish entity identity."
      : "No 'About Us' link found. An About page is a key E-E-A-T signal that helps AI engines understand who is behind this website.",
    impact: "medium",
    value: hasAboutLink,
  });
  // ── 3. Contact information ────────────────────────────────────────────────────
  const contactHrefPatterns = [
    'a[href*="contact"]', 'a[href*="kontakt"]', 'a[href*="napisz"]',
    'a[href^="mailto:"]', 'a[href^="tel:"]',
    'a[href*="contact-us"]', 'a[href*="get-in-touch"]', 'a[href*="reach-us"]',
    'a[href*="contacto"]', 'a[href*="kontakte"]', 'a[href*="nous-contacter"]',
  ];
  const contactTextPhrases = [
    "kontakt", "contact", "contact us", "skontaktuj się", "napisz do nas",
    "napisz do nas", "wyślij wiadomość", "formularz kontaktowy", "zadzwoń",
    "get in touch", "reach us", "write to us", "email us",
    "kontaktieren", "contacto", "nous contacter",
  ];
  const hasContactInfo =
    $(contactHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return contactTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return contactTextPhrases.some(p => text.includes(p))
        || href.includes("kontakt") || href.includes("contact") || href.startsWith("mailto:") || href.startsWith("tel:");
    }) ||
    /(\+\d[\d\s\-()]{7,}|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b)/.test(fullText);

  checks.push({
    id: "contact_info",
    label: "Contact Information",
    status: hasContactInfo ? "pass" : "fail",
    description: hasContactInfo
      ? "Contact information or link found — important trust signal."
      : "No contact information found. Contact details (email, phone, or contact page link) are required for E-E-A-T compliance and AI engine trust.",
    impact: "high",
    value: hasContactInfo,
  });

  // ── 4. Legal pages (Privacy Policy + Terms) ────────────────────────────────────────────────────
  // Privacy: Polish (polityka prywatności, prywatność, RODO), English, German, French, Spanish
  const privacyHrefPatterns = [
    'a[href*="privacy"]', 'a[href*="polityka"]', 'a[href*="rodo"]',
    'a[href*="gdpr"]', 'a[href*="prywatnosci"]', 'a[href*="prywatnosc"]',
    'a[href*="datenschutz"]', 'a[href*="confidentialite"]', 'a[href*="privacidad"]',
    'a[href*="privacy-policy"]', 'a[href*="legal"]', 'a[href*="ochrona-danych"]',
  ];
  const privacyTextPhrases = [
    "polityka prywatności", "privacy policy", "prywatność", "rodo", "ochrona danych",
    "polityka cookies", "datenschutz", "confidentialité", "privacidad", "privacy",
    "polityka",
  ];
  const hasPrivacy =
    $(privacyHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return privacyTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check (Privacy Policy is almost always in footer)
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return privacyTextPhrases.some(p => text.includes(p))
        || href.includes("privacy") || href.includes("polityka") || href.includes("rodo") || href.includes("gdpr");
    });

  // Terms: Polish (regulamin, warunki), English, German, French, Spanish
  const termsHrefPatterns = [
    'a[href*="terms"]', 'a[href*="regulamin"]', 'a[href*="warunki"]',
    'a[href*="tos"]', 'a[href*="legal"]', 'a[href*="agb"]',
    'a[href*="cgv"]', 'a[href*="condiciones"]', 'a[href*="terms-of-service"]',
    'a[href*="terms-of-use"]',
  ];
  const termsTextPhrases = [
    "regulamin", "terms", "terms of service", "terms & conditions", "warunki",
    "warunki korzystania", "warunki użytkowania", "agb", "cgv", "condiciones",
    "terms of use", "user agreement",
  ];
  const hasTerms =
    $(termsHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return termsTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return termsTextPhrases.some(p => text.includes(p))
        || href.includes("regulamin") || href.includes("terms") || href.includes("legal");
    });

  checks.push({
    id: "legal_pages",
    label: "Privacy Policy & Terms",
    status: hasPrivacy && hasTerms ? "pass" : hasPrivacy || hasTerms ? "warning" : "fail",
    description:
      hasPrivacy && hasTerms
        ? "Privacy Policy and Terms/Regulamin links found — full legal compliance signals."
        : hasPrivacy
        ? "Privacy Policy found but no Terms/Regulamin link. Add a Terms page for full legal compliance."
        : hasTerms
        ? "Terms/Regulamin found but no Privacy Policy link. Add a Privacy Policy for GDPR compliance."
        : "No Privacy Policy or Terms links found. These are required for E-E-A-T compliance and user trust.",
    impact: "medium",
    value: `privacy:${hasPrivacy},terms:${hasTerms}`,
  });

  // ── 5. External citations ─────────────────────────────────────────────────
  const pageHost = (() => {
    try { return new URL(page.url).hostname; } catch { return ""; }
  })();
  let externalLinkCount = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.startsWith("http") && !href.includes(pageHost)) externalLinkCount++;
  });

  const citationsRequired = ["article", "service"].includes(pageType);
  checks.push({
    id: "external_citations",
    label: "External Citations",
    status:
      externalLinkCount >= 3 ? "pass"
      : externalLinkCount >= 1 ? "warning"
      : citationsRequired ? "fail"
      : "info",
    description:
      externalLinkCount >= 3
        ? `${externalLinkCount} external links found — good citation signals.`
        : externalLinkCount >= 1
        ? `Only ${externalLinkCount} external link. Add 3–5 links to authoritative sources.`
        : citationsRequired
        ? "No external citations found. Linking to authoritative sources is a critical E-E-A-T signal for this page type."
        : "No external links found. Consider citing sources where relevant.",
    impact: citationsRequired ? "high" : "medium",
    value: externalLinkCount,
  });

  // ── 6. Page-type-specific trust signals ───────────────────────────────────
  if (["product", "product-listing"].includes(pageType)) {
    const hasReviews =
      !!$('[itemprop="ratingValue"], [class*="rating"], [class*="review"], [class*="stars"], [class*="opinie"]').length ||
      /\b(\d+\s*(reviews?|opinie|ocen|gwiazdek|stars?))\b/i.test(fullText);

    checks.push({
      id: "review_signals",
      label: "Customer Reviews / Ratings",
      status: hasReviews ? "pass" : "warning",
      description: hasReviews
        ? "Customer reviews or ratings detected — strong trust signal for e-commerce."
        : "No customer reviews or ratings found. Adding product reviews with star ratings is a key trust signal for AI engines.",
      impact: "high",
      value: hasReviews,
    });

    const hasReturnPolicy =
      /\b(return\s+policy|zwrot|wymiana|gwarancja|warranty|refund|reklamacja)\b/i.test(fullText) ||
      !!$('a[href*="zwrot"], a[href*="return"], a[href*="gwarancja"]').length;

    checks.push({
      id: "trust_signals",
      label: "Return Policy / Guarantee",
      status: hasReturnPolicy ? "pass" : "warning",
      description: hasReturnPolicy
        ? "Return policy or guarantee information found — builds buyer trust."
        : "No return policy or guarantee information found. E-commerce pages should clearly state return/refund policies.",
      impact: "medium",
      value: hasReturnPolicy,
    });
  }

  if (pageType === "homepage") {
    const hasTeamInfo =
      /\b(team|zespół|founders?|założyciel|our\s+story|nasza\s+historia)\b/i.test(fullText) ||
      !!$('[class*="team"], [class*="founder"]').length;

    checks.push({
      id: "company_identity",
      label: "Company / Team Identity",
      status: hasTeamInfo ? "pass" : "warning",
      description: hasTeamInfo
        ? "Company or team information detected — helps AI engines identify the organization."
        : "No company or team information found. Add an 'About Us' section to establish entity identity.",
      impact: "high",
      value: hasTeamInfo,
    });
  }

  // ── 7. Publication date (articles only) ──────────────────────────────────
  if (["article"].includes(pageType)) {
    const hasDate =
      !!$("time[datetime], [itemprop='datePublished'], [itemprop='dateModified']").length ||
      /\b(published|posted|updated|data\s+publikacji|opublikowano)\b/i.test(fullHtml);

    checks.push({
      id: "publication_date",
      label: "Publication / Update Date",
      status: hasDate ? "pass" : "warning",
      description: hasDate
        ? "Publication or update date detected — helps AI engines assess content freshness."
        : "No publication date found. Show when content was published/updated for freshness signals.",
      impact: "medium",
      value: hasDate,
    });
  }

  const score = computeScore(checks, pageType);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, checks, pageType),
  };
}

function computeScore(checks: AuditCheck[], pageType: PageType): number {
  const weights: Record<string, number> = {
    author_byline: 0,        // set dynamically
    about_page: 15,
    contact_info: 20,
    legal_pages: 15,
    external_citations: 0,   // set dynamically
    review_signals: 20,      // e-commerce only
    trust_signals: 10,       // e-commerce only
    company_identity: 20,    // homepage only
    publication_date: 10,    // article only
  };

  if (["article", "service"].includes(pageType)) {
    weights.author_byline = 25;
    weights.external_citations = 25;
  } else if (["homepage", "landing"].includes(pageType)) {
    weights.author_byline = 10;
    weights.external_citations = 15;
    weights.about_page = 20;
  } else {
    // product, product-listing, generic
    weights.author_byline = 5;
    weights.external_citations = 10;
  }

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 10;
    if (w === 0) continue;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.2;
    else if (check.status === "info") earned += w * 0.1;
    // fail = 0
  }

  if (total === 0) return 50;
  return Math.round((earned / total) * 100);
}

function buildSummary(score: number, checks: AuditCheck[], pageType: PageType): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const typeContext =
    pageType === "article" ? "article"
    : pageType === "product" || pageType === "product-listing" ? "e-commerce page"
    : pageType === "homepage" ? "homepage"
    : "page";

  if (score >= 80) return `Strong E-E-A-T signals for this ${typeContext} — good trust and authority indicators.`;
  if (fails > 0) return `${fails} critical E-E-A-T issue${fails > 1 ? "s" : ""} found that reduce AI engine trust for this ${typeContext}.`;
  if (warnings > 0) return `${warnings} E-E-A-T improvement${warnings > 1 ? "s" : ""} recommended to strengthen trust signals.`;
  return `E-E-A-T score: ${score}/100.`;
}
