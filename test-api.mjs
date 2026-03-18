/**
 * End-to-end API test script
 * Tests: audit.run, audit.getById, aiExposure.getScore
 */
import http from 'http';

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data.slice(0, 500) });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== GEO-Auditor API End-to-End Tests ===\n');

  // Test 1: audit.run
  console.log('Test 1: audit.run (https://example.com)');
  const runRes = await request(
    '/api/trpc/audit.run?batch=1',
    'POST',
    { '0': { json: { url: 'https://example.com' } } }
  );
  const runResult = runRes.data[0];
  if (runResult.error) {
    console.log('  FAIL:', runResult.error.message ?? JSON.stringify(runResult.error).slice(0, 200));
    process.exit(1);
  }
  const auditId = runResult.result?.data?.json?.auditId;
  console.log('  PASS: auditId =', auditId);

  // Test 2: audit.getById (wait for completion)
  console.log('\nTest 2: audit.getById (polling for completion)');
  let audit = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const getRes = await request(
      `/api/trpc/audit.getById?batch=1&input=${encodeURIComponent(JSON.stringify({ '0': { json: { id: auditId } } }))}`,
    );
    const getResult = getRes.data[0];
    if (getResult.error) {
      console.log('  FAIL:', getResult.error.message ?? JSON.stringify(getResult.error).slice(0, 200));
      process.exit(1);
    }
    audit = getResult.result?.data?.json;
    console.log(`  Attempt ${i+1}: status=${audit?.status}, score=${audit?.overallScore}`);
    if (audit?.status === 'completed' || audit?.status === 'failed') break;
  }
  if (!audit || audit.status !== 'completed') {
    console.log('  FAIL: Audit did not complete in time. Status:', audit?.status);
    process.exit(1);
  }
  console.log('  PASS: Audit completed!');
  console.log('  Score:', audit.overallScore);
  console.log('  Has llmRecommendations:', Array.isArray(audit.llmRecommendations));
  console.log('  Has contentIntelligence:', !!audit.contentIntelligence);
  console.log('  Has categories:', !!audit.categories);

  // Test 3: aiExposure.getScore
  console.log('\nTest 3: aiExposure.getScore (example.com)');
  const exposureRes = await request(
    `/api/trpc/aiExposure.getScore?batch=1&input=${encodeURIComponent(JSON.stringify({ '0': { json: { url: 'https://example.com' } } }))}`,
  );
  const exposureResult = exposureRes.data[0];
  if (exposureResult.error) {
    console.log('  FAIL:', exposureResult.error.message ?? JSON.stringify(exposureResult.error).slice(0, 200));
  } else {
    const exposure = exposureResult.result?.data?.json;
    console.log('  PASS: fromCache =', exposure?.fromCache);
    console.log('  Result keys:', Object.keys(exposure?.result ?? {}));
    const r = exposure?.result;
    if (r) {
      console.log('  totalKeywordsAnalyzed:', r.totalKeywordsAnalyzed);
      console.log('  insights type:', typeof r.insights, Array.isArray(r.insights));
      console.log('  topKeywords type:', typeof r.topKeywords, Array.isArray(r.topKeywords));
      console.log('  opportunities type:', typeof r.opportunities, Array.isArray(r.opportunities));
    }
  }

  // Test 4: audit.run with invalid URL (should return validation error)
  console.log('\nTest 4: audit.run with invalid URL (should fail gracefully)');
  const invalidRes = await request(
    '/api/trpc/audit.run?batch=1',
    'POST',
    { '0': { json: { url: 'not-a-url' } } }
  );
  const invalidResult = invalidRes.data[0];
  if (invalidResult.error) {
    console.log('  PASS: Got expected error:', invalidResult.error.message ?? 'validation error');
  } else {
    console.log('  WARN: Expected error but got success');
  }

  // Test 5: audit.run with URL without protocol (should be normalized by frontend)
  console.log('\nTest 5: audit.run with URL without protocol (should fail at Zod)');
  const noProtoRes = await request(
    '/api/trpc/audit.run?batch=1',
    'POST',
    { '0': { json: { url: 'example.com' } } }
  );
  const noProtoResult = noProtoRes.data[0];
  if (noProtoResult.error) {
    console.log('  PASS: Got expected error:', noProtoResult.error.message ?? 'validation error');
  } else {
    console.log('  WARN: Expected error but got success (URL without protocol was accepted)');
  }

  console.log('\n=== All tests completed ===');
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
