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
    https: 15,
    http_status: 15,
    noindex: 15,
    nosnippet: 15,
    canonical: 10,
    robots_txt_exists: 5,
    response_time: 10,
    content_type: 5,
    viewport: 5,
    security_headers: 5,
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
