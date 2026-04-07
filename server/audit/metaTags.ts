import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeMetaTags(page: ScrapedPage): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;

  // 1. Title tag
  const title = $("title").first().text().trim();
  const titleLen = Array.from(title).length;
  const titleStatus =
    titleLen >= 30 && titleLen <= 65
      ? "pass"
      : titleLen > 0
      ? "warning"
      : "fail";
  checks.push({
    id: "title_tag",
    label: "Tag tytułu strony",
    status: titleStatus,
    description:
      titleLen === 0
        ? "Brak tagu tytułu. Tytuł jest kluczowy dla silników AI do zrozumienia tematu strony."
        : titleLen < 30
        ? `Tytuł jest za krótki (${titleLen} znaków): \"${title}\". Celuj w 50–65 znaków.`
        : titleLen > 65
        ? `Tytuł jest za długi (${titleLen} znaków): \"${Array.from(title).slice(0, 65).join('')}...\". Skróć do 65 znaków.`
        : `Tag tytułu: \"${title}\" (${titleLen} znaków)`,
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
    label: "Meta opis strony",
    status: descStatus,
    description:
      descLen === 0
        ? "Brak meta opisu. Dodaj przekonujący opis o długości 150–160 znaków."
        : descLen < 120
        ? `Meta opis jest za krótki (${descLen} znaków). Celuj w 150–160 znaków.`
        : descLen > 165
        ? `Meta opis jest za długi (${descLen} znaków). Skróć do 165 znaków.`
        : `Meta opis (${descLen} znaków): "${description.slice(0, 80)}..."`,
    impact: "medium",
    value: description || null,
  });

  // 3. Open Graph title
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "og_title",
    label: "Tytuł Open Graph",
    status: ogTitle ? "pass" : "warning",
    description: ogTitle
      ? `Tytuł OG: "${ogTitle}"`
      : "Brak og:title. Tagi Open Graph poprawiają sposób wyświetlania treści przez silniki AI i platformy społecznościowe.",
    impact: "medium",
    value: ogTitle || null,
  });

  // 4. Open Graph description
  const ogDesc =
    $('meta[property="og:description"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "og_description",
    label: "Opis Open Graph",
    status: ogDesc ? "pass" : "warning",
    description: ogDesc
      ? `Opis OG znaleziony (${ogDesc.length} znaków).`
      : "Brak og:description. Dodaj opis Open Graph dla lepszego udostępniania przez AI i media społecznościowe.",
    impact: "medium",
    value: ogDesc || null,
  });

  // 5. Open Graph image
  const ogImage =
    $('meta[property="og:image"]').attr("content")?.trim() ?? "";
  checks.push({
    id: "og_image",
    label: "Grafika Open Graph",
    status: ogImage ? "pass" : "info",
    description: ogImage
      ? "Grafika OG znaleziona — treść będzie dobrze wyglądać przy udostępnianiu."
      : "Brak og:image. Dodaj grafikę OG dla lepszej reprezentacji wizualnej.",
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
      ? `Typ Twitter Card: ${twitterCard}`
      : "Brak meta tagów Twitter Card.",
    impact: "low",
    value: twitterCard || null,
  });

  // 7. Language declaration
  const lang = $("html").attr("lang") ?? "";
  checks.push({
    id: "lang_attribute",
    label: "Deklaracja języka strony",
    status: lang ? "pass" : "warning",
    description: lang
      ? `Zadeklarowany język: "${lang}" — pomaga silnikom AI serwować treść właściwej grupie odbiorców.`
      : "Brak atrybutu lang na <html>. Dodaj atrybut lang, aby pomóc silnikom AI zidentyfikować język treści.",
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
    label: "Kodowanie znaków",
    status: charset ? "pass" : "warning",
    description: charset
      ? `Zadeklarowane kodowanie znaków: ${charset}`
      : "Brak meta tagu charset. Dodaj <meta charset='UTF-8'>.",
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
    else if (check.status === "warning") earned += w * 0.2; // warning is a real penalty (not half-pass)
    else if (check.status === "info") earned += w * 0.1;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  score: number,
  title: string,
  description: string
): string {
  if (!title) return "Brak tagu tytułu — to najważniejszy meta tag dla widoczności w AI.";
  if (!description) return "Tytuł znaleziony, ale brak meta opisu. Dodaj przekonujący opis.";
  if (score >= 80) return "Meta tagi są dobrze zoptymalizowane — tytuł, opis i tagi Open Graph są obecne.";
  return "Podstawowe meta tagi są obecne, ale tagi Open Graph i społecznościowe wymagają poprawy.";
}
