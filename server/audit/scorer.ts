import type { AuditFindings, AuditResult, Recommendation } from "./types";

/**
 * Category weights for overall GEO score
 *
 * Updated based on iPullRank AI Search Manual (Chapters 7, 9, 10, 11):
 * - Content quality (semantic, entity-rich, passage-optimized) is the #1 signal
 * - Structured data is critical for knowledge graph integration
 * - E-E-A-T (especially Experience) is increasingly important
 * - Technical access signals (crawlability, no JS blocking) are foundational
 *
 * Without contentIntelligence, weights sum to 100 across 7 categories.
 */
const CATEGORY_WEIGHTS_BASE = {
  technical: 12,
  structuredData: 18,
  contentStructure: 22,  // Increased — semantic chunking, entity richness are core GEO signals
  eeat: 15,              // Increased — E-E-A-T (especially Experience) is now more important
  aiCrawlers: 8,
  metaTags: 5,
  brandAuthority: 20,
};

// When Content Intelligence is available, it takes 25% — the most important signal
// Content quality is the single biggest predictor of AI citation probability
const CATEGORY_WEIGHTS_WITH_CI = {
  technical: 9,
  structuredData: 13,
  contentStructure: 16,  // Still high — structural signals complement LLM analysis
  eeat: 11,
  aiCrawlers: 6,
  metaTags: 4,
  brandAuthority: 16,
  contentIntelligence: 25, // ← highest weight: LLM-powered content quality (iPullRank aligned)
};

export function computeOverallScore(findings: AuditFindings): number {
  // Use CI weights if Content Intelligence is available
  const weights = findings.contentIntelligence
    ? CATEGORY_WEIGHTS_WITH_CI
    : CATEGORY_WEIGHTS_BASE;

  let total = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (key === "contentIntelligence") {
      if (findings.contentIntelligence) {
        total += (findings.contentIntelligence.overallScore / 100) * weight;
        totalWeight += weight;
      }
    } else {
      const category = findings[key as keyof typeof CATEGORY_WEIGHTS_BASE];
      if (!category) continue;
      total += ((category as { score: number }).score / 100) * weight;
      totalWeight += weight;
    }
  }

  // Normalize in case weights don't sum to exactly 100
  return Math.round(totalWeight > 0 ? (total / totalWeight) * 100 : 0);
}

