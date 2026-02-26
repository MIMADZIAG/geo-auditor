import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeMetaTags(page: ScrapedPage): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;

  // 1. Title tag
  const title = $("title").first().text().trim();
  const titleLen = title.length;
  const titleStatus =
    titleLen >= 30 && titleLen <= 65
      ? "pass"
      : titleLen > 0
      ? "warning"
      : "fail";
  checks.push({
    id: "title_tag",
    label: "Title Tag",
    status: titleStatus,
    description:
      titleLen === 0
        ? "No title tag found. The title is critical for AI engines to understand page topic."
        : titleLen < 30
        ? `Title is too short (${titleLen} chars): "${title}". Aim for 50–65 characters.`
        : titleLen > 65
        ? `Title is too long (${titleLen} chars): "${title.slice(0, 65)}...". Keep under 65 characters.`
        : `Title tag: "${title}" (${titleLen} chars)`,
    impact: "high",
    value: title || null,
  });

  // 2. Meta description
  const description =
    $('meta[name="description"]').attr("content")?.trim() ?? "";
  const descLen = description.length;
  const descStatus =
    descLen >= 120 && descLen <= 165
      ? "pass"
      : descLen > 0
      ? "warning"
      : "fail";
  checks.push({
    id: "meta_description",
    label: "Meta Description",
    status: descStatus,
    description:
      descLen === 0
        ? "No meta description found. Add a compelling 150–160 character description."
        : descLen < 120
        ? `Meta description is short (${descLen} chars). Aim for 150–160 characters.`
        : descLen > 165
        ? `Meta description is too long (${descLen} chars). Keep under 165 characters.`
        : `Meta description (${descLen} chars): "${description.slice(0, 80)}..."`,
    impact: "medium",
    value: description || null,
  });

  // 3. Open Graph title
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "og_title",
    label: "Open Graph Title",
    status: ogTitle ? "pass" : "warning",
    description: ogTitle
      ? `OG title: "${ogTitle}"`
      : "No og:title found. Open Graph tags improve how AI engines and social platforms display your content.",
    impact: "medium",
    value: ogTitle || null,
  });

  // 4. Open Graph description
  const ogDesc =
    $('meta[property="og:description"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "og_description",
    label: "Open Graph Description",
    status: ogDesc ? "pass" : "warning",
    description: ogDesc
      ? `OG description found (${ogDesc.length} chars).`
      : "No og:description found. Add Open Graph description for better AI and social sharing.",
    impact: "medium",
    value: ogDesc || null,
  });

  // 5. Open Graph image
  const ogImage =
    $('meta[property="og:image"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "og_image",
    label: "Open Graph Image",
    status: ogImage ? "pass" : "info",
    description: ogImage
      ? "OG image found — content will display well when shared."
      : "No og:image found. Add an OG image for better visual representation.",
    impact: "low",
    value: ogImage || null,
  });

  // 6. Twitter Card
  const twitterCard =
    $('meta[name="twitter:card"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "twitter_card",
    label: "Twitter Card",
    status: twitterCard ? "pass" : "info",
    description: twitterCard
      ? `Twitter Card type: ${twitterCard}`
      : "No Twitter Card meta tags found.",
    impact: "low",
    value: twitterCard || null,
  });

  // 7. Language declaration
  const lang = $("html").attr("lang") ?? "";
  checks.push({
    id: "lang_attribute",
    label: "Language Declaration",
    status: lang ? "pass" : "warning",
    description: lang
      ? `Language declared: "${lang}" — helps AI engines serve content to the right audience.`
      : "No lang attribute on <html>. Add lang attribute to help AI engines identify content language.",
    impact: "medium",
    value: lang || null,
  });

  // 8. Charset
  const charset =
    $('meta[charset]').attr("charset") ??
    $('meta[http-equiv="Content-Type"]').attr("content") ??
    "";
  checks.push({
    id: "charset",
    label: "Character Encoding",
    status: charset ? "pass" : "warning",
    description: charset
      ? `Character encoding declared: ${charset}`
      : "No charset meta tag found. Add <meta charset='UTF-8'>.",
    impact: "low",
    value: charset || null,
  });

  const score = computeScore(checks);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, title, description),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    title_tag: 30,
    meta_description: 25,
    og_title: 15,
    og_description: 10,
    lang_attribute: 10,
    og_image: 5,
    twitter_card: 3,
    charset: 2,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.5;
    else if (check.status === "info") earned += w * 0.3;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  score: number,
  title: string,
  description: string
): string {
  if (!title) return "Missing title tag — this is the most critical meta tag for AI visibility.";
  if (!description) return "Title found but meta description is missing. Add a compelling description.";
  if (score >= 80) return "Meta tags are well-optimized with title, description, and Open Graph tags.";
  return "Basic meta tags present but Open Graph and social tags need improvement.";
}
