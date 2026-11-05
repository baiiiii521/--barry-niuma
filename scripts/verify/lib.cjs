// Shared helpers for the Playwright-based checks in this folder.
// Usage: npm run build && npx vite preview --port 4173   (then run any script here)
// Needs `playwright` resolvable from Node (globally preinstalled in Claude Code cloud sessions,
// otherwise: npm i -D playwright). Override the target with BASE_URL=http://localhost:3000.
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:4173';

// Freeze "now" at `iso` (time still advances from there). Works for new Date() and Date.now().
const frozenClock = (iso) => `(() => {
  const D = Date; const off = new D('${iso}').getTime() - D.now();
  globalThis.Date = class extends D {
    constructor(...a) { super(...(a.length ? a : [D.now() + off])); }
    static now() { return D.now() + off; }
  };
})();`;

let browserPromise;
const getBrowser = () => (browserPromise ||= chromium.launch());
const closeBrowser = async () => { if (browserPromise) { await (await browserPromise).close(); browserPromise = undefined; } };

/**
 * Open the app with a deterministic clock + pre-seeded localStorage, run `fn(page)`, clean up.
 * @param {object} o  now: ISO string | config: object merged into niuma_config | storage: extra localStorage keys
 *                    device: Playwright device name | light: boolean | demo: keep the first-run sample-data state
 */
async function withApp(o, fn) {
  const { now = '2026-11-04T15:20:00+08:00', config = {}, storage = {}, device = 'iPhone 13', light = true, demo = false, tz = 'Asia/Shanghai' } = o || {};
  const ctx = await (await getBrowser()).newContext({ ...devices[device], timezoneId: tz, locale: 'zh-CN' });
  await ctx.addInitScript(frozenClock(now));
  await ctx.addInitScript(([config, storage, light, demo, tz]) => {
    if (localStorage.getItem('__seeded')) return;      // seed once, so reloads keep user changes
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('niuma_config', JSON.stringify({ localTimezone: tz, ...config }));
    localStorage.setItem('isLightMode', String(light));
    if (!demo) localStorage.setItem('niuma_demo', '0');
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, [config, storage, light, demo, tz]);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  try { return await fn(page); } finally { await ctx.close(); }
}

const goTab = async (page, label) => { await page.locator(`button[aria-label="${label}"]`).click(); await page.waitForTimeout(600); };
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

module.exports = { BASE, devices, frozenClock, getBrowser, closeBrowser, withApp, goTab, num };
