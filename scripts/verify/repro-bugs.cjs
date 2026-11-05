// Reproduces the logic bugs listed in docs/OPTIMIZATION-GUIDE.md (BUG-01..05, BUG-09).
// Each check prints REPRODUCED (bug still present) or FIXED. `--strict` exits 1 if any is still reproduced.
//   node scripts/verify/repro-bugs.cjs [--strict] [--only BUG-01,BUG-02]
const { withApp, goTab, num, closeBrowser } = require('./lib.cjs');

const SALARY = 21000;                 // Nov 2026 has 21 workdays -> daily wage exactly 1000, easy to reason about
const unpaid = (d) => ({ [d]: [{ id: 'x', text: 'leave', type: 'unpaid_leave', completed: true }] });
const monthEarned = (p) => p.getByText('本月已赚（预估）').locator('xpath=following-sibling::span[1]').textContent();
const lifetime = (p) => p.getByText('历史累计已赚 (估算)').locator('xpath=following-sibling::span[1]').textContent();

const checks = {
  'BUG-01': {
    title: 'Unpaid leave TODAY is deducted twice (earned-this-month)',
    expected: '2000 (11/2 and 11/3 paid; today = leave, earns 0 and must not be deducted again)',
    run: () => withApp({ now: '2026-11-04T08:00:00+08:00', config: { monthlySalary: SALARY }, storage: { niuma_memos: unpaid('2026-11-04') } }, async (p) => num(await monthEarned(p))),
    ok: (v) => Math.abs(v - 2000) < 0.01,
  },
  'BUG-02': {
    title: 'Lifetime total deducts a past unpaid-leave day of THIS month twice',
    expected: 'adding one past unpaid day lowers the lifetime total by exactly 1000',
    run: async () => {
      const base = { now: '2026-11-04T08:00:00+08:00', config: { monthlySalary: SALARY } };
      const a = await withApp(base, async (p) => num(await lifetime(p)));
      const b = await withApp({ ...base, storage: { niuma_memos: unpaid('2026-11-03') } }, async (p) => num(await lifetime(p)));
      return a - b;
    },
    ok: (v) => Math.abs(v - 1000) < 0.01,
  },
  'BUG-03': {
    title: 'Slacking flag restored after reopening credits the whole offline gap',
    expected: '0 min credited for a 4h gap while the app was closed',
    run: () => {
      const now = new Date('2026-11-04T15:20:00+08:00').getTime();
      const state = { date: '11/4/2026', slackSecondsToday: 0, overtimeSecondsToday: 0, isSlacking: true, isOvertime: false, lastGlobalTick: now - 4 * 3600 * 1000 };
      return withApp({ config: { monthlySalary: SALARY }, storage: { niuma_runtime_state: state } },
        async (p) => num(await p.getByText('今日摸鱼', { exact: true }).locator('xpath=following-sibling::span[1]').textContent()));
    },
    ok: (v) => v === 0,
  },
  'BUG-04': {
    title: "Yesterday's completed pomodoros are shown as today's",
    expected: 'no "今日已集齐" line on a new day',
    run: () => withApp({ config: { monthlySalary: SALARY }, storage: { niuma_runtime_state: { date: '11/3/2026', completedPomodoros: 3, slackSecondsToday: 0, overtimeSecondsToday: 0, lastGlobalTick: Date.now() } } },
      async (p) => { await goTab(p, '专注'); return p.getByText('今日已集齐').count(); }),
    ok: (v) => v === 0,
  },
  'BUG-05': {
    title: 'Overnight shift (22:00-06:00) earns 0 even while working',
    expected: 'earned today > 0 at 23:30',
    run: () => withApp({ now: '2026-11-04T23:30:00+08:00', config: { monthlySalary: SALARY, startTime: '22:00', endTime: '06:00', hasLunchBreak: false } },
      // first AutoFitText on Home is the "today earned" number
      async (p) => num(await p.locator('span.inline-block.whitespace-nowrap').first().textContent())),
    ok: (v) => v > 0,
  },
  'BUG-09': {
    title: 'Payday 31 in a 30-day month points at the 1st of next month',
    expected: '26 days (Nov 4 -> Nov 30)',
    run: () => withApp({ config: { monthlySalary: SALARY, payday: 31 } },
      async (p) => num((await p.locator('text=/距离发工资还有/').first().textContent()).match(/还有\s*(\d+)/)[1])),
    ok: (v) => v === 26,
  },
};

(async () => {
  const strict = process.argv.includes('--strict');
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(',') : Object.keys(checks);
  let reproduced = 0;
  for (const id of only) {
    const c = checks[id]; if (!c) { console.log(`${id}: unknown check`); continue; }
    let value; try { value = await c.run(); } catch (e) { console.log(`${id}  ERROR   ${e.message.split('\n')[0]}`); reproduced++; continue; }
    const fixed = c.ok(value); if (!fixed) reproduced++;
    console.log(`${id}  ${fixed ? 'FIXED     ' : 'REPRODUCED'}  observed=${value}  expected: ${c.expected}  — ${c.title}`);
  }
  await closeBrowser();
  console.log(`\n${reproduced} of ${only.length} still reproduced`);
  if (strict && reproduced) process.exit(1);
})();
