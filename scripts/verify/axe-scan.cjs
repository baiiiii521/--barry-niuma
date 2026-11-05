// Automated WCAG 2.1 A/AA scan (axe-core) over every tab, light + dark theme.
//   npm i -D axe-core playwright ; node scripts/verify/axe-scan.cjs [--max-critical 0]
// Baseline at v1.0.29: color-contrast 224 nodes, label 32, select-name 22, button-name 14, scrollable-region-focusable 4.
// axe cannot see: tiny touch targets, wrong <html lang>, endless animations, focus order -> check those by hand (UI-06/09/10).
const path = require('path');
const { withApp, goTab, closeBrowser } = require('./lib.cjs');

const axePath = process.env.AXE_PATH || require.resolve('axe-core/axe.min.js', { paths: [process.cwd()] });
const TABS = [['首页', 'home'], ['专注', 'focus'], ['日历', 'calendar'], ['签证', 'visa'], ['数据', 'data'], ['设定', 'settings']];

(async () => {
  const byRule = {};
  for (const light of [true, false]) {
    await withApp({ light, config: { monthlySalary: 18000 } }, async (p) => {
      await p.addScriptTag({ path: path.resolve(axePath) });
      for (const [label, name] of TABS) {
        if (name !== 'home') await goTab(p, label);
        const violations = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }))
          .violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })));
        for (const v of violations) {
          const r = (byRule[v.id] ||= { impact: v.impact, total: 0, views: {} });
          r.total += v.nodes; r.views[`${light ? 'light' : 'dark'}/${name}`] = v.nodes;
        }
      }
    });
  }
  await closeBrowser();
  const rows = Object.entries(byRule).sort((a, b) => b[1].total - a[1].total);
  if (!rows.length) console.log('No axe violations.');
  for (const [id, r] of rows) console.log(`${id.padEnd(30)} [${r.impact}] total=${r.total}  ${Object.entries(r.views).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  const i = process.argv.indexOf('--max-critical');
  const critical = rows.filter(([, r]) => r.impact === 'critical').reduce((n, [, r]) => n + r.total, 0);
  if (i > -1 && critical > Number(process.argv[i + 1])) { console.error(`\ncritical nodes ${critical} > allowed ${process.argv[i + 1]}`); process.exit(1); }
})();