export function getScoreLabel(
  score: number
): "Excellent" | "Good" | "Fair" | "Poor" {
  // Recalibrated thresholds — higher bar required for positive labels
  if (score >= 85) return "Excellent";  // ← was 80
  if (score >= 65) return "Good";       // ← was 60
  if (score >= 45) return "Fair";       // ← was 40
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
          priority: "high",
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

  // New: semantic chunking recommendation (iPullRank Ch.9)
  if (csChecks.find((c) => c.id === "semantic_chunking" && c.status !== "pass")) {
    recs.push({
      id: "fix_semantic_chunking",
      category: "Content Structure",
      priority: "high",
      title: "Improve Semantic Chunking",
      description: "Paragraphs are too long for AI passage extraction.",
      howToFix:
        "Break long paragraphs into shorter blocks of 40–80 words, each expressing a single complete idea. AI engines like Gemini and ChatGPT segment pages by paragraph and select one at a time for summarization. Each paragraph should be self-contained and work independently when quoted.",
      impact: "Better chunking directly improves the probability of individual paragraphs being selected for AI answers.",
    });
  }

  // New: entity richness recommendation (iPullRank Ch.9)
  if (csChecks.find((c) => c.id === "entity_richness" && c.status !== "pass")) {
    recs.push({
      id: "increase_entity_richness",
      category: "Content Structure",
      priority: "high",
      title: "Increase Entity Richness",
      description: "Content lacks named entities and specific facts.",
      howToFix:
        "Replace vague references with specific named entities: instead of 'this tool', say 'Google Search Console'. Instead of 'most users', say '73% of users'. Include brand names, product names, people, places, and specific statistics. AI models resolve meaning through named entities — vague content gets poor vector embeddings.",
      impact: "Named entities are the building blocks of knowledge graph connections and improve embedding quality.",
    });
  }

  // New: information gain recommendation (iPullRank Ch.11)
  if (csChecks.find((c) => c.id === "information_gain" && c.status !== "pass")) {
    recs.push({
      id: "increase_information_gain",
      category: "Content Structure",
      priority: "high",
      title: "Add Unique Data & Original Insights",
      description: "Content lacks original data or unique insights.",
      howToFix:
        "Add content that only you can publish: original research, proprietary data, personal test results, or expert opinions. Include specific statistics with dates (e.g., 'as of Q1 2025, 73% of users...'). LLMs filter out generic content that mirrors thousands of other pages.",
      impact: "Information gain is a key signal for LLM content selection — unique content is prioritized over generic aggregated content.",
    });
  }

  // New: HowTo schema recommendation (iPullRank Ch.9)
  if (sdChecks.find((c) => c.id === "howto_schema" && c.status === "info")) {
    // Only recommend if page has step-by-step content signals
    const hasStepContent = findings.contentStructure.checks.some(c =>
      c.id === "lists_present" && c.status === "pass"
    );
    if (hasStepContent) {
      recs.push({
        id: "add_howto_schema",
        category: "Structured Data",
        priority: "medium",
        title: "Add HowTo Schema",
        description: "Page has step-by-step content but no HowTo schema.",
        howToFix:
          'Add HowTo JSON-LD schema with step-by-step instructions. Each step should have @type: "HowToStep" with name and text. Include totalTime and estimatedCost if applicable.',
        impact: "HowTo schema is heavily cited by AI engines for instructional queries.",
      });
    }
  }

  // New: schema completeness recommendation (iPullRank Ch.9)
  if (sdChecks.find((c) => c.id === "schema_completeness" && (c.status === "fail" || c.status === "warning"))) {
    recs.push({
      id: "improve_schema_completeness",
      category: "Structured Data",
      priority: "medium",
      title: "Complete Schema Properties",
      description: "Schema markup is present but missing many recommended properties.",
      howToFix:
        "Fill in all available schema properties — be comprehensive, not just compliant. For Article: add author, datePublished, dateModified, image, publisher. For Product: add brand, offers, aggregateRating, sku. For Organization: add sameAs, logo, contactPoint, foundingDate. More complete schemas give AI engines richer context.",
      impact: "Schema completeness directly correlates with AI citation probability.",
    });
  }

  // nofollow recommendation
  if (findings.technical.checks.find((c) => c.id === "nofollow" && c.status === "warning")) {
    recs.push({
      id: "fix_nofollow",
      category: "Technical",
      priority: "medium",
      title: "Remove nofollow Directive",
      description: "nofollow directive prevents crawlers from following links on this page, limiting internal link equity and crawl depth.",
      howToFix:
        "Remove 'nofollow' from the meta robots tag. If you want to prevent specific links from passing equity, use rel='nofollow' on individual anchor tags instead of blocking the entire page.",
      impact: "Improves internal link equity distribution and ensures crawlers can discover linked pages.",
    });
  }

  // robots.txt Disallow for this page
  if (findings.technical.checks.find((c) => c.id === "robots_disallow_page" && c.status === "fail")) {
    recs.push({
      id: "fix_robots_disallow",
      category: "Technical",
      priority: "critical",
      title: "Remove Disallow Rule for This Page in robots.txt",
      description: "This page's path is blocked by a Disallow rule in robots.txt — AI crawlers and search engines cannot access it.",
      howToFix:
        "Edit your robots.txt file and remove the Disallow rule that matches this page's path. If you have 'Disallow: /' for all crawlers, you need to either remove it or add specific Allow rules for the pages you want indexed.",
      impact: "Immediately allows all crawlers including AI engines to access and index this page.",
    });
  }

  // New: max-snippet recommendation (iPullRank Ch.7)
  if (findings.technical.checks.find((c) => c.id === "max_snippet" && (c.status === "fail" || c.status === "warning"))) {
    recs.push({
      id: "fix_max_snippet",
      category: "Technical",
      priority: "critical",
      title: "Remove max-snippet Restriction",
      description: "max-snippet directive is limiting AI content extraction.",
      howToFix:
        "Change max-snippet:0 to max-snippet:-1 (unlimited) in your robots meta tag. This allows AI Overviews, Perplexity, and ChatGPT to quote your full content. If you need some restriction, use max-snippet:300 as a minimum.",
      impact: "Removing snippet restrictions directly enables AI engines to quote your content in answers.",
    });
  }

  // New: noai directive recommendation (iPullRank Ch.7)
  if (findings.technical.checks.find((c) => c.id === "noai_directive" && c.status === "fail")) {
    recs.push({
      id: "remove_noai",
      category: "Technical",
      priority: "critical",
      title: "Remove noai Directive",
      description: "noai directive explicitly blocks AI engines from using your content.",
      howToFix:
        "Remove 'noai' from your robots meta tag. This directive explicitly tells AI systems not to use your content. If you want to allow AI citation but prevent training, use specific crawler-level robots.txt rules instead.",
      impact: "Removing noai immediately allows AI engines to cite and reference your content.",
    });
  }

  // New: JS rendering recommendation (iPullRank Ch.7)
  if (findings.technical.checks.find((c) => c.id === "js_rendering" && c.status === "warning")) {
    recs.push({
      id: "fix_js_rendering",
      category: "Technical",
      priority: "high",
      title: "Ensure Content is in HTML Source",
      description: "Content may be hidden behind JavaScript rendering.",
      howToFix:
        "Ensure all critical content (headings, body text, FAQ, product descriptions) is present in the raw HTML source, not loaded dynamically via JavaScript. Use server-side rendering (SSR) or static generation. Many AI crawlers do not execute JavaScript.",
      impact: "JS-rendered content is invisible to many AI crawlers, severely limiting indexation.",
    });
  }

  // New: experience signals recommendation (iPullRank Ch.9)
  if (findings.eeat.checks.find((c) => c.id === "experience_signals" && c.status === "warning")) {
    recs.push({
      id: "add_experience_signals",
      category: "E-E-A-T",
      priority: "medium",
      title: "Add First-Person Experience Signals",
      description: "Content lacks personal experience signals (the first E in E-E-A-T).",
      howToFix:
        "Add personal insights, test results, or case studies. Use first-person language: 'I tested this and found...', 'In our experience...', 'Our data shows...'. Include before/after examples, real client results, or original research. This differentiates your content from AI-generated generic content.",
      impact: "Experience signals are the most differentiating E-E-A-T factor — AI engines cannot fake genuine first-person experience.",
    });
  }

  // AI Crawler recommendations
  const crawlerChecks = findings.aiCrawlers.checks;
  // Only flag as critical if OAI-SearchBot or PerplexityBot are blocked (they affect live AI search citations)
  // GPTBot and Google-Extended are training-only crawlers — blocking them is a valid choice
  const criticalSearchCrawlers = ["oai_searchbot", "perplexitybot"];
  const blockedSearchCrawlers = crawlerChecks.filter(
    (c) => c.status === "fail" && criticalSearchCrawlers.includes(c.id)
  );
  const blockedTrainingCrawlers = crawlerChecks.filter(
    (c) => c.status === "fail" && ["gptbot", "google_extended"].includes(c.id)
  );
  const blockedOtherCrawlers = crawlerChecks.filter(
    (c) => c.status === "fail" && !criticalSearchCrawlers.includes(c.id) && !["gptbot", "google_extended", "all_ai_crawlers"].includes(c.id)
  );

  if (blockedSearchCrawlers.length > 0) {
    recs.push({
      id: "unblock_ai_crawlers",
      category: "AI Crawler Access",
      priority: "critical",
      title: `Unblock AI Search Crawlers in robots.txt`,
      description: `${blockedSearchCrawlers.map((c) => c.label).join(", ")} ${blockedSearchCrawlers.length > 1 ? "are" : "is"} blocked — your content cannot appear in live AI search citations.`,
      howToFix:
        "Remove the Disallow: / rules for OAI-SearchBot and PerplexityBot from your robots.txt. These crawlers power real-time AI search citations in ChatGPT Search and Perplexity. Note: GPTBot and Google-Extended are training-only crawlers — blocking them is a valid choice if you don't want your content used for AI model training.",
      impact: "Blocked search crawlers prevent your content from appearing in ChatGPT Search and Perplexity AI answers.",
    });
  }

  if (blockedTrainingCrawlers.length > 0) {
    recs.push({
      id: "unblock_training_crawlers",
      category: "AI Crawler Access",
      priority: "medium",
      title: `AI Training Crawlers Blocked (Optional)`,
      description: `${blockedTrainingCrawlers.map((c) => c.label).join(", ")} ${blockedTrainingCrawlers.length > 1 ? "are" : "is"} blocked. These crawlers are used for AI model training only, not for live search citations.`,
      howToFix:
        "Blocking GPTBot and Google-Extended is a legitimate choice if you don't want your content used to train AI models. This does NOT affect your visibility in ChatGPT Search, Google AI Overviews, or Perplexity — those use separate crawlers (OAI-SearchBot, Googlebot, PerplexityBot).",
      impact: "No direct impact on AI search visibility. This is a content licensing decision.",
    });
  }

  // New: sitemap for crawlers recommendation
  if (crawlerChecks.find((c) => c.id === "sitemap_for_crawlers" && c.status !== "pass")) {
    recs.push({
      id: "add_sitemap_directive",
      category: "AI Crawler Access",
      priority: "medium",
      title: "Add Sitemap Directive to robots.txt",
      description: "AI crawlers cannot discover your full content inventory without a sitemap reference.",
      howToFix:
        "Add 'Sitemap: https://yourdomain.com/sitemap.xml' to your robots.txt file. Ensure your XML sitemap is up to date and includes all important pages. This helps AI crawlers discover and index your full content.",
      impact: "Sitemap discovery helps AI crawlers index all your pages, not just those linked from the homepage.",
    });
  }

  // Meta Tags recommendations
  const mtChecks = findings.metaTags.checks;
  if (mtChecks.find((c) => c.id === "title_tag" && c.status === "fail")) {
    recs.push({
      id: "add_title",
      category: "Meta Tags",
      priority: "high",
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
