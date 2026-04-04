const text = 'Ahrefs i Semrush to narzedzia. Ahrefs jest drozszy.';
const pattern = /(?<![.!?]\s)\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g;
const matches = Array.from(text.matchAll(pattern));
console.log('Pattern matches:', matches.map(m => ({
  word: m[1], 
  idx: m.index, 
  before: JSON.stringify(text.substring(Math.max(0, m.index-3), m.index))
})));

// Also test with the full test text
const fullText = `
Jak poprawić widoczność strony w Google
Google Search Console to darmowe narzędzie od Google.
Ahrefs i Semrush to płatne narzędzia SEO. Ahrefs jest droższy niż Semrush.
Google Analytics pozwala śledzić ruch na stronie.
Core Web Vitals to metryki wydajności od Google.
Używaj Google Search Console regularnie. Google Analytics jest bezpłatny.
`;

const fullMatches = Array.from(fullText.matchAll(pattern));
const ahrefsInFull = fullMatches.filter(m => m[1] === 'Ahrefs');
console.log('\nAhrefs in full text:', ahrefsInFull.length, 'times');
ahrefsInFull.forEach(m => {
  console.log('  at index', m.index, 'before:', JSON.stringify(fullText.substring(Math.max(0, m.index-5), m.index)));
});

// Check if Ahrefs is being filtered by STOP_WORDS or BLOCKLIST
const STOP_WORDS_CHECK = new Set(['się', 'nie', 'tak', 'jak', 'ale', 'czy', 'że', 'co', 'po', 'na', 'do']);
const BLOCKLIST_CHECK = new Set(['karta', 'karty', 'konto', 'konta', 'kredyt', 'pożyczka']);
console.log('\nAhrefs in STOP_WORDS:', STOP_WORDS_CHECK.has('ahrefs'));
console.log('Ahrefs in BLOCKLIST:', BLOCKLIST_CHECK.has('ahrefs'));
