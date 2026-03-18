/**
 * Test LLM models availability through Forge API
 */
const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

console.log('Forge URL:', forgeUrl ? 'set' : 'not set');
console.log('Forge Key:', forgeKey ? 'set (' + forgeKey.slice(0, 8) + '...)' : 'not set');

if (!forgeUrl || !forgeKey) {
  console.log('Forge API not configured — skipping model tests');
  process.exit(0);
}

const models = ['gpt-5.4', 'gpt-4o', 'gpt-4.1', 'gpt-4.5-preview'];

for (const model of models) {
  try {
    const res = await fetch(forgeUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + forgeKey },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say hello' }],
        max_completion_tokens: 10,
      })
    });
    const d = await res.json();
    if (d.error) {
      console.log(`  FAIL ${model}: ${d.error.message ?? JSON.stringify(d.error).slice(0, 100)}`);
    } else {
      console.log(`  PASS ${model}: "${d.choices?.[0]?.message?.content?.slice(0, 30)}"`);
    }
  } catch (e) {
    console.log(`  ERROR ${model}: ${e.message}`);
  }
}
