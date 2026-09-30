import zh from './dict-zh.json';
import en from './dict-en.json';

const dicts: Record<string, Record<string, string>> = { zh, en };

let currentLang = 'zh';
try {
  const saved = localStorage.getItem('app_language');
  if (saved && dicts[saved]) currentLang = saved;
} catch (e) {}

export const setLanguage = (lang: string) => {
  if (dicts[lang] && lang !== currentLang) {
    currentLang = lang;
    try { localStorage.setItem('app_language', lang); } catch (e) {}
    window.location.reload();
  }
};

export const getLanguage = () => currentLang;

export const t = (key: string): string => {
  if (!key) return key;
  const dict = dicts[currentLang];
  if (dict && dict[key] !== undefined) return dict[key];
  return key;
};

// Translate a key and fill {placeholders}, e.g. tf('{n}号发薪', { n: 5 })
export const tf = (key: string, vars: Record<string, string | number> = {}): string =>
  t(key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));

// "5 天" / "5 days"; pass spaced=false for the compact zh form "5天"
export const tDays = (n: number, spaced = true): string =>
  currentLang === 'zh' ? `${n}${spaced ? ' ' : ''}天` : `${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

// Unit only, for layouts where the number is styled separately
export const dayUnit = (n: number): string =>
  currentLang === 'zh' ? '天' : Math.abs(n) === 1 ? ' day' : ' days';

// Map a stored value (Chinese key, or its English/any-language text) back to the Chinese key
// among `candidates`. Returns the value unchanged when it matches none (e.g. user-typed text).
export const toKey = (value: string, candidates: string[]): string => {
  if (!value) return value;
  for (const k of candidates) {
    if (value === k) return k;
    for (const d of Object.values(dicts)) if (d[k] === value) return k;
  }
  return value;
};
