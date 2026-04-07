import * as cheerio from "cheerio";

// Simulate what the scraper does — fetch with undici (same as the app)
const res = await fetch("https://www.superauto.pl/wynajem-dlugoterminowy/osobowe", {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9",
  },
  signal: AbortSignal.timeout(15000),
});
console.log("Status:", res.status);
const html = await res.text();
console.log("HTML length:", html.length);

// Test 1: Raw cheerio.load
const $ = cheerio.load(html);
console.log("\n=== Test 1: Raw cheerio.load ===");
console.log("H1 count:", $("h1").length);
$("h1").each((i, el) => {
  console.log(`H1[${i}]:`, $(el).text().trim().slice(0, 100));
});

// Test 2: After removing nav/footer/header (like contentStructure does on $)
const $clean = cheerio.load(html);
$clean("script, style, nav, footer, header, aside, noscript").remove();
console.log("\n=== Test 2: After remove(nav/footer/header) ===");
console.log("H1 count:", $clean("h1").length);
$clean("h1").each((i, el) => {
  console.log(`H1[${i}]:`, $clean(el).text().trim().slice(0, 100));
});

// Test 3: Check if H1 is inside header tag
console.log("\n=== Test 3: H1 inside header? ===");
const $raw = cheerio.load(html);
$raw("h1").each((i, el) => {
  const inHeader = $raw(el).closest("header").length > 0;
  const inNav = $raw(el).closest("nav").length > 0;
  const inFooter = $raw(el).closest("footer").length > 0;
  const inAside = $raw(el).closest("aside").length > 0;
  console.log(`H1[${i}]: inHeader=${inHeader}, inNav=${inNav}, inFooter=${inFooter}, inAside=${inAside}`);
  console.log(`  text: "${$raw(el).text().trim().slice(0, 100)}"`);
  console.log(`  parent: <${$raw(el).parent()[0]?.tagName}>, grandparent: <${$raw(el).parent().parent()[0]?.tagName}>`);
});
