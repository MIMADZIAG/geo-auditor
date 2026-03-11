import https from 'https';

const key = process.env.SERPAPI_API_KEY;
const query = 'fane techniczne toyota rav4';
const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&hl=pl&gl=pl&api_key=${key}`;

console.log('Testing SerpApi with query:', query);

https.get(url, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const j = JSON.parse(data);
    console.log('HTTP Status:', res.statusCode);
    if (j.error) {
      console.log('SerpApi Error:', j.error);
      process.exit(1);
    }
    console.log('Has AI Overview:', !!j.ai_overview);
    if (j.ai_overview) {
      const refs = j.ai_overview.references || [];
      console.log('References count:', refs.length);
      refs.forEach(r => console.log(' -', r.link, '|', r.source));
    }
    console.log('Search metadata:', j.search_metadata?.status);
  });
}).on('error', e => {
  console.error('Request error:', e.message);
  process.exit(1);
});
