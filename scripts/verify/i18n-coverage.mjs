// Checks that every literal t('中文') / tf('中文 {x}') key used in src/ exists in dict-en.json,
// and lists dictionary keys that no literal call references.
//   node scripts/verify/i18n-coverage.mjs        (exit 1 when keys are missing)
// Baseline at v1.0.29: 539 literal keys, 0 missing ("农历" is allow-listed: only used in the zh branch).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/dict-en.json'), 'utf8'));
const zhRe = /[一-龥]/;
const keys = new Set();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(root, 'src')).filter((f) => /\.tsx?$/.test(f))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\b(?:t|tf)\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/\b(?:t|tf)\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
}
const used = [...keys].filter((k) => zhRe.test(k));
// Keys that are intentionally absent from dict-en (only reached in the zh branch, e.g. src/App.tsx lunar date line).
const ALLOW_MISSING = new Set(['农历']);
const missing = used.filter((k) => !(k in en) && !ALLOW_MISSING.has(k));
const untranslated = Object.entries(en).filter(([k, v]) => zhRe.test(k) && v === k).map(([k]) => k);
const unused = Object.keys(en).filter((k) => !keys.has(k));
console.log(`literal keys: ${used.length} | missing in dict-en: ${missing.length} | untranslated (en === zh): ${untranslated.length} | dict keys with no literal call: ${unused.length} (some are dynamic t(variable))`);
missing.forEach((k) => console.log('  MISSING:', k));
untranslated.forEach((k) => console.log('  UNTRANSLATED:', k));
if (missing.length || untranslated.length) process.exit(1);
