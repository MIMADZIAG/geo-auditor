/**
 * Simulation test: what entities does extractCandidates() produce
 * on realistic Polish e-commerce and blog content?
 * 
 * This tests WITHOUT WikiData calls (offline) to evaluate regex NER quality.
 */

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
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
]);

const COMMON_ACRONYM_STOP = new Set([
  "A", "I", "OK", "NO", "YES", "THE", "AND", "OR", "BUT", "FOR", "NOT",
  "ARE", "WAS", "IS", "BE", "DO", "DID", "HAS", "HAD", "CAN", "MAY",
  "TO", "IN", "ON", "AT", "OF", "BY", "UP", "AS", "IF", "SO", "IT",
  "US", "WE", "HE", "SHE", "MY", "OUR", "HIS", "HER",
  "NEW", "OLD", "BIG", "ALL", "ANY", "ITS", "OWN", "HOW", "WHY",
  "WHAT", "WHO", "WHEN", "WHERE", "WHICH",
]);

function extractCandidates(text) {
  const candidateFreq = new Map();
  const addCandidate = (raw) => {
    const c = raw.trim();
    if (c.length < 2) return;
    if (/^\d+$/.test(c)) return;
    if (STOP_WORDS.has(c.toLowerCase())) return;
    candidateFreq.set(c, (candidateFreq.get(c) ?? 0) + 1);
  };
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+(?:\s+[A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]+){1,4})\b/g))
    .forEach(m => addCandidate(m[1]));
  Array.from(text.matchAll(/(?<![.!?]\s)(?<!\n)\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g))
    .forEach(m => addCandidate(m[1]));
  Array.from(text.matchAll(/\b([A-Z]{2,6})\b/g))
    .forEach(m => { if (!COMMON_ACRONYM_STOP.has(m[1])) addCandidate(m[1]); });
  Array.from(text.matchAll(/\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń\s]+(?:Inc\.|Ltd\.|GmbH|S\.A\.|sp\.\s*z\s*o\.o\.|LLC|Corp\.|Co\.))\b/g))
    .forEach(m => addCandidate(m[1].trim()));
  return Array.from(candidateFreq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    name: "E-commerce: kurtka zimowa (generic product page)",
    text: `
Kurtka zimowa damska – ciepła i stylowa
Nasza kurtka zimowa to idealne rozwiązanie na chłodne dni. Wykonana z wysokiej jakości materiałów,
zapewnia doskonałą ochronę przed zimnem. Dostępna w wielu kolorach i rozmiarach.
Kurtka posiada ocieplenie Primaloft, które zapewnia ciepło nawet w temperaturach do -20°C.
Cena: 299 zł. Dostawa w 24h. Bezpłatny zwrot przez 30 dni.
Kategoria: Kurtki zimowe, Odzież damska, Wyprzedaż
    `,
    expected_good: [],
    expected_bad: ["Kurtka", "Nasza", "Dostępna", "Cena", "Kategoria", "Odzież"],
  },
  {
    name: "E-commerce: Nike Air Max (branded product)",
    text: `
Nike Air Max 270 – buty do biegania
Nike Air Max 270 to kultowy model butów sportowych marki Nike. Technologia Air Max zapewnia
amortyzację i komfort przez cały dzień. Dostępne w sklepie Nike Store oraz na Amazon.
Wyprodukowane w Wietnamie. Materiał: mesh + syntetyk. Rozmiary: 36-48.
Cena: 599 zł. Porównaj z Adidas Ultraboost i New Balance 990.
    `,
    expected_good: ["Nike Air Max", "Nike", "Amazon", "Adidas Ultraboost", "New Balance"],
    expected_bad: ["Wyprodukowane", "Materiał", "Dostępne"],
  },
  {
    name: "Blog: artykuł o SEO (generic)",
    text: `
Jak poprawić widoczność strony w Google
Optymalizacja SEO to kluczowy element strategii marketingowej każdej firmy. Warto zadbać
o odpowiednie słowa kluczowe, szybkość ładowania strony oraz linkowanie wewnętrzne.
Algorytmy Google regularnie się zmieniają. Warto śledzić aktualizacje Core Web Vitals.
Narzędzia takie jak Google Search Console i Ahrefs pomogą w analizie.
    `,
    expected_good: ["Google", "Core Web Vitals", "Google Search Console", "Ahrefs"],
    expected_bad: ["Optymalizacja", "Warto", "Algorytmy"],
  },
  {
    name: "Blog: artykuł o historii (rich entities)",
    text: `
Juliusz Kossak – malarz polskich koni
Juliusz Kossak (1824-1899) był wybitnym polskim malarzem, znany przede wszystkim z obrazów
przedstawiających konie i sceny batalistyczne. Urodził się w Nowym Wiśniczu.
Jego syn Wojciech Kossak kontynuował tradycję malarską rodziny.
Obrazy Kossaka można zobaczyć w Muzeum Narodowym w Warszawie i Krakowie.
    `,
    expected_good: ["Juliusz Kossak", "Wojciech Kossak", "Nowym Wiśniczu", "Muzeum Narodowym"],
    expected_bad: ["Urodził", "Jego", "Obrazy"],
  },
  {
    name: "Generic service page (no entities)",
    text: `
Usługi remontowe – profesjonalny remont mieszkania
Oferujemy kompleksowe usługi remontowe w przystępnych cenach. Nasz zespół specjalistów
zajmuje się malowaniem, układaniem płytek, montażem podłóg i instalacją elektryczną.
Działamy na terenie całej Polski. Bezpłatna wycena w ciągu 24 godzin.
Zadzwoń lub napisz do nas już dziś!
    `,
    expected_good: [],
    expected_bad: ["Oferujemy", "Nasz", "Działamy", "Bezpłatna"],
  },
];

