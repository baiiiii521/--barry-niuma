# TimeMeter（牛马时钟）优化与演进指南 · Agent 操作手册

> **English TL;DR for agents** — This is the single source of truth for fixing, refactoring and extending TimeMeter.
> Every work item has a stable ID (`BUG-xx`, `UI-xx`, `ARCH-xx`, `UX-xx`, `FEAT-xx`, `MP-xx`, `ENG-xx`, `TEL-xx`), a code anchor, the root cause, a concrete fix and an acceptance check.
> Claims are tagged **✅实测** (reproduced/measured in a real browser) or **🔍推导** (derived from reading code, not run). Verification scripts live in `scripts/verify/`.
> Take one ID at a time, write the test first, bump the patch version in `package.json` (see `AGENTS.md`), tick the box in §3.

| 项 | 值 |
|---|---|
| 基线 | 分支 `claude/great-euler-zz4fix`，应用版本 **v1.0.29**（本文档随 v1.0.30 提交，`src/` 未改动） |
| 行号约定 | 文中 `App.tsx:1234` 指基线行号，会随改动漂移 → **以「符号/锚点字符串」为准**，用 `grep -n` 定位 |
| 线上 | `main` 部署在 Vercel 项目 `barry`（`barry-tawny.vercel.app`）；`main` 目前 **不含** v1.0.29 的新手引导/币种/自适应金额，该分支尚未合并 |
| 目标用户 | 中国/越南/泰国的打工人；网页 + 微信小程序（小程序为独立代码库，见 §9） |
| 不含 | 工期/排期。本文只定义「做什么、怎么做、怎么验收、依赖谁」 |

