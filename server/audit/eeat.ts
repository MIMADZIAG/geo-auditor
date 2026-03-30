import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeEEAT(page: ScrapedPage, pageType: PageType = "generic"): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;
  const fullHtml = $.html()?.toLowerCase() ?? "";
  const fullText = $("body").text().toLowerCase();

  // ── 1. Author byline ──────────────────────────────────────────────────────
  // Only penalized for articles/blogs. For e-commerce, it's informational only.
  const hasAuthor =
    $('[rel="author"]').length > 0 ||
    $('[class*="author"]').length > 0 ||
    $('[itemprop="author"]').length > 0 ||
    $('meta[name="author"]').length > 0 ||
    $('[class*="byline"]').length > 0 ||
    /\b(written\s+by|author:|by\s+[a-z]+\s+[a-z]+|autor:|napisał|napisała)\b/.test(fullText);

  const authorAdaptive = (() => {
    if (["article", "service"].includes(pageType)) {
      return {
        label: "Podpis autora",
        status: (hasAuthor ? "pass" : "fail") as AuditCheck["status"],
        description: hasAuthor
          ? "Wykryto podpis autora — silny sygnał E-E-A-T dla silników AI."
          : "Brak podpisu autora. Autorstwo z imieniem i nazwiskiem to krytyczny sygnał zaufania dla artykułów i poradników. Dodaj imię i nazwisko autora z kwalifikacjami i link do profilu autora.",
        impact: "high" as const,
      };
    } else if (["homepage", "landing"].includes(pageType)) {
      return {
        label: "Atrybucja zespołu / marki",
        status: (hasAuthor ? "pass" : "warning") as AuditCheck["status"],
        description: hasAuthor
          ? "Wykryto atrybucję autora lub zespołu."
          : "Brak atrybucji zespołu. Rozważ dodanie sekcji 'Nasz zespół' lub 'O nas'.",
        impact: "medium" as const,
      };
    } else {
      // product, product-listing, generic — author not expected
      return {
        label: "Atrybucja sprzedawcy / marki",
        status: (hasAuthor ? "pass" : "info") as AuditCheck["status"],
        description: hasAuthor
          ? "Wykryto atrybucję marki."
          : "Brak podpisu autora — nie jest wymagany dla tego typu strony. Skup się na informacjach o sprzedawcy i badge'ach zaufania.",
        impact: "low" as const,
      };
    }
  })();

  checks.push({ id: "author_byline", value: hasAuthor, ...authorAdaptive });

  // ── 2. About page link ────────────────────────────────────────────────────
  // Broad multi-language detection: Polish, English, German, French, Spanish, Czech
  // Also checks footer specifically (most sites put About in footer nav)
  const aboutHrefPatterns = [
    'a[href*="about"]', 'a[href*="o-nas"]', 'a[href*="o-firmie"]',
    'a[href*="about-us"]', 'a[href*="kim-jestesmy"]', 'a[href*="our-story"]',
    'a[href*="company"]', 'a[href*="wspolpraca"]', 'a[href*="uber-uns"]',
    'a[href*="a-propos"]', 'a[href*="sobre-nosotros"]', 'a[href*="o-spolecnosti"]',
    'a[href*="firma"]', 'a[href*="zespol"]', 'a[href*="team"]',
    'a[href*="who-we-are"]', 'a[href*="our-company"]', 'a[href*="historia"]',
  ];
  const aboutTextPhrases = [
    "o nas", "o firmie", "kim jesteśmy", "nasza historia", "o spółce", "o sklepie",
    "nasz zespół", "poznaj nas", "o marce",
    "about us", "about", "our story", "who we are", "our team", "company",
    "über uns", "à propos", "sobre nosotros",
  ];
  const hasAboutLink =
    $(aboutHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return aboutTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check (most sites put About in footer)
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return aboutTextPhrases.some(p => text.includes(p))
        || href.includes("o-nas") || href.includes("about") || href.includes("firma");
    });

  checks.push({
    id: "about_page",
    label: "Link do strony O nas",
    status: hasAboutLink ? "pass" : "warning",
    description: hasAboutLink
      ? "Znaleziono link do strony O nas — pomaga silnikom AI ustalić tożsamość podmiotu."
      : "Brak linku 'O nas'. Strona O nas to kluczowy sygnał E-E-A-T, który pomaga silnikom AI zrozumieć, kto stoi za tą witryną.",
    impact: "medium",
    value: hasAboutLink,
  });
  // ── 3. Contact information ────────────────────────────────────────────────────
  const contactHrefPatterns = [
    'a[href*="contact"]', 'a[href*="kontakt"]', 'a[href*="napisz"]',
    'a[href^="mailto:"]', 'a[href^="tel:"]',
    'a[href*="contact-us"]', 'a[href*="get-in-touch"]', 'a[href*="reach-us"]',
    'a[href*="contacto"]', 'a[href*="kontakte"]', 'a[href*="nous-contacter"]',
  ];
  const contactTextPhrases = [
    "kontakt", "contact", "contact us", "skontaktuj się", "napisz do nas",
    "napisz do nas", "wyślij wiadomość", "formularz kontaktowy", "zadzwoń",
    "get in touch", "reach us", "write to us", "email us",
    "kontaktieren", "contacto", "nous contacter",
  ];
  const hasContactInfo =
    $(contactHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return contactTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return contactTextPhrases.some(p => text.includes(p))
        || href.includes("kontakt") || href.includes("contact") || href.startsWith("mailto:") || href.startsWith("tel:");
    }) ||
    /(\+\d[\d\s\-()]{7,}|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b)/.test(fullText);

  checks.push({
    id: "contact_info",
    label: "Dane kontaktowe",
    status: hasContactInfo ? "pass" : "fail",
    description: hasContactInfo
      ? "Znaleziono dane kontaktowe lub link — ważny sygnał zaufania."
      : "Brak danych kontaktowych. Dane kontaktowe (email, telefon lub link do strony kontaktowej) są wymagane dla zgodności E-E-A-T i zaufania silników AI.",
    impact: "high",
    value: hasContactInfo,
  });

  // ── 4. Legal pages (Privacy Policy + Terms) ────────────────────────────────────────────────────
  // Privacy: Polish (polityka prywatności, prywatność, RODO), English, German, French, Spanish
  const privacyHrefPatterns = [
    'a[href*="privacy"]', 'a[href*="polityka"]', 'a[href*="rodo"]',
    'a[href*="gdpr"]', 'a[href*="prywatnosci"]', 'a[href*="prywatnosc"]',
    'a[href*="datenschutz"]', 'a[href*="confidentialite"]', 'a[href*="privacidad"]',
    'a[href*="privacy-policy"]', 'a[href*="legal"]', 'a[href*="ochrona-danych"]',
  ];
  const privacyTextPhrases = [
    "polityka prywatności", "privacy policy", "prywatność", "rodo", "ochrona danych",
    "polityka cookies", "datenschutz", "confidentialité", "privacidad", "privacy",
    "polityka",
  ];
  const hasPrivacy =
    $(privacyHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return privacyTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check (Privacy Policy is almost always in footer)
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return privacyTextPhrases.some(p => text.includes(p))
        || href.includes("privacy") || href.includes("polityka") || href.includes("rodo") || href.includes("gdpr");
    });

  // Terms: Polish (regulamin, warunki), English, German, French, Spanish
  const termsHrefPatterns = [
    'a[href*="terms"]', 'a[href*="regulamin"]', 'a[href*="warunki"]',
    'a[href*="tos"]', 'a[href*="legal"]', 'a[href*="agb"]',
    'a[href*="cgv"]', 'a[href*="condiciones"]', 'a[href*="terms-of-service"]',
    'a[href*="terms-of-use"]',
  ];
  const termsTextPhrases = [
    "regulamin", "terms", "terms of service", "terms & conditions", "warunki",
    "warunki korzystania", "warunki użytkowania", "agb", "cgv", "condiciones",
    "terms of use", "user agreement",
  ];
  const hasTerms =
    $(termsHrefPatterns.join(", ")).length > 0 ||
    $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      return termsTextPhrases.some(phrase => text.includes(phrase));
    }) ||
    // Footer-specific check
    $("footer a, [class*='footer'] a, [id*='footer'] a, [class*='Footer'] a").toArray().some((el) => {
      const text = $(el).text().toLowerCase().trim();
      const href = ($(el).attr("href") ?? "").toLowerCase();
      return termsTextPhrases.some(p => text.includes(p))
        || href.includes("regulamin") || href.includes("terms") || href.includes("legal");
    });

  checks.push({
    id: "legal_pages",
    label: "Polityka prywatności i regulamin",
    status: hasPrivacy && hasTerms ? "pass" : hasPrivacy || hasTerms ? "warning" : "fail",
    description:
      hasPrivacy && hasTerms
        ? "Znaleziono linki do polityki prywatności i regulaminu — pełne sygnały zgodności prawnej."
        : hasPrivacy
        ? "Znaleziono politykę prywatności, ale brak linku do regulaminu. Dodaj stronę z regulaminem dla pełnej zgodności prawnej."
        : hasTerms
        ? "Znaleziono regulamin, ale brak linku do polityki prywatności. Dodaj politykę prywatności dla zgodności z RODO."
        : "Brak linków do polityki prywatności i regulaminu. Są one wymagane dla zgodności E-E-A-T i zaufania użytkowników.",
    impact: "medium",
    value: `privacy:${hasPrivacy},terms:${hasTerms}`,
  });

  // NOTE: external_citations check removed from E-E-A-T (d) — already evaluated
  // in contentStructure.ts. Keeping it here would double-count the same signal.
  // Its weight is redistributed to experience_signals (a purer E-E-A-T signal).

  // ── 6. Page-type-specific trust signals ──────────────────────────────────────────────
  if (["product", "product-listing"].includes(pageType)) {
    const hasReviews =
      !!$('[itemprop="ratingValue"], [class*="rating"], [class*="review"], [class*="stars"], [class*="opinie"]').length ||
      /\b(\d+\s*(reviews?|opinie|ocen|gwiazdek|stars?))\b/i.test(fullText);

    checks.push({
      id: "review_signals",
      label: "Opinie i oceny klientów",
      status: hasReviews ? "pass" : "warning",
      description: hasReviews
        ? "Wykryto opinie lub oceny klientów — silny sygnał zaufania dla e-commerce."
        : "Brak opinii lub ocen klientów. Dodanie recenzji produktów z ocenami gwiazdkowymi to kluczowy sygnał zaufania dla silników AI.",
      impact: "high",
      value: hasReviews,
    });

    const hasReturnPolicy =
      /\b(return\s+policy|zwrot|wymiana|gwarancja|warranty|refund|reklamacja)\b/i.test(fullText) ||
      !!$('a[href*="zwrot"], a[href*="return"], a[href*="gwarancja"]').length;

    checks.push({
      id: "trust_signals",
      label: "Polityka zwrotów / gwarancja",
      status: hasReturnPolicy ? "pass" : "warning",
      description: hasReturnPolicy
        ? "Znaleziono informacje o polityce zwrotów lub gwarancji — buduje zaufanie kupujących."
        : "Brak informacji o polityce zwrotów lub gwarancji. Strony e-commerce powinny wyraźnie określać zasady zwrotów/refundacji.",
      impact: "medium",
      value: hasReturnPolicy,
    });
  }

  if (pageType === "homepage") {
    const hasTeamInfo =
      /\b(team|zespół|founders?|założyciel|our\s+story|nasza\s+historia)\b/i.test(fullText) ||
      !!$('[class*="team"], [class*="founder"]').length;

    checks.push({
      id: "company_identity",
      label: "Tożsamość firmy / zespołu",
      status: hasTeamInfo ? "pass" : "warning",
      description: hasTeamInfo
        ? "Wykryto informacje o firmie lub zespole — pomaga silnikom AI zidentyfikować organizację."
        : "Brak informacji o firmie lub zespole. Dodaj sekcję 'O nas', aby ustalić tożsamość podmiotu.",
      impact: "high",
      value: hasTeamInfo,
    });
  }

  // ── 7. Publication date (articles only) ──────────────────────────────────
  if (["article"].includes(pageType)) {
    const hasDate =
      !!$("time[datetime], [itemprop='datePublished'], [itemprop='dateModified']").length ||
      /\b(published|posted|updated|data\s+publikacji|opublikowano)\b/i.test(fullHtml);

    checks.push({
      id: "publication_date",
      label: "Data publikacji / aktualizacji",
      status: hasDate ? "pass" : "warning",
      description: hasDate
        ? "Wykryto datę publikacji lub aktualizacji — pomaga silnikom AI ocenić świeżość treści."
        : "Brak daty publikacji. Pokaż, kiedy treść została opublikowana/zaktualizowana dla sygnałów świeżości.",
      impact: "medium",
      value: hasDate,
    });
  }

  // ── 8. First-person experience signals (iPullRank Ch.9 — Experience in E-E-A-T) ────
  // "Experience" is the first E in E-E-A-T — personal experience with the topic
  // Proxy: first-person language, personal anecdotes, "I tested", "in my experience"
  const firstPersonPatterns = [
    /\b(i\s+(tested|tried|used|reviewed|found|discovered|measured|analyzed|built|created|wrote|spent|worked|learned|noticed|experienced|recommend)|in\s+my\s+(experience|opinion|testing|review)|from\s+my\s+(experience|testing)|i've\s+(been|used|tried|tested|worked|found)|we\s+(tested|tried|found|measured|analyzed|built|created|discovered|recommend)|our\s+(experience|testing|research|data|analysis|team)\b)\b/i,
    // Polish
    /\b(przetestowałem|przetestowałam|sprawdziłem|sprawdziłam|używam|używałem|w\s+moim\s+doświadczeniu|z\s+mojego\s+doświadczenia|polecam|nie\s+polecam|moim\s+zdaniem|według\s+mnie|osobiście|testowałem|testowałam)\b/i,
  ];

  const hasFirstPersonExperience = firstPersonPatterns.some(p => p.test(fullText));

  // Also check for case studies, before/after, real examples
  const hasCaseStudySignals =
    /\b(case\s+study|before\s+and\s+after|real\s+example|actual\s+result|our\s+client|our\s+customer|studium\s+przypadku|przykład|wyniki|rezultaty)\b/i.test(fullText);

  const hasExperienceSignals = hasFirstPersonExperience || hasCaseStudySignals;

  const experienceRelevant = ["article", "service", "homepage"].includes(pageType);
  checks.push({
    id: "experience_signals",
    label: "Sygnały doświadczenia własnego",
    status: hasExperienceSignals
      ? "pass"
      : experienceRelevant
      ? "warning"
      : "info",
    description: hasExperienceSignals
      ? "Wykryto sygnały doświadczenia własnego lub case study — składnik 'Doświadczenie' E-E-A-T. Silniki AI używają tego do odróżnienia treści eksperckich od generycznych."
      : experienceRelevant
      ? "Brak sygnałów doświadczenia własnego. Pierwsze 'E' w E-E-A-T oznacza Doświadczenie — dodaj osobiste spostrzeżenia, wyniki testów, case studies lub język 'przetestowałem', aby zademonstrować bezpośrednie doświadczenie z tematem."
      : "Brak sygnałów doświadczenia własnego. Rozważ dodanie przykładów lub wyników z rzeczywistego świata.",
    impact: experienceRelevant ? "high" : "low",
    value: hasExperienceSignals,
  });

  // ── 9. Expertise signals (iPullRank Ch.9 — Expertise in E-E-A-T) ─────────────
  // Credentials, qualifications, professional background
  const expertisePatterns = [
    /\b(ph\.?d|m\.?d|mba|certified|licensed|accredited|registered|qualified|specialist|expert|consultant|professor|dr\.|engineer|architect|attorney|lawyer|cpa|cfa|years?\s+of\s+experience|years?\s+in\s+the\s+industry)\b/i,
    // Polish
    /\b(certyfikowany|licencjonowany|akredytowany|specjalista|ekspert|konsultant|profesor|inżynier|prawnik|lata\s+doświadczenia|lat\s+w\s+branży|dyplom|wykształcenie|absolwent)\b/i,
  ];

  const hasExpertiseSignals = expertisePatterns.some(p => p.test(fullText)) ||
    $('[class*="credentials"], [class*="expertise"], [class*="qualifications"], [itemprop="knowsAbout"]').length > 0;

  checks.push({
    id: "expertise_signals",
    label: "Ekspertyza i kwalifikacje",
    status: hasExpertiseSignals ? "pass" : ["article", "service"].includes(pageType) ? "warning" : "info",
    description: hasExpertiseSignals
      ? "Wykryto sygnały ekspertyzy (kwalifikacje, certyfikaty lub tło zawodowe) — silny sygnał E-E-A-T dla silników AI."
      : ["article", "service"].includes(pageType)
      ? "Brak sygnałów ekspertyzy. Dodaj kwalifikacje autora, certyfikaty zawodowe lub doświadczenie branżowe, aby wzmocnić składnik 'Ekspertyza' E-E-A-T. Silniki AI używają sygnałów ekspertyzy do oceny wiarygodności treści."
      : "Brak wyraźnych sygnałów ekspertyzy. Rozważ dodanie kwalifikacji tam, gdzie jest to zasadne.",
    impact: ["article", "service"].includes(pageType) ? "medium" : "low",
    value: hasExpertiseSignals,
  });

  const score = computeScore(checks, pageType);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, checks, pageType),
  };
}

