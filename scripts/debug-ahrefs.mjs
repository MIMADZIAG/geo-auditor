const text = `
Jak poprawić widoczność strony w Google
Google Search Console to darmowe narzędzie od Google.
Ahrefs i Semrush to płatne narzędzia SEO. Ahrefs jest droższy niż Semrush.
Google Analytics pozwala śledzić ruch na stronie.
Core Web Vitals to metryki wydajności od Google.
Używaj Google Search Console regularnie. Google Analytics jest bezpłatny.
`;

// Pattern 2: single capitalised words not at sentence start
const pattern2 = /(?<![.!?]\s)(?<!\n)(?<!\n\n)\b([A-ZŁŚŹŻĆĄĘÓŃ][a-złśźżćąęóń]{2,})\b/g;
const all = Array.from(text.matchAll(pattern2));
console.log("All pattern2 matches:", all.map(m => m[1]));

const ahrefsMatches = all.filter(m => m[1] === 'Ahrefs');
console.log("Ahrefs matches count:", ahrefsMatches.length);
if (ahrefsMatches.length > 0) {
  ahrefsMatches.forEach(m => {
    const ctx = text.substring(Math.max(0, m.index - 30), m.index + 30);
    console.log("  Context:", JSON.stringify(ctx));
    console.log("  Index:", m.index);
    console.log("  Char before:", JSON.stringify(text[m.index - 1]));
    console.log("  Char before-2:", JSON.stringify(text[m.index - 2]));
  });
}

// Check what's at position of first 'Ahrefs'
const firstAhrefsIdx = text.indexOf('Ahrefs');
console.log("\nFirst Ahrefs at index:", firstAhrefsIdx);
console.log("Chars before:", JSON.stringify(text.substring(firstAhrefsIdx - 5, firstAhrefsIdx)));
