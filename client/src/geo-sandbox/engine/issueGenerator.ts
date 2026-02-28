// ============================================================
// GEO-Auditor — Issue Generator & Recommendation Engine
// Produces actionable, copy-paste-ready fixes
// ============================================================

import type {
  Issue,
  Recommendation,
  ContentAnalysis,
  TechnicalAnalysis,
  PerplexityL3Analysis,
  GoogleAIOAnalysis,
  RRFAnalysis,
} from '../types/simulator';

let issueCounter = 0;
let recCounter = 0;

function makeId(prefix: string): string {
  return `${prefix}_${++issueCounter}`;
}

function makeRecId(): string {
  return `rec_${++recCounter}`;
}

export function generateIssues(
  content: ContentAnalysis,
  technical: TechnicalAnalysis,
  perplexity: PerplexityL3Analysis,
  googleAIO: GoogleAIOAnalysis,
  rrf: RRFAnalysis
): Issue[] {
  issueCounter = 0;
  const issues: Issue[] = [];
  
  // ---- CRITICAL ISSUES ----
  
  if (technical.blockedBots.includes('OAI-SearchBot') || technical.blockedBots.includes('GPTBot')) {
    issues.push({
      id: makeId('issue'),
      severity: 'critical',
      engine: 'chatgpt',
      category: 'technical',
      title: 'ChatGPT crawlers blocked in robots.txt',
      description: 'GPTBot and/or OAI-SearchBot are disallowed. ChatGPT cannot index or cite this page.',
      impact: 'Removing this block can restore full ChatGPT visibility',
      fix: `Add to robots.txt:\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /`,
      estimatedScoreImpact: 35,
    });
  }
  
  if (technical.blockedBots.includes('PerplexityBot')) {
    issues.push({
      id: makeId('issue'),
      severity: 'critical',
      engine: 'perplexity',
      category: 'technical',
      title: 'PerplexityBot blocked in robots.txt',
      description: 'PerplexityBot is disallowed. Perplexity cannot index or cite this page.',
      impact: 'Removing this block can restore full Perplexity visibility',
      fix: `Add to robots.txt:\n\nUser-agent: PerplexityBot\nAllow: /`,
      estimatedScoreImpact: 30,
    });
  }
  
  if (!perplexity.passesQualityGate) {
    issues.push({
      id: makeId('issue'),
      severity: 'critical',
      engine: 'perplexity',
      category: 'content',
      title: 'Content fails Perplexity L3 quality gate',
      description: `Perplexity's L3 XGBoost reranker scores this content at ${perplexity.l3RerankerScore}/100 (threshold: ~55). Content will be dropped from results before reaching the user.`,
      impact: 'Passing the quality gate can increase Perplexity citation probability by ~40%',
      fix: `Restructure the opening paragraph to:\n1. Answer the main question directly in ≤80 words\n2. Follow with "Because: [specific reason with a number]"\n3. Define the main entity explicitly in the first section\n\nExample:\n"[Product/Topic] is [direct definition]. Because [specific benefit with number], it [outcome]. [Entity] refers to [clear disambiguation]."\n`,
      estimatedScoreImpact: 25,
    });
  }
  
  if (technical.schemaMarkup.types.length === 0) {
    issues.push({
      id: makeId('issue'),
      severity: 'critical',
      engine: 'google_aio',
      category: 'schema',
      title: 'No structured data (JSON-LD) detected',
      description: 'Without schema markup, Google AI Overviews cannot understand the page type, author, or content structure. Pages without schema are significantly less likely to be cited.',
      impact: 'Adding schema can improve Google AIO citation probability by ~30%',
      fix: `Add to <head>:\n\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "${technical.titleTag || 'Your Page Title'}",\n  "author": {\n    "@type": "Person",\n    "name": "Author Name"\n  },\n  "datePublished": "${new Date().toISOString().split('T')[0]}",\n  "dateModified": "${new Date().toISOString().split('T')[0]}",\n  "publisher": {\n    "@type": "Organization",\n    "name": "Your Brand"\n  }\n}\n</script>`,
      estimatedScoreImpact: 20,
    });
  }
  
  // ---- HIGH ISSUES ----
  
  if (!content.hasAnswerFirst) {
    issues.push({
      id: makeId('issue'),
      severity: 'high',
      engine: 'perplexity',
      category: 'content',
      title: 'No "Answer-First" structure',
      description: 'Perplexity requires content to open with a direct answer in ≤80 tokens. The current opening does not lead with a direct answer.',
      impact: 'Answer-first structure can increase Perplexity citation probability by ~20%',
      fix: `Move the direct answer to the very first paragraph. Format:\n"[Topic] is [direct answer in 1-2 sentences]. [Supporting fact with a number]."\n\nExample: "GEO Auditing is the process of optimizing web pages for AI search citation. Because 65% of ChatGPT answers cite only top-10 organic results, pages optimized for AI visibility receive 23x more qualified traffic."`,
      estimatedScoreImpact: 15,
    });
  }
  
  if (!content.hasStatistics) {
    issues.push({
      id: makeId('issue'),
      severity: 'high',
      engine: 'all',
      category: 'content',
      title: 'No statistics or numerical data',
      description: 'Content with statistics receives 22% more AI citations. All three major AI engines prefer factually dense content with specific numbers.',
      impact: '+22% citation visibility across all AI engines',
      fix: `Add specific data points throughout the content:\n- Replace "many users" with "73% of users (Source: Study, Year)"\n- Replace "significant improvement" with "47% improvement in citation rate"\n- Add a statistics callout box with 3-5 key numbers\n- Include a data table comparing metrics`,
      estimatedScoreImpact: 12,
    });
  }
  
  if (!content.hasCitations) {
    issues.push({
      id: makeId('issue'),
      severity: 'high',
      engine: 'all',
      category: 'authority',
      title: 'No citations or external references',
      description: 'Content with citations receives 37% more AI visibility. AI engines use citation presence as an authority signal.',
      impact: '+37% AI visibility boost',
      fix: `Add 3-5 citations to authoritative sources:\n- Link to original research papers or studies\n- Reference industry reports (e.g., "According to [Source] (Year)")\n- Add a "Sources" or "References" section at the bottom\n- Use inline citation format: [1] or (Source, Year)`,
      estimatedScoreImpact: 18,
    });
  }
  
  if (googleAIO.queryFanOutCoverage < 40) {
    issues.push({
      id: makeId('issue'),
      severity: 'high',
      engine: 'google_aio',
      category: 'content',
      title: 'Low query fan-out coverage',
      description: `Google AI Overviews generate synthetic queries (definitional, procedural, comparative, evaluative) and retrieve content for each. This page covers only ${googleAIO.queryFanOutCoverage}% of expected query types.`,
      impact: 'Improving query coverage can increase Google AIO citation probability by ~25%',
      fix: `Add the following sections to cover all synthetic query types:\n1. "What is [Topic]?" — definitional section (H2)\n2. "How to [Action]" — step-by-step guide (H2 + ordered list)\n3. "[Topic] vs [Alternative]" — comparison table (H2 + <table>)\n4. "Best [Topic] for [Use Case]" — evaluative section (H2)\n5. FAQ section with 5-7 questions (H2 + FAQPage schema)`,
      estimatedScoreImpact: 20,
    });
  }
  
  // ---- MEDIUM ISSUES ----
  
  if (!content.hasComparisonTable) {
    issues.push({
      id: makeId('issue'),
      severity: 'medium',
      engine: 'google_aio',
      category: 'content',
      title: 'No comparison table',
      description: 'Comparison tables with proper HTML markup receive 47% higher citation rates in Google AI Overviews. They satisfy the "comparative" synthetic query type.',
      impact: '+47% citation rate for comparative queries',
      fix: `Add an HTML comparison table:\n\n<table>\n  <thead>\n    <tr>\n      <th>Feature</th>\n      <th>[Option A]</th>\n      <th>[Option B]</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr><td>Price</td><td>$X</td><td>$Y</td></tr>\n    <tr><td>Speed</td><td>Fast</td><td>Medium</td></tr>\n  </tbody>\n</table>`,
      estimatedScoreImpact: 10,
    });
  }
  
  if (!content.hasFAQSection) {
    issues.push({
      id: makeId('issue'),
      severity: 'medium',
      engine: 'all',
      category: 'content',
      title: 'No FAQ section',
      description: 'FAQ sections with FAQPage schema markup directly match the question-answering format preferred by all AI engines.',
      impact: 'FAQ sections increase citation probability across all AI engines',
      fix: `Add FAQ section + schema:\n\n<section id="faq">\n  <h2>Frequently Asked Questions</h2>\n  <div itemscope itemtype="https://schema.org/FAQPage">\n    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">\n      <h3 itemprop="name">What is [Topic]?</h3>\n      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">\n        <p itemprop="text">[Direct answer in 2-3 sentences]</p>\n      </div>\n    </div>\n  </div>\n</section>`,
      estimatedScoreImpact: 8,
    });
  }
  
  if (content.contentFreshness === 'stale' || content.contentFreshness === 'unknown') {
    issues.push({
      id: makeId('issue'),
      severity: 'medium',
      engine: 'perplexity',
      category: 'freshness',
      title: 'Missing or outdated publication date',
      description: 'Perplexity applies exponential time decay to content. 65% of AI bot hits target content published within the past year. Missing date signals trigger maximum decay.',
      impact: 'Adding/updating date signals can recover 30% of lost Perplexity visibility',
      fix: `Add visible date + schema:\n1. Add visible "Published: [Date] | Updated: [Date]" near the title\n2. Add to JSON-LD: "datePublished": "YYYY-MM-DD", "dateModified": "YYYY-MM-DD"\n3. Update the content with current data to justify the new date`,
      estimatedScoreImpact: 8,
    });
  }
  
  if (rrf.topicalCoverageScore < 50) {
    issues.push({
      id: makeId('issue'),
      severity: 'medium',
      engine: 'chatgpt',
      category: 'content',
      title: 'Low topical coverage (RRF disadvantage)',
      description: `ChatGPT uses Reciprocal Rank Fusion (RRF) to combine results from multiple query variants. This page covers only ${rrf.topicalCoverageScore}% of relevant query variants. A topic cluster approach scores up to 10x higher than single-keyword optimization.`,
      impact: 'Expanding topical coverage can increase ChatGPT RRF score by up to 10x',
      fix: `Create a topic cluster around this page:\n1. Identify 10-15 related query variants for your main topic\n2. Create supporting pages for each major subtopic\n3. Interlink all pages with descriptive anchor text\n4. Ensure the hub page links to all cluster pages\n\nRRF Math: Ranking #4-8 for 30 queries (RRF=0.456) beats ranking #1 for 3 queries (RRF=0.049) by 9x.`,
      estimatedScoreImpact: 12,
    });
  }
  
  // ---- LOW ISSUES ----
  
  if (!technical.hasCanonical) {
    issues.push({
      id: makeId('issue'),
      severity: 'low',
      engine: 'google_aio',
      category: 'technical',
      title: 'Missing canonical tag',
      description: 'Without a canonical tag, Google may index duplicate versions of this page, splitting authority signals.',
      impact: 'Canonical tag consolidates authority for better AI Overview inclusion',
      fix: `Add to <head>:\n<link rel="canonical" href="${'https://yourdomain.com/this-page'}">`,
      estimatedScoreImpact: 3,
    });
  }
  
  if (!technical.ogTags) {
    issues.push({
      id: makeId('issue'),
      severity: 'low',
      engine: 'all',
      category: 'technical',
      title: 'Missing Open Graph tags',
      description: 'Open Graph tags help AI engines understand page context and improve social sharing signals.',
      impact: 'OG tags improve content discoverability and authority signals',
      fix: `Add to <head>:\n<meta property="og:title" content="${technical.titleTag || 'Page Title'}">\n<meta property="og:description" content="${technical.metaDescription || 'Page description'}">\n<meta property="og:type" content="article">\n<meta property="og:url" content="https://yourdomain.com/this-page">`,
      estimatedScoreImpact: 2,
    });
  }
  
  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function generateRecommendations(
  issues: Issue[],
  content: ContentAnalysis,
  technical: TechnicalAnalysis
): Recommendation[] {
  recCounter = 0;
  const recommendations: Recommendation[] = [];
  
  // Top 5 highest-impact recommendations derived from issues
  const topIssues = issues.slice(0, 5);
  
  topIssues.forEach((issue, index) => {
    recommendations.push({
      id: makeRecId(),
      priority: index + 1,
      engine: issue.engine,
      title: issue.title,
      rationale: issue.description,
      action: issue.fix,
      estimatedImpact: issue.estimatedScoreImpact,
    });
  });
  
  // Add schema template if missing
  if (technical.schemaMarkup.missingRecommended.includes('FAQPage') && content.hasFAQSection) {
    recommendations.push({
      id: makeRecId(),
      priority: recommendations.length + 1,
      engine: 'google_aio',
      title: 'Add FAQPage JSON-LD schema to existing FAQ content',
      rationale: 'FAQ content exists but lacks FAQPage schema. Google AI Overviews specifically look for FAQPage schema to extract Q&A pairs.',
      action: 'Wrap existing FAQ content in FAQPage schema markup',
      template: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Your question here?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Your direct answer here."
      }
    }
  ]
}
</script>`,
      estimatedImpact: 12,
    });
  }
  
  return recommendations;
}
