import puppeteer from "puppeteer-core";
import * as fs from "fs";

const query = process.argv[2] || "fane techniczne toyota rav4";
const targetDomain = process.argv[3] || "autocentrum.pl";

console.log(`Testing query: "${query}" for domain: ${targetDomain}`);

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: [
    "--no-sandbox", "--disable-setuid-sandbox",
    "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--lang=pl",
  ],
  headless: true,
});

const page = await browser.newPage();
await page.setUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
);
await page.setExtraHTTPHeaders({ "Accept-Language": "pl-PL,pl;q=0.9" });

// Try google.pl directly (not google.com with hl=pl)
const searchUrl = `https://www.google.pl/search?q=${encodeURIComponent(query)}&hl=pl`;
console.log("Navigating to:", searchUrl);

await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
// Wait longer for AI Overview to render
await new Promise((r) => setTimeout(r, 6000));

// Take screenshot for debugging
await page.screenshot({ path: "/home/ubuntu/geo-auditor/scripts/debug-aio.png", fullPage: false });
console.log("Screenshot saved to scripts/debug-aio.png");

const diagnostics = await page.evaluate(() => {
  // Strategy 1: known CSS selectors
  const classSelectors = [
    ".YzCcne", ".M8OgIe", ".YzVZnd", ".kno-result",
    "[data-attrid='SGE']", "div[jsname='yEVEwb']",
    ".AIOverview", ".ai-overview",
    // New selectors to try
    ".IVvPP", ".wDYxhc", ".NFQFxe", ".LGOjhe",
    "[data-sgrd]", "[data-content-feature='1']",
    ".ULSxyf", ".yp1CPe", ".ky2eFe",
  ];

  const selectorResults = {};
  for (const sel of classSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const links = el.querySelectorAll("a[href]").length;
        selectorResults[sel] = {
          found: true,
          textLength: (el.textContent || "").length,
          linkCount: links,
          text: (el.textContent || "").slice(0, 80),
        };
      } else {
        selectorResults[sel] = { found: false };
      }
    } catch (e) {
      selectorResults[sel] = { found: false, error: String(e) };
    }
  }

  // Strategy 2: heading-based detection (Polish + English)
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"));
  const aiHeadings = headings
    .filter((h) => {
      const txt = (h.textContent || "").trim();
      return (
        txt === "AI Overview" ||
        txt === "Przegląd od AI" ||
        txt === "Przegląd AI" ||
        txt.startsWith("AI Overview") ||
        txt.startsWith("Przegląd od AI") ||
        txt.startsWith("Przegląd AI")
      );
    })
    .map((h) => ({
      text: (h.textContent || "").trim(),
      tag: h.tagName,
      parentClass: (h.parentElement?.className || "").slice(0, 60),
    }));

  // Strategy 3: find any element containing "AI Overview" text
  const allElements = Array.from(document.querySelectorAll("*"));
  const aiContainers = [];
  for (const el of allElements) {
    const txt = (el.textContent || "").trim();
    if (
      (txt === "AI Overview" || txt === "Przegląd od AI" || txt === "Przegląd AI") &&
      el.children.length === 0
    ) {
      // Found the text node — walk up to find container with links
      let parent = el.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        const linkCount = parent.querySelectorAll("a[href]").length;
        if (linkCount >= 2) {
          aiContainers.push({
            level: i,
            class: (parent.className || "").slice(0, 80),
            id: parent.id || "",
            linkCount,
            text: (parent.textContent || "").slice(0, 100),
          });
          break;
        }
        parent = parent.parentElement;
      }
    }
  }

  // Get all external links on page
  const allLinks = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => a.href)
    .filter((h) => h.startsWith("http") && !h.includes("google."))
    .slice(0, 30);

  // Check if autocentrum.pl appears anywhere
  const pageText = document.body.innerHTML;
  const hasAutocentrum = pageText.includes("autocentrum");

  return {
    title: document.title,
    selectorResults,
    aiHeadings,
    aiContainers,
    allLinks,
    hasAutocentrum,
    bodyLength: document.body.innerHTML.length,
  };
});

console.log("\n=== DIAGNOSTIC RESULTS ===");
console.log("Page title:", diagnostics.title);
console.log("Body HTML length:", diagnostics.bodyLength);
console.log("Has 'autocentrum' in page:", diagnostics.hasAutocentrum);
console.log("\n--- Selector Results ---");
for (const [sel, result] of Object.entries(diagnostics.selectorResults)) {
  if (result.found) {
    console.log(`  ✅ ${sel}: ${JSON.stringify(result)}`);
  }
}
console.log("\n--- AI Headings Found ---");
console.log(JSON.stringify(diagnostics.aiHeadings, null, 2));
console.log("\n--- AI Containers Found (heading walk-up) ---");
console.log(JSON.stringify(diagnostics.aiContainers, null, 2));
console.log("\n--- External Links on Page ---");
diagnostics.allLinks.forEach((l) => console.log(" ", l));

// Save full HTML for analysis
const html = await page.content();
fs.writeFileSync("/home/ubuntu/geo-auditor/scripts/debug-aio.html", html.slice(0, 500000));
console.log("\nFull HTML saved to scripts/debug-aio.html (first 500KB)");

await browser.close();
