/**
 * E2E test for AI Search Exposure Score
 * Tests real domains known to have AI Overview visibility
 */

const BASE = "http://localhost:3000";

async function trpcGet(proc, input) {
  const url = `${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.json?.message ?? JSON.stringify(data.error));
  return data.result?.data?.json;
}

async function testDomain(url, label) {
  console.log(`\n--- Testing: ${label} (${url}) ---`);
  try {
    const result = await trpcGet("aiExposure.getScore", { url });
    const r = result?.result;
    if (!r) { console.log("  ERROR: No result returned"); return; }
    
    console.log(`  Domain: ${r.domain}`);
    console.log(`  Total keywords analyzed: ${r.totalKeywordsAnalyzed}`);
    console.log(`  Keywords with AI Overview: ${r.keywordsWithAiOverview}`);
    console.log(`  Keywords cited in AI Overview: ${r.keywordsCitedInAiOverview}`);
    console.log(`  Exposure Score: ${r.exposureScore}/100`);
    console.log(`  Citation Score: ${r.citationScore}/100`);
    console.log(`  Composite Score: ${r.compositeScore}/100`);
    console.log(`  Tier: ${r.tier} — ${r.tierLabel}`);
    console.log(`  From cache: ${result.fromCache}`);
    
    if (r.topKeywords?.length > 0) {
      console.log(`  Top AI keyword: "${r.topKeywords[0].keyword}" (${r.topKeywords[0].volume.toLocaleString()} vol)`);
    }
    if (r.insights?.length > 0) {
      console.log(`  Insight: ${r.insights[0]}`);
    }
    
    // Validation
    if (r.totalKeywordsAnalyzed > 0) {
      console.log(`  ✓ PASS: Got real keyword data`);
    } else {
      console.log(`  ⚠ WARNING: No keywords found (domain may have low organic traffic in Ahrefs)`);
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message?.slice(0, 200)}`);
  }
}

async function main() {
  console.log("=== AI Search Exposure Score — E2E Tests ===");
  console.log("Testing with real domains...\n");

  // Test domains with known AI Overview presence
  await testDomain("https://healthline.com", "Healthline (health/medical — high AI Overview)");
  await testDomain("https://nytimes.com", "NY Times (news — moderate AI Overview)");
  await testDomain("https://wikipedia.org", "Wikipedia (reference — high AI Overview)");
  
  console.log("\n=== Tests completed ===");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