function computeScore(checks: AuditCheck[], pageType: PageType): number {
  const weights: Record<string, number> = {
    author_byline: 0,          // set dynamically
    about_page: 12,
    contact_info: 15,
    legal_pages: 12,
    // external_citations removed — evaluated in contentStructure.ts
    review_signals: 15,        // e-commerce only
    trust_signals: 8,          // e-commerce only
    company_identity: 15,      // homepage only
    publication_date: 8,       // article only
    experience_signals: 0,     // set dynamically
    expertise_signals: 0,      // set dynamically
  };

  if (["article", "service"].includes(pageType)) {
    weights.author_byline = 20;
    // external_citations weight (15) redistributed to experience_signals
    weights.experience_signals = 25;  // raised: pure E-E-A-T signal
    weights.expertise_signals = 10;
  } else if (["homepage", "landing"].includes(pageType)) {
    weights.author_byline = 8;
    weights.about_page = 22;          // raised from 18 (absorbed 4 from ext citations)
    weights.experience_signals = 12;  // raised from 8
    weights.expertise_signals = 5;
  } else {
    // product, product-listing, generic
    weights.author_byline = 5;
    weights.experience_signals = 8;   // raised from 5
    weights.expertise_signals = 5;    // raised from 3
  }

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 10;
    if (w === 0) continue;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.2;
    else if (check.status === "info") earned += w * 0.1;
    // fail = 0
  }

  if (total === 0) return 50;
  return Math.round((earned / total) * 100);
}

function buildSummary(score: number, checks: AuditCheck[], pageType: PageType): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const typeContext =
    pageType === "article" ? "article"
    : pageType === "product" || pageType === "product-listing" ? "e-commerce page"
    : pageType === "homepage" ? "homepage"
    : "page";

  if (score >= 80) return `Silne sygnały E-E-A-T dla tej ${typeContext} — dobre wskaźniki zaufania i autorytetu.`;
  if (fails > 0) return `${fails} krytycz${fails > 1 ? "ne problemy E-E-A-T zmniejszają" : "ny problem E-E-A-T zmniejsza"} zaufanie silników AI do tej ${typeContext}.`;
  if (warnings > 0) return `${warnings} usprawnie${warnings > 1 ? "nia E-E-A-T zalecane" : "nie E-E-A-T zalecane"} w celu wzmocnienia sygnałów zaufania.`;
  return `Wynik E-E-A-T: ${score}/100.`;
}