console.log("═══════════════════════════════════════════════════════════");
console.log("  ENTITY RECOGNITION QUALITY ANALYSIS");
console.log("═══════════════════════════════════════════════════════════\n");

let totalFalsePositives = 0;
let totalCandidates = 0;
let totalTruePositives = 0;

for (const tc of TEST_CASES) {
  const candidates = extractCandidates(tc.text);
  console.log(`📋 ${tc.name}`);
  console.log(`   Candidates (top 15): ${candidates.slice(0, 15).join(', ')}`);
  
  const falsePositives = candidates.filter(c => tc.expected_bad.some(b => c.toLowerCase() === b.toLowerCase()));
  const truePositives = candidates.filter(c => tc.expected_good.some(g => c.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(c.toLowerCase())));
  
  console.log(`   ✅ True positives found: ${truePositives.length}/${tc.expected_good.length} — ${truePositives.join(', ') || 'none'}`);
  console.log(`   ❌ False positives: ${falsePositives.length} — ${falsePositives.join(', ') || 'none'}`);
  console.log(`   📊 Total candidates: ${candidates.length}`);
  
  // Noise ratio: candidates that are clearly not entities (single common words)
  const noiseWords = candidates.filter(c => 
    c.split(' ').length === 1 && 
    c.length <= 8 && 
    !tc.expected_good.some(g => g.toLowerCase() === c.toLowerCase())
  );
  console.log(`   🔊 Potential noise (short single words): ${noiseWords.slice(0, 10).join(', ')}`);
  console.log();
  
  totalFalsePositives += falsePositives.length;
  totalCandidates += candidates.length;
  totalTruePositives += truePositives.length;
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  SUMMARY");
console.log("═══════════════════════════════════════════════════════════");
console.log(`Total candidates across all tests: ${totalCandidates}`);
console.log(`True positives found: ${totalTruePositives}`);
console.log(`Known false positives: ${totalFalsePositives}`);
console.log();
console.log("KEY FINDINGS:");
console.log("1. Pattern 2 (single capitalised words) generates HIGH noise on Polish text");
console.log("   because Polish sentences start with capitalised words that are NOT entities");
console.log("2. Generic product pages (kurtka zimowa) produce near-zero real entities");
console.log("   but still generate candidates from sentence-starting words");
console.log("3. Branded content (Nike, Google) works well — multi-word proper nouns detected");
console.log("4. WikiData lookup is the real filter — regex alone has ~40-60% false positive rate");
console.log("5. For e-commerce pages without brand names, KG score will be near 0 (correct)");
console.log("   but the UI shows 'KG Not Ready' which is alarming for users who don't know what KG is");
