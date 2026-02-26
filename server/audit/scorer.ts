import type { AuditFindings, AuditResult, Recommendation } from "./types";

// Category weights for overall score (must sum to 100)
const CATEGORY_WEIGHTS = {
  technical: 25,
  structuredData: 20,
  contentStructure: 25,
  eeat: 15,
  aiCrawlers: 10,
  metaTags: 5,
};

export function computeOverallScore(findings: AuditFindings): number {
  let total = 0;
  for (const [key, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const category = findings[key as keyof AuditFindings];
    total += (category.score / 100) * weight;
  }
  return Math.round(total);
}

export function getScoreLabel(
  score: number
): "Excellent" | "Good" | "Fair" | "Poor" {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

export function generateRecommendations(
  findings: AuditFindings
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Technical recommendations
  for (const check of findings.technical.checks) {
    if (check.status === "fail" || check.status === "warning") {
      if (check.id === "https") {
        recs.push({
          id: "fix_https",
          category: "Technical",
          priority: "critical",
          title: "Enable HTTPS",
          description: "Your page is served over HTTP, which blocks AI crawler trust.",
          howToFix:
            "Install an SSL certificate (free via Let's Encrypt) and redirect all HTTP traffic to HTTPS. Update your CMS settings to use HTTPS URLs.",
          impact: "Required for indexation in all modern search engines and AI crawlers.",
        });
      }
      if (check.id === "noindex") {
        recs.push({
          id: "fix_noindex",
          category: "Technical",
          priority: "critical",
          title: "Remove noindex Directive",
          description: "Page is marked as noindex and cannot appear in AI Overviews.",
          howToFix:
            "Remove 'noindex' from the meta robots tag or X-Robots-Tag header. Check your CMS settings — some platforms add noindex to draft or private pages.",
          impact: "Immediately allows AI crawlers and search engines to index the page.",
        });
      }
      if (check.id === "nosnippet") {
        recs.push({
          id: "fix_nosnippet",
          category: "Technical",
          priority: "critical",
          title: "Remove nosnippet Directive",
          description: "nosnippet blocks AI Overviews and featured snippets from using your content.",
          howToFix:
            "Remove 'nosnippet' from the meta robots tag. If you need to limit snippet length, use 'max-snippet:300' instead.",
          impact: "Allows AI engines to quote your content in answers and overviews.",
        });
      }
      if (check.id === "canonical") {
        recs.push({
          id: "add_canonical",
          category: "Technical",
          priority: "medium",
          title: "Add Canonical Tag",
          description: "Missing canonical tag can cause duplicate content issues.",
          howToFix:
            "Add <link rel='canonical' href='https://yourdomain.com/this-page/'> in the <head> section. Most CMS platforms (WordPress, Shopify) have plugins that do this automatically.",
          impact: "Prevents duplicate content penalties and consolidates ranking signals.",
        });
      }
      if (check.id === "viewport") {
        recs.push({
          id: "add_viewport",
          category: "Technical",
          priority: "medium",
          title: "Add Mobile Viewport Meta Tag",
          description: "Missing viewport tag indicates the page may not be mobile-friendly.",
          howToFix:
            "Add <meta name='viewport' content='width=device-width, initial-scale=1'> in the <head> section.",
          impact: "Mobile-friendliness is a ranking factor for AI features and Google Search.",
        });
      }
    }
  }

  // Structured Data recommendations
  const sdChecks = findings.structuredData.checks;
  if (sdChecks.find((c) => c.id === "jsonld_present" && c.status === "fail")) {
    recs.push({
      id: "add_jsonld",
      category: "Structured Data",
      priority: "critical",
      title: "Add JSON-LD Structured Data",
      description: "No structured data found — this is the single most impactful improvement for AI visibility.",
      howToFix:
        "Add a JSON-LD script block in your <head> with appropriate schema types. For a product page use Product schema, for articles use Article schema, for your homepage use Organization + WebSite schema. Use Google's Rich Results Test to validate.",
      impact: "Structured data is the primary signal AI engines use to understand page content and entities.",
    });
  }
  if (sdChecks.find((c) => c.id === "faq_schema" && c.status !== "pass")) {
    recs.push({
      id: "add_faq_schema",
      category: "Structured Data",
      priority: "high",
      title: "Add FAQPage Schema",
      description: "FAQ schema dramatically increases AI citation rates.",
      howToFix:
        'Add a FAQPage JSON-LD block with mainEntity items. Each item should have @type: "Question" with acceptedAnswer. Add 3–8 relevant Q&A pairs about your page topic.',
      impact: "FAQ schema is one of the most effective ways to appear in AI-generated answers.",
    });
  }
  if (sdChecks.find((c) => c.id === "organization_schema" && c.status !== "pass")) {
    recs.push({
      id: "add_org_schema",
      category: "Structured Data",
      priority: "medium",
      title: "Add Organization Schema",
      description: "Organization schema establishes your entity identity for AI engines.",
      howToFix:
        "Add Organization schema with name, url, logo, contactPoint, and sameAs (social media profiles). Place this on your homepage and About page.",
      impact: "Helps AI engines recognize your brand as a trusted entity.",
    });
  }

  // Content Structure recommendations
  const csChecks = findings.contentStructure.checks;
  if (csChecks.find((c) => c.id === "tldr_summary" && c.status !== "pass")) {
    recs.push({
      id: "add_tldr",
      category: "Content Structure",
      priority: "high",
      title: "Add TL;DR / Summary Block",
      description: "A short summary at the top of the page is the most-quoted element by AI engines.",
      howToFix:
        "Add a 2–4 sentence summary at the top of your content, clearly labeled 'TL;DR', 'Summary', or 'Key Takeaways'. This should directly answer the main question the page addresses.",
      impact: "AI engines frequently quote page summaries verbatim in their answers.",
    });
  }
  if (csChecks.find((c) => c.id === "faq_section" && c.status !== "pass")) {
    recs.push({
      id: "add_faq_section",
      category: "Content Structure",
      priority: "high",
      title: "Add FAQ Section",
      description: "A FAQ section with Q&A pairs is one of the most effective GEO tactics.",
      howToFix:
        "Add a 'Frequently Asked Questions' section with 5–10 questions your target audience asks. Write clear, direct answers of 2–4 sentences each. Combine with FAQPage schema for maximum impact.",
      impact: "FAQ content is heavily cited in AI-generated answers and featured snippets.",
    });
  }
  if (csChecks.find((c) => c.id === "content_length" && c.status !== "pass")) {
    recs.push({
      id: "expand_content",
      category: "Content Structure",
      priority: "medium",
      title: "Expand Content Length",
      description: "Thin content is less likely to be cited by AI engines.",
      howToFix:
        "Expand your content to at least 800 words. Add more context, examples, step-by-step instructions, and supporting information. Focus on comprehensively answering the user's intent.",
      impact: "Longer, more comprehensive content is preferred by AI engines for citation.",
    });
  }
  if (csChecks.find((c) => c.id === "heading_hierarchy" && c.status !== "pass")) {
    recs.push({
      id: "fix_headings",
      category: "Content Structure",
      priority: "medium",
      title: "Improve Heading Structure",
      description: "Proper H1→H2→H3 hierarchy helps AI engines parse content sections.",
      howToFix:
        "Ensure you have exactly one H1 (the page title), then use H2 for main sections and H3 for subsections. Each H2 should represent a distinct topic that can be independently cited.",
      impact: "Clear heading structure allows AI engines to extract and cite specific sections.",
    });
  }

  // E-E-A-T recommendations
  const eeatChecks = findings.eeat.checks;
  if (eeatChecks.find((c) => c.id === "author_byline" && c.status !== "pass")) {
    recs.push({
      id: "add_author",
      category: "E-E-A-T",
      priority: "high",
      title: "Add Author Byline",
      description: "Named authorship is a key trust signal for AI engines.",
      howToFix:
        "Add a visible author name and brief credentials near the top of the page. Link to an author profile page. Add Person schema with the author's name, credentials, and social profiles.",
      impact: "AI engines prioritize content from identifiable, credentialed authors.",
    });
  }
  if (eeatChecks.find((c) => c.id === "external_citations" && c.status === "fail")) {
    recs.push({
      id: "add_citations",
      category: "E-E-A-T",
      priority: "high",
      title: "Add External Citations",
      description: "Linking to authoritative sources demonstrates research quality.",
      howToFix:
        "Add 3–5 links to authoritative external sources (research papers, government sites, industry reports) that support your claims. Use descriptive anchor text.",
      impact: "External citations signal to AI engines that your content is well-researched and trustworthy.",
    });
  }

  // AI Crawler recommendations
  const crawlerChecks = findings.aiCrawlers.checks;
  const blockedCrawlers = crawlerChecks.filter(
    (c) => c.status === "fail" && c.id !== "all_ai_crawlers"
  );
  if (blockedCrawlers.length > 0) {
    recs.push({
      id: "unblock_ai_crawlers",
      category: "AI Crawler Access",
      priority: "critical",
      title: `Unblock AI Crawlers in robots.txt`,
      description: `${blockedCrawlers.map((c) => c.label).join(", ")} ${blockedCrawlers.length > 1 ? "are" : "is"} blocked.`,
      howToFix:
        "Remove the Disallow: / rules for AI crawlers from your robots.txt. If you want to allow crawling but prevent training data use, you can allow crawling while using specific opt-out tokens like Google-Extended.",
      impact: "Blocked crawlers cannot index your content for AI-powered search results.",
    });
  }

  // Meta Tags recommendations
  const mtChecks = findings.metaTags.checks;
  if (mtChecks.find((c) => c.id === "title_tag" && c.status === "fail")) {
    recs.push({
      id: "add_title",
      category: "Meta Tags",
      priority: "critical",
      title: "Add Title Tag",
      description: "Missing title tag — critical for all search engines and AI crawlers.",
      howToFix:
        "Add a <title> tag in the <head> section with a descriptive, keyword-rich title of 50–65 characters.",
      impact: "Title tag is the primary signal for page topic identification.",
    });
  }
  if (mtChecks.find((c) => c.id === "meta_description" && c.status === "fail")) {
    recs.push({
      id: "add_meta_desc",
      category: "Meta Tags",
      priority: "high",
      title: "Add Meta Description",
      description: "Missing meta description reduces click-through from AI-powered results.",
      howToFix:
        "Add <meta name='description' content='...'> with a compelling 150–160 character summary that includes your primary keyword.",
      impact: "Meta descriptions are used by AI engines to understand page content.",
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  return recs;
}
