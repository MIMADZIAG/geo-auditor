const text = `
Jak poprawić widoczność strony w Google
Google Search Console to darmowe narzędzie od Google.
Ahrefs i Semrush to płatne narzędzia SEO. Ahrefs jest droższy niż Semrush.
Google Analytics pozwala śledzić ruch na stronie.
Core Web Vitals to metryki wydajności od Google.
Używaj Google Search Console regularnie. Google Analytics jest bezpłatny.
`;

// Test Pattern 2 with the new regex (no newline lookbehind)
const pattern2 = /(?<![.!?]\s)\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g;
const allMatches = Array.from(text.matchAll(pattern2));
console.log("All Pattern 2 matches:", allMatches.map(m => m[1]));

const ahrefsMatches = allMatches.filter(m => m[1] === 'Ahrefs');
console.log("Ahrefs count:", ahrefsMatches.length);

// Check character by character
const ahrefsIdx = text.indexOf('Ahrefs');
console.log("\nAhrefs at index:", ahrefsIdx);
console.log("Chars before:", JSON.stringify(text.substring(ahrefsIdx-3, ahrefsIdx)));
console.log("Ahrefs chars:", [...'Ahrefs'].map(c => `${c}(${c.charCodeAt(0)})`).join(' '));

// Test if 'hrefs' matches [a-złśźżćąęóń]{2,}
console.log("\n'hrefs' matches [a-złśźżćąęóń]{2,}:", /^[a-złśźżćąęóń]{2,}$/.test('hrefs'));
console.log("'Ahrefs' matches full pattern:", /^[A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,}$/.test('Ahrefs'));

// Check if the freq filter is the issue - Ahrefs appears twice
const candidateFreq = new Map();
allMatches.forEach(m => {
  const c = m[1].trim().replace(/\s+/g, ' ');
  candidateFreq.set(c, (candidateFreq.get(c) ?? 0) + 1);
});
console.log("\nFrequency map:", Object.fromEntries(candidateFreq));
console.log("Ahrefs freq:", candidateFreq.get('Ahrefs'));
