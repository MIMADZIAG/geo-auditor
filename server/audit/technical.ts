import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeTechnical(page: ScrapedPage): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;

  // 1. HTTPS
  checks.push({
    id: "https",
    label: "HTTPS włączony",
    status: page.isHttps ? "pass" : "fail",
    description: page.isHttps
      ? "Strona jest serwowana przez HTTPS — wymagane dla sygnałów zaufania crawlerów AI."
      : "Strona jest serwowana przez HTTP. HTTPS jest wymagane do indeksowania i dostępu crawlerów AI.",
    impact: "high",
    value: page.isHttps,
  });

  // 2. HTTP Status
  const statusOk = page.statusCode >= 200 && page.statusCode < 300;
  checks.push({
    id: "http_status",
    label: "Status HTTP 200",
    status: statusOk ? "pass" : "fail",
    description: statusOk
      ? `Strona zwróciła HTTP ${page.statusCode}.`
      : `Strona zwróciła HTTP ${page.statusCode || "błąd"}. Crawlery AI nie mogą indeksować stron bez kodu 200.`,
    impact: "high",
    value: page.statusCode,
  });

  // 3. Canonical tag
  const canonical = $('link[rel="canonical"]').attr("href");
  checks.push({
    id: "canonical",
    label: "Tag canonical",
    status: canonical ? "pass" : "warning",
    description: canonical
      ? `Znaleziono tag canonical: ${canonical}`
      : "Brak tagu canonical. Dodaj <link rel='canonical'>, aby zapobiec problemom z duplikatem treści.",
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
    label: "Strona jest indeksowalna",
    status: hasNoindex ? "fail" : "pass",
    description: hasNoindex
      ? "Strona ma dyrektywę noindex — nie może pojawić się w AI Overviews ani wynikach wyszukiwania."
      : "Strona jest indeksowalna (brak dyrektywy noindex).",
    impact: "high",
    value: !hasNoindex,
  });

  // 5. nosnippet check
  const hasNosnippet =
    robotsMeta.toLowerCase().includes("nosnippet") ||
    xRobotsTag.toLowerCase().includes("nosnippet");
  checks.push({
    id: "nosnippet",
    label: "Snippety dozwolone",
    status: hasNosnippet ? "fail" : "pass",
    description: hasNosnippet
      ? "Wykryto dyrektywę nosnippet — blokuje to AI Overviews i featured snippety przed używaniem Twojej treści."
      : "Generowanie snippetów jest dozwolone — silniki AI mogą cytować Twoją treść.",
    impact: "high",
    value: !hasNosnippet,
  });

  // 5b. nofollow check (meta robots)
  const hasNofollow =
    robotsMeta.toLowerCase().includes("nofollow") ||
    xRobotsTag.toLowerCase().includes("nofollow");
  checks.push({
    id: "nofollow",
    label: "Linki śledzalne (nofollow)",
    status: hasNofollow ? "warning" : "pass",
    description: hasNofollow
      ? "Wykryto dyrektywę nofollow w meta robots — wyszukiwarki i crawlery AI nie będą śledzitć linków na tej stronie. Ogranicza to dystrybucję link equity i może zmniejszyć głębokość indeksowania witryny."
      : "Brak dyrektywy nofollow na tej stronie — linki są śledzalne przez crawlery.",
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
    label: "Strona nie jest zablokowana w robots.txt",
    status: pageDisallowed ? "fail" : "pass",
    description: pageDisallowed
      ? `Ścieżka tej strony jest zablokowana regułą Disallow w robots.txt dla wszystkich crawlerów (User-agent: *). Crawlery AI i wyszukiwarki nie mogą uzyskać dostępu do tej strony.`
      : "Strona nie jest zablokowana w robots.txt — crawlery mogą uzyskać do niej dostęp.",
    impact: "high",
    value: !pageDisallowed,
  });

  // 6. robots.txt exists
  checks.push({
    id: "robots_txt_exists",
    label: "Plik robots.txt obecny",
    status: page.robotsTxt !== null ? "pass" : "warning",
    description:
      page.robotsTxt !== null
        ? "Plik robots.txt znaleziony i dostępny."
        : "Brak robots.txt. Choć nie jest wymagany, pomaga crawlerom zrozumieć strukturę witryny.",
    impact: "low",
    value: page.robotsTxt !== null,
  });

  // 7. Response time
  const fastResponse = page.responseTimeMs < 3000;
  checks.push({
    id: "response_time",
    label: "Szybki czas odpowiedzi",
    status: fastResponse ? "pass" : "warning",
    description: fastResponse
      ? `Strona załadowana w ${page.responseTimeMs}ms — dobry wynik dla indeksowalności.`
      : `Strona załadowana w ${page.responseTimeMs}ms — wolne strony mogą być depriorytetyzowane przez crawlery.`,
    impact: "medium",
    value: page.responseTimeMs,
  });

  // 8. Content-Type header
  const contentType = page.headers["content-type"] ?? "";
  const isHtml = contentType.includes("text/html");
  checks.push({
    id: "content_type",
    label: "Typ zawartości HTML",
    status: isHtml ? "pass" : "warning",
    description: isHtml
      ? "Content-Type to text/html — poprawny dla stron internetowych."
      : `Content-Type to '${contentType || "nieznany"}' — crawlery AI oczekują text/html.`,
    impact: "low",
    value: contentType,
  });

  // 9. Viewport meta (mobile-friendly proxy)
  const viewport = $('meta[name="viewport"]').attr("content");
  checks.push({
    id: "viewport",
    label: "Meta tag viewport (mobile)",
    status: viewport ? "pass" : "warning",
    description: viewport
      ? "Meta tag viewport obecny — strona jest przyjazna dla urządzeń mobilnych."
      : "Brak meta tagu viewport. Responsywność mobilna jest czynnikiem rankingowym dla funkcji AI.",
    impact: "medium",
    value: viewport ?? null,
  });

  // 10. X-Frame-Options / security headers (info)
  const hasSecurityHeaders =
    !!page.headers["x-frame-options"] ||
    !!page.headers["content-security-policy"];
  checks.push({
    id: "security_headers",
    label: "Nagłówki bezpieczeństwa",
    status: hasSecurityHeaders ? "pass" : "info",
    description: hasSecurityHeaders
      ? "Wykryto nagłówki bezpieczeństwa — dobre sygnały zaufania."
      : "Brak nagłówków bezpieczeństwa. Dodanie X-Frame-Options lub CSP poprawia sygnały zaufania.",
    impact: "low",
    value: hasSecurityHeaders,
  });

  // 11. Deklaracja języka (lang attr) — zawsze sprawdzamy
  const hreflangLinks = $("link[rel='alternate'][hreflang]");
  const hasHreflang = hreflangLinks.length > 0;
  const langAttr = $("html").attr("lang") ?? "";
  const hasLangDeclaration = !!langAttr;
  checks.push({
    id: "hreflang",
    label: "Deklaracja języka (lang)",
    status: hasLangDeclaration ? "pass" : "fail",
    description: hasLangDeclaration
      ? `Atrybut lang='${langAttr}' obecny na <html> — silniki AI poprawnie rozpoznają język strony.`
      : "Brak atrybutu lang na <html>. Silniki AI używają sygnałów językowych do dopasowania treści do zapytań użytkowników w odpowiednim języku.",
    impact: "medium",
    value: langAttr || null,
  });
  // 11b. Hreflang — sprawdzamy TYLKO gdy tagi hreflang są obecne w HTML
  if (hasHreflang) {
    const hreflangValues = hreflangLinks.map((_, el) => $(el).attr("hreflang") ?? "").get();
    const hasSelfOrDefault = hreflangValues.includes(langAttr) || hreflangValues.includes("x-default");
    const hasDuplicates = hreflangValues.length !== new Set(hreflangValues).size;
    const hreflangStatus = hasSelfOrDefault && !hasDuplicates ? "pass" : "warning";
    const issues: string[] = [];
    if (!hasSelfOrDefault) issues.push(`brak tagu hreflang='${langAttr}' lub 'x-default'`);
    if (hasDuplicates) issues.push("zduplikowane wartości hreflang");
    checks.push({
      id: "hreflang_validity",
      label: "Poprawność tagów hreflang",
      status: hreflangStatus,
      description: hreflangStatus === "pass"
        ? `Znaleziono ${hreflangValues.length} tagów hreflang — konfiguracja wygląda poprawnie.`
        : `Znaleziono ${hreflangValues.length} tagów hreflang, ale wykryto problemy: ${issues.join("; ")}.`,
      impact: "medium",
      value: hreflangValues.length,
    });
  }

  // 12. Sitemap reference in robots.txt
  const hasSitemapInRobots = page.robotsTxt
    ? /^sitemap:/im.test(page.robotsTxt)
    : false;
  checks.push({
    id: "sitemap_reference",
    label: "Mapa strony w robots.txt",
    status: hasSitemapInRobots ? "pass" : "warning",
    description: hasSitemapInRobots
      ? "URL mapy strony podany w robots.txt — pomaga crawlerom AI odkryć wszystkie strony."
      : "Brak dyrektywy Sitemap w robots.txt. Dodaj 'Sitemap: https://twojadomena.pl/sitemap.xml', aby pomóc crawlerom AI odkryć Twoją treść.",
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
    label: "Głębokość URL",
    status: urlDepth <= 3 ? "pass" : urlDepth <= 5 ? "warning" : "fail",
    description: urlDepth <= 3
      ? `Głębokość URL wynosi ${urlDepth} poziomów — płytkie URL są łatwiejsze do priorytetyzowania przez crawlery AI.`
      : urlDepth <= 5
      ? `Głębokość URL wynosi ${urlDepth} poziomów — rozważ spłaszczenie struktury URL dla lepszej indeksowalności.`
      : `Głębokość URL wynosi ${urlDepth} poziomów — głębokie URL są depriorytetyzowane przez crawlery AI. Spląszcz strukturę URL.`,
    impact: "low",
    value: urlDepth,
  });

  // 15. Render-blocking resources (inline scripts in <head>)
  const headScripts = $('head script:not([async]):not([defer]):not([type="application/ld+json"])').length;
  checks.push({
    id: "render_blocking",
    label: "Brak skryptów blokujących renderowanie",
    status: headScripts === 0 ? "pass" : headScripts <= 2 ? "warning" : "fail",
    description: headScripts === 0
      ? "Brak skryptów blokujących renderowanie w <head> — strona ładuje się sprawnie dla crawlerów."
      : headScripts <= 2
      ? `${headScripts} skrypt(y) blokujące renderowanie w <head>. Dodaj atrybuty async lub defer, aby poprawić szybkość indeksowania.`
      : `${headScripts} skryptów blokujących renderowanie w <head>. Znacznie spowalnia to renderowanie strony dla crawlerów AI.`,
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
    label: "max-snippet bez ograniczeń",
    status: maxSnippetValue === null
      ? "pass"
      : maxSnippetValue === -1
      ? "pass"
      : maxSnippetValue === 0
      ? "fail"
      : maxSnippetValue < 200
      ? "warning"
      : "pass",
    description: maxSnippetValue === null
      ? "Brak ograniczenia max-snippet — silniki AI mogą cytować pełną treść (domyślnie bez limitu)."
      : maxSnippetValue === -1
      ? "Wykryto max-snippet:-1 — jawnie bez limitu, silniki AI mogą cytować treść o dowolnej długości."
      : maxSnippetValue === 0
      ? "Wykryto max-snippet:0 — blokuje to całe generowanie snippetów AI. Usuń tę dyrektywę, aby AI Overviews i Perplexity mogły cytować Twoją treść."
      : `Wykryto max-snippet:${maxSnippetValue} — silniki AI mogą cytować tylko do ${maxSnippetValue} znaków. Dla GEO ustaw max-snippet:-1 (bez limitu), aby umożliwić pełną ekstrakcję treści.`,
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
    label: "Brak dyrektywy noai",
    status: hasNoAI ? "fail" : "pass",
    description: hasNoAI
      ? "Wykryto dyrektywę noai w meta tagu robots — jawnie blokuje to silniki AI przed używaniem Twojej treści. Usuń tę dyrektywę, aby umożliwić cytowanie przez AI."
      : "Brak dyrektywy noai — silniki AI mogą używać Twojej treści.",
    impact: "high",
    value: !hasNoAI,
  });

  // 18. JavaScript rendering check (e) — enhanced H1 + first paragraph source check
  //
  // The original check only detected JS-heavy pages by comparing body text length
  // to inline script size. This misses the most important case for e-commerce:
  // React/Vue/Next.js CSR pages where the HTML source has a shell but H1 and the
  // first paragraph are injected by JavaScript at runtime.
  //
  // AI crawlers (GPTBot, PerplexityBot, ClaudeBot) do NOT execute JavaScript.
  // If H1 or the first paragraph are absent from the raw HTML source, these crawlers
  // cannot read the most critical content signals.
  //
  // Algorithm:
  //  1. Parse the raw HTML source (not the cheerio-rendered DOM) to extract text
  //     that is NOT inside <script> tags.
  //  2. Check if the H1 text found in the DOM is also present in the non-script HTML.
  //  3. Check if any <p> with ≥20 words exists outside of <script> tags.
  //  4. Combine with the original JS-heavy heuristic for a multi-signal verdict.

  const bodyTextLength = $('body').text().replace(/\s+/g, ' ').trim().length;
  const inlineScriptLength = $('script:not([src]):not([type="application/ld+json"])').toArray()
    .reduce((sum, el) => sum + ($(el).html()?.length ?? 0), 0);
  const isJsHeavy = bodyTextLength < 500 && inlineScriptLength > 2000;

  // Strip all <script> content from raw HTML to get source-only text
  const htmlWithoutScripts = page.html.replace(/<script[\s\S]*?<\/script>/gi, " ");

  // H1 in source: get H1 text from DOM, then check raw HTML (without scripts) contains it
  const h1DomText = $('h1').first().text().trim();
  // Use first 40 chars of H1 to avoid false negatives from whitespace differences
  const h1Snippet = h1DomText.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const h1InSource = h1Snippet.length >= 5
    ? new RegExp(h1Snippet, 'i').test(htmlWithoutScripts)
    : true; // no H1 to check — handled by contentStructure h1_present check

  // First paragraph in source: look for a <p> tag with ≥20 words outside scripts
  const sourceParagraphMatch = htmlWithoutScripts.match(/<p[^>]*>([^<]{80,})<\/p>/i);
  const firstParaInSource = sourceParagraphMatch !== null;

  // Determine overall status
  const criticalMissing = !h1InSource || (!firstParaInSource && bodyTextLength < 1000);

  let jsStatus: AuditCheck["status"];
  let jsDescription: string;

  if (isJsHeavy && criticalMissing) {
    jsStatus = "fail";
    jsDescription = [
      `Strona jest JS-heavy (${bodyTextLength} zn. tekstu, ${Math.round(inlineScriptLength / 1024)}KB JS inline)`,
      !h1InSource && h1DomText ? ` i H1 ("${h1DomText.slice(0, 50)}") nie jest obecny w źródle HTML` : "",
      !firstParaInSource ? " — brak akapitów w źródle HTML" : "",
      ". Crawlery AI (GPTBot, PerplexityBot, ClaudeBot) nie wykonują JavaScript — nie widzą tej treści. Wdroż SSR (Server-Side Rendering) lub pre-rendering.",
    ].join("");
  } else if (!h1InSource && h1DomText) {
    jsStatus = "warning";
    jsDescription = `H1 ("${h1DomText.slice(0, 60)}") jest renderowany przez JavaScript i może być niewidoczny dla crawlerów AI. Upewnij się, że H1 jest w źródle HTML (SSR/pre-render), nie tylko w bundle JS.`;
  } else if (!firstParaInSource && bodyTextLength < 1000) {
    jsStatus = "warning";
    jsDescription = `Brak akapitów w źródle HTML przy małej ilości tekstu (${bodyTextLength} zn.). Pierwszy akapit może być renderowany przez JavaScript. Crawlery AI nie wykonują JS — wdroż SSR lub dodaj kluczową treść do HTML source.`;
  } else if (isJsHeavy) {
    jsStatus = "warning";
    jsDescription = `Strona jest JS-heavy (${bodyTextLength} zn. tekstu, ${Math.round(inlineScriptLength / 1024)}KB JS inline). H1 i pierwszy akapit są obecne w źródle HTML — to dobry znak. Sprawdź jednak, czy cała krytyczna treść jest dostępna bez JavaScript.`;
  } else {
    jsStatus = "pass";
    jsDescription = `H1 i treść są obecne w źródle HTML (${bodyTextLength} zn.) — crawlery AI mogą odczytać krytyczne sygnały bez wykonywania JavaScript.`;
  }

  checks.push({
    id: "js_rendering",
    label: "Krytyczna treść w HTML source (SSR/pre-render)",
    status: jsStatus,
    description: jsDescription,
    impact: "high",
    value: `body:${bodyTextLength}ch, h1InSource:${h1InSource}, paraInSource:${firstParaInSource}, jsHeavy:${isJsHeavy}`,
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
    hreflang_validity: 4,
    sitemap_reference: 5,
    url_depth: 3,
    render_blocking: 4,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.2; // warning is a real penalty (not half-pass)
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
  if (score >= 80) return `Konfiguracja techniczna jest mocna — ${checks.filter((c) => c.status === "pass").length} testów zakończonych sukcesem.`;
  if (fails > 0) return `${fails} krytycz${fails > 1 ? "ne problemy blokują" : "ny problem blokuje"} dostęp crawlerów AI.`;
  if (warnings > 0) return `${warnings} usprawnie${warnings > 1 ? "nia zalecane" : "nie zalecane"} w celu wzmocnienia sygnałów technicznych.`;
  return `Wynik techniczny: ${score}/100.`;
}
