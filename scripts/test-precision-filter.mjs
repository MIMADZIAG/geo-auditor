/**
 * Offline precision test for the new entity recognition filter.
 * Tests the extractCandidates() logic WITHOUT WikiData calls.
 * 
 * Simulates the exact problematic scenario from audit #3870001:
 * a financial/e-commerce page with Polish common nouns that were
 * previously being matched to unrelated WikiData entries.
 */

// ─── Inline the key logic from entityRecognizer.ts ───────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "this", "that", "these", "those", "it", "its", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need", "dare",
  "i", "we", "you", "he", "she", "they", "me", "us", "him", "her", "them",
  "my", "our", "your", "his", "their", "its", "mine", "ours", "yours",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "as", "until", "while", "although", "though", "since",
  "się", "nie", "tak", "jak", "ale", "czy", "że", "co", "po", "na", "do",
  "ze", "za", "przy", "pod", "nad", "przed", "między", "przez", "bez",
  "już", "też", "tylko", "jeszcze", "więc", "oraz", "albo", "ani",
  "który", "która", "które", "tego", "tej", "temu", "tym", "ich", "im",
  "jego", "jej", "nam", "nas", "was", "wam", "sobie", "siebie",
]);

const COMMON_ACRONYM_STOP = new Set([
  "A", "I", "OK", "NO", "YES", "THE", "AND", "OR", "BUT", "FOR", "NOT",
  "ARE", "WAS", "IS", "BE", "DO", "DID", "HAS", "HAD", "CAN", "MAY",
  "TO", "IN", "ON", "AT", "OF", "BY", "UP", "AS", "IF", "SO", "IT",
  "US", "WE", "HE", "SHE", "MY", "OUR", "HIS", "HER",
  "NEW", "OLD", "BIG", "ALL", "ANY", "ITS", "OWN", "HOW", "WHY",
  "WHAT", "WHO", "WHEN", "WHERE", "WHICH",
  "CPM", "CPC", "CTR", "CPA", "CPL", "CPV", "CPS", "ROI", "ROAS", "AOV",
  "KPI", "OKR", "SLA", "NPS", "MRR", "ARR", "LTV", "CAC", "GMV",
  "BIK", "PKB", "NBP", "GUS", "ZUS", "NFZ", "VAT", "PIT", "CIT",
  "HTTP", "HTTPS", "HTML", "CSS", "PHP", "SQL", "XML", "JSON", "PDF",
  "URL", "URI", "API", "SDK", "CDN", "DNS", "SSL", "TLS", "IP",
  "FAQ", "TOS", "GDPR", "RODO", "UX", "UI", "CMS", "CRM", "ERP",
]);

