import http from 'http';

function trpc(proc, input) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ json: input });
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path: '/api/trpc/' + proc + '?input=' + encodeURIComponent(body),
      method: 'GET', headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== GEO-Auditor Final E2E Tests ===\n');

  // Test 1: getById dla istniejącego audytu
  console.log('Test 1: audit.getById (existing audit)');
  const result = await trpc('audit.getById', { id: 2340009 });
  const audit = result.result?.data?.json;
  console.log('  Status:', audit?.status);
  console.log('  Score:', audit?.overallScore);
  console.log('  Has findings:', !!audit?.findings);
  console.log('  Has llmRecommendations:', !!audit?.llmRecommendations);
  console.log('  Has contentIntelligence:', !!audit?.contentIntelligence);
  if (audit?.status === 'completed' && audit?.overallScore > 0) {
    console.log('  PASS\n');
  } else {
    console.log('  FAIL\n');
  }

  // Test 2: aiExposure.getScore
  console.log('Test 2: aiExposure.getScore (example.com)');
  const aiResult = await trpc('aiExposure.getScore', { url: 'https://example.com' });
  const aiData = aiResult.result?.data?.json;
  const r = aiData?.result;
  console.log('  fromCache:', aiData?.fromCache);
  console.log('  insights is array:', Array.isArray(r?.insights));
  console.log('  topKeywords is array:', Array.isArray(r?.topKeywords));
  console.log('  opportunities is array:', Array.isArray(r?.opportunities));
  console.log('  compositeScore:', r?.compositeScore);
  if (Array.isArray(r?.insights) && Array.isArray(r?.topKeywords) && Array.isArray(r?.opportunities)) {
    console.log('  PASS\n');
  } else {
    console.log('  FAIL\n');
  }

  // Test 3: URL validation — empty URL
  console.log('Test 3: audit.run with empty URL (should fail)');
  const emptyResult = await trpc('audit.run', { url: '' });
  if (emptyResult.error) {
    console.log('  PASS: Got expected error:', emptyResult.error.message?.slice(0, 50));
  } else {
    console.log('  FAIL: Expected error for empty URL');
  }
  console.log();

  // Test 4: URL validation — invalid URL
  console.log('Test 4: audit.run with invalid URL (should fail)');
  const invalidResult = await trpc('audit.run', { url: 'not-a-url' });
  if (invalidResult.error) {
    console.log('  PASS: Got expected error:', invalidResult.error.message?.slice(0, 50));
  } else {
    console.log('  FAIL: Expected error for invalid URL');
  }
  console.log();

  console.log('=== All tests completed ===');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
