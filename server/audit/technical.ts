import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeTechnical(page: ScrapedPage): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;

  // 1. HTTPS
  checks.push({
    id: "https",
    label: "HTTPS Enabled",
    status: page.isHttps ? "pass" : "fail",
    description: page.isHttps
      ? "Page is served over HTTPS — required for AI crawler trust signals."
      : "Page is served over HTTP. HTTPS is required for indexation and AI crawler access.",
    impact: "high",
    value: page.isHttps,
  });

  // 2. HTTP Status
  const statusOk = page.statusCode >= 200 && page.statusCode < 300;
  checks.push({
    id: "http_status",
    label: "HTTP 200 Status",
    status: statusOk ? "pass" : "fail",
    description: statusOk
      ? `Page returned HTTP ${page.statusCode}.`
      : `Page returned HTTP ${page.statusCode || "error"}. AI crawlers cannot index non-200 pages.`,
    impact: "high",
    value: page.statusCode,
  });

  // 3. Canonical tag
  const canonical = $('link[rel="canonical"]').attr("href");
  checks.push({
    id: "canonical",
    label: "Canonical Tag",
    status: canonical ? "pass" : "warning",
    description: canonical
      ? `Canonical tag found: ${canonical}`
      : "No canonical tag found. Add <link rel='canonical'> to prevent duplicate content issues.",
    impact: "medium",
    value: canonical ?? null,
  });

  // 4. noindex check
  const robotsMeta = $('meta[name="robots"]').attr("content") ?? "";
  const xRobotsTag = page.headers["x-robots-tag"] ?? "";
  const hasNoindex =
    robotsMeta.toLowerCase().includes("noindex") ||
    xRobotsTag.toLowerCase().includes("noindex");
  checks.push({
    id: "noindex",
    label: "Page is Indexable",
    status: hasNoindex ? "fail" : "pass",
    description: hasNoindex
      ? "Page has noindex directive — it cannot appear in AI Overviews or search results."
      : "Page is indexable (no noindex directive detected).",
    impact: "high",
    value: !hasNoindex,
  });

  // 5. nosnippet check
  const hasNosnippet =
    robotsMeta.toLowerCase().includes("nosnippet") ||
    xRobotsTag.toLowerCase().includes("nosnippet");
  checks.push({
    id: "nosnippet",
    label: "Snippets Allowed",
    status: hasNosnippet ? "fail" : "pass",
    description: hasNosnippet
      ? "nosnippet directive detected — this blocks AI Overviews and featured snippets from using your content."
      : "Snippet generation is allowed — AI engines can quote your content.",
    impact: "high",
    value: !hasNosnippet,
  });

  // 5b. nofollow check (meta robots)
  const hasNofollow =
    robotsMeta.toLowerCase().includes("nofollow") ||
    xRobotsTag.toLowerCase().includes("nofollow");
  checks.push({
    id: "nofollow",
    label: "Links Followable (nofollow)",
    status: hasNofollow ? "warning" : "pass",
    description: hasNofollow
      ? "nofollow directive detected in meta robots — search engines and AI crawlers will not follow links on this page. This limits internal link equity distribution and may reduce crawl depth of your site."
      : "No nofollow directive on this page — links are followable by crawlers.",
    impact: "medium",
    value: !hasNofollow,
  });

  // 5c. robots.txt Disallow check for this specific page path
  const pageDisallowed = (() => {
    if (!page.robotsTxt) return false;
    try {
      const pagePath = new URL(page.finalUrl).pathname;
      const lines = page.robotsTxt.split("\n").map(l => l.trim());
      let inAllBlock = false;
      for (const line of lines) {
        if (line.toLowerCase().startsWith("user-agent:")) {
          const ua = line.substring("user-agent:".length).trim();
          inAllBlock = ua === "*";
        }
        if (inAllBlock && line.toLowerCase().startsWith("disallow:")) {
          const disallowPath = line.substring("disallow:".length).trim();
          if (disallowPath === "/" || (disallowPath.length > 0 && pagePath.startsWith(disallowPath))) {
            return true;
          }
        }
      }
      return false;
    } catch { return false; }
  })();
  checks.push({
    id: "robots_disallow_page",
    label: "Page Not Disallowed in robots.txt",
    status: pageDisallowed ? "fail" : "pass",
    description: pageDisallowed
      ? `This page's path is blocked by a Disallow rule in robots.txt for all crawlers (User-agent: *). AI crawlers and search engines cannot access this page.`
      : "This page's path is not blocked by robots.txt — crawlers can access it.",
    impact: "high",
    value: !pageDisallowed,
  });

  // 6. robots.txt exists
  checks.push({
    id: "robots_txt_exists",
    label: "robots.txt Present",
    status: page.robotsTxt !== null ? "pass" : "warning",
    description:
      page.robotsTxt !== null
        ? "robots.txt file found and accessible."
        : "No robots.txt found. While not required, it helps crawlers understand your site structure.",
    impact: "low",
    value: page.robotsTxt !== null,
  });

  // 7. Response time
  const fastResponse = page.responseTimeMs < 3000;
  checks.push({
    id: "response_time",
    label: "Fast Response Time",
    status: fastResponse ? "pass" : "warning",
    description: fastResponse
      ? `Page loaded in ${page.responseTimeMs}ms — good for crawlability.`
      : `Page loaded in ${page.responseTimeMs}ms — slow pages may be deprioritized by crawlers.`,
    impact: "medium",
    value: page.responseTimeMs,
  });

  // 8. Content-Type header
  const contentType = page.headers["content-type"] ?? "";
  const isHtml = contentType.includes("text/html");
  checks.push({
    id: "content_type",
    label: "HTML Content-Type",
    status: isHtml ? "pass" : "warning",
    description: isHtml
      ? "Content-Type is text/html — correct for web pages."
      : `Content-Type is '${contentType || "unknown"}' — AI crawlers expect text/html.`,
    impact: "low",
    value: contentType,
  });

  // 9. Viewport meta (mobile-friendly proxy)
  const viewport = $('meta[name="viewport"]').attr("content");
  checks.push({
    id: "viewport",
    label: "Mobile Viewport Meta",
    status: viewport ? "pass" : "warning",
    description: viewport
      ? "Viewport meta tag present — page is mobile-friendly."
      : "No viewport meta tag. Mobile-friendliness is a ranking factor for AI features.",
    impact: "medium",
    value: viewport ?? null,
  });

  // 10. X-Frame-Options / security headers (info)
  const hasSecurityHeaders =
    !!page.headers["x-frame-options"] ||
    !!page.headers["content-security-policy"];
  checks.push({
    id: "security_headers",
    label: "Security Headers",
    status: hasSecurityHeaders ? "pass" : "info",
    description: hasSecurityHeaders
      ? "Security headers detected — good trust signals."
      : "No security headers detected. Adding X-Frame-Options or CSP improves trust signals.",
    impact: "low",
    value: hasSecurityHeaders,
  });

  // 11. Hreflang / language targeting
  const hasHreflang = $("link[rel='alternate'][hreflang]").length > 0;
  const langAttr = $("html").attr("lang") ?? "";
  const hasLangDeclaration = !!langAttr;
  checks.push({
    id: "hreflang",
    label: "Language Declaration",
    status: hasLangDeclaration ? (hasHreflang ? "pass" : "warning") : "fail",
    description: !hasLangDeclaration
      ? "No lang attribute on <html>. AI engines use language signals to match content to user queries in the right language."
      : hasHreflang
      ? `Language declared (lang='${langAttr}') with hreflang alternate links — strong international signal.`
      : `Language declared (lang='${langAttr}') but no hreflang links. If you target multiple regions, add hreflang tags.`,
    impact: "medium",
    value: langAttr || null,
  });

  // 12. Sitemap reference in robots.txt
  const hasSitemapInRobots = page.robotsTxt
    ? /^sitemap:/im.test(page.robotsTxt)
    : false;
  checks.push({
    id: "sitemap_reference",
    label: "Sitemap in robots.txt",
    status: hasSitemapInRobots ? "pass" : "warning",
    description: hasSitemapInRobots
      ? "Sitemap URL referenced in robots.txt — helps AI crawlers discover all pages."
      : "No Sitemap directive in robots.txt. Add 'Sitemap: https://yourdomain.com/sitemap.xml' to help AI crawlers discover your content.",
    impact: "medium",
    value: hasSitemapInRobots,
  });

  // 13. Structured page depth (URL depth — shallow = better crawlability)
  const urlDepth = (() => {
    try {
      const path = new URL(page.finalUrl).pathname;
      return path.split("/").filter(Boolean).length;
    } catch { return 0; }
  })();
  checks.push({
    id: "url_depth",
    label: "URL Depth",
    status: urlDepth <= 3 ? "pass" : urlDepth <= 5 ? "warning" : "fail",
    description: urlDepth <= 3
      ? `URL depth is ${urlDepth} levels — shallow URLs are easier for AI crawlers to prioritize.`
      : urlDepth <= 5
      ? `URL depth is ${urlDepth} levels — consider flattening your URL structure for better crawlability.`
      : `URL depth is ${urlDepth} levels — deep URLs are deprioritized by AI crawlers. Flatten your URL structure.`,
    impact: "low",
    value: urlDepth,
  });

  // 14. Page size (HTML weight — very large pages slow crawling)
  const htmlSizeKb = Math.round(page.html.length / 1024);
  checks.push({
    id: "page_size",
    label: "Page HTML Size",
    status: htmlSizeKb < 200 ? "pass" : htmlSizeKb < 500 ? "warning" : "fail",
    description: htmlSizeKb < 200
      ? `HTML size is ${htmlSizeKb}KB — lightweight and fast to crawl.`
      : htmlSizeKb < 500
      ? `HTML size is ${htmlSizeKb}KB — consider reducing inline scripts/styles to improve crawl efficiency.`
      : `HTML size is ${htmlSizeKb}KB — very large HTML can slow AI crawler processing and reduce crawl budget.`,
    impact: "low",
    value: htmlSizeKb,
  });

  // 15. Render-blocking resources (inline scripts in <head>)
  const headScripts = $('head script:not([async]):not([defer]):not([type="application/ld+json"])').length;
  checks.push({
    id: "render_blocking",
    label: "No Render-Blocking Scripts",
    status: headScripts === 0 ? "pass" : headScripts <= 2 ? "warning" : "fail",
    description: headScripts === 0
      ? "No render-blocking scripts in <head> — page loads efficiently for crawlers."
      : headScripts <= 2
      ? `${headScripts} render-blocking script(s) in <head>. Add async or defer attributes to improve crawl speed.`
      : `${headScripts} render-blocking scripts in <head>. This significantly slows page rendering for AI crawlers.`,
    impact: "medium",
    value: headScripts,
  });

  // 16. max-snippet meta tag (iPullRank Ch.7 — controls how much AI engines can quote)
  // -1 = unlimited (best for GEO), 0 = no snippet (worst), positive = limited
  const maxSnippetMeta = $('meta[name="robots"]').attr("content") ?? "";
  const maxSnippetMatch = maxSnippetMeta.match(/max-snippet:\s*(-?\d+)/i);
  const maxSnippetValue = maxSnippetMatch ? parseInt(maxSnippetMatch[1]) : null;
  const hasMaxSnippetRestriction = maxSnippetValue !== null && maxSnippetValue >= 0 && maxSnippetValue < 200;

  checks.push({
    id: "max_snippet",
    label: "max-snippet Not Restricted",
    status: maxSnippetValue === null
      ? "pass"  // No restriction = unlimited by default
      : maxSnippetValue === -1
      ? "pass"  // Explicitly unlimited
      : maxSnippetValue === 0
      ? "fail"  // No snippets at all
      : maxSnippetValue < 200
      ? "warning"  // Limited
      : "pass",
    description: maxSnippetValue === null
      ? "No max-snippet restriction detected — AI engines can quote your full content (default unlimited)."
      : maxSnippetValue === -1
      ? "max-snippet:-1 detected — explicitly unlimited, AI engines can quote any length of your content."
      : maxSnippetValue === 0
      ? "max-snippet:0 detected — this blocks all AI snippet generation. Remove this directive to allow AI Overviews and Perplexity to quote your content."
      : `max-snippet:${maxSnippetValue} detected — AI engines can only quote up to ${maxSnippetValue} characters. For GEO, set max-snippet:-1 (unlimited) to allow full content extraction.`,
    impact: "high",
    value: maxSnippetValue,
  });

  // 17. noai / noimageai directives (iPullRank Ch.7 — AI-specific opt-out directives)
  const hasNoAI =
    robotsMeta.toLowerCase().includes("noai") ||
    xRobotsTag.toLowerCase().includes("noai") ||
    $('meta[name="robots"]').toArray().some(el => $(el).attr("content")?.toLowerCase().includes("noai"));

  checks.push({
    id: "noai_directive",
    label: "No noai Directive",
    status: hasNoAI ? "fail" : "pass",
    description: hasNoAI
      ? "noai directive detected in robots meta tag — this explicitly blocks AI engines from using your content. Remove this directive to allow AI citation."
      : "No noai directive detected — AI engines are allowed to use your content.",
    impact: "high",
    value: !hasNoAI,
  });

  // 18. JavaScript-heavy page detection (iPullRank Ch.7 — JS rendering issues)
  // If most content is in JS bundles and body text is thin, AI crawlers may miss content
  const bodyTextLength = $('body').text().replace(/\s+/g, ' ').trim().length;
  const inlineScriptLength = $('script:not([src]):not([type="application/ld+json"])').toArray()
    .reduce((sum, el) => sum + ($(el).html()?.length ?? 0), 0);
  const jsRatio = bodyTextLength > 0 ? inlineScriptLength / bodyTextLength : 0;
  const isJsHeavy = bodyTextLength < 500 && inlineScriptLength > 2000;

  checks.push({
    id: "js_rendering",
    label: "Content Not JS-Dependent",
    status: isJsHeavy ? "warning" : "pass",
    description: isJsHeavy
      ? `Low body text (${bodyTextLength} chars) with heavy inline JavaScript (${Math.round(inlineScriptLength / 1024)}KB). Content may require JavaScript rendering to be visible. Many AI crawlers do not execute JavaScript — ensure critical content is in the HTML source.`
      : `Body text is present in HTML source (${bodyTextLength} chars) — AI crawlers can access content without JavaScript execution.`,
    impact: "high",
    value: !isJsHeavy,
  });

  const score = computeScore(checks);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary("Technical", score, checks),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    https: 10,
    http_status: 10,
    noindex: 10,
    nosnippet: 8,
    nofollow: 4,
    robots_disallow_page: 10,
    noai_directive: 8,          // NEW — iPullRank Ch.7
    max_snippet: 8,             // NEW — iPullRank Ch.7
    js_rendering: 8,            // NEW — iPullRank Ch.7
    canonical: 6,
    robots_txt_exists: 4,
    response_time: 5,
    content_type: 3,
    viewport: 4,
    security_headers: 2,
    hreflang: 5,
    sitemap_reference: 5,
    url_depth: 3,
    page_size: 3,
    render_blocking: 4,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.5;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  category: string,
  score: number,
  checks: AuditCheck[]
): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  if (score >= 80) return `${category} setup is strong with ${checks.filter((c) => c.status === "pass").length} checks passing.`;
  if (fails > 0) return `${fails} critical issue${fails > 1 ? "s" : ""} found that block AI crawler access.`;
  if (warnings > 0) return `${warnings} improvement${warnings > 1 ? "s" : ""} recommended to strengthen ${category.toLowerCase()} signals.`;
  return `${category} score: ${score}/100.`;
}