const POLISH_COMMON_NOUN_BLOCKLIST = new Set([
  "karta", "karty", "kartę", "kartą",
  "konto", "konta", "koncie", "kontem",
  "kredyt", "kredyty", "kredytu", "kredytem",
  "pożyczka", "pożyczki", "pożyczkę", "pożyczką",
  "lokata", "lokaty", "lokatę", "lokatą",
  "przelew", "przelewy", "przelewu", "przelewem",
  "płatność", "płatności", "płatnością",
  "faktura", "faktury", "fakturę", "fakturą",
  "rachunek", "rachunki", "rachunku", "rachunkiem",
  "ubezpieczenie", "ubezpieczenia", "ubezpieczeniu",
  "inwestycja", "inwestycje", "inwestycji",
  "oszczędności", "oszczędność",
  "oprocentowanie", "oprocentowania",
  "prowizja", "prowizje", "prowizji",
  "hipoteka", "hipoteki", "hipotekę",
  "leasing", "leasingu", "leasingiem",
  "produkt", "produkty", "produktu", "produktem",
  "kategoria", "kategorie", "kategorii",
  "kolekcja", "kolekcje", "kolekcji",
  "oferta", "oferty", "ofertę", "ofertą",
  "promocja", "promocje", "promocji",
  "wyprzedaż", "wyprzedaże", "wyprzedaży",
  "rabat", "rabaty", "rabatu", "rabatem",
  "cena", "ceny", "cenę", "ceną",
  "dostawa", "dostawy", "dostawę", "dostawą",
  "zwrot", "zwroty", "zwrotu", "zwrotem",
  "zamówienie", "zamówienia", "zamówieniu",
  "koszyk", "koszyki", "koszyka", "koszykiem",
  "sklep", "sklepy", "sklepu", "sklepem",
  "sprzedaż", "sprzedaży",
  "zakup", "zakupy", "zakupu", "zakupem",
  "strona", "strony", "stronę", "stroną",
  "menu", "nawigacja", "nawigacji",
  "kontakt", "kontaktu", "kontaktem",
  "regulamin", "regulaminu", "regulaminem",
  "polityka", "polityki", "politykę",
  "pomoc", "pomocy",
  "faq", "pytania", "pytanie",
  "blog", "bloga", "blogiem",
  "artykuł", "artykuły", "artykułu",
  "poradnik", "poradniki", "poradnika",
  "polecaj", "polecamy", "polecane",
  "sprawdź", "sprawdzamy", "sprawdzenie",
  "zobacz", "zobaczysz", "zobaczyć",
  "dowiedz", "dowiedz się", "dowiedzieć",
  "kup", "kupuj", "kupujesz", "kupowanie",
  "wybierz", "wybieramy", "wybrać",
  "porównaj", "porównanie", "porównania",
  "oblicz", "obliczenie", "obliczenia",
  "zarejestruj", "rejestracja", "rejestracji",
  "zaloguj", "logowanie", "logowania",
  "nowy", "nowe", "nowa", "nowych",
  "najlepszy", "najlepsze", "najlepsza",
  "tani", "tanie", "tania", "tanich",
  "drogi", "drogie", "droga", "drogich",
  "popularny", "popularne", "popularna",
  "darmowy", "darmowe", "darmowa",
  "szybki", "szybkie", "szybka",
  "informacje", "informacja", "informacji",
  "szczegóły", "szczegół", "szczegółu",
  "opis", "opisu", "opisem",
  "wyniki", "wynik", "wyniku",
  "dane", "danych",
  "warunki", "warunek", "warunku",
  "zasady", "zasada", "zasadzie",
  "usługa", "usługi", "usługę", "usługą",
  "firma", "firmy", "firmę", "firmą",
  "pozostałe", "pozostały", "pozostała",
  "inne", "inny", "inna",
  "więcej", "mniej",
  "wszystkie", "wszystko", "wszystkich",
]);

function extractCandidates(text) {
  const candidateFreq = new Map();

  const addCandidate = (raw) => {
    const c = raw.trim().replace(/\s+/g, " ");
    if (c.length < 2) return;
    if (/^\d+$/.test(c)) return;
    if (STOP_WORDS.has(c.toLowerCase())) return;
    if (POLISH_COMMON_NOUN_BLOCKLIST.has(c.toLowerCase())) return;
    candidateFreq.set(c, (candidateFreq.get(c) ?? 0) + 1);
  };

  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+(?:\s+[A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+){1,4})\b/g))
    .forEach(m => addCandidate(m[1]));

  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g))
    .forEach(m => addCandidate(m[1]));

  Array.from(text.matchAll(/\b([A-Z]{2,6})\b/g))
    .forEach(m => { if (!COMMON_ACRONYM_STOP.has(m[1])) addCandidate(m[1]); });

  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń\s]+(?:Inc\.|Ltd\.|GmbH|S\.A\.|sp\.\s*z\s*o\.o\.|LLC|Corp\.|Co\.))\b/g))
    .forEach(m => addCandidate(m[1].trim()));

  // Precision filter: single-word candidates must appear ≥2 times
  const filtered = new Map();
  candidateFreq.forEach((freq, candidate) => {
    const isMultiWord = candidate.split(/\s+/).length > 1;
    const isAcronym = /^[A-Z]{2,6}$/.test(candidate);
    const hasLegalSuffix = /(?:Inc\.|Ltd\.|GmbH|S\.A\.|sp\. z o\.o\.|LLC|Corp\.|Co\.)$/.test(candidate);
    if (isMultiWord || isAcronym || hasLegalSuffix) {
      filtered.set(candidate, freq);
    } else if (freq >= 2) {
      filtered.set(candidate, freq);
    }
  });

  const filteredArr = [];
  filtered.forEach((freq, candidate) => filteredArr.push([candidate, freq]));
  return filteredArr
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const PROBLEMATIC_WORDS = ["Polecaj", "Karty", "CPM", "Konta", "Pożyczki", "Pozostałe", "Ii"];

