/**
 * Brand Authority Module
 *
 * Evaluates how likely an AI engine is to treat this domain as an authoritative
 * source in its category — compared to established players in the same space.
 *
 * This is NOT a copy of Google E-E-A-T. It is a proprietary "Brand Presence Score"
 * based on observable signals in the page HTML, domain metadata, and structural
 * patterns that correlate with AI citation probability.
 *
 * Signals analyzed:
 *  1. Brand Consistency — is the brand name consistently used across title, H1, OG tags, schema?
 *  2. Knowledge Panel Signals — Wikipedia link, Wikidata, official social profiles
 *  3. Press & Media Mentions — links to/from media domains, press page
 *  4. Industry Credentials — certifications, awards, associations, accreditations
 *  5. Content Depth Signals — number of unique topics, content breadth vs. niche focus
 *  6. Domain Age Proxy — signals in HTML that suggest an established brand (not detectable without WHOIS)
 *  7. Social Proof Density — follower counts, review counts, testimonials
 */

import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { AuditCheck, CategoryResult } from "./types";

export interface BrandAuthorityResult extends CategoryResult {
  brandPresenceScore: number;   // 0–100 composite score
  brandName: string | null;
  authorityTier: "established" | "growing" | "emerging" | "unknown";
  signals: {
    knowledgePanelReady: boolean;
    hasMediaMentions: boolean;
    hasIndustryCredentials: boolean;
    hasSocialProof: boolean;
    brandConsistent: boolean;
    hasPressMentions: boolean;
  };
}

