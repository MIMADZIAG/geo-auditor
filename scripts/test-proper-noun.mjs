// Quick test of the fixed isProperNounOrAcronym logic

function isProperNounOrAcronym(word) {
  if (!word) return false;
  if (/^[A-ZĄĆĘŁŃÓŚŹŻ]{2,}(-[A-ZĄĆĘŁŃÓŚŹŻ]+)*$/.test(word)) return true;
  if (word.length >= 3 && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word.slice(2))) return true;
  if (word.length >= 2 && /^[a-z]/.test(word) && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word.slice(1))) return true;
  return false;
}

const tests = [
  ['AI', true],
  ['SEO', true],
  ['GEO', true],
  ['FAQ', true],
  ['ChatGPT', true],
  ['WordPress', true],
  ['WooCommerce', true],
  ['iPhone', true],
  ['Search', false],
  ['Best', false],
  ['I', false],
  ['A', false],
  ['W', false],
  ['Szybki', false],
  ['Tani', false],
  ['Juliusza', false],
  ['Kossaka', false],
];

let pass = 0, fail = 0;
for (const [word, expected] of tests) {
  const got = isProperNounOrAcronym(word);
  const ok = got === expected;
  if (ok) {
    pass++;
  } else {
    console.log('FAIL:', word, 'expected:', expected, 'got:', got);
    fail++;
  }
}
console.log(pass + '/' + (pass+fail) + ' passed');