const TEST_CASES = [
  {
    name: "🔴 Audit #3870001 — financial/e-commerce page (BEFORE fix: had false positives)",
    text: `
Polecaj drogi swoje
Karty kredytowe i debetowe
CPM to wskaźnik kosztu tysiąca wyświetleń
Konta bankowe dla firm i osób prywatnych
Pożyczki gotówkowe i kredyty studenckie w Polsce
Pozostałe postacie serialu "Gotowe na wszystko"
Ii to kolejna kategoria
Sprawdź nasze oferty. Wybierz najlepszą opcję.
Karty płatnicze dostępne online. Konta oszczędnościowe.
Pożyczki bez BIK. Kredyty dla studentów.
    `,
    shouldNotContain: PROBLEMATIC_WORDS,
    shouldContain: [],
  },
  {
    name: "🟢 Branded e-commerce — Nike (should find brand entities)",
    text: `
Nike Air Max 270 – buty do biegania
Nike Air Max 270 to kultowy model butów sportowych marki Nike.
Nike Air Max jest dostępny w rozmiarach 36-48.
Dostępne w sklepie Nike Store oraz na Nike.com.
Porównaj z Adidas Ultraboost i New Balance 990.
Nike Store oferuje darmową dostawę. Adidas Ultraboost jest alternatywą.
    `,
    shouldNotContain: ["Dostępne", "Porównaj"],
    shouldContain: ["Nike Air Max", "Nike", "Adidas Ultraboost"],
  },
  {
    name: "🟢 Blog SEO — named tools (should find tool names)",
    text: `
Jak poprawić widoczność strony w Google
Google Search Console to darmowe narzędzie od Google.
Ahrefs i Semrush to płatne narzędzia SEO. Ahrefs jest droższy niż Semrush.
Google Analytics pozwala śledzić ruch na stronie.
Core Web Vitals to metryki wydajności od Google.
Używaj Google Search Console regularnie. Google Analytics jest bezpłatny.
    `,
    shouldNotContain: ["Pozwala", "Śledzić"],
    shouldContain: ["Google Search Console", "Google Analytics", "Ahrefs", "Core Web Vitals"],
  },
  {
    name: "🟢 History article — proper nouns (should find people/places)",
    text: `
Juliusz Kossak – malarz polskich koni
Juliusz Kossak (1824-1899) był wybitnym polskim malarzem.
Jego syn Wojciech Kossak kontynuował tradycję malarską rodziny.
Obrazy Juliusz Kossaka można zobaczyć w Muzeum Narodowym w Warszawie.
Wojciech Kossak malował sceny batalistyczne. Muzeum Narodowe posiada kolekcję.
    `,
    shouldNotContain: ["Obrazy", "Malował", "Posiada"],
    shouldContain: ["Juliusz Kossak", "Wojciech Kossak", "Muzeum Narodowym"],
  },
  {
    name: "🔴 Generic service page (should find NOTHING — no brands)",
    text: `
Usługi remontowe – profesjonalny remont mieszkania
Oferujemy kompleksowe usługi remontowe w przystępnych cenach.
Nasz zespół specjalistów zajmuje się malowaniem, układaniem płytek.
Działamy na terenie całej Polski. Bezpłatna wycena w ciągu 24 godzin.
Zadzwoń lub napisz do nas już dziś!
    `,
    shouldNotContain: ["Oferujemy", "Nasz", "Działamy", "Bezpłatna", "Zadzwoń"],
    shouldContain: [],
  },
];

// ─── Run tests ────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("  PRECISION FILTER TEST — entity recognition false positives");
console.log("═══════════════════════════════════════════════════════════\n");

let passed = 0;
let failed = 0;

for (const tc of TEST_CASES) {
  const candidates = extractCandidates(tc.text);
  console.log(`${tc.name}`);
  console.log(`  Candidates: [${candidates.join(', ')}]`);
  
  const falsePositives = tc.shouldNotContain.filter(w =>
    candidates.some(c => c.toLowerCase() === w.toLowerCase())
  );
  const missingExpected = tc.shouldContain.filter(expected =>
    !candidates.some(c => c.toLowerCase().includes(expected.toLowerCase()) || expected.toLowerCase().includes(c.toLowerCase()))
  );
  
  if (falsePositives.length === 0 && missingExpected.length === 0) {
    console.log(`  ✅ PASS`);
    passed++;
  } else {
    if (falsePositives.length > 0) {
      console.log(`  ❌ FAIL — False positives still present: ${falsePositives.join(', ')}`);
    }
    if (missingExpected.length > 0) {
      console.log(`  ⚠️  Missing expected entities: ${missingExpected.join(', ')}`);
    }
    failed++;
  }
  console.log();
}

console.log("═══════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════════════");
if (failed === 0) {
  console.log("  ✅ All precision tests pass — false positives eliminated");
} else {
  console.log("  ❌ Some tests failed — review the filter");
  process.exit(1);
}