## 目录
0. [Agent 工作规则](#0-agent-工作规则)
1. [项目地图](#1-项目地图)
2. [基线度量（实测）](#2-基线度量实测)
3. [任务总表](#3-任务总表)
4. [BUG：计算正确性](#4-bug计算正确性)
5. [UI：样式、无障碍、性能](#5-ui样式无障碍性能)
6. [ARCH：架构](#6-arch架构)
7. [UX：交互与信息架构](#7-ux交互与信息架构)
8. [FEAT：功能路线](#8-feat功能路线)
9. [MP：小程序同步与合规](#9-mp小程序同步与合规)
10. [ENG：工程与清理](#10-eng工程与清理)
11. [TEL：埋点与指标](#11-tel埋点与指标)
12. [技巧库 T-01…T-22](#12-技巧库)
13. [验证与发布清单](#13-验证与发布清单)
14. [待人类决策](#14-待人类决策)
15. [附录](#15-附录)

---

## 0. Agent 工作规则

1. **先读 `AGENTS.md`**：每次改动代码库，`package.json` 的 patch 版本必须 +1（文档变更也算）。
2. **一次只做一个任务 ID**。提交信息格式：`fix(BUG-01): 无薪假当天不再重复扣款`；多语言/样式类用 `feat(UI-03)` 等。
3. **计薪、日期、账本逻辑：测试先行**。没有测试框架时先做 ARCH-01；在此之前至少用 `scripts/verify/repro-bugs.cjs` 证明「修复前复现、修复后通过」。
4. **文案走 `t()`**：中文原文即 key（`t('中文')`、带变量用 `tf('{n}号发薪', {n})`），同步改 `src/dict-zh.json` 与 `src/dict-en.json`；改完跑 `node scripts/verify/i18n-coverage.mjs`。
5. **不要改 localStorage 的 key 名或结构**而不写迁移（key 清单见 §1.3）。老用户的数据不能丢。
6. **不要碰「刻意如此」清单**（§1.5）。
7. **UI 改动必须浅色 + 深色各看一遍**，宽度至少 375px；用固定时钟截图（T-01）保证可对比。
8. 完成后：在 §3 把 `[ ]` 改成 `[x]`，并在该条后追加一行 `完成记录：commit、日期、验证命令输出摘要`。
9. 遇到 §14 的事项**不要自行决定**，向用户确认。
10. 不要提交密钥或个人信息（`.env*` 已被忽略）；文档与代码注释里不要写入雇主/客户等私人业务信息。

---

## 1. 项目地图

### 1.1 技术栈与命令
React 19 · TypeScript 5.8（未开 strict）· Vite 6 · Tailwind CSS **v4**（`@tailwindcss/vite`）· motion（framer-motion 继任者）· lucide-react · html2canvas · lunar-javascript · 无后端、无账号，数据只在 `localStorage`。

```bash
npm ci                                   # 安装
npm run dev                              # http://localhost:3000
npm run lint                             # = tsc --noEmit（目前干净）
npm run build && npx vite preview --port 4173   # 验证脚本默认打这个地址
node scripts/verify/repro-bugs.cjs       # BUG 复现（修复后应全部 FIXED）
node scripts/verify/axe-scan.cjs         # WCAG 自动扫描（需 axe-core）
node scripts/verify/perf-probe.cjs --throttle 6   # 主线程开销
node scripts/verify/i18n-coverage.mjs    # 翻译覆盖
```

### 1.2 文件与符号地图（基线行号）
| 位置 | 内容 |
|---|---|
| `src/App.tsx`（3570 行） | **几乎全部逻辑与界面**，下表展开 |
| `src/VisaTab.tsx`（537） | 签证页，自成一套样式；`parseLocal()` 是正确的本地日期解析，可复用 |
| `src/holidays.ts`（198） | 中/港/越/泰节假日与调休，**仅 2026–2027**，`t()` 在模块加载时求值 |
| `src/i18n.ts`（50） | `t / tf / tDays / dayUnit / toKey / setLanguage`（切换语言会 `location.reload()`） |
| `src/lib/NoiseSynth.ts`（432） | Web Audio 实时合成白噪音（9 种） |
| `src/index.css`（104） | 颜色变量 + 手写 `.bg-card` 等工具类（**问题根源，见 UI-01/UI-02**） |
| `scripts/translate/*` | 一次性中→英抽取/翻译脚本（`ts-morph`、Gemini），无 npm 脚本入口 |
| `scripts/verify/*` | 本文档配套验证脚本 |

`src/App.tsx` 内部：

| 符号 / 锚点 | 行 | 说明 |
|---|---|---|
| `playAlertSound` | 12 | 每次新建 `AudioContext` 且不关闭（ENG-05） |
| `formatMoney` / `formatMoneyFit` | 94 / 100 | 金额格式化；`Fit` 过长时切换为「亿/万、B/M」 |
| `DEFAULT_CURRENCIES` / `AutoFitText` | 112 / 120 | v1.0.29 新增：币种表、自适应字号 |
| `getWorkDaysInMonth` | 178 | 当月工作日数（含调休/节假日） |
| `FORTUNES` | 205 | 运势文案（MP-03 合规关注） |
| `NiumaAvatar` / `FOCUS_CONTAINERS` | 239 / 319 | 头像状态、番茄钟容器 |
| `MemoModal` / `CalendarGrid` / `FocusVisualizer` | 401 / 518 / 618 | 备忘弹窗、日历格、10 种专注动画 |
| `export default function App` | 865 | **主组件（~2700 行）** |
| `const [config, setConfig]` | 892 | 设置（同时塞了报销、币种） |
| `const [isDemoData` | 946 | 新手引导标志（v1.0.29） |
| `runtimeState` / 番茄钟 state | 963 / 999–1083 | 运行态恢复（10 秒防抖保存） |
| `const localTime = useMemo` | 1113 | **时区转换：toLocaleString 再 new Date（UTC 以西时区有坑，BUG-12）** |
| `toggleLeaveType` | 1170 | 请假（存进备忘 `niuma_memos`） |
| `slackSecondsToday` / `runtimeSaveTimerRef` | 1256 / 1273 | 摸鱼/加班累计、运行态保存 |
| `derivedHoursPerDay` → `hourlyRate` | 1315 → 1324 | 秒薪公式 |
| `let autoWorkSecs` | 1359 | 今日工时（**不支持跨零点班次**，BUG-05） |
| Worker ticker / `handleTick` | 1388 / 1404 | 每秒 `setNow`，驱动一切（刻意如此，见 §1.5） |
| `currencyList` / `renderCurrencySelect` | 1479 / 1490 | 显示币种 |
| `totalUnpaidLeaves` | 1505 | 无薪假统计（BUG-01/02 的根源） |
| `totalEarnedBeforeToday` / `earnedThisMonth` / `earnedThisYear` | 1534 / 1564 / 1575 | 累计口径 |
| `effectiveWorkThisWeek` … `bestDayStr` | 1593–1602 | **算了但没被用**（死代码，BUG-14） |
| `paydayObj` / `daysToNextRestDay` / `retireDateObj` | 1607 / 1613 / 1636 | 倒计时 |
| `activeTab === 'home' &&` | 1659 | 首页（约 560 行） |
| `'data'` / `'profile'` / `'pomodoro'` / `'calendar'` / `'visa'` | 2219 / 2455 / 2904 / 3042 / 3187 | 其余页面 |
| `showOnboarding &&`、`showCurrencyEditor &&` | 3287 / 3308 | 弹窗（v1.0.29） |
| `Off-screen Share Layout` | 3369 | 分享图离屏布局（**固定 ¥ 与深色**，BUG-08） |
| `ConversionCard` / `CountdownCard` / `NavItem` | 3501 / 3524 / 3547 | 小组件 |

### 1.3 持久化数据（localStorage）
| key | 内容 | 备注 |
|---|---|---|
| `niuma_config` | 设置：薪资、作息、地区、时区、倒计时、`currencies`、`displayCurrency`，**还混着 `reimbursements`** | BUG-06 根源 |
| `niuma_profiles` | `[{name, config}]` 配置方案快照 | 载入会整体覆盖 config |
| `niuma_memos` | `{ 'YYYY-MM-DD': [{id,text,completed,type?}] }`，**请假以 `type: 'paid_leave'` 或 `'unpaid_leave'` 存在这里** | 请假与备忘混存 |
| `niuma_runtime_state` | `{date, slackSecondsToday, overtimeSecondsToday, isSlacking, isOvertime, pomodoro*, completedPomodoros, lastGlobalTick}` | 10 秒防抖；`date` 是 `en-US` 本地日期串，如 `11/4/2026` |
| `niuma_fortune` | `{date, fortune}` | 每日一签 |
| `niuma_demo` | `'1'` = 仍是示例数据 | 语义见 §1.5 |
| `isLightMode` | `'true'/'false'`，默认浅色 | |
| `app_language` | `zh` / `en` | |
| `pomodoroContainer` / `activeBgms` | 专注容器 / 白噪音列表 | |
| `exportRates` | `{USD_TO_CNY, THB_TO_CNY, VND_TO_CNY}` | **与 `config.currencies` 是两套汇率（BUG-10）** |
| `my_visas` / `my_travel_records` | 签证页数据 | 国家/类型/口岸存中文 key（见 §1.5） |

### 1.4 计算依赖图
```
config.monthlySalary ─┐
region + restDays ────┼─> currentMonthWorkDays (getWorkDaysInMonth)
start/end/lunch ──────┴─> derivedHoursPerDay
hourlyRate = salary / (currentMonthWorkDays × derivedHoursPerDay) ; secondRate = hourlyRate / 3600

nowSecs + start/end/lunch + isRestDay ─> workSecondsToday ─> earnedToday = workSecondsToday × secondRate
earnedThisMonth = pastWorkDays × (salary/workDays) + earnedToday − unpaidLeavesThisMonth × dailyDeduction   ← BUG-01
lifetime        = totalEarnedBeforeToday + earnedThisMonth
totalEarnedBeforeToday = monthsPaid × salary − totalUnpaidLeaves × dailyDeduction                          ← BUG-02
显示金额 = 人民币金额 ÷ activeCurrency.rate（金额一律先按 CNY 算，最后换算）
```

### 1.5 「刻意如此」清单（不要改，除非任务明确要求）
- **Worker 计时器**（`App.tsx:1388`）：用 Blob Worker 的 `setInterval` 驱动，避免后台标签被节流；`visibilitychange` 时补一次 tick。扩展它，不要替换成主线程 `setInterval`。
- **中文即 i18n key**，且签证页把中文 key 当存储值（`toKey()` 做历史兼容）。语言切换是整页 reload，所以模块顶层的 `t()` 是安全的。
- **`niuma_demo` 语义**：首次访问且尚无 `niuma_config` 时写入 `'1'`，用户点「保存，开始计算」后删除；老用户（已有 config）永不出现引导。
- **`AutoFitText` 先按最大字号测量再缩小**：这样能正确处理「亿/万」等 CJK 宽字符（CSS-only 方案对此有坑，见 T-07）。
- **`formatMoneyFit` 的阈值**（今日 12、双币 11、本月 10、累计 14 个字符）是配合卡片宽度调出来的。
- 首页 `border-app` 等工具类**当前**写死了 `border-width`，修 UI-02 时必须同批处理所有用法，不能只改一处。

---

## 2. 基线度量（实测）

测试环境：Chromium（Playwright 1.63）· iPhone 13 视口 · 固定时钟 2026-11-04 15:20（工作时段）· 浅/深色各一遍。复现命令见 §13。

| 维度 | 结果 |
|---|---|
| **包体积** | `index-*.js` 1,052 KB（gzip 309 KB）· CSS 72 KB（gzip 11 KB）· **单个 chunk**；`date-holidays`、`express`、`dotenv`、`autoprefixer` 已安装但未使用 |
| **首页主线程开销（工作时段）** ✅ | 1× CPU：任务 **~145 ms/s（≈14%）**，每秒 **60–66 次 layout**；6× CPU（低端机）：**~760–830 ms/s（≈80%）**，每 8 秒 3–6 个 >50ms 长任务。日历/设置页：6× 时约 50–100 ms/s，每秒 1 次 layout |
| ↳ 归因（6×，首页） ✅ | 全部 `transition`+`animation` 关闭 → **438 ms/s，layout 降到 2/s**（−47%）；只关 transition → 506；只关 animation → 768；关模糊/阴影/滤镜 → 853（**无变化，不是成本来源**）。主要站点见 UI-13 |
| ↳ 注意 | 下班时段首页几乎不动（只有 ~13 ms/s）。**测性能必须把时钟固定在工作时段**，否则数字会好看 10 倍（`perf-probe.cjs` 已默认 15:20） |
| **每秒整页重渲染** ✅ | 脚本时间仅 ~4–11 ms/s（1×）、~30–80 ms/s（6×）。结论：它**不是首要瓶颈**；价值在于「先拆出纯函数再测试」，而不是为了省电。真正该先动的是 UI-13（布局抖动） |
| **翻译** ✅ | 539 个字面量 key，缺失 0（`农历` 仅在 zh 分支使用，已加白名单）；英文无「与中文相同」的漏译；23 行中文未走 `t()`，均为签证页存储 key 常量与生肖映射（预期内） |
| **axe-core 4.10.2（WCAG 2.1 A/AA，6 页 × 2 主题）** ✅ | `color-contrast` 224 节点（serious）· `label` 32（critical，设置页每主题 15）· `select-name` 22（critical）· `button-name` 14（critical）· `scrollable-region-focusable` 4（serious）。其余规则 0。axe **看不到**：触控目标过小、`<html lang>` 与界面语言不符、无限动画、焦点顺序 |
| **令牌对比度** ✅ | 浅色：辅助文字 `#9ca3af` 对白 **2.54:1**、对 `#f3f4f6` **2.31:1**；品牌绿 `#059669` 对白 3.77:1；橙 `#f97316` 2.80:1；黄 `#eab308` 1.92:1。深色：辅助文字 `#6b7280` 对 `#141414` 3.81:1。目标 ≥ 4.5:1 |
| **颜色透明度失效** ✅ | 源码中 97 处 `bg-brand/10`、`text-secondary/60` 等写法在 Tailwind v4 下**不生成 CSS**（产物里 0 条）；修复后全部生效，CSS gzip 仅 +1.4 KB（见 UI-01，含前后对比图） |
| **`border-app` 全方框** ✅ | `.border-app` 自带 `border-width:1px`，`border-t border-app` 实际画出四边框（隐私卡、数据页统计区、专注收入框等出现黑/白方框） |

配图（`docs/assets/review/`）：`tokens-before-after-light.jpg` / `-dark.jpg`（UI-01/02 前后对比：左=现状，右=修复）、`tabs-baseline-light.jpg`、`home-baseline-light.jpg`。

> 订正说明：早期口头评审曾把「每秒整页重渲染」说成首要耗电原因，并把触控目标标为 WCAG 2.1 AA。实测后：性能主因是 UI-13；触控目标在 WCAG 2.1 属 **AAA（2.5.5）**，WCAG 2.2 AA 的要求是 ≥24×24px（2.5.8）。本项目内部取 **44×44px** 作为标准（iOS HIG），属于更严格的自定标准。

---

## 3. 任务总表

优先级只表示**先后顺序**：P0 = 数据错/界面坏，先做；P1 = 影响体验或为后续铺路；P2 = 打磨；P3 = 增长/商业化。`依赖` 列为必须先完成的任务。

### 正确性
| ✔ | ID | 标题 | 级 | 依赖 | 验证 |
|---|---|---|---|---|---|
| [ ] | BUG-01 | 无薪假当天多扣一天 | P0 | — | ✅实测 |
| [ ] | BUG-02 | 历史累计重复扣本月无薪假 | P0 | — | ✅实测 |
| [ ] | BUG-03 | 摸鱼/加班不自动停；重开页面补算整段离线时间 | P0 | — | ✅实测 |
| [ ] | BUG-04 | 番茄钟完成数不按天清零 | P1 | — | ✅实测 |
| [ ] | BUG-05 | 跨零点班次（夜班）收入恒为 0 | P1 | — | ✅实测 |
| [ ] | BUG-06 | 载入配置方案会覆盖报销记录 | P1 | — | 🔍推导 |
| [ ] | BUG-07 | 月度「摸鱼/加班」是今天数据 × 系数的估算 | P1 | ARCH-03 | 🔍推导 |
| [ ] | BUG-08 | 分享卡标题写错且固定 ¥/深色 | P1 | — | 🔍推导 |
| [ ] | BUG-09 | 发薪日无校验，遇小月跳到下月 1 号 | P1 | — | ✅实测 |
| [ ] | BUG-10 | 两套汇率表（报销 7.2 vs 显示 6.8） | P1 | — | 🔍推导 |
| [ ] | BUG-11 | 深色模式进度条轨道是浅灰（`dark:` 变体与 class 主题不匹配） | P0 | — | ✅实测（截图） |
| [ ] | BUG-12 | UTC 以西时区：日期串按 UTC 解析，星期/月差错位 | P2 | ARCH-02 | 🔍推导 |
| [ ] | BUG-13 | `daysToCustom` / `customEventDate` / `native-calendar` 死代码 | P2 | — | ✅ 确认无引用 |
| [ ] | BUG-14 | 本周统计变量算了不用 | P2 | — | ✅ 确认无引用 |
| [ ] | BUG-15 | 「全国牛马击败率」是虚构公式 | P1 | — | ✅ 读码确认 |

### 样式 / 无障碍 / 性能
| ✔ | ID | 标题 | 级 | 依赖 |
|---|---|---|---|---|
| [ ] | UI-01 | 颜色令牌接入 Tailwind v4（`@theme inline`），让 97 处透明度写法生效 | P0 | — |
| [ ] | UI-02 | `border-app` 去掉 `border-width`，修分隔线变方框 | P0 | UI-01 |
| [ ] | UI-03 | 对比度令牌调整（浅/深色辅助字、品牌绿、橙、黄） | P0 | UI-01 |
| [ ] | UI-04 | 键盘焦点统一用 `:focus-visible`，去掉点击后的粗黑/白环 | P0 | UI-01 |
| [ ] | UI-05 | 图标按钮/下拉/输入框的可读名称（`button-name`、`select-name`、`label`） | P0 | — |
| [ ] | UI-06 | 触控目标 ≥44px（视觉不变，外扩点击区） | P1 | — |
| [ ] | UI-07 | 字号下限（正文 ≥12px，标签 ≥11px），清理 96 处 8–10px | P1 | UI-03 |
| [ ] | UI-08 | 公共弹窗组件（焦点陷阱、Esc、滚动锁定） | P1 | — |
| [ ] | UI-09 | `<html lang>` 与 `<title>` 跟随语言 | P1 | — |
| [ ] | UI-10 | 尊重「减少动态效果」 | P1 | — |
| [ ] | UI-11 | 签证页接入全局令牌（去掉写死白底/蓝头/另一种绿） | P1 | UI-01 |
| [ ] | UI-12 | 币种/语言一致性（番茄钟收入、分享卡、报销汇总、「Shanghai」英文残留） | P1 | BUG-10 |
| [ ] | UI-13 | **首页布局抖动**：width/left 过渡与无限动画 → transform / 暂停 | P0 | — |
| [ ] | UI-14 | 横向滚动条带可聚焦（`scrollable-region-focusable`） | P2 | — |
| [ ] | UI-15 | 日历格改为 `button` + 完整读屏描述 | P1 | — |
| [ ] | UI-16 | 表单即时校验与错误说明 | P1 | — |

### 架构
| ✔ | ID | 标题 | 级 | 依赖 |
|---|---|---|---|---|
| [ ] | ARCH-01 | 测试基座（Vitest）+ CI | P0 | — |
| [ ] | ARCH-02 | 抽出 `core/`（time / workday / salary / currency），纯函数、以 `now` 为参数 | P0 | ARCH-01 |
| [ ] | ARCH-03 | 数据模型 v2：settings / ledger / records 分离，带版本号、迁移、导出/导入 | P1 | ARCH-02 |
| [ ] | ARCH-04 | 时钟与渲染边界：`useNow`、按日期缓存月度统计、农历按天算 | P1 | ARCH-02 |
| [ ] | ARCH-05 | 拆分 `features/` 与 `ui/` 组件 | P1 | ARCH-04 |
| [ ] | ARCH-06 | 懒加载与分包 | P2 | ARCH-05 |
| [ ] | ARCH-07 | 节假日数据外置 JSON + 校验脚本 | P1 | ARCH-02 |
| [ ] | ARCH-08 | TypeScript 渐进开启 strict | P2 | ARCH-05 |
| [ ] | ARCH-09 | i18n 稳定 key 与覆盖测试 | P2 | ARCH-01 |

### 交互
| ✔ | ID | 标题 | 级 | 依赖 |
|---|---|---|---|---|
| [ ] | UX-01 | 首页信息架构重排：金额做主视觉 | P1 | UI-13 |
| [ ] | UX-02 | 「工作/摸鱼/加班/休息」四选一状态机 | P1 | BUG-03 |
| [ ] | UX-03 | 设置页分组 + 校验；提醒功能移到专注页 | P1 | UI-16 |
| [ ] | UX-04 | 底部导航收成 5 个，签证并入「我的」 | P2 | — |
| [ ] | UX-05 | 删除/归零可撤销（Undo toast） | P1 | — |
| [ ] | UX-06 | 日历点日期 → 底部面板（备忘 + 请假 + 当日收入） | P1 | UI-08 |
| [ ] | UX-07 | 番茄钟休息循环、容器与时长解耦 | P2 | — |
| [ ] | UX-08 | 金额翻牌动效（替代每秒重挂载） | P2 | UI-13 |
| [ ] | UX-09 | 首次使用清单（引导进度） | P2 | — |
| [ ] | UX-10 | 进度图标上的「!」红点是假警报，去掉或赋予含义 | P2 | — |

### 功能
| ✔ | ID | 标题 | 级 | 依赖 |
|---|---|---|---|---|
| [ ] | FEAT-01 | 每日账本 + 周报/月报 | P1 | ARCH-03 |
| [ ] | FEAT-02 | 下班总结卡 + 连续打卡 | P2 | FEAT-01 |
| [ ] | FEAT-03 | 牛马年报 | P3 | FEAT-01 |
| [ ] | FEAT-04 | 分享卡升级（跟随币种/主题、小程序码） | P2 | BUG-08 |
| [ ] | FEAT-05 | 税前→税后计算器（CN/VN/TH） | P2 | ARCH-02 |
| [ ] | FEAT-06 | 计薪口径可选（当月实际工作日 / 21.75 天） | P2 | ARCH-02 |
| [ ] | FEAT-07 | 加班费倍数（150/200/300%） | P2 | ARCH-02 |
| [ ] | FEAT-08 | 排班：大小周、轮班、夜班 | P2 | BUG-05 |
| [ ] | FEAT-09 | 工资币种可选（越南盾/泰铢直接录入） | P2 | ARCH-03 |
| [ ] | FEAT-10 | 签证规则化 + 到期提醒 + 多签证 | P2 | ARCH-03 |
| [ ] | FEAT-11 | 皮肤系统（VHS / CRT / 胶片 / 梦核） | P3 | UI-01 |
| [ ] | FEAT-12 | 购买力换算接 CPS | P3 | TEL-01 |
| [ ] | FEAT-13 | 激励视频广告 | P3 | MP-03 |
| [ ] | FEAT-14 | 企业日历码（HR 配置、员工扫码导入） | P3 | ARCH-07 |
| [ ] | FEAT-15 | Offer 对比 / 跳槽收益计算器 | P3 | FEAT-05 |
| [ ] | FEAT-16 | 小程序订阅消息提醒 | P2 | MP-02 |

### 小程序 / 工程 / 埋点
| ✔ | ID | 标题 | 级 | 依赖 |
|---|---|---|---|---|
| [ ] | MP-01 | 与网页共用 `core/` 的策略 | P1 | ARCH-02 |
| [ ] | MP-02 | 平台适配层（存储/计时/通知/分享/音频/时区） | P1 | MP-01 |
| [ ] | MP-03 | 审核与合规检查 | P1 | — |
| [ ] | MP-04 | 数据备份（导出码 / 云开发） | P2 | ARCH-03 |
| [ ] | MP-05 | 移植提示词模板 | P2 | — |
| [ ] | ENG-01 | 清理依赖与 AI Studio 模板残留 | P1 | — |
| [ ] | ENG-02 | 外部资源本地化（Google Fonts、纹理图） | P1 | — |
| [ ] | ENG-03 | GitHub Actions：lint + 测试 + 构建 | P1 | ARCH-01 |
| [ ] | ENG-04 | 翻译脚本补 npm 入口与说明 | P2 | — |
| [ ] | ENG-05 | 复用单个 `AudioContext` | P2 | — |
| [ ] | ENG-06 | Vercel 分支预览与发布约定 | P2 | — |
| [ ] | TEL-01 | 匿名埋点（事件表、分桶、开关） | P2 | — |

---

## 4. BUG：计算正确性

> 所有 BUG 的复现与验收：`node scripts/verify/repro-bugs.cjs`（覆盖 01–05、09）。数字约定：月薪 21,000 时 2026 年 11 月有 21 个工作日，日薪恰为 1,000。

### BUG-01 · 无薪假当天多扣一天 ✅实测
- **锚点**：`totalUnpaidLeaves` 循环（`keyVal <= todayVal`，含今天）与 `earnedThisMonth = … − unpaidLeavesThisMonth * dailyDeduction`。
- **现象**：11/4 08:00 标记当天无薪假，「本月已赚」显示 ¥1,000，应为 ¥2,000（11/2、11/3 已出勤）。
- **根因**：已过去的工作日按整天计入 `pastWorkDays`，所以**过去的**无薪假要扣；但今天不在 `pastWorkDays` 里，今天的收入本来就是 0（`isRestDay`），再扣一天就重复了。另外休息日/节假日上的无薪假标记也会被扣。
- **修法**：只扣「严格早于今天」且「当天在日历上是工作日」的无薪假。
  ```ts
  // core/salary.ts
  export function unpaidLeaveWorkdaysBefore(todayKey: string, monthStartKey: string, leaves: Set<string>, isBaseWorkday: (k: string) => boolean) {
    let n = 0;
    for (const k of leaves) if (k >= monthStartKey && k < todayKey && isBaseWorkday(k)) n++;   // 字符串字典序 == 日期先后
    return n;
  }
  // earnedThisMonth = (elapsedBaseWorkdays − unpaidLeaveWorkdaysBefore) × daily + earnedToday
  ```
  其中 `elapsedBaseWorkdays` 与 `daily = salary / baseWorkdaysInMonth` 一律**忽略请假**（请假只作为扣减项，不改变分母）。
- **验收**：`repro-bugs.cjs` 的 BUG-01 = FIXED；并加单测 `监测：11/3 无薪假 → 1000；11/4 无薪假 → 2000；11/2 周日无薪假 → 2000（休息日不扣）`。

### BUG-02 · 历史累计重复扣本月无薪假 ✅实测
- **锚点**：`totalEarnedBeforeToday = monthsPaid * salary − totalUnpaidLeaves * dailyDeduction`，随后显示 `totalEarnedBeforeToday + earnedThisMonth`。
- **现象**：本月 11/3 加一天无薪假，历史累计下降 **2000**（应为 1000）。
- **根因**：`totalUnpaidLeaves` 含本月，`earnedThisMonth` 又扣一次。另外 `dailyDeduction` 用「当月」工作日数折算所有历史月份。
- **修法**：历史部分只扣**早于本月 1 日**的无薪假，且**按该假期所在月份**的工作日数折算：`salary / baseWorkdaysInMonth(leaveMonth)`。
- **验收**：repro 的 BUG-02 = FIXED（降幅 = 1000）。单测：跨月无薪假各自按所在月折算。

### BUG-03 · 摸鱼/加班不自动停；重开页面补算整段离线 ✅实测
- **锚点**：`handleTick` 中 `if (isSlackingRef.current) setSlackSecondsToday(prev => prev + deltaSecs)`；`slackSecondsToday` 的 `useState` 初始化里 `base += timeSinceLastTick`。
- **现象**：保存状态为「摸鱼中」，4 小时后同一天重开，立刻显示 240 分钟；下班后/午休时忘关也一直累计。
- **根因**：用「增量累加」代替「时间区间」；初始化时把整个离线间隔都算进去。
- **修法**：采用 **T-03 区间账本**：记录 `[start, end|null]` 区间，读取时按「工作时段 − 午休」裁剪；运行中每 10 秒写一次 `lastSeen`，重开时若有未闭合区间且 `now − lastSeen > 阈值（建议 2 分钟）`，在 `lastSeen` 处关闭。短暂后台（≤阈值）视为连续。
- **验收**：repro 的 BUG-03 = FIXED（离线 4h → 0 分钟）。新增单测：区间跨午休被切掉、跨午夜按天拆分。
- **注意**：加班（`isOvertime`）本来发生在工作时段之外，裁剪窗口不同——加班区间只受「单次上限（如 12h）+ 午夜拆分」约束。

### BUG-04 · 番茄钟完成数不按天清零 ✅实测
- **锚点**：`const [completedPomodoros…] = useState(() => runtimeState?.completedPomodoros ?? 0)`（没有 `isSameDay` 判断）。
- **修法**：与 `slackSecondsToday` 一样先判 `isSameDay`；长期方案是把完成数写进账本 `ledger[dateKey].pomodoros`（T-04：用 `endAt` 记录，关页面期间到点的番茄也记在**到点那天**）。
- **验收**：repro 的 BUG-04 = FIXED。

### BUG-05 · 跨零点班次收入恒为 0 ✅实测
- **锚点**：`derivedHoursPerDay`（已支持 `+24h`）与 `autoWorkSecs`（`Math.min(nowSecs, endSecs) − startSecs`，当 `end < start` 为负 → `Math.max(0)`）。
- **现象**：22:00–06:00，23:30 显示「已经下班」「¥0.00」。
- **修法**：用 **T-02 班次相对时间**：把一个班次看成长度 `len`、休息段为相对偏移的区间；`workedSeconds(elapsed, len, breaks)`；当前时刻属于「开始日」的班次实例，凌晨 00:00–06:00 归属前一天。
  ```ts
  export function workedSeconds(elapsed: number, len: number, breaks: [number, number][]) {
    const e = Math.min(Math.max(elapsed, 0), len);
    return e - breaks.reduce((s, [a, b]) => s + Math.max(0, Math.min(e, b) - a), 0);
  }
  // 09:00–18:00、午休 12–13 → len=32400, breaks=[[10800,14400]]；15:20 → elapsed=22800 → 19200s（5h20m）✓
  ```
- **验收**：repro 的 BUG-05 = FIXED；单测覆盖：白班、夜班、含午休、班前、班后。

### BUG-06 · 载入配置方案会覆盖报销记录 🔍推导
- **锚点**：`setConfig(p.config)`（`载入` 按钮）；报销存于 `config.reimbursements`。
- **修法**：ARCH-03 把报销拆到 `records`；在此之前，载入时保留当前的 `reimbursements`：`setConfig({ ...p.config, reimbursements: config.reimbursements })`，并保留 `currencies/displayCurrency` 中方案里没有的字段。
- **验收**：单测：载入旧方案后报销条数不变。

### BUG-07 · 月度摸鱼/加班是估算 🔍推导
- **锚点**：`本月摸鱼总收益` → `slackLoss * (localTime.getDate() * 0.7)`；`本月义务加班送钱` 用 `0.8`；日历页 `calSlack/calOvertime` 同；`effectiveWorkThisWeek` 用 `0.85/0.15`。
- **现象**：今天摸鱼 30 分钟（¥54），「本月摸鱼」显示 ¥152.50。
- **修法**：依赖 ARCH-03 的账本；账本落地前，把这几项标注为「估算」或隐藏，不要当事实展示。月度 = 账本里该月所有天的区间秒数之和 × 当日秒薪。
- **验收**：构造 3 天账本，月度合计等于逐日之和。

### BUG-08 · 分享卡标题写错、固定 ¥ 与深色 🔍推导
- **锚点**：`Off-screen Share Layout`，`今日摸鱼收入` 实际显示 `earnedToday`；`¥` 写死。
- **修法**：标题改 `今日已赚`（新增 key）；金额走 `sym/ex` 与 `formatMoneyFit`；主题跟随当前主题/皮肤；见 FEAT-04。

### BUG-09 · 发薪日无校验，遇小月跳到下月 1 号 ✅实测
- **锚点**：`paydayObj = new Date(y, m, config.payday)`；设置页 `payday` 输入无范围。
- **现象**：发薪日 31，11/4 显示「还有 27 天」，应为 26（11/30）。
- **修法**：输入限制 1–31；取 `min(payday, 当月天数)`；若今天已过当月发薪日，则取下月的 `min(payday, 下月天数)`。用 T-09 的 key 运算，不用 `Date` 的月份溢出行为。
- **验收**：repro 的 BUG-09 = FIXED；单测覆盖 31/30/29/28（闰年 2 月）。

### BUG-10 · 两套汇率表 🔍推导
- **锚点**：`exportRates`（USD 7.2）与 `DEFAULT_CURRENCIES`（USD 6.8）。
- **修法**：合并成一张 `RateTable`（T-10 / ARCH-02 的 `currency.ts`），报销汇总与显示币种共用；`exportRates` 迁移进新表后删除。

### BUG-11 · 深色模式进度条轨道是浅灰 ✅实测（截图）
- **锚点**：`bg-gray-200 dark:bg-card-inner dark:shadow-[…]`（首页进度标尺）。
- **根因**：Tailwind v4 的 `dark:` 默认跟随系统 `prefers-color-scheme`，而本应用用 `body.theme-light` 类切换主题，两者不同步。
- **修法**：改为 `bg-card-inner shadow-inner`（令牌会随主题变化），并全局禁用 `dark:` 的使用（全项目仅此 1 处）。

### BUG-12 · UTC 以西时区的日期解析 🔍推导
- **锚点**：`new Date(config.joinDate)`、`new Date(leaveDateStr)`、`new Date(evt.date)`（`YYYY-MM-DD` 按 UTC 午夜解析）。
- **现象**：用户在 UTC−5 时，`'2026-11-07'` 会变成本地 11/6 19:00，`getDay()` 差一天；入职月份差也会错位。UTC+7/+8 的主力用户基本不受影响，故为 P2。
- **修法**：统一用 T-09（日期字符串 key + UTC 日历算术），或复用 `VisaTab.tsx` 的 `parseLocal`。

### BUG-13 / BUG-14 · 死代码
- `daysToCustom`（引用 `config.customEventDate`，该字段已不存在 → `Invalid Date`）、首页「查看日历」里的 `native-calendar` 取值逻辑（页面里没有该 id）；`earnedThisWeek / effectiveWorkThisWeek / slackThisWeek / bestDayStr / bestDayEarned` 仅被自己引用。
- **修法**：删除；周报需要时在 FEAT-01 里基于账本重做。**验收**：`npm run lint` 干净，行为无变化。

### BUG-15 · 「全国牛马击败率」是虚构公式
- **锚点**：`全国牛马击败率` → `min(99.9, max(1.0, salary/10000*80))`。
- **问题**：把一个编造的数字当作全国排名展示；小程序审核与用户信任都有风险。
- **修法**：改名为「娱乐向·牛马指数」并加「仅供娱乐」，或接入真实分布数据后再叫「击败率」（需要后端，当前不做）。

---

## 5. UI：样式、无障碍、性能

### UI-01 · 颜色令牌接入 Tailwind v4 ✅实测
- **问题**：`src/index.css` 用 `@layer utilities { .bg-card {…} .text-brand {…} }` 手写颜色类。Tailwind v4 不会为这些类生成 `/10`、`/50` 透明度变体，97 处写法全部失效（卡片底色消失、品牌色淡色块变成无色、`ring-brand` 回落到文字色→黑/白粗环）。
- **修法**（已在副本中构建验证：`bg-brand/10`、`text-primary/40`、`bg-card-inner/60`、`from-brand/20`、`focus:ring-brand` 全部生成）：
  ```css
  @import "tailwindcss";

  @theme inline {                      /* inline = 直接引用运行时 CSS 变量，主题切换无需重新生成 */
    --color-app: var(--app-bg);
    --color-card: var(--card-bg);
    --color-card-inner: var(--card-inner-bg);
    --color-primary: var(--text-primary);
    --color-secondary: var(--text-secondary);
    --color-tertiary: var(--text-tertiary);
    --color-brand: var(--brand-green);
    --color-brand-hover: var(--brand-green-hover);
  }
  ```
  同时**删除**手写的 `.bg-app/.bg-card/.bg-card-inner/.text-primary/.text-secondary/.text-tertiary/.text-app/.text-card/.text-brand/.bg-brand/.bg-brand-hover:hover/.border-brand`；`:root` 与 `body.theme-light` 里的变量保持不变。
- **注意**：`border-app`、`border-app-strong`、`border-frame` 与 `--color-app` 语义不同（前者是「边线颜色」），所以**保留为自定义工具类**，但见 UI-02。
- **验收**：`npm run build` 后 `grep -c '\.bg-brand\\/10' dist/assets/*.css` ≥ 1；浅/深色截图对比 `docs/assets/review/tokens-before-after-*.jpg`（隐私卡变为淡绿底而非黑框；「本月摸鱼总收益」卡片带淡绿底；底部导航当前项的环变品牌绿）。

### UI-02 · `border-app` 去掉 `border-width` ✅实测
- **问题**：`.border-app { border-color: …; border-width: 1px; }`，所以 `border-t border-app` 变成四边框（`App.tsx:2252` 数据页统计区、设置页空白框、`<hr className="border-app">` 等）。
- **修法**：
  ```css
  @layer utilities {
    .border-app        { border-color: var(--border-app); }
    .border-app-strong { border-color: var(--border-app-strong); }
    .border-frame      { border-color: var(--frame-border); }
  }
  ```
  源码里 131 处 `border-app` 中，仅 1 处没有配套宽度类（`<hr className="border-app my-2" />`，`hr` 自带 1px 上边线，无需改）。**同批改完再验收**，否则颜色类生效、宽度消失会让部分边框丢失。
- **验收**：对比图中「历史总计…」统计区外围不再有方框；全局搜索 `border-app` 的元素都带 `border`/`border-t` 等宽度类。

### UI-03 · 对比度令牌（已算好）
| 令牌 | 现值 → 建议 | 对比度（现 → 新） |
|---|---|---|
| 浅色 `--text-tertiary` | `#9ca3af` → `#636975` | 白底 2.54 → 5.51；`#f3f4f6` 底 2.31 → 5.01 |
| 浅色品牌绿（文字用） | `#059669` → `#047857` | 白底 3.77 → 5.48；`#f3f4f6` 底 3.42 → 4.98 |
| 浅色橙色提示字 | `#f97316` → `#c2410c` | 白底 2.80 → 5.18 |
| 浅色黄色（发薪横幅） | `#eab308` → `#a16207` | 白底 1.92 → 4.92 |
| 深色 `--text-tertiary` | `#6b7280` → `#8b919c` | `#141414` 底 3.81 → 5.81；`#0d0d0d` 底 4.02 → 6.13 |
- **做法**：品牌绿拆成两个令牌：`--brand-green`（填充/图形，≥3:1 即可，保留原亮绿）与 `--brand-text`（文字，≥4.5:1）；橙/黄文字在浅色主题下改用更深的 `-600/-700` 档（`text-orange-700` 等）。
- **验收**：`node scripts/verify/axe-scan.cjs` 的 `color-contrast` 节点数从 224 降到 0（或只剩被明确豁免的装饰元素）。

### UI-04 · 键盘焦点用 `:focus-visible`
- **问题**：底部导航 `focus:ring-2 focus:ring-brand focus:ring-opacity-50`——`ring-brand` 当前不存在，回落到 `currentColor`，所以**每次点击后**出现一圈粗黑（浅）/白（深）环；全项目 48 处 `outline-none` 又让键盘用户在输入框里看不到焦点。
- **修法**：UI-01 之后 `ring-brand` 生效；把 `focus:` 改 `focus-visible:`；再加一条全局兜底：
  ```css
  :where(button, [role="button"], a, input, select, textarea, summary):focus-visible {
    outline: 2px solid var(--brand-green); outline-offset: 2px;
  }
  ```
  `outline-none` 只允许与「边框颜色变化」成对出现。
- **验收**：鼠标点击底部导航后无环；Tab 键遍历时每个控件都有可见焦点。

### UI-05 · 可读名称（axe：`button-name` 14 / `select-name` 22 / `label` 32，均 critical）
- 纯图标按钮：运势 🥠、主题切换、语言、显示金额 👁、删除 ×、日历「今」、上月/下月、关闭 ✕ → 加 `aria-label={t('…')}`（新增翻译 key）。
- 下拉：首页两个时区 `<select>`（透明叠在文字上）、数据页币种、日历相关 → `aria-label`。
- 设置页输入框：现有 `<label>` 与 `<input>` 没有关联 → 抽 `<Field label hint error>` 组件（T-13），内部用 `useId()` 生成 `htmlFor/id`，错误用 `aria-describedby` + `aria-invalid`。
- **验收**：`axe-scan.cjs` 的这三条规则为 0。

### UI-06 · 触控目标 ≥44px
- 现状：顶栏按钮 28px（`w-7 h-7`）、「归零」≈17px（`text-[9px] py-0.5`）、报销删除 20px（`w-5 h-5`）、日历上/下月 32px（`p-2` + 16px 图标）。
- **做法（T-14）**：不改视觉大小，用伪元素外扩点击区：`relative after:absolute after:-inset-2`（目标 44px）；相邻小控件之间的外扩区**不得重叠**（必要时加大间距）。
- **验收**：Playwright 遍历所有可点击元素，`boundingBox()` + 伪元素外扩后 ≥44×44（脚本可用 `getComputedStyle(el,'::after')` 读取，或在 `data-hit` 属性上声明）。

### UI-07 · 字号下限
- 现状 96 处 `text-[8|9|10px]`。规则：**正文 ≥12px，次要标签 ≥11px，纯装饰角标可 10px 但不得承载信息**。与 UI-03 同批处理，否则小字 + 低对比叠加。
- 数字（金额、倒计时）用 `font-variant-numeric: tabular-nums`，避免跳动。

### UI-08 · 公共弹窗组件（T-12）
- 现有弹窗（备忘、全部倒计时、分享、运势、汇率、引导、导出）各写各的，没有焦点陷阱/Esc/`role="dialog"`。
- **做法**：基于原生 `<dialog>.showModal()`（自带焦点陷阱、Esc、`::backdrop`），统一 `title/onClose/children`，并锁定背景滚动；移动端以「底部抽屉」样式呈现。
- **验收**：每个弹窗打开后焦点在弹窗内、Esc 可关、关闭后焦点回到触发按钮。

### UI-09 · `<html lang>` 与标题
- `index.html` 写死 `lang="en"`，界面却默认中文，读屏会用英文发音读中文。在 `i18n.ts` 解析出语言后设置 `document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'`，并同步 `document.title`。

### UI-10 · 减少动态效果（T-15）
- 约 25 处无限循环动画。`@media (prefers-reduced-motion: reduce)` 全局兜底 + `<MotionConfig reducedMotion="user">` 包住 `App`。装饰性无限动画（运势红点、头像光环、专注火焰）在此模式下停止。

### UI-11 · 签证页接入全局令牌
- `VisaTab.tsx` 用 `bg-white`、`#4CAF50`、蓝色头图等写死颜色，深色主题下仍是白底。改为 `bg-card / text-primary / bg-brand` 等令牌；蓝色头图可作为该页的强调色保留，但用令牌的 `--accent-visa` 表达，并保证深色可读。英文文案 `OVERSEAS BUTLER` 走 `t()`。

### UI-12 · 币种与语言一致性
- 番茄钟「本次专注已赚取」固定 `¥`、分享卡固定 `¥`、报销汇总固定 CNY/USD、顶部时区显示 `Shanghai/Ho_Chi_Minh` 原始 ID → 统一用 `sym/ex`；城市名走 `TIMEZONES[].short`。

### UI-13 · 首页布局抖动（性能，最大单项）✅实测
- **现象**：工作时段首页每秒 60+ 次 layout，6× CPU 下占主线程约 80%（§2）。
- **主要站点（基线行号）**：
  | 位置 | 问题 | 改法 |
  |---|---|---|
  | `App.tsx:1755` 进度条填充 | `transition-all duration-1000` + 改 `width` | 固定宽度元素 + `transform: scaleX(p)`，`transform-origin:left`，`will-change: transform` |
  | `App.tsx:1767` 进度图标 | `transition-all` + 改 `left` | `transform: translateX(calc(p * trackWidth))`，或用 `left:0` + CSS 变量 `--p` 与 `translate` |
  | `App.tsx:1877` 圆环 | `transition-all` 改 `strokeDashoffset` | 只过渡 `stroke-dashoffset`（`transition: stroke-dashoffset 1s linear`），不要 `all` |
  | `App.tsx:1866/1869` | 两个 `animate-[spin…infinite]` 的 SVG `g` | 非工作时段/不可见/减少动态时停止 |
  | `App.tsx:1771、1702、272–309` | 多个 `animate-pulse`、头像光环 | 同上；红点「!」见 UX-10 |
  | `App.tsx:1952` | `key={earnedToday}` 每秒重挂载金额节点并重放动画 | 去掉 `key`；动效交给 UX-08 的数字翻牌 |
  | `FocusVisualizer`（专注页 10 种动画） | `transition-[height]` 每秒、多处 `repeat: Infinity` | 同上，并在页面不可见时暂停 |
- **原则（T-17）**：只动画 `transform` 和 `opacity`（合成器线程）；禁用 `transition-all`，写具体属性；离开视口/切后台/`prefers-reduced-motion` 时暂停无限动画。
- **验收（A/B 方法）**：
  ```bash
  node scripts/verify/perf-probe.cjs --throttle 6                       # 基线 ~760-830 ms/s，layouts/s ~60
  node scripts/verify/perf-probe.cjs --throttle 6 \
       --css "*,*::before,*::after{transition:none!important;animation:none!important}"   # 理论下限 ~440 ms/s，layouts/s ~2
  ```
  修复后的数字应**接近下限**，layouts/s ≤ 5。每改一处就跑一次，用 `--css` 二分定位剩余成本。
- 与 BUG 无关，可独立做；也不要为此改动计薪逻辑。

### UI-14 · 横向滚动条带可聚焦
- 倒计时条与购买力换算条（`overflow-x-auto`）被 axe 判定为不可键盘滚动：加 `tabIndex={0} role="region" aria-label="…"`，并提供可见焦点。

### UI-15 · 日历格改 `button`
- `CalendarGrid` 的格子是 `motion.div onClick`。改 `<button>`，`aria-label` 形如「11月12日，带薪休假，1 条备忘」；今天加 `aria-current="date"`。

### UI-16 · 表单校验（WCAG 3.3.1 / 3.3.3）
- 规则：月薪 > 0 且 ≤ 1e8；发薪日 1–31；下班 ≠ 上班；午休必须落在班次内；汇率 > 0。错误显示在字段下方，用 `aria-live="polite"`；保存按钮在「示例数据」状态下遇到错误不可提交（v1.0.29 已有月薪校验，扩展即可）。

---

## 6. ARCH：架构

### 目标结构
```
src/
├─ core/                    # 纯函数，零 React/DOM 依赖 → 网页与小程序共用（MP-01）
│  ├─ time.ts               # wallClock(at,tz)、zonedEpoch、日期 key 运算（T-09）
│  ├─ workday.ts            # dayKind(key,…)、isBaseWorkday、baseWorkdaysInMonth
│  ├─ salary.ts             # workedSeconds、earnedToday/Month/Year、unpaidLeave 扣减
│  ├─ ledger.ts             # 区间账本（T-03）
│  ├─ timers.ts             # 番茄钟 endAt 状态机（T-04）
│  ├─ currency.ts           # 唯一 RateTable + convert
│  └─ holidays/             # cn.json、hk.json、vn.json、th.json + schema（ARCH-07）
├─ store/                   # settings / ledger / records 的读写、版本、迁移、导出导入（T-11）
├─ hooks/useNow.ts          # 唯一的「每秒时钟」
├─ features/                # home / focus / calendar / data / settings / visa
└─ ui/                      # Modal、Field、IconButton、Toggle、MoneyText、Toast(+Undo)
```

### ARCH-01 · 测试基座 + CI
- 引入 `vitest`（先只测纯函数，**暂不装** `@testing-library/react`）。
- ⚠️ **已知坑 ✅实测**：之前分支 `claude/analyze-test-coverage-i0RGE` 在 Vercel 上构建失败，原因是 `npm install` 的 **ERESOLVE**：`@testing-library/react@16.0.0` 的 peer 依赖只接受 `react@^18`，而项目是 React 19。以后若需要组件测试，选用声明支持 React 19 的版本（≥16.1，安装前用 `npm view @testing-library/react peerDependencies` 核对），不要用 `--force` 绕过。
- `vitest.config.ts`：`environment: 'node'`；`globalSetup` 里 `process.env.TZ = 'Asia/Shanghai'`；加一组 `TZ=America/New_York` 的运行用于 BUG-12。
- 固定时钟：`vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T15:20:00+08:00'))`（T-01）。
- 先写的 8 组用例见 §13.3。
- CI：ENG-03。

### ARCH-02 · 抽出 `core/`
1. 原样搬运：`getWorkDaysInMonth`、秒薪公式、`autoWorkSecs`、请假统计、倒计时计算，**先不改行为**，补上特征测试（characterization tests）锁住现状。
2. 一个一个修 BUG（每个带测试），再把 `App.tsx` 里的重复计算换成 `core` 调用。
3. **所有函数都显式传 `now` 与 `tz`**（T-02），不在内部读 `Date.now()`。
4. 接口草案：
   ```ts
   // core/time.ts
   export function wallClock(at: number | Date, tz: string): { y:number; m:number; d:number; hh:number; mm:number; ss:number; dow:number; key:string; secs:number };
   export function addDays(key: string, n: number): string;           // 'YYYY-MM-DD' 运算，基于 UTC 日历，无 DST/时区问题
   export function dayDiff(a: string, b: string): number;
   // core/salary.ts
   export interface Shift { start: number; len: number; breaks: [number, number][] }   // 相对班次起点的秒
   export function earnedToday(args: { salaryPerSecond: number; shift: Shift; elapsed: number }): number;
   export function monthEarned(args: { salary: number; baseWorkdays: number; elapsedBaseWorkdays: number; unpaidLeaveBefore: number; earnedToday: number }): number;
   ```

### ARCH-03 · 数据模型 v2、迁移、导出/导入
- 三个库分开存，**各自带版本号**：
  ```ts
  type SettingsV2 = { v: 2; salary: { amount: number; currency: string }; schedule: Shift & { region: string; restDays: 1|2; tz: string };
                      payday: { day: number; first: string }; join: string; retire: string; countdowns: Countdown[];
                      ui: { skin: string; displayCurrency: string; hideMoney: boolean }; rates: Record<string, number> /* 1 单位 = ? CNY */ };
  type LedgerV2   = { v: 2; days: Record<string /*YYYY-MM-DD*/, { slack: Iv[]; overtime: Iv[]; pomodoros: number; leave?: 'paid'|'unpaid'; note?: string }> };
  type RecordsV2  = { v: 2; memos: Record<string, Memo[]>; reimbursements: Reimb[]; visas: Visa[]; travel: Travel[] };
  ```
- **迁移映射**：`niuma_config` → settings（+ `reimbursements` → records）；`niuma_memos` 中 `type: *_leave` → `ledger.days[k].leave`，其余留在 `records.memos`；`niuma_runtime_state` → 今日账本 + 计时器状态；`exportRates` 与 `config.currencies` 合并进 `rates`。
- **迁移机制**见 T-11：版本数组 `migrations[]`，每步纯函数；迁移前把旧值原样备份到 `niuma_backup_v{旧版本}`（单槽位），失败可回滚。
- **导出/导入**：JSON 文件下载 + 复制到剪贴板（小程序用导出码，MP-04）。导入时：限制体积（≤2 MB）、校验 `v`、白名单字段、数值夹紧（薪资 0–1e8 等）、永不 `eval`/`innerHTML`。导入前先自动导出当前数据。
- **验收**：用 v1.0.29 的真实 `localStorage` 快照（fixtures）跑迁移，往返导出/导入后与原数据逐字段一致。

### ARCH-04 · 时钟与渲染边界
- 现状：`handleTick` 每秒 `setNow` → `App` 整个函数重跑（含 ~100 次日期判断、30 次倒计时循环、`Solar.fromDate(...).getLunar()` **每秒**重算）。✅实测脚本开销不大（§2），但这是下一步拆组件的前提。
- 做法：
  - `useNow(intervalMs)`：只有需要「秒」的小组件订阅（金额、时钟、倒计时）；
  - 月度/年度统计、农历、工作日数用 `useMemo`，key 为 `dateKey`（每天只算一次）；
  - 在对齐秒边界处触发：`setTimeout(tick, 1000 - (Date.now() % 1000))`（T-19），数字不会漂。
- **先量后改**：每步后跑 `perf-probe.cjs`，只保留能看到收益的改动。

### ARCH-05 · 拆分组件
- 顺序：`ui/`（Modal、Field、MoneyText、IconButton）→ `features/settings` → `features/data` → `features/calendar` → `features/focus` → `features/home`（最后，最大）。每拆一块都要保持 `npm run build` 和 `repro-bugs.cjs` 结果不变。
- `data-testid`：金额、本月已赚、历史累计、摸鱼分钟、发薪横幅等关键节点加 `data-testid`，让 `scripts/verify/*` 不再依赖中文文案和 DOM 顺序。

### ARCH-06 · 懒加载与分包
- 见 T-20：`React.lazy` 载入签证/专注/日历；`html2canvas` 在点击「分享」时动态 `import()`；`lunar-javascript` 首屏后用 `requestIdleCallback` 加载；`vite.config.ts` 里 `manualChunks` 拆 `react`/`motion`/`lunar`。
- 目标：首屏 JS（gzip）显著小于现在的 309 KB；用 `npm run build` 输出与 `vite-bundle-visualizer`（可选）对比。

### ARCH-07 · 节假日数据外置
- `src/holidays.ts` → `core/holidays/{cn,hk,vn,th}.json`，结构 `{ year: { holidays: {'YYYY-MM-DD': '名称key'}, workdays: ['YYYY-MM-DD'] } }`，并带 `source`（公告链接）、`updatedAt`。
- 校验脚本（CI 跑）：日期格式合法；`workdays` 不落在 `holidays` 里；中国大陆每年必须存在（缺年份时给出警告并**回退为「仅周末」**，同时在 UI 提示「该年节假日数据未收录」）。
- **缺口**：中国 2027 年调休 `workdays: []` 待官方公告后补；2021–2025 年历史节假日未收录，所以「入职以来累计」按「月数 × 月薪」估算（这是估算，界面应标注）。
- 年度更新流程写进 `docs/`（国务院办公厅每年 11 月前后发布次年安排）。

### ARCH-08 · strict
- 先 `"noImplicitAny": false` 保持，逐目录开启 `strict`：`core/` 与 `store/` 从第一天就 strict；`features/*` 拆完后再开。禁止新增 `any`（ESLint 规则或 CI grep）。

### ARCH-09 · i18n
- 中文即 key 的风险：改一个中文标点，英文就丢。方案：保留现有 key，另加稳定 ID 的新文案（`home.earnedToday`）；`i18n-coverage.mjs` 进 CI（失败即阻止合并）。语言切换改为不 reload（用 context），需要先解决模块顶层 `t()`（`TIMEZONES/FORTUNES/FOCUS_CONTAINERS/CUSTOM_HOLIDAYS`）→ 改成函数或 `useMemo`。这一步收益小、风险中，放在最后。

---

## 7. UX：交互与信息架构

### UX-01 · 首页重排
```
┌──────────────────────────────────┐
│ 11/05 周四 · 农历九月廿六    🥠  ☾ │  ← 顶栏：只留日期与 2 个图标，其余进「我的」
├──────────────────────────────────┤
│ 今日已赚                 CNY ▾  👁 │
│ ¥ 571.49      ← 主视觉，翻牌数字   │
│ ● 工作中 ▾   ████████░░  66.7%     │  ← 状态切换器（UX-02）+ 进度（transform 动画）
├──────────────────────────────────┤
│ [下班 02:39] [休息日 3天] [发薪 1天] │  ← 倒计时横滑
│ [🐟 摸鱼] [🏢 加班] [✈️ 请假] [📸 分享] │  ← 4 个快捷操作
├──────────────────────────────────┤
│ 购买力换算（可折叠，默认收起）        │
│ 更多 ▾：时区 · 借口生成器 · 历史累计   │
└──────────────────────────────────┘
```
- 首屏（iPhone SE 667px 高）必须同时看到：今日已赚、状态、进度。
- 「示例数据」提示条保留在最上方，直到用户保存。

### UX-02 · 状态机
- 一个枚举 `mode: 'work' | 'slack' | 'overtime' | 'rest'`，四选一，替代两个独立开关。
- 切换规则：进入 `slack` 只能在工作时段（v1.0.29 已有此提示）；离开工作时段自动回到 `rest`/`work`（BUG-03）；`overtime` 可在任意时间进入，但受单次上限。
- 与账本区间一一对应：切换 = 关闭旧区间 + 打开新区间。

### UX-03 · 设置页
- 分 5 组、可折叠：**薪资**、**作息**、**日期与倒计时**、**个性化**（形象/皮肤/币种）、**数据**（导出/导入/配置方案/隐私）。
- 「循环提醒」「提示音」移到专注页的「设置」抽屉。
- 每个输入的校验与提示见 UI-16；`示例数据` 状态下顶部固定一个「已填 3/4 项」进度（UX-09）。
- 修「保存当前」一行超出卡片右边（`flex` 里的输入框加 `min-w-0`）。

### UX-04 · 底部导航
- 6 → 5：首页 / 专注 / 日历 / 数据 / 我的（设置 + 签证 + 导出）。签证是小众功能，入口放「我的」，不占一级导航。若数据表明签证页留存高，再恢复。
- 当前项 `aria-current="page"`；不要给整行加粗外环（UI-04）。

### UX-05 · 撤销（T-21）
- 「归零」、删除备忘/报销/倒计时、清空配置方案：立即生效 + 底部 toast「已删除 · 撤销」5 秒。比二次确认弹窗更快，也不打断。

### UX-06 · 日历底部面板
- 点日期 → 底部抽屉（UI-08）：当日收入与工时、请假开关（带薪/无薪/无）、备忘列表。把现在分散在首页「请假操作板」与日历备忘的功能合在一起。首页「请假操作板」保留为「今天」的快捷入口。

### UX-07 · 番茄钟
- 加短休（5 分钟）与 4 轮后长休（15–30 分钟）循环；容器仅是视觉，时长单独选（现在选容器会强制改时长）。完成时记入账本（T-04）。

### UX-08 · 金额翻牌（T-18）
- 去掉每秒整体重挂载动画（UI-13）；改为按位滚动，只有变化的末 1–2 位动。配合 `tabular-nums`，宽度不跳。`prefers-reduced-motion` 下直接替换数字。

### UX-09 · 首次使用清单
- v1.0.29 已有欢迎弹窗 + 示例数据条 + 设置页顶部提示。下一步：把「必填 4 项」做成可勾选的进度（薪资/作息/发薪日/入职时间），每填一项即时打勾；全部完成后才出现「保存，开始计算」的强调态。

### UX-10 · 假警报
- 进度图标右上角红色「!」一直在 `animate-pulse`（`App.tsx:1771`），没有任何含义。去掉，或仅在「距下班 ≤10 分钟 / 正在加班」时出现并配文字说明。

---

## 8. FEAT：功能路线

> 每项给出：目标 · 数据/依赖 · 关键实现点 · 指标 · 风险。**都不含工期。** 涉及税率、法规、平台规则的数值，实现前必须核对最新官方来源，并把数值放在带 `source` 与 `effectiveFrom` 字段的外置 JSON 里，**不得照抄本文数字上线**。

### FEAT-01 · 每日账本 + 周报/月报
- 目标：让所有「累计」都是**记录**而不是估算（BUG-07），并成为年报（FEAT-03）的数据源。
- 依赖：ARCH-03。关键实现：每天 `dayKey` 一条；周/月视图做堆叠条（工作/摸鱼/加班）；用 `dataviz` skill 的配色与可访问性规则。
- 指标：周报查看率、7 日留存。风险：账本变大 → 只保留近 400 天明细，更早的按月汇总。

### FEAT-02 · 下班总结卡 + 连续打卡
- 触发：到达下班时间或手动。内容：今日已赚、工时、摸鱼分钟、对应奶茶杯数。连续天数 = 账本里连续有「出勤」的天数（请假不断档，旷工/未记录断档需定义）。
- 指标：次日留存、每日打开次数。

### FEAT-03 · 牛马年报
- 内容（均来自账本，字段缺失则隐藏该页）：年度收入与工时、最晚下班日、摸鱼总时长与最长一次、加班总时长、最赚钱的一天、年度称号（规则式，如「摸鱼 ≥ X 小时」→ 称号表，纯本地计算）、一句话总结。
- 形式：竖版 3–6 页海报，可分享（FEAT-04）；皮肤：胶片日期戳 / 梦核（FEAT-11）。
- 指标：分享率、分享带来的新用户（TEL-01 的 `share_opened`）。
- 风险：数据太少时的空状态；首年用户账本不完整 → 文案诚实（「从 X 月开始记录」）。

### FEAT-04 · 分享卡升级
- 跟随显示币种与主题；标题动态（「我今天已经赚了 ¥571」）；加小程序码（需要服务端/云函数调用 `getwxacodeunlimit`，参数带 `src=share`）；网页用 `import('html2canvas')` 懒加载，小程序用 canvas 2d 绘制（MP-02）。
- 隐私：分享前提供「隐藏金额」开关（沿用 `hide()`），默认**隐藏绝对金额、显示杯数/百分比**更安全。

### FEAT-05 · 税前→税后计算器
- 国家：CN（累计预扣法）、VN、TH。结构：`{ country, effectiveFrom, source, brackets:[{upTo, rate, quickDeduction?}], allowances:{…}, social:{…} }`。
- CN 综合所得年度税率表自 2019 年起稳定（3% / 10% / 20% / 25% / 30% / 35% / 45%，对应年累计应纳税所得额分界 3.6 万 / 14.4 万 / 30 万 / 42 万 / 66 万 / 96 万，速算扣除数 0 / 2520 / 16920 / 31920 / 52920 / 85920 / 181920）——**仍须以当期官方公告核对**；专项附加扣除金额与社保公积金比例随年份/城市变化，务必外置。越南、泰国的个税与扣除额近年调整较多，**不要凭记忆写死**。
- 输出：税后月薪 → 一键填入 `monthlySalary`（解决「很多人只记得税前」导致算不准）。
- 指标：引导完成率。风险：合规——明确标注「估算，非报税依据」。

### FEAT-06 · 计薪口径
- 选项 A（现状）：`salary / 当月工作日`（每月不同）；B：`salary / 21.75`（法定折算日，与工资条对得上）；C：按小时制。默认保持 A，避免改变老用户数字。放在 `core/salary.ts` 的策略参数里，加测试。

### FEAT-07 · 加班费倍数
- 把「义务加班损失」升级为「应得加班费」估算：工作日延长 ≥150%、休息日 ≥200%、法定节假日 ≥300%（中国劳动法口径）。**倍数按地区配置**（越南、泰国规则不同，需核对）。时薪基数用 FEAT-06 的口径。
- 指标：加班功能使用率。风险：不是法律意见，需免责声明。

### FEAT-08 · 排班
- 模型：`{ type: 'fixed' | 'bigsmall' | 'rotation', anchor: 'YYYY-MM-DD', pattern: ('work'|'rest')[] }`。大小周 = 以锚点周为基准的两周循环；轮班 = 自定义循环；夜班依赖 BUG-05 的相对时间模型。
- 日历与倒计时都从 `dayKind()` 取值，不再各算各的。

### FEAT-09 · 工资币种可选
- `settings.salary.currency`；所有计算以该币种为基准，显示再换算（`rates` 表以 CNY 为桥或以基准币种为 1，二选一并写进 ADR）。越南/泰国员工直接按本币录入。迁移：老用户 `CNY`。

### FEAT-10 · 签证规则化
- 目前只有「一张签证 + 出入境记录」。方向：多签证、按国家规则算可停留天数（外置 JSON，带 `source/effectiveFrom`，越南/泰国的免签/电子签政策变化频繁，**以官方为准**）、到期前 30/7/1 天提醒（小程序走订阅消息 FEAT-16）。
- 指标：签证页留存。

### FEAT-11 · 皮肤系统（视觉方向：90s 复古 / 胶片 / Dreamcore）
- 实现：CSS 变量 + `data-skin` 属性；令牌覆盖背景、前景、强调色、圆角、字体、叠加层（扫描线/噪点）。每个皮肤在浅/深都要过 UI-03 的对比度。
| 皮肤 | 令牌要点 | 用在 |
|---|---|---|
| VHS 下班录像带 | 屏角时间码 `PLAY ▶ 15:20:01`（午休显示 `PAUSE ‖`）；扫描线叠加；金额数字红/蓝错位阴影 | 首页 |
| CRT 绿屏终端 | 沿用品牌绿；荧光余晖；金额写成 `> 已赚 ¥571.49` | 深色升级版 |
| 胶片日期戳 | 颗粒噪点；右下橙色 `'26 11 05` 日期戳 | 分享卡、年报 |
| Dreamcore 梦核工位 | 低饱和粉蓝渐变、柔光、空旷办公室氛围；文案「梦里也在上班」 | 年报封面、限定款 |
- 变现提示：小程序 iOS 端虚拟商品支付有平台限制（MP-03），先做「看广告/成就解锁」，再评估付费。

### FEAT-12 · CPS
- 「今天赚了 28 杯奶茶 → 领券」。需联盟账号；按平台要求标注推广；**不要打断核心流程**，放在换算卡片末尾，并可一键隐藏。

### FEAT-13 · 激励视频
- 场景：重抽运势、解锁番茄容器/皮肤试用。不得阻断核心计薪功能。流量主开通门槛与广告位规则以微信后台为准。

### FEAT-14 · 企业日历码
- HR 在后台配置：公司节假日/调休、发薪日、大小周规则 → 生成一个短链/二维码，指向 HTTPS 上的 JSON（域名白名单）。员工扫码 → 合并为自定义地区 `ORG:<id>`。
- 数据格式沿用 ARCH-07；导入前展示预览并让用户确认；**只允许白名单域名**，防篡改与钓鱼。可先在自己公司/团队内部试点。

### FEAT-15 · Offer 对比
- 输入：月薪、薪数（12/13/14…）、年终奖、五险一金、通勤/居家、周工时 → 输出**有效时薪**与年度到手差。复用 FEAT-05。若做线索收集，必须有明确同意与隐私说明。

### FEAT-16 · 订阅消息
- 微信里网页通知不可用，只能走订阅消息：下班前 10 分钟、发薪日、签证到期。注意订阅是**用户每授权一次推一条**（一次性订阅），需在合适时机反复引导授权，并提供降级（应用内提示）。

---

## 9. MP：小程序同步与合规

> 小程序是**独立代码库**，形态未知（`web-view` 套壳 / 原生 / uni-app / Taro）。执行任何 MP 任务前先判断形态，并问用户（§14）。

### MP-01 · 共享 `core/`
选一种，在 ADR 里记录：
1. **同仓 monorepo**：`packages/core` 被网页与小程序同时引用（推荐；`core/` 零依赖，直接被小程序构建链打包）。
2. **git submodule / subtree**：小程序仓库挂载网页仓库的 `src/core`。
3. **复制 + 校验脚本**：最简单；用脚本对比两边 `core/` 的哈希，不一致则 CI 失败。
- 禁止在小程序里「按网页逻辑重写一遍」——这正是现在每个功能都要人工移植的原因。

### MP-02 · 平台适配层（接口先行，`core/` 不碰平台 API）
| 能力 | 网页 | 小程序 | 适配要点 |
|---|---|---|---|
| 存储 | `localStorage` | `wx.getStorageSync/setStorageSync`（单 key、总量有上限，以文档为准） | `StorageAdapter`；清缓存会丢全部数据 → MP-04 |
| 计时 | Blob Worker + `visibilitychange` | 切后台后会被挂起 | **所有计时只存时间戳**（T-03/T-04），`onShow` 用 `Date.now()` 差值补算，不依赖后台 tick |
| 通知 | `Notification`（微信内置浏览器不可用） | 订阅消息 `wx.requestSubscribeMessage` | `NotifyAdapter`；降级为应用内 toast |
| 分享图 | `html2canvas` | canvas 2d + `wx.canvasToTempFilePath`；分享用 `onShareAppMessage/onShareTimeline` | `ShareAdapter` |
| 音频 | Web Audio 实时合成 | `wx.createWebAudioContext` 可用但需**在目标基础库实测**；否则用音频文件 + `InnerAudioContext` | `AudioAdapter` |
| 时区 | `Intl.DateTimeFormat({timeZone})` | 不同基础库对 `timeZone` 选项支持**需实测** | `core/time.ts` 内置「固定偏移」回退（CN/HK/TH/VN/JP 无夏令时可精确；纽约/伦敦/悉尼/巴黎回退为设备偏移并提示） |
| 剪贴板 | `navigator.clipboard` | `wx.setClipboardData`（涉及隐私授权，见 MP-03） | 导出码 |

### MP-03 · 审核与合规检查（**以微信官方最新规则为准**，下列为需要逐条核对的风险点）
1. **运势/抽签**（`FORTUNES`、🥠 入口）：命理/占卜类内容在小程序类目与内容规范里可能受限 → 做成功能开关 `FEATURES.fortune`，小程序版默认改名「今日牛马签（纯娱乐）」并去掉「吉/凶」断语，或直接关闭。
2. **烟草元素**：专注容器「香烟 🚬」→ 小程序版改名/替换图标，用开关控制。
3. **虚构数据**：BUG-15 的「全国击败率」。
4. **隐私**：需要配置并展示《用户隐私保护指引》；使用剪贴板、保存到相册等隐私接口前按平台流程授权。埋点（TEL-01）也要在指引里说明。
5. **订阅消息模板**：与小程序类目匹配，且不得做营销骚扰。
6. **广告/流量主**：开通门槛、广告位位置与频次规则。
7. **付费皮肤**：iOS 端小程序虚拟商品支付限制，先确认可行路径再设计商业化。
8. **`web-view`**：个人主体小程序不能使用 `web-view`；使用 `web-view` 需要把业务域名配置到公众平台且**该域名要完成 ICP 备案**（`*.vercel.app` 不满足）。主体是公司（而非个人）时再评估。
9. 提审与发布永远由人在微信开发者工具/公众平台完成（上传需要扫码或上传密钥），**Agent 只负责推送代码到仓库**。

### MP-04 · 数据备份
- 微信清缓存即丢数据。方案：① 导出码（JSON → 复制 / 保存到文件助手）；② 云开发数据库按 `openid` 存一份加密备份（需用户同意，写进隐私指引）。导入时校验同 ARCH-03。

### MP-05 · 移植提示词模板
当网页新增功能、小程序暂未共用 `core/` 时，给小程序仓库的 Agent 使用（把方括号替换掉）：
```markdown
## 任务：把网页版 TimeMeter 的 [功能名 / 任务 ID] 移植到本小程序（AppID: [appid]）
参考源码：baiiiii521/--barry-niuma，分支 [分支]，提交 [sha]。先用 add_repo 只读加入，再 `git show [sha]`，并阅读 docs/OPTIMIZATION-GUIDE.md 中对应任务。
不要照搬 React；按本项目的技术栈重新实现，存储用 wx.getStorageSync/setStorageSync。
[逐条写验收标准，可直接引用指南里的验收段落]
完成后：版本号 +1；跑项目已有检查；提交到本仓库开发分支并推送；说明改了哪些文件。
不要上传或发布，上传与提审由我在微信开发者工具里操作。
```

---

## 10. ENG：工程与清理

- **ENG-01 清理**：`package.json` 里未使用的 `date-holidays`、`express`、`@types/express`、`dotenv`、`autoprefixer`（Tailwind v4 的 Vite 插件不需要）；包名 `react-example` → `timemeter`；`metadata.json`、`.env.example`（Gemini/AI Studio 文案）按需保留或删除；`@google/genai` 只被 `scripts/translate/translate_api.ts` 用，保留在 devDependencies 即可。每删一项都 `npm ci && npm run build` 验证。
- **ENG-02 外部资源**：`index.css` 首行 `@import url('https://fonts.googleapis.com/…')` 与 `App.tsx:1668` 的 `transparenttextures.com` 纹理图。国内首屏会被拖慢，也与「不请求第三方」的隐私定位不符。做法：`@fontsource/inter`、`@fontsource/jetbrains-mono` 自托管（只带用到的字重/子集），纹理图删除或内联为 CSS 渐变。
- **ENG-03 CI**：`.github/workflows/ci.yml`：`npm ci` → `npm run lint` → `vitest run` → `node scripts/verify/i18n-coverage.mjs` → `npm run build`；可选再加 `axe-scan.cjs --max-critical 0`（需要 `playwright` 浏览器，单独 job）。
- **ENG-04 翻译脚本**：`scripts/translate/*` 加 `npm run i18n:extract` 等入口，并在 README 写明用法与密钥获取（`GEMINI_API_KEY` 只放环境变量，**不要**进客户端 bundle——v1.0.x 早期曾误把它注入 `vite define`，已修复，别回退）。
- **ENG-05 AudioContext**：`playAlertSound` 每次 `new AudioContext()` 不关闭，浏览器对同时存在的实例有上限（iOS 尤其严格）。改为复用一个并在用户手势里 `resume()`；`NoiseSynth` 已有 `ensureCtx`，两者合并。
- **ENG-06 Vercel**：`main` = 生产；其他分支自动出预览（已有）。合并前在预览链接上跑 §13 的清单。注意：预览域名默认开启 SSO 保护，需要登录 Vercel 才能打开；要给外部人看，请他走团队邀请或临时关闭该保护。

---

## 11. TEL：埋点与指标

### 原则
匿名；**不上传原始薪资、备忘文本、报销说明**；薪资只用分桶；设置页提供「匿名使用统计」开关（默认开，可关）；隐私政策/指引里写明。

### 事件表（TEL-01）
| 事件 | 属性 | 触发 |
|---|---|---|
| `app_open` | `is_new`、`demo`、`lang`、`theme`、`platform` | 每次启动（每天首次另标 `first_of_day`） |
| `onboarding_started` / `onboarding_completed` | `fields_changed`(数量) | 欢迎弹窗出现 / 点击「保存，开始计算」 |
| `config_saved` | `salary_bucket`(`<5k/5-10k/10-20k/20-50k/>50k`)、`region`、`has_lunch` | 设置保存 |
| `mode_changed` | `from`、`to` | 状态切换（UX-02） |
| `pomodoro_complete` | `len_min` | 番茄完成 |
| `currency_changed` | `code` | 切换显示币种 |
| `share_generated` | `type`(`daily/annual`)、`hide_amount` | 生成分享图 |
| `share_opened` | `src` | 通过分享链接/小程序码打开（带 `src=share`） |
| `feature_click` | `name` | 运势、年报、CPS、广告等入口 |
| `ad_impression` / `cps_click` / `skin_purchase` | — | 变现事件 |

### 指标
| 环节 | 指标 |
|---|---|
| 激活 | 新用户完成引导比例 =（`onboarding_completed` / `onboarding_started`） |
| 留存 | 次日、7 日留存；日均打开次数 |
| 传播 | 分享率；K 因子 = 人均分享次数 × 每次分享带来的新用户数 |
| 变现 | 广告曝光 × eCPM、CPS 点击率与佣金、皮肤付费转化 |
- 实现：`track(name, props)` 单点封装（开发环境 no-op，关闭开关时 no-op）。网页可用 Vercel Web Analytics（无 cookie；自定义事件可能要付费计划，以当前套餐为准）或自托管 Umami/Plausible；小程序用微信后台自带的数据分析与自定义事件。
- 先收两周基线，再据此决定 §8 里 P2/P3 的先后。

---

## 12. 技巧库

> 每条技巧都标明用在哪些任务。带 ✅ 的已在本仓库实际验证过。

**T-01 固定时钟 ✅**（测试与截图的前提，用于所有任务）
Playwright：在页面脚本前注入，时间从指定时刻继续走（`scripts/verify/lib.cjs` 已封装为 `frozenClock/withApp`）：
```js
await ctx.addInitScript(`(() => { const D = Date; const off = new D('2026-11-04T15:20:00+08:00').getTime() - D.now();
  globalThis.Date = class extends D { constructor(...a){ super(...(a.length ? a : [D.now()+off])); } static now(){ return D.now()+off; } }; })();`);
```
Vitest：`vi.useFakeTimers(); vi.setSystemTime(...)`。Playwright ≥1.45 也可用内置 `page.clock`。时区单独用 `timezoneId` / `TZ` 控制。**固定在工作时段**，否则性能与动画数据失真。

**T-02 班次相对时间 + 纯函数传 `now`**（BUG-05、ARCH-02、FEAT-08）
把班次表示为「起点 + 长度 + 休息段（相对起点的秒）」，白班/夜班/午休不再需要特判跨零点；所有函数签名带 `now`/`tz` 参数，不在内部读系统时间——这样同一个函数既能单测，也能在小程序里复用。

**T-03 区间账本代替增量累加**（BUG-03、BUG-07、FEAT-01）
```ts
type Iv = [start: number, end: number | null];                    // epoch ms；end=null 表示进行中
const overlap = (a0:number,a1:number,b0:number,b1:number) => Math.max(0, Math.min(a1,b1) - Math.max(a0,b0));
export function secondsIn(ivs: Iv[], now: number, windows: [number, number][]) {
  return ivs.reduce((sum,[s,e]) => sum + windows.reduce((w,[a,b]) => w + overlap(s, e ?? now, a, b), 0), 0) / 1000;
}
// windows = 「工作时段 − 午休」拆成的若干段；跨午夜的区间按天拆分后分别记入各天
```
进行中的区间每 10 秒写一次 `lastSeen`；重开时若 `now − lastSeen` 超过阈值，在 `lastSeen` 关闭。好处：离线、后台节流、跨天、午休都自然正确，且不需要「每秒累加」。

**T-04 番茄钟存 `endAt` 而不是 `timeLeft`**（BUG-04、UX-07）
```ts
type Pomo = { status: 'idle'|'running'|'paused'; endAt?: number; remainingMs: number; lengthMin: number };
start  = { status:'running', endAt: now + remainingMs, ... }      // 立刻持久化，不要等 10 秒防抖
pause  = { status:'paused',  remainingMs: Math.max(0, endAt - now) }
timeLeft = status==='running' ? Math.max(0, endAt - now)/1000 : remainingMs/1000
// 重开页面时 status==='running' && now>=endAt → 标记完成，计入 endAt 当天的账本
```

**T-05 Tailwind v4 的 `@theme inline` + 运行时变量 ✅**（UI-01）
`inline` 让工具类直接引用 `var(--card-bg)` 等运行时变量，切换主题无需重建；透明度变体由浏览器 `color-mix` 完成，所以 `bg-brand/10` 在两个主题下都正确。

**T-06 边线的「颜色」与「宽度」分离 ✅**（UI-02）
颜色类只设 `border-color`，宽度永远来自 `border / border-t / …`。否则每个 `border-t` 都会变成方框。

**T-07 自适应字号：JS 测量 vs 纯 CSS ✅**（UI-12，已实现为 `AutoFitText`）
- 现用 JS：先以最大字号测 `scrollWidth`，再按比例缩小；能自动处理「亿/万」等宽字符。**保留**。
- 纯 CSS 替代（容器查询单位）：
  ```css
  .box { container-type: inline-size; overflow: hidden; }
  .fit { white-space: nowrap; font-size: 20px;                         /* 不支持 cqw 时的回退 */
         font-size: clamp(12px, calc(100cqw / (var(--chars) * 0.6)), 44px); }  /* 等宽字体每字约 0.6em */
  ```
  ✅实测：纯 ASCII 数字可行；**含 CJK 时会溢出**（「₫10.64亿」在 100px 宽处溢出）——必须把 CJK 字符按 **≈1.8** 个单位计入 `--chars`（实测加权后仅剩触到 12px 下限的超长串溢出，而那正是 `formatMoneyFit` 压缩格式要避免的）。所以只在确认值只含数字时用，否则用 JS 版。

**T-08 缓存 `Intl.NumberFormat`**（UI-13/ARCH-04）
`formatMoney` 每秒被调用十余次，用 `toLocaleString` 每次都新建格式化器。改成模块级 `const fmt = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})`。同理缓存 `Intl.DateTimeFormat`（按时区）。用 `perf-probe.cjs` 对比确认有收益再保留。

**T-09 时区安全的日期**（BUG-09、BUG-12、ARCH-02）
```ts
const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function wallClock(at: number | Date, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) fmtCache.set(tz, f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', weekday:'short' }));
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]));
  const hh = +p.hour % 24;                                          // 防个别引擎把 0 点写成 24
  return { y:+p.year, m:+p.month, d:+p.day, hh, mm:+p.minute, ss:+p.second,
           dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday), key:`${p.year}-${p.month}-${p.day}`, secs: hh*3600 + +p.minute*60 + +p.second };
}
// 纯日历运算一律在「日期 key」上做，用 UTC 避开 DST 与时区
const keyToUTC = (k: string) => { const [y,m,d] = k.split('-').map(Number); return Date.UTC(y, m-1, d); };
export const addDays = (k: string, n: number) => new Date(keyToUTC(k) + n*86400000).toISOString().slice(0,10);
export const dayDiff = (a: string, b: string) => Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000);
export const dowOf   = (k: string) => new Date(keyToUTC(k)).getUTCDay();
```
日期先后比较直接比字符串（`'2026-11-03' < '2026-11-04'`）。当月天数：`new Date(Date.UTC(y, m, 0)).getUTCDate()`。

**T-10 单一汇率表**（BUG-10、FEAT-09）
`rates: Record<code, cnyPerUnit>`，`convert = (amt, from, to) => amt * rates[from] / rates[to]`。显示币种、报销汇总、分享卡共用；编辑器（v1.0.29 的 `showCurrencyEditor`）直接改这张表。

**T-11 带版本的存储迁移 + 导入防御**（ARCH-03、MP-04）
```ts
const migrations: Array<(d: any) => any> = [ /* v0→v1 */ m1, /* v1→v2 */ m2 ];
export function load(key: string) {
  const raw = localStorage.getItem(key); if (!raw) return null;
  let data = JSON.parse(raw); let v = data?.v ?? 0;
  if (v < migrations.length) localStorage.setItem(`${key}__backup_v${v}`, raw);   // 单槽位备份，便于回滚
  while (v < migrations.length) { data = migrations[v](data); v++; }
  return { ...data, v };
}
```
导入：先限制体积与 `v`，再逐字段白名单 + 夹紧范围；导入前自动导出当前数据；永远不 `eval`，不 `innerHTML`。

**T-12 原生 `<dialog>` 做弹窗**（UI-08）
```tsx
function Modal({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const d = ref.current!; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <dialog ref={ref} aria-labelledby={id} onClose={onClose} onClick={e => e.target === ref.current && onClose()}
                 className="backdrop:bg-black/50 backdrop:backdrop-blur-sm …"><h2 id={id}>{title}</h2>{children}</dialog>;
}
```
免费获得焦点陷阱、Esc 关闭、`::backdrop`、关闭后焦点回到触发元素。注意：目标设备（iOS ≥15.4、微信内核）需实测；退出动画可用 CSS `@starting-style` 或保持 `motion` 包一层。

**T-13 表单组件自动关联标签**（UI-05、UI-16）
`<Field label error hint>` 内部 `useId()` 生成 id，输出 `<label htmlFor>`、`aria-describedby`、`aria-invalid`，一次解决 axe 的 `label` 规则与错误提示。

**T-14 不改外观地放大点击区**（UI-06）
`relative after:absolute after:-inset-2 after:content-['']`（目标 44px）；相邻按钮的外扩区不要重叠，必要时增大 `gap`。

**T-15 减少动态效果两层兜底**（UI-10）
```css
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important; } }
```
```tsx
import { MotionConfig } from 'motion/react';
<MotionConfig reducedMotion="user"><App /></MotionConfig>
```

**T-16 `aria-current` / `aria-pressed` / `lang`**（UI-05、UI-09）
底部导航当前项 `aria-current="page"`；开关类按钮 `aria-pressed`；根据语言设置 `document.documentElement.lang`。

**T-17 只动画 `transform` 与 `opacity` ✅**（UI-13）
进度条：宽度固定，用 `transform: scaleX(p)`（`transform-origin:left`）；进度图标：`transform: translateX(...)`。避免 `transition-all`。无限动画在不可见/非工作时段/减少动态时暂停（`IntersectionObserver` + `document.hidden`）。用 `perf-probe.cjs --css` 做 A/B 验证每一处改动的收益（基线实测：全部关闭 → layout 60→2/s、任务 −47%）。

**T-18 数字翻牌**（UX-08）
每一位渲染成 0–9 的竖列，用 `transform: translateY(-d * 1em)` + `transition: transform .35s cubic-bezier(.2,.8,.2,1)`；容器 `height:1em; overflow:hidden`；配合 `font-variant-numeric: tabular-nums`；只有变化的位会动。

**T-19 对齐秒边界的时钟**（ARCH-04）
`setTimeout(tick, 1000 - (Date.now() % 1000))` 递归调度，避免 `setInterval` 漂移造成的「一会儿一跳、一会儿两跳」；Worker 内同理。

**T-20 懒加载**（ARCH-06）
```tsx
const VisaTab = lazy(() => import('./VisaTab').then(m => ({ default: m.VisaTab })));
const share = async () => { const { default: html2canvas } = await import('html2canvas'); /* … */ };
// vite.config.ts
build: { rollupOptions: { output: { manualChunks: { react: ['react','react-dom'], motion: ['motion/react'], lunar: ['lunar-javascript'] } } } }
```

**T-21 撤销提示代替确认弹窗**（UX-05）
先执行、保存快照、toast 显示「已删除 · 撤销」5 秒；点撤销恢复快照，超时丢弃快照。一个 `useUndo()` hook 即可服务全部删除/归零场景。

**T-22 示例数据的「安全阀」**（UX-09、已实现）
`niuma_demo` 必须在**第一次写入 `niuma_config` 之前**设置，否则刷新后无法区分「新用户」与「老用户」。任何新增的「首次使用」逻辑都要沿用这个先写标志再写数据的顺序。

---

## 13. 验证与发布清单

### 13.1 每个任务都要
- [ ] `npm run lint` 通过；`npm run build` 通过
- [ ] `package.json` patch 版本 +1
- [ ] 文案改动：`node scripts/verify/i18n-coverage.mjs` 退出码 0
- [ ] 相关 BUG：`node scripts/verify/repro-bugs.cjs --only BUG-xx --strict`
- [ ] UI 改动：浅/深色 × 375px / 430px 各截图一次（固定时钟，T-01），对比改前改后
- [ ] 无障碍相关：`node scripts/verify/axe-scan.cjs`，对应规则节点数下降
- [ ] 性能相关：`node scripts/verify/perf-probe.cjs --throttle 6`，数字不变差
- [ ] 老用户数据不丢：用 v1.0.29 的 `localStorage` 快照启动，所有页面正常

### 13.2 发布（网页）
1. 分支上 Vercel 自动出预览；在预览链接上跑 13.1。
2. 合并到 `main` 后 Vercel 自动发布 `barry-tawny.vercel.app`。
3. 小程序若是 `web-view` 套壳：网页更新后无需重新提审；原生/uni-app 则按 MP-03 流程人工上传与提审。

### 13.3 首批单元测试（ARCH-01 起步，全部用固定时钟与 TZ=Asia/Shanghai）
| 用例 | 输入 | 期望 |
|---|---|---|
| 秒薪 | 月薪 18000，11 月 21 个工作日，09:00–18:00，午休 12–13 | 时薪 107.14，秒薪 0.029762 |
| 今日已赚 | 同上，11-04 15:20:00 | ≈ 571.43（工时 19200s） |
| 夜班 | 22:00–06:00，23:30 | 工时 5400s；凌晨 02:00 归属前一天班次 |
| 无薪假-今天 | 月薪 21000，11-04 08:00，当天无薪假 | 本月已赚 2000 |
| 无薪假-昨天 | 同上，11-03 无薪假 | 本月已赚 1000 |
| 无薪假-休息日 | 11-01（周日）无薪假 | 不扣款 |
| 历史累计 | 11-03 增加一天无薪假 | 累计恰好减少 1000 |
| 发薪倒计时 | 发薪日 31，11-04 | 26 天；2 月、闰年边界各一组 |
| 账本区间 | 摸鱼 11:50–13:10，午休 12–13 | 仅计 20 分钟 |
| 区间离线 | 摸鱼中，`lastSeen` 4 小时前重开 | 区间在 `lastSeen` 关闭，不补算 |
| 番茄钟 | `endAt` 已过 | 重开后记为完成，计入 `endAt` 当天 |
| 时区 | `TZ=America/New_York` 下 `dowOf('2026-11-07')` | 6（周六），不受时区影响 |
| 迁移 | v1.0.29 快照 | 迁移到 v2 后字段一一对应，备份键存在 |

### 13.4 复现数据（可直接用于 `withApp`）
```js
// 无薪假当天
withApp({ now:'2026-11-04T08:00:00+08:00', config:{ monthlySalary:21000 },
          storage:{ niuma_memos:{ '2026-11-04':[{ id:'x', text:'leave', type:'unpaid_leave', completed:true }] } } }, fn)
// 夜班
withApp({ now:'2026-11-04T23:30:00+08:00', config:{ monthlySalary:21000, startTime:'22:00', endTime:'06:00', hasLunchBreak:false } }, fn)
```

---

## 14. 待人类决策

**Agent 遇到下列事项请先向用户确认，不要自行决定。**
1. 是否把 `claude/great-euler-zz4fix` 合并到 `main` 并发布到线上（合并后所有线上用户立刻看到 v1.0.29 的改动）。
2. 小程序的实际形态：`web-view` 套壳 / 原生 / uni-app / Taro？主体是个人还是公司？代码在哪个仓库？
3. 是否开通匿名埋点，及选用哪种方案（TEL-01）。
4. 运势、香烟元素在小程序版是保留、改名还是关闭（MP-03）。
5. 皮肤、广告、CPS 的商业化是否启动、先后顺序（FEAT-11/12/13）。
6. 「全国牛马击败率」改名还是接真实数据（BUG-15）。
7. 工资币种基准：以 CNY 为桥，还是以用户的基准币种为 1（FEAT-09）。
8. 是否需要线上数据备份（云开发，MP-04），涉及隐私指引。

---

## 15. 附录

### A. 已核实 / 未核实
| 已在真实浏览器里核实 ✅ | 仅读码推导 🔍（动手前先写测试确认） |
|---|---|
| BUG-01/02/03/04/05/09/11；颜色透明度失效与修复；`border-app` 方框；axe 全部数字；首页布局抖动与归因；纯 CSS 自适应字号的 CJK 缺陷；i18n 覆盖；Vercel 上 vitest 分支构建失败原因 | BUG-06/07/08/10/12；所有 FEAT 与 MP 的平台行为（Intl 时区、`web-view`、订阅消息、`<dialog>` 在目标内核的表现）需在目标环境实测 |

### B. 复现脚本一览（`scripts/verify/`）
| 文件 | 作用 |
|---|---|
| `lib.cjs` | `withApp(opts, fn)`：固定时钟 + 预置 localStorage + 打开应用；`goTab`、`num` |
| `repro-bugs.cjs` | BUG-01/02/03/04/05/09 的复现与验收，`--strict` 失败退出 |
| `axe-scan.cjs` | 6 页 × 浅/深主题的 WCAG 2.1 A/AA 扫描，`--max-critical N` |
| `perf-probe.cjs` | 首页/日历/设置的主线程开销，支持 CPU 降速与 `--css` 做 A/B |
| `i18n-coverage.mjs` | `t()` key 对 `dict-en.json` 的覆盖 |

需要：`playwright`（云端会话已预装，本机 `npm i -D playwright`）、`axe-core`（`npm i -D axe-core`，或设 `AXE_PATH`）。目标地址默认 `http://localhost:4173`，用 `BASE_URL` 覆盖。

### C. 配套 skill（按任务选用）
| 任务 | skill |
|---|---|
| UI 评审、无障碍 | `design:design-critique`、`design:accessibility-review` |
| 文案（按钮、错误、空状态） | `design:ux-copy` |
| 设计令牌与组件规范 | `design:design-system` |
| 年报、数据页图表 | `dataviz` |
| 用户验证（年报 vs 税后计算器先做哪个） | `design:user-research` |
| 传播与上线计划 | `marketing:campaign-plan` |
| 有埋点数据后的留存分析 | `data:analyze` |
| 提交前评审 | `code-review`、`simplify` |

### D. 变更记录
| 版本 | 内容 |
|---|---|
| v1 | 初版：全量评审、基线度量、任务清单、技巧库、验证脚本 |
