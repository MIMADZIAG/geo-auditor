import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeEEAT(page: ScrapedPage): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;
  const fullHtml = $.html()?.toLowerCase() ?? "";
  const bodyText = $("body").text().toLowerCase();

  // 1. Author byline
  const authorPatterns = [
    /by\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
    /author[:\s]/i,
    /written\s+by/i,
    /class="author"/i,
    /rel="author"/i,
    /"author"\s*:/i, // JSON-LD
    /itemprop="author"/i,
  ];
  const hasAuthor = authorPatterns.some((p) => p.test(fullHtml));
  checks.push({
    id: "author_byline",
    label: "Author Byline",
    status: hasAuthor ? "pass" : "warning",
    description: hasAuthor
      ? "Author byline or attribution detected — supports E-E-A-T signals."
      : "No author byline found. Adding a named author with credentials significantly improves E-E-A-T.",
    impact: "high",
    value: hasAuthor,
  });

  // 2. Author bio / credentials
  const bioPatterns =
    /author-bio|author_bio|about.the.author|author\s+profile|bio\s*:|credentials|expertise/i;
  const hasAuthorBio = bioPatterns.test(fullHtml);
  checks.push({
    id: "author_bio",
    label: "Author Bio / Credentials",
    status: hasAuthorBio ? "pass" : "info",
    description: hasAuthorBio
      ? "Author bio or credentials section detected."
      : "No author bio found. Add a brief author bio with credentials to strengthen expertise signals.",
    impact: "medium",
    value: hasAuthorBio,
  });

  // 3. About page link
  const aboutLinks = $('a[href*="about"]');
  const hasAboutLink = aboutLinks.length > 0;
  checks.push({
    id: "about_page",
    label: "About Page Link",
    status: hasAboutLink ? "pass" : "warning",
    description: hasAboutLink
      ? "Link to About page found — establishes organizational identity."
      : "No About page link found. An About page is a key trust signal for AI engines.",
    impact: "medium",
    value: hasAboutLink,
  });

  // 4. Contact information
  const contactPatterns =
    /contact|email|phone|tel:|mailto:|address|location/i;
  const hasContact =
    contactPatterns.test(fullHtml) ||
    $('a[href^="mailto:"], a[href^="tel:"]').length > 0;
  checks.push({
    id: "contact_info",
    label: "Contact Information",
    status: hasContact ? "pass" : "warning",
    description: hasContact
      ? "Contact information or links found — good trust signal."
      : "No contact information found. Add email, phone, or contact page link for trust signals.",
    impact: "medium",
    value: hasContact,
  });

  // 5. External citations / references
  const parsed = new URL(page.finalUrl);
  const domain = parsed.hostname;
  const externalLinks = $("a[href]")
    .toArray()
    .filter((el) => {
      const href = $(el).attr("href") ?? "";
      return (
        href.startsWith("http") &&
        !href.includes(domain) &&
        !href.includes("javascript:")
      );
    });
  const hasExternalCitations = externalLinks.length >= 2;
  checks.push({
    id: "external_citations",
    label: "External Citations & References",
    status:
      externalLinks.length >= 5
        ? "pass"
        : externalLinks.length >= 2
        ? "warning"
        : "fail",
    description:
      externalLinks.length >= 5
        ? `${externalLinks.length} external links found — good citation practice.`
        : externalLinks.length >= 2
        ? `${externalLinks.length} external links found. Add more citations to primary sources.`
        : "No external citations found. Linking to authoritative sources is a key E-E-A-T signal.",
    impact: "high",
    value: externalLinks.length,
  });

  // 6. Privacy policy / Terms
  const legalLinks = $('a[href*="privacy"], a[href*="terms"], a[href*="legal"]');
  const hasLegalLinks = legalLinks.length > 0;
  checks.push({
    id: "legal_pages",
    label: "Privacy Policy / Terms Links",
    status: hasLegalLinks ? "pass" : "warning",
    description: hasLegalLinks
      ? "Privacy policy or terms links found — establishes legitimacy."
      : "No privacy policy or terms links found. These are important trust signals.",
    impact: "medium",
    value: hasLegalLinks,
  });

  // 7. Publication date
  const datePatterns =
    /published|posted|updated|date|datetime/i;
  const hasDate =
    datePatterns.test(fullHtml) ||
    $("time[datetime], [itemprop='datePublished'], [itemprop='dateModified']")
      .length > 0;
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

  // 8. Social proof / reviews
  const reviewPatterns =
    /review|rating|testimonial|star|verified|trusted/i;
  const hasSocialProof = reviewPatterns.test(fullHtml);
  checks.push({
    id: "social_proof",
    label: "Reviews / Social Proof",
    status: hasSocialProof ? "pass" : "info",
    description: hasSocialProof
      ? "Reviews or social proof elements detected."
      : "No reviews or social proof found. User reviews and ratings strengthen authority signals.",
    impact: "low",
    value: hasSocialProof,
  });

  const score = computeScore(checks);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, checks),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    author_byline: 20,
    external_citations: 20,
    about_page: 15,
    contact_info: 15,
    legal_pages: 10,
    publication_date: 10,
    author_bio: 5,
    social_proof: 5,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.4;
    else if (check.status === "info") earned += w * 0.2;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(score: number, checks: AuditCheck[]): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  if (score >= 80) return "Strong E-E-A-T signals with author attribution, citations, and trust indicators.";
  if (fails > 0) return `${fails} critical E-E-A-T signal${fails > 1 ? "s" : ""} missing. AI engines prioritize content from identifiable, trusted sources.`;
  return "E-E-A-T signals are present but incomplete. Strengthen author attribution and external citations.";
}