export function analyzeBrandAuthority(
  page: ScrapedPage,
  pageType: PageType = "generic"
): BrandAuthorityResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;
  const fullText = $("body").text().toLowerCase();
  const fullHtml = $.html()?.toLowerCase() ?? "";

  // ── Extract brand name from multiple sources ──────────────────────────────
  const brandFromSchema = (() => {
    try {
      const scripts = $('script[type="application/ld+json"]').toArray();
      for (const s of scripts) {
        const json = JSON.parse($(s).html() ?? "{}");
        const entries = Array.isArray(json) ? json : [json];
        for (const entry of entries) {
          if (entry.name) return entry.name as string;
          if (entry.brand?.name) return entry.brand.name as string;
          if (entry.publisher?.name) return entry.publisher.name as string;
        }
      }
    } catch { /* ignore */ }
    return null;
  })();

  const brandFromOG = $('meta[property="og:site_name"]').attr("content") ?? null;
  const brandFromTitle = (() => {
    const title = $("title").first().text().trim();
    // Common patterns: "Brand | Page" or "Page - Brand" or "Brand: Page"
    const separators = [" | ", " - ", " – ", " — ", ": "];
    for (const sep of separators) {
      if (title.includes(sep)) {
        const parts = title.split(sep);
        // Brand is usually the shorter part
        return parts.sort((a, b) => a.length - b.length)[0].trim();
      }
    }
    return title.length < 40 ? title : null;
  })();

  const brandName = brandFromSchema ?? brandFromOG ?? brandFromTitle;

  // ── 1. Brand Consistency ──────────────────────────────────────────────────
  // Does the brand name appear consistently across title, H1, OG tags, and schema?
  const h1Text = $("h1").first().text().toLowerCase().trim();
  const titleText = $("title").first().text().toLowerCase();
  const ogSiteName = (brandFromOG ?? "").toLowerCase();
  const schemaName = (brandFromSchema ?? "").toLowerCase();
  const brandLower = (brandName ?? "").toLowerCase();

  const brandInH1 = brandLower && h1Text.includes(brandLower);
  const brandInTitle = brandLower && titleText.includes(brandLower);
  const brandInOG = brandLower && ogSiteName.includes(brandLower);
  const brandInSchema = brandLower && schemaName.includes(brandLower);

  const consistencyScore = [brandInTitle, brandInOG, brandInSchema].filter(Boolean).length;
  const brandConsistent = consistencyScore >= 2;

  checks.push({
    id: "brand_consistency",
    label: "Spójność nazwy marki",
    status: brandName
      ? (consistencyScore >= 2 ? "pass" : consistencyScore === 1 ? "warning" : "fail")
      : "fail",
    description: !brandName
      ? "Nie udało się wykryć nazwy marki. Upewnij się, że nazwa marki pojawia się w tytule strony, meta tagu OG site_name i znacznikach schema.org."
      : consistencyScore >= 2
      ? `Nazwa marki "${brandName}" jest spójnie używana w tytule, tagach OG i schema — silny sygnał tożsamości dla silników AI.`
      : consistencyScore === 1
      ? `Nazwa marki "${brandName}" jest tylko częściowo spójna. Dodaj ją do OG site_name i znaczników schema.org Organization/WebSite.`
      : `Wykryto nazwę marki, ale nie jest spójnie używana w meta tagach i schema. Silniki AI używają spójności marki do ustalania tożsamości encji.`,
    impact: "high",
    value: brandName,
  });

  // ── 2. Knowledge Panel Readiness ──────────────────────────────────────────
  // Wikipedia link, Wikidata sameAs, official social profiles in schema
  const hasWikipediaLink =
    $('a[href*="wikipedia.org"]').length > 0 ||
    fullHtml.includes("wikipedia.org");

  const hasSameAs = (() => {
    try {
      const scripts = $('script[type="application/ld+json"]').toArray();
      for (const s of scripts) {
        const json = JSON.parse($(s).html() ?? "{}");
        const entries = Array.isArray(json) ? json : [json];
        for (const entry of entries) {
          if (Array.isArray(entry.sameAs) && entry.sameAs.length > 0) return true;
          if (typeof entry.sameAs === "string" && entry.sameAs.length > 0) return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  })();

  const knowledgePanelReady = hasWikipediaLink || hasSameAs;

  checks.push({
    id: "knowledge_panel",
    label: "Gotowość do Knowledge Panel",
    status: knowledgePanelReady ? "pass" : "warning",
    description: knowledgePanelReady
      ? "Wykryto odwołanie do Wikipedii lub linki sameAs w schema — silny sygnał dla silników AI do identyfikacji marki jako znana encja."
      : "Nie znaleziono linku do Wikipedii ani właściwości schema sameAs. Dodanie linków sameAs (Wikipedia, Wikidata, oficjalne profile społecznościowe) do schematu Organization pomoże silnikom AI rozpoznać Twoją markę jako znaną encję.",
    impact: "medium",
    value: knowledgePanelReady,
  });

  // ── 3. Press & Media Mentions ─────────────────────────────────────────────
  // Links to media domains, press page, or media mentions section
  const mediaDomains = [
    "forbes.com", "techcrunch.com", "businessinsider.com", "reuters.com",
    "bloomberg.com", "wired.com", "theguardian.com", "nytimes.com",
    "wsj.com", "ft.com", "economist.com", "bbc.com", "cnn.com",
    // Polish media
    "wyborcza.pl", "rzeczpospolita.pl", "newsweek.pl", "forbes.pl",
    "pulshr.pl", "bankier.pl", "money.pl", "pb.pl", "natemat.pl",
    "onet.pl", "wp.pl", "interia.pl",
  ];

  const hasMediaLinks = mediaDomains.some(domain =>
    $(`a[href*="${domain}"]`).length > 0
  );

  const hasPressPage =
    $('a[href*="press"], a[href*="media"], a[href*="newsroom"], a[href*="news"]').length > 0 ||
    $("a").toArray().some(el => {
      const text = $(el).text().toLowerCase().trim();
      return ["press", "media", "newsroom", "w mediach", "o nas w mediach", "prasa"].some(p => text.includes(p));
    });

  const hasMediaMentions = hasMediaLinks || hasPressPage;

  checks.push({
    id: "media_presence",
    label: "Obecność w mediach i prasie",
    status: hasMediaLinks ? "pass" : hasPressPage ? "warning" : "info",
    description: hasMediaLinks
      ? "Wykryto linki do uznanych mediów — silny sygnał autorytetu. Silniki AI używają cytowań medialnych do oceny wiarygodności marki."
      : hasPressPage
      ? "Znaleziono stronę prasową lub medialną. Rozważ dodanie linków do rzeczywistych artykułów medialnych, aby wzmocnić sygnały autorytetu."
      : "Nie znaleziono wzmianek medialnych ani strony prasowej. Marki cytowane w uznanych mediach są znacznie częściej cytowane w odpowiedziach AI Search. Rozważ stworzenie strony prasowej z relacjami medialnymi.",
    impact: "medium",
    value: hasMediaMentions,
  });

  // ── 4. Industry Credentials ───────────────────────────────────────────────
  // Certifications, awards, associations, accreditations
  const credentialKeywords = [
    // Polish
    "certyfikat", "nagroda", "wyróżnienie", "akredytacja", "zrzeszenie",
    "członek", "partner", "autoryzowany", "licencja", "iso",
    // English
    "certified", "award", "accredited", "member of", "partner",
    "authorized", "licensed", "iso ", "gdpr compliant", "pci",
    "featured in", "as seen in", "trusted by",
  ];

  const hasCredentials =
    credentialKeywords.some(kw => fullText.includes(kw)) ||
    $('[class*="award"], [class*="cert"], [class*="badge"], [class*="trust"], [class*="partner"]').length > 0 ||
    $('img[alt*="award"], img[alt*="certified"], img[alt*="nagroda"], img[alt*="certyfikat"]').length > 0;

  checks.push({
    id: "industry_credentials",
    label: "Certyfikaty i nagrody branżowe",
    status: hasCredentials ? "pass" : "info",
    description: hasCredentials
      ? "Wykryto certyfikaty branżowe, nagrody lub akredytacje — silne sygnały autorytetu dla silników AI."
      : "Nie znaleziono certyfikatów ani nagród branżowych. Wyświetlanie certyfikatów, nagród i członkostwa w organizacjach branżowych zwiększa sygnały autorytetu, które silniki AI używają do oceny ekspertyzy.",
    impact: "medium",
    value: hasCredentials,
  });

  // ── 5. Social Proof Density ───────────────────────────────────────────────
  // Follower counts, review counts, testimonials, case studies
  const socialProofPatterns = [
    // Numbers + social proof words
    /\b\d[\d,]+\s*(customers?|clients?|klient\u00f3w|u\u017cytkownik\u00f3w|users?|subscribers?|followers?|obserwuj\u0105cych|reviews?|opinii|ocen)\b/i,
    /\b(trusted by|used by|zaufali nam|korzysta z nas|polecany przez)\b/i,
    /\b\d[\d,]+\+?\s*(firm|brands?|companies|sklep\u00f3w|stron|websites?)\b/i,
  ];

  const hasTestimonials =
    $('[class*="testimonial"], [class*="review"], [class*="opinia"], [class*="quote"]').length > 0 ||
    $('[itemprop="review"], [itemprop="testimonial"]').length > 0;

  const hasSocialProofText = socialProofPatterns.some(p => p.test(fullText));

  const hasSocialLinks =
    $('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="facebook.com"]').length > 0;

  const hasSocialProof = hasTestimonials || hasSocialProofText || hasSocialLinks;

  checks.push({
    id: "social_proof",
    label: "Dowód społeczny i sygnały społecznościowe",
    status: (hasTestimonials || hasSocialProofText) ? "pass" : hasSocialLinks ? "warning" : "info",
    description: (hasTestimonials || hasSocialProofText)
      ? "Wykryto sygnały dowodu społecznego (recenzje, opinie klientów lub liczby użytkowników) — silniki AI używają ich do oceny wiarygodności marki."
      : hasSocialLinks
      ? "Znaleziono linki do mediow społecznościowych, ale brak opinii lub liczby klientów. Dodanie skwantyfikowanego dowodu społecznego (np. '10 000+ klientów') wzmacnia sygnały autorytetu."
      : "Nie znaleziono sygnałów dowodu społecznego. Opinie klientów, liczby recenzji i obserwujących pomagają silnikom AI ocenić autorytet marki.",
    impact: "medium",
    value: hasSocialProof,
  });

  // ── 6. Niche Authority vs. Broad Domain ──────────────────────────────────
  // Focused niche content is more likely to be cited by AI for specific queries
  // than a generic site covering many unrelated topics
  const hasNicheSignals = (() => {
    // Check if schema.org type is specific (not just "WebSite")
    try {
      const scripts = $('script[type="application/ld+json"]').toArray();
      for (const s of scripts) {
        const json = JSON.parse($(s).html() ?? "{}");
        const entries = Array.isArray(json) ? json : [json];
        for (const entry of entries) {
          const type = entry["@type"];
          if (type && !["WebSite", "WebPage"].includes(type)) return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  })();

  const hasSpecialtyKeywords =
    $('[class*="specialist"], [class*="expert"], [class*="ekspert"]').length > 0 ||
    /\b(specialist|expert|ekspert|specjalista|lider|leader|#1|number one|najlepszy w|best in)\b/i.test(fullText);

  checks.push({
    id: "niche_authority",
    label: "Specjalizacja domenowa",
    status: (hasNicheSignals || hasSpecialtyKeywords) ? "pass" : "warning",
    description: (hasNicheSignals || hasSpecialtyKeywords)
      ? "Wykryto sygnały specjalizacji domenowej — skoncentrowana ekspertyza to silny czynnik cytowania przez AI."
      : "Brak wyraźnych sygnałów specjalizacji domenowej. Silniki AI preferują cytowanie źródeł wykazujących skoncentrowaną ekspertyzę w konkretnym obszarze. Użyj typów schema.org specyficznych dla Twojej branży (np. MedicalOrganization, LegalService, FinancialService) i wyraźnie określ swoją dziedzinę ekspertyzy.",
    impact: "high",
    value: hasNicheSignals || hasSpecialtyKeywords,
  });

  // ── Compute composite Brand Presence Score ────────────────────────────────
  const score = computeScore(checks);

  // ── Determine authority tier ──────────────────────────────────────────────
  const authorityTier: BrandAuthorityResult["authorityTier"] =
    score >= 75 ? "established"
    : score >= 50 ? "growing"
    : score >= 25 ? "emerging"
    : "unknown";

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, authorityTier, brandName),
    brandPresenceScore: score,
    brandName,
    authorityTier,
    signals: {
      knowledgePanelReady,
      hasMediaMentions,
      hasIndustryCredentials: hasCredentials,
      hasSocialProof,
      brandConsistent,
      hasPressMentions: hasPressPage,
    },
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    brand_consistency: 25,
    knowledge_panel: 15,
    media_presence: 20,
    industry_credentials: 15,
    social_proof: 15,
    niche_authority: 10,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 10;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.4;
    else if (check.status === "info") earned += w * 0.1;
    // fail = 0
  }

  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

function buildSummary(
  score: number,
  tier: BrandAuthorityResult["authorityTier"],
  brandName: string | null
): string {
  const name = brandName ? `"${brandName}"` : "Ta domena";
  if (tier === "established") {
    return `${name} wykazuje silne sygnały autorytetu marki — wysokie prawdopodobieństwo cytowania przez AI dla odpowiednich zapytań.`;
  }
  if (tier === "growing") {
    return `${name} ma umiarkowany autorytet marki. Wzmocnienie obecności medialnej i dowodu społecznego zwiększy prawdopodobieństwo cytowania przez AI.`;
  }
  if (tier === "emerging") {
    return `${name} to rozwijająca się marka z ograniczonymi sygnałami autorytetu. Skup się na spójności marki, certyfikatach i obecności medialnej, aby poprawić widoczność w AI.`;
  }
  return `${name} ma minimalne sygnały autorytetu marki. Silniki AI raczej nie będą cytować tej domeny bez silniejszej tożsamości encji i wskaźników wiarygodności.`;
}
