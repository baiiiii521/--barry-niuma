// Measures main-thread cost of the per-second tick on a few tabs, optionally with CPU throttling.
//   node scripts/verify/perf-probe.cjs [--seconds 10] [--throttle 6] [--css "*{transition:none!important}"] [--clock 2026-11-04T15:20:00+08:00]
// The clock is frozen INSIDE work hours on purpose: outside work hours the progress UI stops moving and the
// numbers look ~10x better than what users actually experience.
// Baseline at v1.0.29, Home tab, 15:20 (work hours), layouts/s ~60-66:
//   1x CPU : task ~145 ms/s (~14% of the main thread)      6x CPU: task ~760-830 ms/s (~76-80%), 3-6 long tasks per 8 s
//   6x CPU with ALL transitions+animations disabled via --css : task ~440 ms/s, layouts/s ~2  (transitions alone: 506, animations alone: 768)
//   blur/box-shadow/filter off: no change (853) -> they are not the cost.  Calendar / Settings tabs: ~50-100 ms/s at 6x, 1 layout/s.
// Use --css for A/B bisecting, e.g. --css ".transition-all{transition:none!important}".
const { BASE, devices, frozenClock, getBrowser, closeBrowser } = require('./lib.cjs');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const argStr = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const seconds = arg('--seconds', 10), throttle = arg('--throttle', 1);
const css = argStr('--css', ''), clock = argStr('--clock', '2026-11-04T15:20:00+08:00');

(async () => {
  const ctx = await (await getBrowser()).newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Shanghai' });
  await ctx.addInitScript(frozenClock(clock));
  await ctx.addInitScript(() => { localStorage.setItem('niuma_config', JSON.stringify({ monthlySalary: 18000, localTimezone: 'Asia/Shanghai' })); localStorage.setItem('niuma_demo', '0'); });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await p.goto(BASE); await p.waitForTimeout(1500);
  if (css) await p.addStyleTag({ content: css });
  await p.waitForTimeout(1000);
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  console.log(`CPU throttle ${throttle}x, ${seconds}s per tab, clock ${clock}${css ? ', css: ' + css : ''}`);
  for (const tab of ['首页', '日历', '设定']) {
    await p.locator(`button[aria-label="${tab}"]`).click(); await p.waitForTimeout(800);
    await p.evaluate(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ entryTypes: ['longtask'] }); });
    const a = await metrics(); await p.waitForTimeout(seconds * 1000); const z = await metrics();
    const long = await p.evaluate(() => window.__long.length);
    const per = (k) => (((z[k] - a[k]) * 1000) / seconds).toFixed(1);
    console.log(`${tab}  script ${per('ScriptDuration')} ms/s  task ${per('TaskDuration')} ms/s  layouts/s ${((z.LayoutCount - a.LayoutCount) / seconds).toFixed(1)}  long tasks(>50ms) ${long}`);
  }
  await closeBrowser();
})();
