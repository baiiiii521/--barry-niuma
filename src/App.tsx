import { t, tf, tDays, dayUnit, setLanguage, getLanguage } from "./i18n";
import { version as APP_VERSION } from "../package.json";
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getNoiseSynth } from './lib/NoiseSynth';
import { motion, AnimatePresence } from 'motion/react';
import { Solar } from 'lunar-javascript';
import html2canvas from 'html2canvas';

import { isDateCustomHoliday, isDateCustomWorkday, getCustomHolidayName } from './holidays';
import { VisaTab } from './VisaTab';

const playAlertSound = (type: string) => {
  if (!type || type === 'none') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'beep') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'bell') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 1.5);
      gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.5);
    } else if (type === 'chime') {
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2); // E5
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime + 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.0);
    } else if (type === 'digital') {
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

import {
  Settings,
  RefreshCw,
  Calendar as CalendarIcon,
  Eye,
  EyeOff,
  Home,
  PieChart,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Clock, // Pomodoro icon
  Timer, // Better Pomodoro icon
  Plus,  // Memo
  Trash2, // Memo delete
  Edit2,  // Memo edit
  CheckCircle,
  X,
  Play,
  Pause,
  Square,
  Plane,
  Globe
} from 'lucide-react';

const MILK_TEA_PRICE = 20;
const COFFEE_PRICE = 30;
const GAS_PRICE = 8; // per Liter
const IPHONE_PRICE = 7999;

// --- FORMATTERS ---
const formatMoney = (amount: number) => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const pad0 = (num: number) => num.toString().padStart(2, '0');

// Timezones options
const TIMEZONES = [
  { label: t('🇨🇳 北京'), value: 'Asia/Shanghai', short: t('北京') },
  { label: t('🇹🇭 曼谷'), value: 'Asia/Bangkok', short: t('曼谷') },
  { label: t('🇻🇳 胡志明'), value: 'Asia/Ho_Chi_Minh', short: t('胡志明') },
  { label: t('🇨🇳 香港'), value: 'Asia/Hong_Kong', short: t('香港') },
  { label: t('🇯🇵 东京'), value: 'Asia/Tokyo', short: t('东京') },
  { label: t('🇺🇸 纽约'), value: 'America/New_York', short: t('纽约') },
  { label: t('🇬🇧 伦敦'), value: 'Europe/London', short: t('伦敦') },
  { label: t('🇦🇺 悉尼'), value: 'Australia/Sydney', short: t('悉尼') },
  { label: t('🇫🇷 巴黎'), value: 'Europe/Paris', short: t('巴黎') },
];

const ZODIAC_EN: Record<string, string> = { '鼠': 'Rat', '牛': 'Ox', '虎': 'Tiger', '兔': 'Rabbit', '龙': 'Dragon', '蛇': 'Snake', '马': 'Horse', '羊': 'Goat', '猴': 'Monkey', '鸡': 'Rooster', '狗': 'Dog', '猪': 'Pig' };

const tzShort = (value: string, stored: string) => TIMEZONES.find(z => z.value === value)?.short ?? t(stored);

const getLocalTzInfo = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    const match = TIMEZONES.find(t => t.value === tz);
    return { value: tz, label: match ? match.short : (tz.split('/').pop() || t('本地')) };
  } catch (e) {
    return { value: 'Asia/Shanghai', label: t('北京') };
  }
};

const initialTz = getLocalTzInfo();

const getWorkDaysInMonth = (year: number, month: number, region: string, restDays: number, upToDate?: number) => {
  let workdays = 0;
  const maxDays = new Date(year, month + 1, 0).getDate();
  const days = upToDate !== undefined ? Math.min(upToDate, maxDays) : maxDays;
  for (let i = 1; i <= days; i++) {
    const d = new Date(year, month, i);
    const day = d.getDay();
    const isStandardWeekend = restDays === 2 ? (day === 0 || day === 6) : (day === 0);
    const isCustomHoliday = isDateCustomHoliday(d, region);
    const isCustomWorkday = isDateCustomWorkday(d, region);
    
    // Logic: If it's a holiday, it's NOT a workday.
    // If it's NOT a holiday:
    //   If it's a weekend, it's only a workday if it's explicitly a custom make-up workday.
    //   If it's a weekday, it's a workday unless it's explicitly a custom holiday.
    
    if (isCustomHoliday) {
      // Not a workday
    } else if (isCustomWorkday) {
      workdays++;
    } else if (!isStandardWeekend) {
      workdays++;
    }
  }
  return workdays || 21.75;
};

const FORTUNES = [
  { level: t('大吉'), text: t('今日大吉：摸鱼指数100%'), detail: t('今天老板出差，敞开摸吧！'), emoji: '🎉', color: 'text-green-500' },
  { level: t('大吉'), text: t('今日大吉：系统崩溃'), detail: t('趁现在，快去喝杯咖啡！'), emoji: '☕', color: 'text-green-500' },
  { level: t('大吉'), text: t('今日大吉：准点下班'), detail: t('没有任何阻碍，电梯都刚刚好。'), emoji: '🏃', color: 'text-green-500' },
  { level: t('大吉'), text: t('今日大吉：带薪拉屎'), detail: t('马桶犹如龙椅，舒适度满分。'), emoji: '🚽', color: 'text-green-500' },
  { level: t('大吉'), text: t('今日大吉：灵感爆棚'), detail: t('10分钟写完代码，剩下7小时50分摸鱼。'), emoji: '💡', color: 'text-green-500' },
  { level: t('大吉'), text: t('今日大吉：奖金翻倍'), detail: t('虽然是做梦，但梦里真的很爽。'), emoji: '💰', color: 'text-green-500' },
  { level: t('大吉'), text: t('今日大吉：神仙乙方'), detail: t('今天对接的人意外地好说话。'), emoji: '✨', color: 'text-green-500' },
  { level: t('小吉'), text: t('今日小吉：无事发生'), detail: t('没有需求就是最好的需求。'), emoji: '😌', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：会议数量-2'), detail: t('不用去听废话了，但也可能有个甲方找麻烦。'), emoji: '📅', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：下午茶+1'), detail: t('隔壁部门请客，白嫖快乐。'), emoji: '🍰', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：Bug秒解'), detail: t('随便改了一行，居然跑通了。'), emoji: '🐛', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：网速起飞'), detail: t('刷B站一点都不卡。'), emoji: '🚀', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：老板笑脸'), detail: t('虽然不知为何，但总比板着脸好。'), emoji: '😏', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：食堂加肉'), detail: t('阿姨今天手没抖。'), emoji: '🍗', color: 'text-yellow-500' },
  { level: t('小吉'), text: t('今日小吉：不用排队'), detail: t('厕所空旷，空气清新。'), emoji: '✨', color: 'text-yellow-500' },
  { level: t('平平'), text: t('今日平平：一切照旧'), detail: t('不好不坏，又混过一天。'), emoji: '😐', color: 'text-blue-500' },
  { level: t('平平'), text: t('今日平平：假装忙碌'), detail: t('敲击键盘的速度与实际产出成反比。'), emoji: '⌨️', color: 'text-blue-500' },
  { level: t('平平'), text: t('今日平平：准时打卡'), detail: t('晚一分钟算迟到，早一分钟算早退。'), emoji: '⏰', color: 'text-blue-500' },
  { level: t('平平'), text: t('今日平平：5点准时下班'), detail: t('但有人想叫你加班。'), emoji: '👀', color: 'text-blue-500' },
  { level: t('平平'), text: t('今日平平：喝水太多'), detail: t('一天去了8次洗手间，间接摸鱼。'), emoji: '💧', color: 'text-blue-500' },
  { level: t('平平'), text: t('今日平平：忘带耳机'), detail: t('被迫听了一天同事的八卦。'), emoji: '🎧', color: 'text-blue-500' },
  { level: t('平平'), text: t('今日平平：中午吃撑'), detail: t('下午犯困，生产力-50%。'), emoji: '😴', color: 'text-blue-500' },
  { level: t('凶'), text: t('今日凶：天降大锅'), detail: t('不是你的Bug，但要你背锅。'), emoji: '🥘', color: 'text-red-400' },
  { level: t('凶'), text: t('今日凶：产品改需求'), detail: t('刚写完的代码，又要推翻重来。'), emoji: '📝', color: 'text-red-400' },
  { level: t('凶'), text: t('今日凶：钉钉狂响'), detail: t('响了23次，建议提前关机。'), emoji: '🔔', color: 'text-red-400' },
  { level: t('凶'), text: t('今日凶：代码冲突'), detail: t('解Git冲突解到怀疑人生。'), emoji: '💥', color: 'text-red-400' },
  { level: t('凶'), text: t('今日凶：周五发版'), detail: t('发版必崩，周末别想过了。'), emoji: '🔥', color: 'text-red-400' },
  { level: t('凶'), text: t('今日凶：老板查岗'), detail: t('刚好在切后台，被抓个正着。'), emoji: '😱', color: 'text-red-400' },
  { level: t('大凶'), text: t('今日大凶：全盘崩溃'), detail: t('没提交代码？节哀顺变。'), emoji: '💀', color: 'text-red-600' },
  { level: t('大凶'), text: t('今日大凶：连环夺命Call'), detail: t('周报+月报+季报同时催，建议请病假。'), emoji: '📱', color: 'text-red-600' },
  { level: t('大凶'), text: t('今日大凶：右眼狂跳'), detail: t('破财免灾，今天别点贵的奶茶。'), emoji: '💸', color: 'text-red-600' },
];

function NiumaAvatar({ 
  activeTheme, 
  workSeconds, 
  slackSeconds, 
  overtimeSeconds, 
  nowSecs, 
  endSecs 
}: { 
  activeTheme: string, 
  workSeconds: number, 
  slackSeconds: number, 
  overtimeSeconds: number, 
  nowSecs: number, 
  endSecs: number 
}) {
   const isSlackingTooMuch = slackSeconds > 2 * 3600;
   const isWorkingTooMuch = workSeconds > 8 * 3600;
   const isOvertime = overtimeSeconds > 0;
   const isNearOffwork = nowSecs > (endSecs - 3600) && nowSecs < endSecs;

   const baseEmojis: Record<string, string> = {
      default: '🐮',
      cyberpunk: '🤖',
      retro: '👾',
      classic: '🐴'
   };
   
   const emoji = baseEmojis[activeTheme] || '🐮';

   return (
      <div className="relative inline-flex items-center justify-center text-[42px] z-10 w-16 h-16 pointer-events-none">
         {/* Background Auras */}
         {isOvertime && (
            <div className="absolute inset-0 bg-red-500/30 rounded-full blur-md animate-pulse z-0"></div>
         )}
         {isNearOffwork && !isOvertime && (
            <div className="absolute inset-0 bg-green-500/30 rounded-full blur-md animate-pulse z-0"></div>
         )}
         
         {/* Base Emoji */}
         <span className={`relative z-10 filter drop-shadow-md transform hover:scale-110 transition-transform duration-300 ${isOvertime ? 'animate-bounce' : ''}`}>{emoji}</span>
         
         {/* Floating State Icons */}
         {isSlackingTooMuch && (
            <motion.div 
               animate={{ y: [0, -8, 0], x: [0, 4, 0] }}
               transition={{ repeat: Infinity, duration: 2.5 }}
               className="absolute -top-3 -left-3 text-2xl z-20 drop-shadow-sm"
            >
               🐟
            </motion.div>
         )}
         
         {isWorkingTooMuch && !isSlackingTooMuch && !isOvertime && (
            <div className="absolute -top-2 right-0 text-xl z-20 opacity-80 rotate-12 drop-shadow-sm">
               💢
            </div>
         )}
         
         {isNearOffwork && !isOvertime && (
            <motion.div 
               animate={{ x: [0, 5, 0], rotate: [0, 10, -10, 0] }}
               transition={{ repeat: Infinity, duration: 1.5 }}
               className="absolute -bottom-1 -left-2 text-2xl z-20 drop-shadow-sm"
            >
               🏃
            </motion.div>
         )}

         {isOvertime && (
            <div className="absolute -bottom-2 left-0 text-2xl z-20 opacity-90 animate-pulse drop-shadow-sm">
               🔥
            </div>
         )}
         
         <div className="text-xl absolute bottom-0 -right-2 z-30 drop-shadow-lg filter">💻</div>
      </div>
   );
}

const FOCUS_CONTAINERS = [
  { id: 'incense', name: t('线香(25m)'), emoji: '🥢', defaultTime: 25 },
  { id: 'candle', name: t('蜡烛(30m)'), emoji: '🕯️', defaultTime: 30 },
  { id: 'hourglass', name: t('沙漏(45m)'), emoji: '⏳', defaultTime: 45 },
  { id: 'coffee', name: t('咖啡(20m)'), emoji: '☕', defaultTime: 20 },
  { id: 'cigarette', name: t('香烟(10m)'), emoji: '🚬', defaultTime: 10 },
  { id: 'ice', name: t('冰块(15m)'), emoji: '🧊', defaultTime: 15 },
  { id: 'sakura', name: t('樱花(50m)'), emoji: '🌸', defaultTime: 50 },
  { id: 'moon', name: t('月亮(90m)'), emoji: '🌙', defaultTime: 90 },
  { id: 'campfire', name: t('篝火(60m)'), emoji: '🔥', defaultTime: 60 },
  { id: 'ramen', name: t('泡面(5m)'), emoji: '🍜', defaultTime: 5 }
];

const playNoise = (type: string) => {
   getNoiseSynth().play(type);
};

const stopNoise = (type: string) => {
   getNoiseSynth().stop(type);
};

const stopAllNoise = () => {
   getNoiseSynth().stopAll();
};

const MemoItems = React.memo(({ 
  memos, 
  onToggle, 
  onDelete 
}: { 
  memos: any[], 
  onToggle: (idx: number) => void, 
  onDelete: (idx: number) => void 
}) => {
  if (memos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-20 h-20 bg-brand/5 rounded-3xl flex items-center justify-center text-brand/20 border border-brand/10 border-dashed animate-pulse">
          <Plus size={40} />
        </div>
        <div>
          <p className="text-primary font-bold text-lg tracking-tight">{t('今日无事')}</p>
          <p className="text-secondary text-sm mt-1 max-w-[200px] mx-auto opacity-70">{t('勾勒你的今日牛马计划，让时间更有分量。')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {memos.map((memo, idx) => (
        <motion.div 
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          key={memo.id} 
          className={`group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${
            memo.completed 
              ? 'bg-card-inner/30 border-app opacity-40 grayscale' 
              : 'bg-card border-app shadow-sm hover:border-brand/40 hover:shadow-md'
          }`}
        >
           <div className="flex items-center gap-4 flex-1 overflow-hidden" onClick={() => onToggle(idx)}>
              <div className={`shrink-0 transition-transform duration-300 transform ${memo.completed ? 'scale-110 text-brand' : 'text-tertiary group-hover:scale-110'}`}>
                 <CheckCircle size={22} fill={memo.completed ? "currentColor" : "none"} strokeWidth={1.5} />
              </div>
              <span className={`text-[15px] font-medium truncate py-0.5 select-none ${memo.completed ? 'line-through text-secondary' : 'text-primary'}`}>
                {memo.text}
              </span>
           </div>
           <button 
             onClick={(e) => { e.stopPropagation(); onDelete(idx); }} 
             className="text-red-400 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-xl transition-all"
           >
              <Trash2 size={18} />
           </button>
        </motion.div>
      ))}
    </div>
  );
});

const MemoModal = React.memo(({ 
  date, 
  memos, 
  onClose, 
  onSave 
}: { 
  date: string, 
  memos: any[], 
  onClose: () => void, 
  onSave: (date: string, updatedMemos: any[]) => void 
}) => {
  const [localMemos, setLocalMemos] = useState(memos);
  const [text, setText] = useState("");
  
  // Update local state when source memos change (if modal stays open)
  useEffect(() => {
    setLocalMemos(memos);
  }, [memos]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const newMemo = { id: Math.random().toString(), text: text.trim(), completed: false };
    const updated = [...localMemos, newMemo];
    setLocalMemos(updated);
    onSave(date, updated);
    setText("");
  };

  const toggleMemo = useCallback((idx: number) => {
    setLocalMemos(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], completed: !updated[idx].completed };
      onSave(date, updated);
      return updated;
    });
  }, [date, onSave]);

  const deleteMemo = useCallback((idx: number) => {
    setLocalMemos(prev => {
      const updated = [...prev];
      updated.splice(idx, 1);
      onSave(date, updated);
      return updated;
    });
  }, [date, onSave]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-md px-0 md:px-4">
      <motion.div 
        initial={{ y: "100%", opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        exit={{ y: "100%", opacity: 0 }}
        className="bg-card w-full max-w-lg rounded-t-[32px] md:rounded-[32px] shadow-2xl border-t md:border border-app overflow-hidden flex flex-col max-h-[90vh] md:max-h-[80vh] relative"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-3xl rounded-full pointer-events-none" />
        
        <div className="p-6 border-b border-app flex items-center justify-between bg-card-inner relative z-10">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-primary tracking-tight flex items-center gap-2">
              <div className="w-2 h-6 bg-brand rounded-full"></div>
              {t('备忘清单')}
                                      </h3>
            <p className="text-xs text-secondary font-mono mt-0.5 opacity-70">{date}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-card border border-app rounded-2xl text-secondary hover:bg-app hover:text-primary transition-all active:scale-90 shadow-sm border-dashed">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 pt-3 flex-1 overflow-y-auto space-y-4 no-scrollbar relative z-10 min-h-[300px]">
          <MemoItems 
            memos={localMemos.filter(m => !(m.type && m.type.includes('leave')))} 
            onToggle={(idx) => {
              // We need to find the real index
              const realIdx = localMemos.findIndex(m => m.id === localMemos.filter(x => !(x.type && x.type.includes('leave')))[idx].id);
              if (realIdx >= 0) toggleMemo(realIdx);
            }} 
            onDelete={(idx) => {
              const realIdx = localMemos.findIndex(m => m.id === localMemos.filter(x => !(x.type && x.type.includes('leave')))[idx].id);
              if (realIdx >= 0) deleteMemo(realIdx);
            }} 
          />
        </div>

        <div className="p-6 bg-card-inner border-t border-app relative z-10">
          <form onSubmit={handleAdd} className="flex gap-3">
            <div className="flex-1 relative">
              <input 
                type="text" 
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('键入待办事项...')} 
                className="w-full bg-card border border-app rounded-2xl px-5 py-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand shadow-inner text-primary placeholder:text-tertiary transition-all"
              />
            </div>
            <button 
              type="submit" 
              disabled={!text.trim()}
              className="bg-brand text-card w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-brand-hover active:scale-90 transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:grayscale"
            >
              <Plus size={24} strokeWidth={3} />
            </button>
          </form>
          <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
             <div className="h-[1px] w-8 bg-tertiary"></div>
             <span className="text-[10px] text-tertiary font-medium uppercase tracking-[0.1em]">Local Storage Only</span>
             <div className="h-[1px] w-8 bg-tertiary"></div>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

// Extracted Calendar Grid for performance
const CalendarGrid = React.memo(({ 
  calendarDate, 
  localTime, 
  config, 
  memos, 
  onDateClick 
}: { 
  calendarDate: Date, 
  localTime: Date, 
  config: any, 
  memos: any, 
  onDateClick: (key: string) => void 
}) => {
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const startDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
  
  const cells = [];
  // Empty cells
  for (let i = 0; i < startDay; i++) {
    cells.push(<div key={`empty-${i}`} className="h-16 md:h-20 border border-transparent"></div>);
  }
  
  // Day cells
  for (let date = 1; date <= daysInMonth; date++) {
    const d = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), date);
    const dayOfWeek = d.getDay();
    const isStandardWeekend = config.restDays === 2 ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0);
    const isCustomHoliday = isDateCustomHoliday(d, config.holidayRegion);
    const isCustomWorkday = isDateCustomWorkday(d, config.holidayRegion);
    const holidayName = getCustomHolidayName(d, config.holidayRegion);

    const memoKey = `${calendarDate.getFullYear()}-${(calendarDate.getMonth() + 1).toString().padStart(2, '0')}-${date.toString().padStart(2, '0')}`;
    const dayMemos = (memos || {})[memoKey] || [];
    const completedCount = dayMemos.filter((m: any) => m.completed).length;

    const isPaidLeave = dayMemos.some((m: any) => m.type === 'paid_leave');
    const isUnpaidLeave = dayMemos.some((m: any) => m.type === 'unpaid_leave');

    let isRest = ((isStandardWeekend || isCustomHoliday) && !isCustomWorkday) || isPaidLeave || isUnpaidLeave;
    
    let label = t('上班');
    if (isPaidLeave) {
      label = t('带薪休假');
    } else if (isUnpaidLeave) {
      label = t('无薪休假');
    } else if (isRest) {
      label = isStandardWeekend && !isCustomHoliday ? t('休息') : t('假期');
    } else if (isCustomWorkday) {
      label = t('补班');
    }
    
    const isToday = date === localTime.getDate() && calendarDate.getMonth() === localTime.getMonth() && calendarDate.getFullYear() === localTime.getFullYear();
    
    cells.push(
      <motion.div 
        key={date} 
        whileTap={{ scale: 0.95 }}
        onClick={() => onDateClick(memoKey)}
        className={`h-16 md:h-20 flex flex-col items-center justify-center rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
          isToday ? 'bg-brand/10 border-brand shadow-[0_0_15px_rgba(0,255,65,0.2)] z-10' : 
          isRest ? 'bg-card border-transparent text-secondary/60' : 'bg-card-inner border-app shadow-sm hover:border-brand/30'
        }`}
      >
        {isToday && <div className="absolute top-2 right-2 w-2 h-2 bg-brand rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,65,0.8)]"></div>}
        
        {dayMemos.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-0.5">
            {dayMemos.slice(0, 3).map((m: any, idx: number) => {
              if (m.type === 'paid_leave' || m.type === 'unpaid_leave') return null;
              return <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors ${m.completed ? 'bg-brand/30' : 'bg-brand shadow-[0_0_4px_rgba(0,255,65,0.5)]'}`}></div>;
            })}
            {dayMemos.filter((m: any) => m.type !== 'paid_leave' && m.type !== 'unpaid_leave').length > 3 && <div className="w-1 h-1 rounded-full bg-brand/20"></div>}
          </div>
        )}
        
        <span className={`text-base md:text-xl font-bold mb-0.5 transition-colors group-hover:text-brand ${isToday ? 'text-primary' : 'text-primary'}`}>{date}</span>
        
        {isPaidLeave || isUnpaidLeave ? (
           <span className={`text-[8px] md:text-[10px] font-bold leading-tight text-center truncate px-1 rounded-md border shadow-sm ${isPaidLeave ? 'text-blue-500 bg-blue-500/10 border-blue-500/20' : 'text-orange-500 bg-orange-500/10 border-orange-500/20'}`}>{label}</span>
        ) : holidayName ? (
          <span className="text-[8px] md:text-[10px] text-orange-500 font-bold leading-tight text-center truncate px-1 w-full max-w-[90%] bg-orange-500/10 rounded-md border border-orange-500/20">{holidayName}</span>
        ) : isCustomWorkday ? (
          <span className="text-[8px] md:text-[10px] text-red-500 font-bold leading-tight text-center truncate px-1 bg-red-500/10 rounded-md border border-red-500/20 shadow-sm">{label}</span>
        ) : (
          <div className="flex items-center gap-1">
             <span className={`text-[9px] md:text-[11px] font-medium ${isToday ? 'text-brand' : (isRest ? 'text-secondary/50' : 'text-tertiary')}`}>{label}</span>
             {dayMemos.length > 0 && completedCount === dayMemos.length && !isPaidLeave && !isUnpaidLeave && <span className="text-[10px]">✅</span>}
          </div>
        )}
      </motion.div>
    );
  }
  
  return (
    <div className="grid grid-cols-7 gap-2 text-center">
      {cells}
    </div>
  );
});

function FocusVisualizer({ 
  containerId, 
  timeLeft, 
  lengthMins, 
  isActive 
}: { 
  containerId: string, 
  timeLeft: number, 
  lengthMins: number, 
  isActive: boolean 
}) {
   const totalSecs = lengthMins * 60;
   const progress = 1 - (timeLeft / totalSecs); // 0 to 1
   const ratio = timeLeft / totalSecs; // 1 to 0
   const isLast5Mins = timeLeft <= 300 && timeLeft > 0;
   const isDone = timeLeft === 0;

   // Base renderer 
   let visual = null;
   const container = FOCUS_CONTAINERS.find(c => c.id === containerId);

   if (containerId === 'incense') {
      visual = (
         <div className="relative w-6 h-40 flex flex-col justify-end items-center mx-auto">
           <div 
             className="w-1.5 bg-gradient-to-t from-[#8E614A] to-[#D3A98F] rounded-t-full relative transition-[height] duration-1000 ease-linear shadow-[inset_0_0_2px_rgba(0,0,0,0.5)] overflow-visible"
             style={{ height: `${Math.max(2, ratio * 100)}%` }}
           >
              {(isActive || timeLeft !== totalSecs) && timeLeft > 0 && (
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full animate-pulse transition-colors duration-1000 ${isLast5Mins ? 'bg-red-500 shadow-[0_0_12px_rgba(255,0,0,1)]' : 'bg-gradient-to-r from-red-500 to-orange-400 shadow-[0_0_8px_rgba(255,165,0,0.8)]'}`}>
                  {isActive && (
                    <motion.div 
                      key="smoke"
                      initial={{ opacity: 0, y: 0, scale: 0.8 }}
                      animate={{ opacity: [0, isLast5Mins ? 0.8 : 0.5, 0], y: -50, scale: isLast5Mins ? 2 : 1.5, x: [0, -15, 20, -10] }}
                      transition={{ duration: isLast5Mins ? 2 : 3, repeat: Infinity, ease: "linear" }}
                      className={`absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-12 blur-md rounded-full pointer-events-none ${isLast5Mins ? 'bg-orange-500/30' : 'bg-gray-300/40'}`}
                    />
                  )}
                </div>
              )}
           </div>
           <div className={`w-1.5 absolute bottom-3 bg-[#A0A0A0] transition-[height] duration-1000 rounded-b opacity-80`} style={{ height: `${progress * 100}%` }}></div>
           <div className="w-16 h-3 bg-gradient-to-b from-[#555] to-[#333] rounded-b-xl border-t-2 border-[#fff]/10 shadow-[0_4px_10px_rgba(0,0,0,0.5)] shrink-0 z-10"></div>
           <div className="w-20 h-1 bg-black/20 blur-sm rounded-full mt-1"></div>
         </div>
      );
   } else if (containerId === 'candle') {
      visual = (
         <div className="relative w-16 h-32 flex flex-col justify-end items-center mb-4">
            <div 
               className="w-12 bg-gradient-to-b from-yellow-50 to-orange-100 rounded-t-xl transition-all duration-1000 ease-linear shadow-[inset_-2px_0_5px_rgba(0,0,0,0.1)] relative"
               style={{ height: `${Math.max(20, ratio * 100)}%` }}
            >
                {isActive && timeLeft > 0 && (
                   <motion.div 
                     animate={{ opacity: [0.8, 1, 0.8], scale: [0.9, 1.1, 0.9], y: [-2, 2, -2] }}
                     transition={{ duration: 1, repeat: Infinity }}
                     className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-8 bg-gradient-to-t from-orange-500 to-yellow-200 rounded-full blur-[2px] opacity-80"
                   />
                )}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-3 bg-gray-700/80 rounded-t-sm"></div>
            </div>
            <div className="w-16 h-2 bg-amber-800 rounded-b border-t border-amber-900 z-10 shrink-0"></div>
         </div>
      );
  } else if (containerId === 'coffee' || containerId === 'ramen') {
      const isRamen = containerId === 'ramen';
      visual = (
         <div className="relative w-24 h-24 flex justify-center items-center mb-4">
            <div className={`text-6xl filter drop-shadow-xl ${progress === 0 ? 'grayscale opacity-50' : ''}`}>
               {isRamen ? '🍜' : '☕'}
            </div>
            {(isActive || progress < 1) && progress > 0 && (
               <motion.div 
                 initial={{ opacity: 0, y: 0 }}
                 animate={{ opacity: [0, progress * 0.6, 0], y: -30 - (progress * 20), x: [0, 10, -5] }}
                 transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                 className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-12 bg-white/30 blur-md rounded-full pointer-events-none"
               />
            )}
         </div>
      );
  } else if (containerId === 'cigarette') {
      visual = (
         <div className="relative w-40 h-8 flex justify-end items-center mb-8">
            <div className="absolute right-0 w-8 h-6 bg-orange-600/80 rounded-r-md border border-orange-800/20 shadow-inner"></div>
            <div 
              className="h-6 bg-[#f8f9fa] border-y border-gray-100 rounded-l-sm flex justify-start items-center transition-[width] duration-1000 ease-linear shadow-sm"
              style={{ width: `${Math.max(10, progress * 100)}%` }}
            >
               {(isActive || progress < 1) && progress > 0 && (
                  <div className="w-1.5 h-6 bg-red-500 rounded-l-full shadow-[0_0_10px_rgba(255,0,0,0.8)] animate-pulse relative">
                     {isActive && (
                       <motion.div 
                         initial={{ opacity: 0, y: 0, x: 0, scale: 0.8 }}
                         animate={{ opacity: [0, 0.4, 0], y: -40, x: -20, scale: 2 }}
                         transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                         className="absolute -top-2 -left-2 w-4 h-10 bg-gray-300/30 blur-md rounded-full pointer-events-none"
                       />
                     )}
                  </div>
               )}
            </div>
            {/* Ashes line */}
            <div className="flex-1 h-2 mx-1 flex items-center justify-start opacity-30">
               {progress < 0.8 && <div className="w-4 h-1.5 bg-gray-600 rounded blur-[1px]"></div>}
               {progress < 0.5 && <div className="w-6 h-1 bg-gray-700 rounded blur-[1px] ml-1"></div>}
               {progress < 0.2 && <div className="w-4 h-2 bg-gray-500 rounded blur-[1.5px] ml-1"></div>}
            </div>
         </div>
      );
  } else if (containerId === 'ice') {
      visual = (
         <div className="relative w-32 h-32 flex justify-center items-center mb-4">
            <div 
               className="bg-blue-100/40 backdrop-blur-md border border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.4)] flex justify-center items-center transition-all duration-1000 ease-linear"
               style={{ 
                 width: `${Math.max(20, progress * 100)}%`, 
                 height: `${Math.max(20, progress * 100)}%`,
                 borderRadius: `${10 + (1-progress)*40}%`
               }}
            >
               <div className="w-1/2 h-1/2 bg-white/30 rounded-full blur-sm absolute top-2 left-2"></div>
               {isActive && progress > 0 && (
                 <motion.div
                   animate={{ y: [0, 40], opacity: [1, 0] }}
                   transition={{ duration: 2, repeat: Infinity, ease: "easeIn" }}
                   className="absolute bottom-[-10px] w-2 h-2 bg-blue-200/60 rounded-full blur-[0.5px]"
                 />
               )}
            </div>
            {/* Water puddle */}
            {progress < 1 && (
               <div 
                 className="absolute -bottom-4 bg-blue-200/20 backdrop-blur-sm rounded-[100%] transition-all duration-1000"
                 style={{ width: `${60 + (1-progress)*40}%`, height: '20px' }}
               />
            )}
         </div>
      );
  } else if (containerId === 'sakura') {
      visual = (
         <div className="relative w-32 h-40 flex justify-center items-end mb-4 overflow-hidden">
            <div className={`text-6xl absolute z-10 transition-opacity duration-1000 ${progress === 0 ? 'opacity-20 grayscale' : 'opacity-100'}`}>🌸</div>
            {isActive && progress > 0 && Array.from({length: 3}).map((_, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: -40, x: (Math.random() - 0.5) * 40, rotate: 0 }}
                  animate={{ opacity: [0, 1, 0], y: 60, x: (Math.random() - 0.5) * 60, rotate: 360 }}
                  transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: i * 1.5 }}
                  className="absolute z-20 text-sm text-pink-300 drop-shadow-sm pointer-events-none"
                >
                  ✿
                </motion.div>
            ))}
            {/* fallen leaves */}
            <div className="absolute bottom-0 w-full h-8 flex justify-center items-end gap-1 opacity-60">
               {progress < 0.8 && <span className="text-xs text-pink-300 -rotate-12 translate-y-1">✿</span>}
               {progress < 0.5 && <span className="text-[10px] text-pink-300 rotate-45 translate-y-2">✿</span>}
               {progress < 0.2 && <span className="text-xs text-pink-300 rotate-90 w-4 translate-x-2">✿</span>}
            </div>
         </div>
      );
  } else if (containerId === 'moon') {
      visual = (
         <div className="relative w-40 h-40 flex justify-center items-center mb-4 border-b border-primary/10 overflow-hidden">
            <motion.div 
               className="absolute w-20 h-20 bg-yellow-100 rounded-full shadow-[0_0_30px_rgba(255,255,200,0.8)] flex justify-center items-center"
               style={{
                  top: `${20 + (1-progress)*60}%`,
                  left: `${10 + (1-progress)*80}%`,
                  opacity: progress + 0.2
               }}
            >
               <div className="w-6 h-6 bg-black/10 rounded-full absolute top-4 left-4 blur-[2px]"></div>
               <div className="w-8 h-8 bg-black/5 rounded-full absolute bottom-4 right-2 blur-[1px]"></div>
            </motion.div>
         </div>
      );
  } else if (containerId === 'campfire') {
      visual = (
         <div className="relative w-32 h-32 flex justify-center items-end flex-col mb-4">
            <div className="relative w-full h-24 flex justify-center items-end mb-2">
               {(isActive || progress < 1) && progress > 0 && (
                 <>
                   <motion.div 
                     animate={{ height: [`${progress*100}%`, `${progress*80}%`, `${progress*110}%`] }}
                     transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
                     className="absolute bottom-1 w-6 rounded-t-full bg-yellow-400 blur-[2px] opacity-80 mix-blend-screen"
                   />
                   <motion.div 
                     animate={{ height: [`${progress*80}%`, `${progress*120}%`, `${progress*70}%`] }}
                     transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
                     className="absolute bottom-1 -left-2 w-8 rounded-t-full bg-orange-500 blur-[3px] opacity-90 mix-blend-screen"
                   />
                   <motion.div 
                     animate={{ height: [`${progress*110}%`, `${progress*70}%`, `${progress*90}%`] }}
                     transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                     className="absolute bottom-1 -right-2 w-8 rounded-t-full bg-red-500 blur-[4px] opacity-70 mix-blend-screen"
                   />
                 </>
               )}
            </div>
            {/* Logs connecting to ember */}
            <div className="relative w-16 h-8 flex justify-center items-center shrink-0">
               <div className="absolute w-14 h-4 bg-amber-900 rounded-sm rotate-12 border border-black/40 shadow-xl overflow-hidden">
                 <div className="w-full h-full bg-black/40 transition-opacity duration-1000" style={{opacity: 1-progress}}></div>
               </div>
               <div className="absolute w-14 h-4 bg-amber-800 rounded-sm -rotate-12 border border-black/40 shadow-xl overflow-hidden">
                 <div className="w-full h-full bg-black/40 transition-opacity duration-1000" style={{opacity: 1-progress}}></div>
               </div>
               {(isActive || progress < 1) && progress > 0 && (
                 <motion.div 
                   animate={{ opacity: [0.5, 1, 0.5] }}
                   transition={{ duration: 2, repeat: Infinity }}
                   className="absolute w-6 h-2 bg-orange-500 blur-[2px] rounded-full"
                 />
               )}
            </div>
         </div>
      );
  } else {
      // generic emoji fallback for others
      visual = (
         <div className="relative w-32 h-32 flex justify-center items-center mb-4">
            <div className={`text-7xl transition-all duration-1000 filter drop-shadow-xl ${progress === 0 ? 'grayscale opacity-50' : ''}`} style={{
                transform: `scale(${0.8 + progress * 0.2}) translateY(${ isActive ? Math.sin(progress*100)*5 : 0 }px)`
            }}>
               {container.emoji}
            </div>
         </div>
      );
  }

   return (
      <div className="relative w-full flex flex-col items-center justify-center min-h-[220px]">
         <div className="flex-1 flex items-end justify-center mb-6 z-0">
            {visual}
         </div>
         <div className="text-[3.5rem] font-mono font-bold text-primary tabular-nums tracking-tighter filter drop-shadow-lg z-10 leading-none">
           {pad0(Math.floor(timeLeft / 60))}:{pad0(Math.floor(timeLeft % 60))}
         </div>
      </div>
   );
}

export default function App() {
  const [profiles, setProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('niuma_profiles');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [];
  });
  const [currentProfileName, setCurrentProfileName] = useState('');
  
  useEffect(() => {
    localStorage.setItem('niuma_profiles', JSON.stringify(profiles));
  }, [profiles]);
  const [isLightMode, setIsLightMode] = useState(() => {
    const saved = localStorage.getItem('isLightMode');
    return saved ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('isLightMode', isLightMode.toString());
    if (isLightMode) {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  }, [isLightMode]);

  const [config, setConfig] = useState(() => {
    const defaultConfig = {
      monthlySalary: 25000,
      holidayRegion: 'CN',
      restDays: 2, // 2 for double rest, 1 for single
      hoursPerDay: 8,
      exchangeRateUsd: 6.80,
      joinDate: '2021-06-01',
      firstPayDate: '2021-07-05',
      payday: 5,
      startTime: '09:00',
      endTime: '18:00',
      hasLunchBreak: true,
      lunchStartTime: '12:00',
      lunchEndTime: '13:00',
      customEvents: [{ id: '1', name: t('纪念日'), date: '2022-01-01', color: 'purple' }],
      retirementDate: '2050-01-01',
      otherTimezone: 'Asia/Ho_Chi_Minh',
      otherTimezoneLabel: t('胡志明'),
      localTimezone: initialTz.value,
      localTimezoneLabel: initialTz.label,
      customItemName: t('自定义'), 
      customItemPrice: 100,
      pomodoroStartSound: 'none',
      pomodoroEndSound: 'bell',
      pomodoroBreakSound: 'chime',
      avatarTheme: 'default',
    };
    try {
      const savedConfig = localStorage.getItem('niuma_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const merged = { ...defaultConfig, ...(parsed || {}) };
        if (!merged.customEvents && merged.customEventName) {
          merged.customEvents = [{ id: Math.random().toString(), name: merged.customEventName, date: merged.customEventDate || '2000-01-01', color: 'purple' }];
        }
        return merged;
      }
    } catch(e) {}
    return defaultConfig;
  });
  
  useEffect(() => {
    localStorage.setItem('niuma_config', JSON.stringify(config));
  }, [config]);




  const [runtimeState] = useState(() => {
    try {
      const saved = localStorage.getItem('niuma_runtime_state');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return null;
  });
  
  const todayStr = new Date().toLocaleDateString("en-US", {timeZone: config.localTimezone});
  const isSameDay = runtimeState?.date === todayStr;
  const timeSinceLastTick = Math.max(0, (Date.now() - (runtimeState?.lastGlobalTick || Date.now())) / 1000);

  const [dailyFortune, setDailyFortune] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('niuma_fortune');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === todayStr) return parsed.fortune;
      }
    } catch(e) {}
    return null;
  });
  const [fortuneModalOpen, setFortuneModalOpen] = useState(false);
  
  const drawFortune = useCallback(() => {
    if (dailyFortune) {
      setFortuneModalOpen(true);
      return;
    }
    const r = Math.floor(Math.random() * FORTUNES.length);
    const fortune = FORTUNES[r];
    setDailyFortune(fortune);
    setFortuneModalOpen(true);
    localStorage.setItem('niuma_fortune', JSON.stringify({ date: todayStr, fortune }));
  }, [todayStr, dailyFortune]);

  // === Pomodoro State ===
  const [pomodoroContainer, setPomodoroContainer] = useState(() => localStorage.getItem('pomodoroContainer') || 'incense');
  const [activeBgms, setActiveBgms] = useState<string[]>(() => {
    try {
       const saved = localStorage.getItem('activeBgms');
       if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [];
  });

  useEffect(() => localStorage.setItem('pomodoroContainer', pomodoroContainer), [pomodoroContainer]);
  useEffect(() => localStorage.setItem('activeBgms', JSON.stringify(activeBgms)), [activeBgms]);

  // Simplified playback logic
  useEffect(() => {
    // Just restore if needed
    const allSupportedBgms = ['rain', 'fire', 'train', 'ocean', 'birds', 'wind', 'stream', 'keyboard', 'clock'];
    allSupportedBgms.forEach(bgm => {
       if (activeBgms.includes(bgm)) {
          // Will only play if not already playing due to internal check
          playNoise(bgm);
       }
    });
  }, []); // Run ONCE on mount

  const [pomodoroLength, setPomodoroLength] = useState(() => runtimeState?.pomodoroLength ?? 25); // in minutes
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(() => {
    if (runtimeState?.pomodoroTimeLeft !== undefined) {
      if (runtimeState.isPomodoroActive) {
         return Math.max(0, runtimeState.pomodoroTimeLeft - timeSinceLastTick);
      }
      return runtimeState.pomodoroTimeLeft;
    }
    return 25 * 60;
  }); // in seconds
  const [isPomodoroActive, setIsPomodoroActive] = useState(() => {
    if (runtimeState?.isPomodoroActive && runtimeState?.pomodoroTimeLeft !== undefined) {
       return (runtimeState.pomodoroTimeLeft - timeSinceLastTick > 0);
    }
    return false;
  });
  const [pomodoroTask, setPomodoroTask] = useState(() => runtimeState?.pomodoroTask ?? "");
  const [completedPomodoros, setCompletedPomodoros] = useState(() => runtimeState?.completedPomodoros ?? 0);

  // === Reminder State ===
  const [reminderText, setReminderText] = useState(t('该摸一会儿鱼了，休息一下！'));
  const [reminderMins, setReminderMins] = useState(30);
  const [isReminderActive, setIsReminderActive] = useState(false);
  const [reminderTimeLeft, setReminderTimeLeft] = useState(30 * 60);

  // === Refs for Background Ticking ===
  const pomodoroTimeLeftRef = useRef(pomodoroTimeLeft);
  pomodoroTimeLeftRef.current = pomodoroTimeLeft;
  const isPomodoroActiveRef = useRef(isPomodoroActive);
  isPomodoroActiveRef.current = isPomodoroActive;
  
  const reminderTimeLeftRef = useRef(reminderTimeLeft);
  reminderTimeLeftRef.current = reminderTimeLeft;
  const isReminderActiveRef = useRef(isReminderActive);
  isReminderActiveRef.current = isReminderActive;
  const reminderMinsRef = useRef(reminderMins);
  reminderMinsRef.current = reminderMins;
  const reminderTextRef = useRef(reminderText);
  reminderTextRef.current = reminderText;

  const togglePomodoro = () => {
    if (!isPomodoroActive && 'Notification' in window && Notification.permission === "default") {
       Notification.requestPermission().catch(()=>{});
    }
    if (!isPomodoroActive) {
      playAlertSound(config.pomodoroStartSound);
    }
    setIsPomodoroActive(!isPomodoroActive);
  };

  const resetPomodoro = () => {
    setIsPomodoroActive(false);
    setPomodoroTimeLeft(pomodoroLength * 60);
  };
  
  const handlePomodoroLengthChange = (mins) => {
     setPomodoroLength(mins);
     setPomodoroTimeLeft(mins * 60);
     setIsPomodoroActive(false);
  };

  // === Memo State ===
  const [memos, setMemos] = useState(() => {
    try {
      const saved = localStorage.getItem('niuma_memos');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed || {};
      }
    } catch(e) {}
    return {};
  });

  useEffect(() => {
    localStorage.setItem('niuma_memos', JSON.stringify(memos));
  }, [memos]);

  const [selectedMemoDate, setSelectedMemoDate] = useState(null);

  const [activeTab, setActiveTab] = useState('home');
  const [showAllCountdowns, setShowAllCountdowns] = useState(false);
  const [conversionTimeframe, setConversionTimeframe] = useState<'today'|'month'|'year'>('today');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImgUrl, setShareImgUrl] = useState('');
  const shareRef = useRef<HTMLDivElement>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  const [now, setNow] = useState(new Date());
  
  const localTime = useMemo(() => new Date(now.toLocaleString("en-US", {timeZone: config.localTimezone})), [now, config.localTimezone]);

  const initialLeaveDate = `${localTime.getFullYear()}-${(localTime.getMonth() + 1).toString().padStart(2, '0')}-${localTime.getDate().toString().padStart(2, '0')}`;
  const [leaveDateStr, setLeaveDateStr] = useState(initialLeaveDate);
  
  const generateShareImage = async () => {
    if (!shareRef.current) return;
    try {
      const canvas = await html2canvas(shareRef.current, { backgroundColor: null, scale: 2 });
      setShareImgUrl(canvas.toDataURL('image/png'));
      setShowShareModal(true);
    } catch (err) {
      console.error('Failed to generate sharing image:', err);
    }
  };
  
  // Dynamic average work days calculated to represent 'hourly rate' today. Let's use the current month for calculation.
  const currentMonthWorkDays = useMemo(() => {
    return getWorkDaysInMonth(localTime.getFullYear(), localTime.getMonth(), config.holidayRegion, config.restDays);
  }, [localTime.getFullYear(), localTime.getMonth(), config.holidayRegion, config.restDays]);

  /* Moved hourlyRate below */

  const [isSlacking, setIsSlacking] = useState(() => isSameDay ? (runtimeState?.isSlacking ?? false) : false);
  const [toast, setToast] = useState<{message: string, type: 'info'|'warn'}|null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [newReimbDesc, setNewReimbDesc] = useState('');
  const [newReimbAmount, setNewReimbAmount] = useState('');
  const [newReimbCurrency, setNewReimbCurrency] = useState('CNY');
  const [exportRates, setExportRates] = useState(() => {
     try {
         const r = localStorage.getItem('exportRates');
         if (r) return JSON.parse(r);
     } catch(e) {}
     return { USD_TO_CNY: 7.2, THB_TO_CNY: 0.2, VND_TO_CNY: 0.0003 };
  });
  useEffect(() => localStorage.setItem('exportRates', JSON.stringify(exportRates)), [exportRates]);
  const [showExportModal, setShowExportModal] = useState(false);

  const handleMemoModalClose = useCallback(() => {
    setSelectedMemoDate(null);
  }, []);

  const handleMemoModalSave = useCallback((date: string, updatedMemos: any[]) => {
    setMemos((prev: any) => ({
      ...prev,
      [date]: updatedMemos
    }));
  }, []);

  const toggleLeaveType = useCallback((type: string) => {
    setMemos((prev: any) => {
       const prevMemos = prev[leaveDateStr] || [];
       const hasLeaveType = prevMemos.some((m: any) => m.type === type);
       let newMemos = prevMemos.filter((m: any) => !(m.type && m.type.includes('leave')));
       if (!hasLeaveType) {
          newMemos.unshift({
             id: 'sys_leave_' + Date.now(),
             text: type === 'paid_leave' ? t('🌟 带薪假') : t('🍂 无薪假'),
             type,
             completed: true
          });
       }
       return { ...prev, [leaveDateStr]: newMemos };
    });
  }, [leaveDateStr]);

  const handleDateClick = useCallback((key: string) => {
    setSelectedMemoDate(key);
  }, []);
  const [isOvertime, setIsOvertime] = useState(() => isSameDay ? (runtimeState?.isOvertime ?? false) : false);
  const [showMoney, setShowMoney] = useState(true);
  const [showUSD, setShowUSD] = useState(false);
  const [excuse, setExcuse] = useState(t('刚刚我的键盘卡主了，我在测试硬件抗冲击力...'));
  
  const generateExcuse = () => {
    const excuses = [
      t('报告老板，我的键盘正在进行系统级的自我净化。'),
      t('正在等npm装包，进度条卡在99%已经十分钟了。'),
      t('我在测试系统的抗压能力，顺便研究下缓存为什么没失效。'),
      t('刚才闭眼是在做需求可视化，绝不是在打盹。'),
      t('领导，这叫敏捷开发中的‘战略性停顿’。'),
      t('不是在发呆，是在和产品的灵魂深切对话，寻找业务痛点。'),
      t('眼睛干涩，正在执行医嘱：眺望远方20英尺外20秒。'),
      t('这不是摸鱼，这是在为下一行能够改变世界的代码积攒灵感。'),
      t('我在思考如何重构底层的屎山代码，太复杂了脑壳疼。'),
      t('正在查阅行业前沿资料，分析竞品的最新动态。'),
      t('刚才在想中午跟同事去吃哪家对团队建设最有帮助。'),
      t('本地环境崩了，正在重新配，太难了！'),
      t('刚才在尝试通过量子纠缠的方式远程修复Bug。'),
      t('我在观察办公室的空气动力学，为了提高工位效率。'),
      t('正在深度思考Carbon在未来的地位。'),
      t('其实我是在做深度呼吸训练，以此降低服务器的碳排放。'),
      t('刚才那个姿势是在模仿罗丹的‘思考者’，试图获得哲学加持。'),
      t('我发现代码里有一个逻辑漏洞，正在脑海中跑虚拟机测试。'),
      t('正在计算公司上市后我手里的期权能买几斤猪肉。'),
      t('老板，我正在用意念与服务器进行底层协议握手。'),
      t('这不叫迟到，这叫‘分布式时差办公’。'),
      t('我在研究黑洞，因为我感觉我的逻辑被吞噬了。'),
      t('刚才是幻觉，我刚才其实在另一个平行宇宙已经写完需求了。'),
      t('我在测试鼠标垫的摩擦系数，确保拖动代码时的极致丝滑。'),
      t('刚才那个眼神是在扫描办公室的安全漏洞。'),
      t('正在等待宇宙射线的干扰消失，否则代码会产生位翻转。'),
      t('我在通过心跳频率判断代码的运行效率。'),
      t('刚才闭眼是在跟AI贾维斯灵魂沟通。'),
      t('这不叫偷懒，这叫给CPU降频以延长企业资产寿命。'),
      t('我正在进行语义分析，试图理解产品经理那句‘简单改下’背后的含义。'),
      t('我在跟桌上的橡皮鸭解释为何这段代码它就是跑不通。'),
      t('正在等咖啡机的进度条，那才是我的生命值进度条。'),
      t('刚才是在测试办公室的隔音效果。'),
      t('我在思考如果人类灭绝了，这段代码还能不能继续运行下去。'),
      t('我在进行‘离散数学交互演习’。'),
      t('刚才那个哈欠是在排出大脑多余的冗余数据。'),
      t('老板，我在给代码做心理辅导，它最近有点抗拒生产环境。'),
      t('我在研究如何用5G信号控制我的午餐外卖。'),
      t('刚才低头是在感叹人生如戏，全是Bug。'),
      t('我在寻找代码中的‘艺术感’。'),
      t('正在进行高强度的脑机接口测试。'),
      t('这叫‘内省式开发’，在安静中寻找逻辑的真谛。'),
      t('我在为下个季度的KPI提前担忧，导致焦虑性停工。'),
      t('正在试图用‘原力’修复那段该死的旧代码。'),
      t('老板，我正在试图突破由于过度工作造成的维度障壁。'),
      t('我在思考如何把这个项目做成元宇宙模式。'),
      t('刚才其实是在对代码进行‘无声的抗议’。'),
      t('我在估算如果我现在跳槽，公司的损失会有多大。'),
      t('我在试图理解人类存在的意义，顺便写个Hello World。'),
      t('我在跟空调的风向进行斗争。'),
      t('正在跟自己的影子对需求。'),
      t('刚才是灵魂出窍，去巡查了一下机房。'),
      t('我在练习如何用眼神杀掉一个Bug。'),
      t('这叫‘意识流编码’，我正在积攒流量。')
    ];
    setExcuse(excuses[Math.floor(Math.random() * excuses.length)]);
  };

  // Accumulated data
  const [slackSecondsToday, setSlackSecondsToday] = useState(() => {
    if (isSameDay) {
       let base = runtimeState?.slackSecondsToday || 0;
       if (runtimeState?.isSlacking) base += timeSinceLastTick;
       return base;
    }
    return 0;
  });
  const [overtimeSecondsToday, setOvertimeSecondsToday] = useState(() => {
    if (isSameDay) {
       let base = runtimeState?.overtimeSecondsToday || 0;
       if (runtimeState?.isOvertime) base += timeSinceLastTick;
       return base;
    }
    return 0;
  });
  
  const runtimeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (runtimeSaveTimerRef.current) clearTimeout(runtimeSaveTimerRef.current);
    runtimeSaveTimerRef.current = setTimeout(() => {
      const d = new Date().toLocaleDateString("en-US", {timeZone: config.localTimezone});
      localStorage.setItem('niuma_runtime_state', JSON.stringify({
        date: d,
        slackSecondsToday,
        overtimeSecondsToday,
        isSlacking,
        isOvertime,
        pomodoroTimeLeft,
        pomodoroLength,
        isPomodoroActive,
        pomodoroTask,
        completedPomodoros,
        lastGlobalTick: Date.now()
      }));
    }, 10000);
    return () => { if (runtimeSaveTimerRef.current) clearTimeout(runtimeSaveTimerRef.current); };
  }, [config.localTimezone, slackSecondsToday, overtimeSecondsToday, isSlacking, isOvertime, pomodoroTimeLeft, pomodoroLength, isPomodoroActive, pomodoroTask, completedPomodoros]);

  // Real-time timepieces and lunar
  const otherTime = new Date(now.toLocaleString("en-US", {timeZone: config.otherTimezone}));
  const lunar = Solar.fromDate(localTime).getLunar();
  const lunarDateStr = getLanguage() === 'zh'
    ? `${t('农历')}${lunar.getMonthInChinese()}${t('月')}${lunar.getDayInChinese()} ${lunar.getYearInGanZhi()}${t('年')}`
    : tf('农历 {m}/{d} {gz}', { m: Math.abs(lunar.getMonth()), d: lunar.getDay(), gz: ZODIAC_EN[lunar.getYearShengXiao()] ?? lunar.getYearInGanZhi() });

  // Work calculation
  const getSecondsFromMidnight = (timeStr: string) => {
    const [h,m] = timeStr.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60;
  };

    const nowSecs = localTime.getHours() * 3600 + localTime.getMinutes() * 60 + localTime.getSeconds();
  /* Moved again */
  const startSecs = getSecondsFromMidnight(config.startTime);
  const endSecs = getSecondsFromMidnight(config.endTime);
  const lunchStartSecs = getSecondsFromMidnight(config.lunchStartTime);
  const lunchEndSecs = getSecondsFromMidnight(config.lunchEndTime);

  const derivedHoursPerDay = useMemo(() => {
    let totalSecs = endSecs > startSecs ? endSecs - startSecs : (endSecs + 24 * 3600) - startSecs;
    if (config.hasLunchBreak) {
      const lunchSecs = Math.max(0, lunchEndSecs > lunchStartSecs ? lunchEndSecs - lunchStartSecs : (lunchEndSecs + 24 * 3600) - lunchStartSecs);
      totalSecs = Math.max(0, totalSecs - lunchSecs);
    }
    return totalSecs / 3600 || 8; // fallback to 8 if 0
  }, [startSecs, endSecs, lunchStartSecs, lunchEndSecs, config.hasLunchBreak]);

  const hourlyRate = config.monthlySalary / ((currentMonthWorkDays || 22) * (derivedHoursPerDay || 8));
  const minuteRate = hourlyRate / 60;
  const secondRate = minuteRate / 60;

  const isPublicHoliday = useMemo(() => {
    return isDateCustomHoliday(localTime, config.holidayRegion);
  }, [localTime, config.holidayRegion]);

  const isMakeUpWorkday = useMemo(() => {
    return isDateCustomWorkday(localTime, config.holidayRegion);
  }, [localTime, config.holidayRegion]);

  const memoTodayStr = `${localTime.getFullYear()}-${(localTime.getMonth() + 1).toString().padStart(2, '0')}-${localTime.getDate().toString().padStart(2, '0')}`;
  const todayMemos = (memos || {})[memoTodayStr] || [];
  const isTodayPaidLeave = todayMemos.some((m: any) => m.type === 'paid_leave');
  const isTodayUnpaidLeave = todayMemos.some((m: any) => m.type === 'unpaid_leave');

  const todayDay = localTime.getDay();
  const isWeekend = (config.restDays === 2 && (todayDay === 0 || todayDay === 6)) || (config.restDays === 1 && todayDay === 0);
  const isHolidayOrWeekend = (isWeekend || isPublicHoliday) && !isMakeUpWorkday;
  const isRestDay = isHolidayOrWeekend || isTodayPaidLeave || isTodayUnpaidLeave;
  
  let restTypeLabel = t('周末休息');
  const todayHolidayName = getCustomHolidayName(localTime, config.holidayRegion);
  if (isTodayPaidLeave) {
     restTypeLabel = t('带薪休假');
  } else if (isTodayUnpaidLeave) {
     restTypeLabel = t('无薪休假');
  } else if (todayHolidayName) {
     restTypeLabel = tf('{name}假期', { name: todayHolidayName });
  }
  
  const isLunchBreak = config.hasLunchBreak && nowSecs >= lunchStartSecs && nowSecs < lunchEndSecs;
  const isCurrentlyWorkingTime = !isRestDay && nowSecs >= startSecs && nowSecs < endSecs && !isLunchBreak;

  let autoWorkSecs = 0;
  if (!isRestDay && nowSecs > startSecs) {
    autoWorkSecs = Math.min(nowSecs, endSecs) - startSecs;
    if (config.hasLunchBreak) {
      if (nowSecs > lunchStartSecs) {
         autoWorkSecs -= (Math.min(nowSecs, lunchEndSecs) - lunchStartSecs);
      }
    }
  } else if (isTodayPaidLeave) {
    // Treat paid leave as if fully worked until now, or full day if past end time (for earning calculation context)
    if (nowSecs > startSecs) {
       autoWorkSecs = Math.min(nowSecs, endSecs) - startSecs;
       if (config.hasLunchBreak && nowSecs > lunchStartSecs) {
          autoWorkSecs -= (Math.min(nowSecs, lunchEndSecs) - lunchStartSecs);
       }
    }
  }
  const workSecondsToday = Math.max(0, autoWorkSecs);

  const workerRef = useRef<Worker | null>(null);
  const lastGlobalTickRef = useRef<number>(Date.now());
  const isSlackingRef = useRef(isSlacking);
  const isOvertimeRef = useRef(isOvertime);
  const configRef = useRef(config);
  
  isSlackingRef.current = isSlacking;
  isOvertimeRef.current = isOvertime;
  configRef.current = config;

  useEffect(() => {
    lastGlobalTickRef.current = Date.now();
    const code = `
      let interval;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          interval = setInterval(() => self.postMessage('tick'), 1000);
        } else if (e.data === 'stop') {
          clearInterval(interval);
        }
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;
    
    const handleTick = () => {
      const current = Date.now();
      const deltaSecs = (current - lastGlobalTickRef.current) / 1000;
      
      const lastDateStr = new Date(lastGlobalTickRef.current).toLocaleDateString("en-US", {timeZone: configRef.current.localTimezone});
      const currDateStr = new Date(current).toLocaleDateString("en-US", {timeZone: configRef.current.localTimezone});

      lastGlobalTickRef.current = current;
      
      setNow(new Date(current));
      
      if (lastDateStr !== currDateStr) {
         setSlackSecondsToday(0);
         setOvertimeSecondsToday(0);
      } else {
        if (isSlackingRef.current) {
          setSlackSecondsToday(prev => prev + deltaSecs);
        }
        if (isOvertimeRef.current) {
          setOvertimeSecondsToday(prev => prev + deltaSecs);
        }
      }

      // Handle Pomodoro background tick
      if (isPomodoroActiveRef.current && pomodoroTimeLeftRef.current > 0) {
         const nextTime = pomodoroTimeLeftRef.current - deltaSecs;
         if (nextTime <= 0) {
            setPomodoroTimeLeft(0);
            setIsPomodoroActive(false);
            setCompletedPomodoros(prev => prev + 1);
            if ('Notification' in window && Notification.permission === "granted") {
               new Notification(t('番茄钟完成'), { body: t('时间到，休息一下吧！') });
            }
            playAlertSound(configRef.current.pomodoroEndSound);
         } else {
            setPomodoroTimeLeft(nextTime);
         }
      }

      // Handle Reminder background tick
      if (isReminderActiveRef.current && reminderTimeLeftRef.current > 0) {
         const nextTime = reminderTimeLeftRef.current - deltaSecs;
         if (nextTime <= 0) {
            setReminderTimeLeft(reminderMinsRef.current * 60);
            if ('Notification' in window && Notification.permission === "granted") {
               new Notification(t('定时提醒'), { body: reminderTextRef.current });
            }
            playAlertSound(configRef.current.pomodoroBreakSound);
         } else {
            setReminderTimeLeft(nextTime);
         }
      }
    };
    
    worker.onmessage = handleTick;
    
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
         handleTick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    
    worker.postMessage('start');
    
    return () => {
      worker.postMessage('stop');
      worker.terminate();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const earnedToday = workSecondsToday * secondRate;
  const slackLoss = slackSecondsToday * secondRate;
  const overtimeLoss = overtimeSecondsToday * secondRate;
  const sym = showUSD ? '$' : '¥';
  const ex = showUSD ? config.exchangeRateUsd : 1;
  const hide = (val: string) => showMoney ? val : '****';
  
  // Leave calculations
  let totalUnpaidLeaves = 0;
  let unpaidLeavesThisYear = 0;
  let unpaidLeavesThisMonth = 0;
  const currentMonthPrefix = `${localTime.getFullYear()}-${(localTime.getMonth()+1).toString().padStart(2, '0')}`;
  const currentYearPrefix = `${localTime.getFullYear()}-`;
  const todayVal = `${localTime.getFullYear()}${(localTime.getMonth()+1).toString().padStart(2, '0')}${localTime.getDate().toString().padStart(2, '0')}`;
  
  Object.keys(memos || {}).forEach(key => {
    const keyVal = key.replace(/-/g, '');
    if (keyVal <= todayVal) {
      const dayMemos = memos[key];
      if (Array.isArray(dayMemos) && dayMemos.some((m: any) => m.type === 'unpaid_leave')) {
         totalUnpaidLeaves++;
         if (key.startsWith(currentYearPrefix)) {
             unpaidLeavesThisYear++;
         }
         if (key.startsWith(currentMonthPrefix)) {
             unpaidLeavesThisMonth++;
         }
      }
    }
  });

  // Estimations for summary
  const joinDateObj = new Date(config.joinDate);
  const firstPayObj = new Date(config.firstPayDate || config.joinDate);
  const monthsWorked = (localTime.getFullYear() - joinDateObj.getFullYear()) * 12 + localTime.getMonth() - joinDateObj.getMonth();
  const monthsPaid = Math.max(0, (localTime.getFullYear() - firstPayObj.getFullYear()) * 12 + localTime.getMonth() - firstPayObj.getMonth());
  const dailyDeduction = (config.monthlySalary / (currentMonthWorkDays || 22));
  const totalEarnedBeforeToday = Math.max(0, monthsPaid * config.monthlySalary - (totalUnpaidLeaves * dailyDeduction));
  
  const daysInMonth = new Date(localTime.getFullYear(), localTime.getMonth() + 1, 0).getDate();
  // Recalculate past workdays inline to strictly guarantee correctness, skipping function calls
  let pastWorkDaysThisMonth = 0;
  const currentMonth = localTime.getMonth();
  const currentYear = localTime.getFullYear();
  let maxLoopDays = Math.max(0, localTime.getDate() - 1);
  if (maxLoopDays > 31) maxLoopDays = 31;
  if (maxLoopDays < 0) maxLoopDays = 0;
  
  for (let i = 1; i <= maxLoopDays; i++) {
    const d = new Date(currentYear, currentMonth, i);
    const day = d.getDay();
    const isStandardWeekend = config.restDays === 2 ? (day === 0 || day === 6) : (day === 0);
    const isCustomHol = isDateCustomHoliday(d, config.holidayRegion);
    const isCustomWork = isDateCustomWorkday(d, config.holidayRegion);
    if (isCustomHol) {
      // It's a holiday, skip
    } else if (isCustomWork) {
      pastWorkDaysThisMonth++;
    } else if (!isStandardWeekend) {
      pastWorkDaysThisMonth++;
    }
  }

  // Safe guard logic: On the first day of the month, pastWorkDays MUST strictly be 0.
  const safePastWorkDaysThisMonth = localTime.getDate() <= 1 ? 0 : pastWorkDaysThisMonth;
  const safeCurrentMonthWorkDays = Math.max(1, currentMonthWorkDays || 22);

  let earnedThisMonth = 0;
  let hoursThisMonth = 0;
  if (safePastWorkDaysThisMonth > 0 || Math.max(0, autoWorkSecs) > 0) {
    earnedThisMonth = Math.max(0, safePastWorkDaysThisMonth * (config.monthlySalary / safeCurrentMonthWorkDays) + earnedToday - (unpaidLeavesThisMonth * dailyDeduction));
    hoursThisMonth = Math.max(0, safePastWorkDaysThisMonth * derivedHoursPerDay + (workSecondsToday / 3600));
  }

  let monthsThisYear = localTime.getMonth();
  if (joinDateObj.getFullYear() === localTime.getFullYear()) {
      monthsThisYear = Math.max(0, localTime.getMonth() - joinDateObj.getMonth());
  }
  const earnedThisYear = Math.max(0, (monthsThisYear * config.monthlySalary) + earnedThisMonth - ((unpaidLeavesThisYear - unpaidLeavesThisMonth) * dailyDeduction));
  const displayEarned = conversionTimeframe === 'today' ? earnedToday : conversionTimeframe === 'month' ? earnedThisMonth : earnedThisYear;

  const daysThisWeek = localTime.getDay() === 0 ? 7 : localTime.getDay();
  // Compute how many workdays have passed this week
  let pastWorkDaysThisWeek = 0;
  for (let i = 1; i < daysThisWeek; i++) {
    const d = new Date(localTime.getFullYear(), localTime.getMonth(), localTime.getDate() - (daysThisWeek - i));
    const isHoliday = isDateCustomHoliday(d, config.holidayRegion);
    const isWorkday = isDateCustomWorkday(d, config.holidayRegion);
    const day = d.getDay();
    const isStandardWeekend = config.restDays === 2 ? (day === 0 || day === 6) : (day === 0);
    if (!isHoliday && (isWorkday || !isStandardWeekend)) {
      pastWorkDaysThisWeek++;
    }
  }
  const earnedThisWeek = Math.max(0, pastWorkDaysThisWeek * (config.monthlySalary / safeCurrentMonthWorkDays) + earnedToday);
  
  const effectiveWorkThisWeek = Math.max(0, pastWorkDaysThisWeek * derivedHoursPerDay * 0.85 + (workSecondsToday - slackSecondsToday) / 3600);
  const slackThisWeek = Math.max(0, pastWorkDaysThisWeek * derivedHoursPerDay * 0.15 + slackSecondsToday / 3600);
  
  const bestDayEarned = Math.max(earnedToday, (config.monthlySalary / (currentMonthWorkDays || 22)));
  const weekDaysStr = [t('周日'),t('周一'),t('周二'),t('周三'),t('周四'),t('周五'),t('周六')];
  let bestDayStr = weekDaysStr[localTime.getDay()];
  if (bestDayEarned > earnedToday && pastWorkDaysThisWeek > 0) {
    const yesterday = new Date(localTime.getFullYear(), localTime.getMonth(), localTime.getDate() - 1);
    bestDayStr = weekDaysStr[yesterday.getDay()];
  }

  // Countdown calculations
  const offWorkSecs = Math.max(0, endSecs - nowSecs);
  
  const paydayObj = new Date(localTime.getFullYear(), localTime.getMonth(), config.payday);
  if (localTime.getDate() > config.payday) {
     paydayObj.setMonth(paydayObj.getMonth() + 1);
  }
  const daysToPayday = localTime.getDate() === config.payday ? 0 : Math.ceil((paydayObj.getTime() - localTime.getTime()) / (1000 * 3600 * 24));
  
  let daysToNextRestDay = 1;
  let nextRestDayObj = new Date(localTime);
  nextRestDayObj.setDate(localTime.getDate() + 1);
  for (let i = 0; i < 30; i++) {
     const dayDay = nextRestDayObj.getDay();
     const isWknd = (config.restDays === 2 && (dayDay === 0 || dayDay === 6)) || (config.restDays === 1 && dayDay === 0);
     const isMakeUp = isDateCustomWorkday(nextRestDayObj, config.holidayRegion);
     const isHol = isDateCustomHoliday(nextRestDayObj, config.holidayRegion);
     const nextMemoStr = `${nextRestDayObj.getFullYear()}-${(nextRestDayObj.getMonth() + 1).toString().padStart(2, '0')}-${nextRestDayObj.getDate().toString().padStart(2, '0')}`;
     const nextMemos = (memos || {})[nextMemoStr] || [];
     const isNextPaid = nextMemos.some((m: any) => m.type === 'paid_leave');
     const isNextUnpaid = nextMemos.some((m: any) => m.type === 'unpaid_leave');
     
     if (((isWknd || isHol) && !isMakeUp) || isNextPaid || isNextUnpaid) {
         break;
     }
     nextRestDayObj.setDate(nextRestDayObj.getDate() + 1);
     daysToNextRestDay++;
  }
  
  const customDateObj = new Date(config.customEventDate);
  const daysToCustom = Math.ceil((customDateObj.getTime() - localTime.getTime()) / (1000 * 3600 * 24));

  const retireDateObj = new Date(config.retirementDate);
  const daysToRetire = Math.ceil((retireDateObj.getTime() - localTime.getTime()) / (1000 * 3600 * 24));
  
  let isSelectedLeaveDateNaturalRest = false;
  let selectedLeaveDateLabel = "";
  if (leaveDateStr) {
     const tDate = new Date(leaveDateStr);
     if (!isNaN(tDate.getTime())) {
        const dDay = tDate.getDay();
        const isWknd = (config.restDays === 2 && (dDay === 0 || dDay === 6)) || (config.restDays === 1 && dDay === 0);
        const isHolStr = getCustomHolidayName(tDate, config.holidayRegion);
        const isHol = isDateCustomHoliday(tDate, config.holidayRegion);
        const isMakeUp = isDateCustomWorkday(tDate, config.holidayRegion);
        isSelectedLeaveDateNaturalRest = (isWknd || isHol) && !isMakeUp;
        if (isSelectedLeaveDateNaturalRest) {
           selectedLeaveDateLabel = isHolStr ? tf('{name}假期，无需请假', { name: isHolStr }) : t('周末休息日，无需请假');
        }
     }
  }

  return (
    <div className="w-full min-h-[100dvh] md:max-w-4xl lg:max-w-6xl xl:max-w-[1400px] mx-auto bg-app text-primary font-sans overflow-x-hidden pb-24 md:pb-0 relative flex flex-col transition-colors duration-300 md:shadow-2xl md:my-4 md:rounded-3xl border-x md:border-y border-app duration-500">
      
      {activeTab === 'home' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
          <div className="px-4 md:px-8 pt-6 pb-2 flex flex-col gap-4 max-w-5xl mx-auto w-full">
            
            {/* Header & Date Row */}
            <div className="flex flex-row items-center justify-between gap-2 pb-2 mt-2">
              {/* Brand & Logo */}
              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-brand/20 via-card to-brand/5 border border-brand/30 flex items-center justify-center text-brand shadow-[0_0_20px_rgba(0,255,65,0.25)] shrink-0 relative overflow-hidden">
                   <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 drop-shadow-md">
                     <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                     <line x1="12" y1="22" x2="12" y2="15.5" />
                     <polyline points="22 8.5 12 15.5 2 8.5" />
                     <polyline points="2 15.5 12 8.5 22 15.5" />
                     <line x1="12" y1="2" x2="12" y2="8.5" />
                     <circle cx="12" cy="12" r="1.5" className="fill-brand stroke-brand" />
                   </svg>
                </div>
                <div className="flex flex-col justify-center shrink-0">
                  <h1 className="text-lg md:text-[22px] font-bold tracking-tight text-primary leading-none mb-1.5 flex items-center gap-2">
                    TimeMeter
                    <span className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded font-mono font-medium border border-brand/20 hidden md:inline-flex">BETA</span>
                  </h1>
                  <p className="text-[9px] md:text-[10px] text-brand/90 font-mono uppercase tracking-[0.2em] font-bold leading-none">Pay Per Sec</p>
                </div>
              </div>

              {/* Date & Theme Toggle */}
              <div className="flex items-center gap-1.5 md:gap-3 bg-card-inner/60 backdrop-blur-md pl-2 md:pl-4 pr-1.5 md:pr-2 py-1 md:py-1.5 rounded-2xl border border-app shadow-sm min-w-0">
                <div className="flex flex-col text-right truncate">
                  <div className="text-[10px] md:text-sm font-semibold text-primary mb-0.5 flex items-center gap-1 md:gap-2 justify-end truncate">
                    <span className="text-[9px] md:text-xs text-secondary font-medium hidden md:inline-block">{t('周')}{[t('日'),t('一'),t('二'),t('三'),t('四'),t('五'),t('六')][localTime.getDay()]}</span>
                    <span className="truncate">{localTime.getFullYear()}-{String(localTime.getMonth() + 1).padStart(2, '0')}-{String(localTime.getDate()).padStart(2, '0')}</span>
                  </div>
                  <div className="text-[8px] md:text-[10px] text-secondary/80 font-medium tracking-wide truncate mt-0.5 md:mt-0">
                     {lunarDateStr}
                  </div>
                </div>
                <div className="w-[1px] h-6 md:h-7 bg-app block mx-0.5 md:mx-1 shrink-0"></div>
                <button onClick={drawFortune} className="w-7 h-7 md:w-8 md:h-8 bg-card rounded-xl border border-app shadow-inner text-primary flex items-center justify-center transition-all hover:scale-105 active:scale-95 relative group shrink-0">
                   <div className="absolute inset-0 bg-brand/5 group-hover:bg-brand/10 transition-colors rounded-xl"></div>
                   <span className="text-sm md:text-base relative z-10 group-hover:scale-110 transition-transform">🥠</span>
                   {!dailyFortune && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card animate-pulse"></span>}
                </button>
                <button onClick={() => setLanguage(getLanguage() === 'zh' ? 'en' : 'zh')} className="w-7 h-7 md:w-8 md:h-8 bg-card rounded-xl border border-app shadow-inner text-primary flex items-center justify-center transition-all hover:scale-105 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-brand shrink-0 text-xs font-bold">
                   {getLanguage() === 'zh' ? 'EN' : '中'}
                </button>
                <button onClick={() => setIsLightMode(!isLightMode)} className="w-7 h-7 md:w-8 md:h-8 bg-card rounded-xl border border-app shadow-inner text-primary flex items-center justify-center transition-all hover:scale-105 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-brand shrink-0">
                   {isLightMode ? (
                     <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500 group-hover:rotate-45 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                   ) : (
                     <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand group-hover:-rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                   )}
                </button>
              </div>
            </div>

            {/* Daily Work Progress */}
            <div className="bg-card rounded-[24px] p-5 border border-app shadow-2xl relative overflow-hidden mb-2 group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full pointer-events-none group-hover:bg-brand/10 transition-colors duration-500"></div>
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-card-inner/30 to-transparent pointer-events-none"></div>
              
              <div className="w-full flex-col flex gap-2 relative z-10">
                <div className="flex justify-between items-end pl-1 mb-1">
                  <span className="flex items-center gap-2 text-[11px] font-bold text-tertiary uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full border-[2px] border-brand shadow-[0_0_5px_rgba(0,255,65,0.5)]"></div>
                    {isRestDay ? t('今日休息') : t('今日进度标尺')}
                  </span>
                  <div className="flex items-end gap-1 font-mono">
                    <span className="text-brand font-black text-lg tracking-tighter drop-shadow-[0_0_8px_rgba(0,255,65,0.4)] leading-none mt-1">
                      {isRestDay ? '0' : nowSecs < startSecs ? '0' : nowSecs > endSecs ? '100' : `${((workSecondsToday / Math.max(1, endSecs - startSecs - (config.hasLunchBreak ? lunchEndSecs - lunchStartSecs : 0))) * 100).toFixed(1)}`}
                    </span>
                    <span className="text-xs text-brand/80 font-bold mb-[2px]">%</span>
                  </div>
                </div>
                
                <div className="relative pt-6 pb-1">
                   {/* Main progress track - Adaptive styling */}
                   <div className="h-4 bg-gray-200 dark:bg-card-inner rounded-full overflow-hidden border border-app shadow-inner dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] relative">
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00cc33] via-[#00FF41] to-[#e4ff00] transition-all duration-1000 ease-linear" 
                        style={{ width: `${isRestDay ? 0 : nowSecs < startSecs ? 0 : nowSecs > endSecs ? 100 : ((workSecondsToday / Math.max(1, endSecs - startSecs - (config.hasLunchBreak ? lunchEndSecs - lunchStartSecs : 0))) * 100)}%` }} 
                      >
                         {/* Custom striped pattern for progress bar */}
                         <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.5) 4px, rgba(255,255,255,0.5) 8px)' }}></div>
                         {/* Shine effect */}
                         <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent"></div>
                      </div>
                   </div>

                   {/* Progress Indicator Icon moving along the track */}
                   <div 
                     className="absolute top-0 transform -translate-x-1/2 -translate-y-2.5 transition-all duration-1000 ease-linear z-20"
                     style={{ left: `${nowSecs < startSecs ? 0 : nowSecs > endSecs ? 100 : ((workSecondsToday / Math.max(1, endSecs - startSecs - (config.hasLunchBreak ? lunchEndSecs - lunchStartSecs : 0))) * 100)}%` }}
                   >
                     <div className="bg-card border-2 border-brand text-[22px] w-11 h-11 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,255,65,0.4)] relative bg-gradient-to-br from-card to-card-inner">
                       <span className="absolute -top-1 -right-1 text-[9px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-sm transform -rotate-12 animate-pulse">!</span>
                       {isRestDay ? '🏖️' : nowSecs < startSecs ? '😴' : nowSecs > endSecs ? '🎉' : isLunchBreak ? '🍚' : '🏃'}
                     </div>
                   </div>

                   {/* Timestamps */}
                   <div className="flex justify-between text-[10px] text-tertiary/60 font-mono mt-3 px-2 font-medium">
                      <span>{config.startTime}</span>
                      {config.hasLunchBreak && (
                        <div className="flex flex-col items-center gap-0.5 text-orange-500/60 relative -mt-1.5 group-hover:text-orange-500 transition-colors">
                           <span className="text-[8px] bg-orange-500/10 px-1.5 py-0.5 rounded-sm">{t('午休期间')}</span>
                           <span>{config.lunchStartTime} - {config.lunchEndTime}</span>
                        </div>
                      )}
                      <span>{config.endTime}</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Timezone Card */}
            <div className="bg-card rounded-2xl p-3 border border-app flex flex-row items-center justify-between relative shadow-sm">
                <div className="flex flex-col relative w-1/2 overflow-hidden">
                   <select 
                     className="absolute top-0 left-0 w-24 h-full opacity-0 cursor-pointer appearance-none z-10"
                     value={config.localTimezone}
                     onChange={(e) => {
                       const tz = TIMEZONES.find(t => t.value === e.target.value);
                       if (tz) setConfig({...config, localTimezone: tz.value, localTimezoneLabel: tz.short});
                     }}
                   >
                     {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                   </select>
                   <div className="text-[10px] text-tertiary mb-0.5 flex items-center gap-1 group">
                     {tf('{city}时间', { city: tzShort(config.localTimezone, config.localTimezoneLabel) })} <span className="transform rotate-90 text-[8px] opacity-70 group-hover:opacity-100 mix-blend-screen transition-opacity">▸</span>
                   </div>
                   <div className="text-xl font-mono text-brand font-semibold leading-none drop-shadow-[0_0_8px_rgba(0,255,65,0.4)]">{pad0(localTime.getHours())}:{pad0(localTime.getMinutes())}:{pad0(localTime.getSeconds())}</div>
                   <div className="text-[9px] text-primary/40 mt-1 truncate max-w-[80%]">{config.localTimezone.split('/')[1] || config.localTimezone}</div>
                </div>
                
                <RefreshCw size={14} className="text-primary/20 mx-1 shrink-0" />
                
                <div className="flex flex-col items-end text-right relative w-1/2 overflow-hidden">
                   <select 
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
                     value={config.otherTimezone}
                     onChange={(e) => {
                       const tz = TIMEZONES.find(t => t.value === e.target.value);
                       if (tz) setConfig({...config, otherTimezone: tz.value, otherTimezoneLabel: tz.short});
                     }}
                   >
                     {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                   </select>
                   <div className="text-[10px] text-tertiary mb-0.5 flex items-center justify-end w-full gap-1 group">
                     {tf('{city}时间', { city: tzShort(config.otherTimezone, config.otherTimezoneLabel) })} <span className="transform rotate-90 text-[8px] opacity-70 group-hover:opacity-100 mix-blend-screen transition-opacity">▸</span>
                   </div>
                   <div className="text-xl font-mono text-primary font-medium leading-none">{pad0(otherTime.getHours())}:{pad0(otherTime.getMinutes())}:{pad0(otherTime.getSeconds())}</div>
                   <div className="text-[9px] text-primary/40 mt-1 truncate max-w-[80%] text-right float-right">{config.otherTimezone.split('/')[1] || config.otherTimezone}</div>
                </div>
            </div>
          </div>
          {/* Marquee Banner */}
          <div className="px-4 md:px-8 py-2 max-w-5xl mx-auto w-full">
            <div className="bg-card rounded-full px-3 py-2 text-xs flex items-center justify-between border border-app">
               <div className="flex items-center gap-2 text-yellow-500/80 truncate pr-2">
                  <span>📢</span>
                  <span className="truncate">{t('距离发工资还有')} {daysToPayday} {t('天，再坚持一下！💪')}</span>
               </div>
               <div className="flex items-center gap-1 text-secondary cursor-pointer whitespace-nowrap relative shrink-0" onClick={() => {
                  const input = document.getElementById('native-calendar') as HTMLInputElement;
                  if (input && 'showPicker' in input) {
                    try { input.showPicker(); } catch (e) { input.focus(); }
                  } else if (input) {
                    input.click();
                  }
               }}>
                  <span>{t('查看日历')}</span>
                  <CalendarIcon size={12} />
                  <div className="absolute inset-0" onClick={() => setActiveTab('calendar')}></div>
               </div>
            </div>
          </div>


          {/* 2. WORK STATUS & REAL-TIME INCOME */}
          <div className="px-4 md:px-8 py-2 flex flex-col gap-3 md:gap-5 max-w-5xl mx-auto w-full">
             {/* Top Row: Clock & Punch Out vs Current Income (Side by side) */}
             <div className="flex gap-3 md:gap-5">
               {/* Left: Clock */}
               <div className="w-[140px] md:w-[180px] rounded-[32px] bg-card border-[1.5px] border-app p-4 flex flex-col items-center justify-between shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-brand/10 blur-2xl rounded-full mix-blend-screen pointer-events-none" />
                  
                  <div className="relative w-24 h-24 mb-3 drop-shadow-[0_0_10px_rgba(0,255,65,0.2)] shrink-0">
                     <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                       <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" className="text-app-strong" strokeWidth="2" strokeDasharray="1 4" />
                       <g className="origin-center animate-[spin_10s_linear_infinite]">
                         <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" className="text-brand/40" strokeWidth="2" strokeDasharray="20 40 10 20" strokeLinecap="round" />
                       </g>
                       <g className="origin-center animate-[spin_15s_linear_infinite_reverse]">
                         <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" className="text-brand/20" strokeWidth="1" strokeDasharray="5 15" strokeLinecap="round" />
                       </g>
                       <circle 
                         cx="50" cy="50" r="46" fill="none" 
                         stroke="url(#cow_gradient)" strokeWidth="4" 
                         strokeDasharray={289} 
                         strokeDashoffset={289 * (1 - (workSecondsToday / Math.max(1, (endSecs - startSecs))))} 
                         className="transition-all duration-1000 ease-linear" 
                         strokeLinecap="round" 
                       />
                       <defs>
                         <linearGradient id="cow_gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                           <stop offset="0%" stopColor="#00FF41" />
                           <stop offset="100%" stopColor="#00cc33" />
                         </linearGradient>
                       </defs>
                     </svg>
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <NiumaAvatar 
                           activeTheme={config.avatarTheme || 'default'}
                           workSeconds={workSecondsToday}
                           slackSeconds={slackSecondsToday}
                           overtimeSeconds={overtimeSecondsToday}
                           nowSecs={nowSecs}
                           endSecs={endSecs}
                        />
                     </div>
                  </div>

                  <div className="text-center z-10 w-full mb-3">
                     <div className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-1 inline-block ${isRestDay ? 'text-primary bg-blue-500/10' : nowSecs < startSecs ? 'text-secondary bg-secondary/10' : nowSecs > endSecs ? 'text-brand bg-brand/10' : isLunchBreak ? 'text-orange-500 bg-orange-500/10' : 'text-primary bg-primary/10'}`}>
                        {isRestDay ? `${restTypeLabel} ✨` : nowSecs < startSecs ? t('还没上班') : nowSecs > endSecs ? t('已经下班') : isLunchBreak ? t('午休干饭 🍚') : t('牛马进行中 ⚡️')}
                     </div>
                     <div className="text-[18px] font-mono font-bold tracking-tight text-primary/90">
                        {pad0(Math.floor(workSecondsToday / 3600))}:
                        {pad0(Math.floor((workSecondsToday % 3600) / 60))}:
                        {pad0(workSecondsToday % 60)}
                     </div>
                  </div>

                  <div className="w-full mb-1">
                     <div className="bg-card-inner rounded-xl p-1.5 border border-app text-center">
                        <span className="text-[9px] text-tertiary block mb-0.5">{t('牛马指数')}</span>
                        <span className="text-[11px] font-medium text-primary">
                          {isRestDay ? t('🏖️ 幸福躺平中') :
                           nowSecs < startSecs ? t('😴 续命睡眠中') :
                           nowSecs >= endSecs ? t('🎉 灵魂归位') : 
                           isLunchBreak ? t('😋 能量补给中') :
                           (workSecondsToday / Math.max(1, (endSecs - startSecs))) > 0.9 ? t('💀 彻底疯狂') :
                           (workSecondsToday / Math.max(1, (endSecs - startSecs))) > 0.7 ? t('🤯 逐渐暴躁') :
                           (workSecondsToday / Math.max(1, (endSecs - startSecs))) > 0.4 ? t('🔋 电量过半') :
                           (workSecondsToday / Math.max(1, (endSecs - startSecs))) > 0.2 ? t('🤔 陷入沉思') :
                           t('☕️ 能量回收中')}
                        </span>
                     </div>
                  </div>

                  <div className="w-full py-2 rounded-xl flex flex-col items-center justify-center font-black uppercase tracking-tighter bg-card border-none">
                    <span className={`text-xs ${isRestDay ? 'text-primary' : nowSecs < startSecs ? 'text-secondary' : nowSecs > endSecs ? 'text-brand' : isLunchBreak ? 'text-orange-500' : 'text-primary'}`}>
                      {isRestDay ? tf('{name}愉快 🏖️', { name: restTypeLabel }) : nowSecs < startSecs ? t('等待打工') : nowSecs > endSecs ? t('下班啦 ✨') : isLunchBreak ? t('干饭啦 🍚') : t('正在牛马 ⚡️')}
                    </span>
                  </div>
               </div>

               {/* Right: Income Main Metrics */}
               <div className="flex-1 rounded-[32px] bg-gradient-to-b from-card to-card-inner border-[1.5px] border-app p-5 flex flex-col shadow-2xl justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full pointer-events-none" />

                  <div>
                    <div className="flex items-center justify-between text-xs text-secondary mb-2">
                       <span>{t('今日已赚')}</span>
                       <div className="flex items-center gap-1.5">
                          <button onClick={() => setShowUSD(!showUSD)} className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showUSD ? 'border-brand text-brand' : 'border-app-strong text-secondary hover:text-primary'}`}>USD</button>
                          <button onClick={() => setShowMoney(!showMoney)} className="text-tertiary hover:text-primary">
                             {showMoney ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                       </div>
                    </div>
                    
                    <div className="flex items-baseline gap-1">
                       <span className="text-brand text-xl font-mono opacity-80">{sym}</span>
                       <motion.span 
                         key={earnedToday}
                         initial={{ opacity: 0.8, y: 2 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="text-4xl md:text-5xl font-mono font-bold text-brand tracking-tighter leading-none"
                       >
                         {hide(formatMoney(earnedToday / ex))}
                       </motion.span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-4">
                     <div className="bg-card-inner rounded-xl p-2.5 flex items-center justify-between border border-app">
                        <div className="flex flex-col">
                           <span className="text-[9px] text-tertiary mb-0.5">{t('本月已赚（预估）')}</span>
                           <span className="text-primary font-mono text-xs">{sym} {hide(formatMoney(earnedThisMonth / ex))}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand">💰</div>
                     </div>
                     <div className="bg-card-inner rounded-xl p-2.5 flex items-center justify-between border border-app">
                        <div className="flex flex-col">
                           <span className="text-[9px] text-tertiary mb-0.5">{t('本月工时')}</span>
                           <span className="text-primary font-mono text-xs">{hoursThisMonth.toFixed(1)} <span className="text-[10px] text-tertiary">h</span></span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400"><TrendingUp size={12} /></div>
                     </div>
                  </div>
               </div>
             </div>

             {/* Bottom row: Accumulated */}
             <div className="bg-card rounded-2xl p-3 border border-app flex items-center justify-between shadow-lg px-4">
                <span className="text-[11px] text-secondary">{t('历史累计已赚 (估算)')}</span>
                <span className="text-primary font-mono text-sm tracking-tight">{sym} {hide(formatMoney((totalEarnedBeforeToday + earnedThisMonth) / ex))}</span>
             </div>
          </div>

          {/* 3. CURRENCY & VALUE CONVERSION */}
          <div className="px-4 md:px-8 py-2 mt-2 max-w-5xl mx-auto w-full">
             <div className="bg-card rounded-2xl p-3 border border-app flex flex-col shadow-lg">
                <div className="flex flex-col gap-2 mb-3">
                   <div className="flex items-center justify-between">
                      <select 
                        className="appearance-none bg-transparent text-[11px] text-secondary font-medium outline-none cursor-pointer hover:text-primary transition-colors pr-4 relative"
                        style={{ background: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 24 24' width='12' height='12' xmlns='http://www.w3.org/2000/svg'><path fill='gray' d='M7 10l5 5 5-5z'/></svg>") no-repeat right center` }}
                        value={conversionTimeframe}
                        onChange={e => setConversionTimeframe(e.target.value as any)}
                      >
                         <option value="today">{t('今日收入换算 & 购买力')}</option>
                         <option value="month">{t('本月收入换算 & 购买力')}</option>
                         <option value="year">{t('本年收入换算 & 购买力')}</option>
                      </select>
                      <div className="flex gap-2">
                         <div className="text-[10px] bg-primary/5 text-primary/80 px-2 py-1 flex items-center rounded-full hover:bg-primary/10 border border-app transition-colors cursor-pointer" onClick={generateShareImage}>{t('📸 分享')}</div>
                         <div className="text-[10px] bg-brand/10 text-brand px-2 py-1 flex items-center rounded-full gap-1 border border-brand/20 shadow-sm cursor-pointer" onClick={() => setShowUSD(!showUSD)}>{t('双币展示')}</div>
                      </div>
                   </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-3">
                   <div className="bg-card-inner rounded-xl p-3 border border-app flex flex-col items-center justify-center relative overflow-hidden">
                      <span className="text-[10px] text-tertiary mb-1 tracking-wider">{t('人民币 (CNY)')}</span>
                      <span className="text-brand font-mono text-2xl font-bold tracking-tight">¥{hide(formatMoney(displayEarned))}</span>
                   </div>
                   <div className="bg-card-inner rounded-xl p-3 border border-app flex flex-col items-center justify-center relative overflow-hidden">
                      <span className="text-[10px] text-tertiary mb-1 tracking-wider">{t('美元 (USD)')}</span>
                      <span className="text-primary font-mono text-2xl font-bold tracking-tight">${hide(formatMoney(displayEarned / config.exchangeRateUsd))}</span>
                   </div>
                </div>

                <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
                   <ConversionCard icon={<span className="text-xl filter drop-shadow-md">🧋</span>} label={t('奶茶')} value={hide((displayEarned / MILK_TEA_PRICE).toFixed(1))} unit={t('杯')} color="text-orange-300" />
                   <ConversionCard icon={<span className="text-xl filter drop-shadow-md">☕️</span>} label={t('咖啡')} value={hide((displayEarned / COFFEE_PRICE).toFixed(1))} unit={t('杯')} color="text-amber-400" />
                   <ConversionCard icon={<span className="text-xl filter drop-shadow-md">⛽️</span>} label={t('汽油')} value={hide((displayEarned / GAS_PRICE).toFixed(1))} unit="L" color="text-red-400" />
                   <ConversionCard icon={<span className="text-xl filter drop-shadow-md">📱</span>} label="iPhone" value={hide(((displayEarned / IPHONE_PRICE) * 100).toFixed(2))} unit="%" color="text-blue-300" />
                   <ConversionCard icon={<span className="text-xl filter drop-shadow-md">✨</span>} label={t(config.customItemName)} value={hide((displayEarned / config.customItemPrice).toFixed(2))} unit={t('个')} color="text-purple-400" />
                </div>
             </div>
          </div>

          {/* 4. COUNTDOWN SYSTEM (Horizontal Scroll) */}
          <div className="px-4 md:px-8 py-2 max-w-5xl mx-auto w-full">
             <div className="flex items-center justify-between mb-3 text-sm">
                <span className="text-primary font-medium">{t('倒计时')}</span>
                <span className="text-xs text-tertiary cursor-pointer flex items-center" onClick={() => setShowAllCountdowns(true)}>{t('全部')} <ChevronRight size={12} /></span>
             </div>
             
             <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 snaps-x">
                {!isRestDay ? (
                   <CountdownCard 
                      title={t('下班倒计时')}
                      time={`${pad0(Math.floor(offWorkSecs / 3600))}:${pad0(Math.floor((offWorkSecs % 3600)/60))}:${pad0(offWorkSecs % 60)}`}
                      desc={tf('{time}下班', { time: config.endTime })}
                      progress={100 - (offWorkSecs / (derivedHoursPerDay * 3600)) * 100}
                      icon={<Briefcase size={16} />}
                      color="green"
                   />
                ) : (
                   <CountdownCard 
                      title={t('今日状态')}
                      time={t('休息中')}
                      desc={t('尽情享受假期')}
                      progress={100}
                      icon={<Briefcase size={16} />}
                      color="green"
                   />
                )}
                <CountdownCard 
                   title={isRestDay ? t('距离下个休息日') : t('距离休息日')}
                   time={tDays(daysToNextRestDay)}
                   desc={t('盼望好日子')}
                   progress={100 - (daysToNextRestDay / 7) * 100}
                   icon={<CalendarIcon size={16} />}
                   color="yellow"
                />
                <CountdownCard 
                   title={t('距离发薪日')}
                   time={tDays(daysToPayday)}
                   desc={tf('{n}号发薪', { n: config.payday })}
                   progress={100 - (daysToPayday / daysInMonth) * 100}
                   icon={<span className="text-sm">💰</span>}
                   color="amber"
                />
                {(config.customEvents || []).map((evt: any) => {
                   const evtDateObj = new Date(evt.date);
                   const daysToEvt = Math.ceil((evtDateObj.getTime() - localTime.getTime()) / (1000 * 3600 * 24));
                   return (
                     <CountdownCard 
                        key={evt.id}
                        title={t(evt.name)}
                        time={daysToEvt < 0 ? tf('已过去 {d}', { d: tDays(Math.abs(daysToEvt)) }) : tDays(daysToEvt)}
                        desc={evtDateObj.toLocaleDateString()}
                        progress={daysToEvt < 0 ? 100 : Math.max(0, 100 - (daysToEvt / 365) * 100)}
                        icon={<span className="text-sm">⭐</span>}
                        color={evt.color as keyof typeof colorMap || "purple"}
                     />
                   );
                })}
                 <CountdownCard 
                   title={t('距离退休')}
                   time={tDays(daysToRetire, false)}
                   desc={retireDateObj.toLocaleDateString()}
                   progress={daysToRetire < 0 ? 100 : Math.max(0, 100 - (daysToRetire / (365*30)) * 100)}
                   icon={<span className="text-sm">🪑</span>}
                   color="red"
                />
             </div>
          </div>

          {/* Quick Leave Actions */}
          <div className="px-4 md:px-8 py-2 max-w-5xl mx-auto w-full">
            <div className="bg-card-inner rounded-2xl border border-app shadow-sm p-4">
              <div className="flex justify-between items-center mb-4">
                 <span className="text-xs md:text-sm font-bold text-primary flex items-center gap-1.5"><span className="text-sm">✈️</span> {t('请假操作板')}</span>
                 <input 
                   type="date" 
                   value={leaveDateStr}
                   onChange={(e) => setLeaveDateStr(e.target.value)} 
                   className="text-[10px] md:text-xs bg-card border border-app rounded text-secondary px-2 py-1 outline-none"
                 />
              </div>
              <div className="flex gap-3 w-full">
                {isSelectedLeaveDateNaturalRest ? (
                   <div className="w-full text-center py-4 bg-primary/5 rounded-xl text-primary/80 text-xs tracking-wider font-medium">
                       {t('所选日期是')}{selectedLeaveDateLabel} 🎉
                   </div>
                ) : (
                  <>
                     <button onClick={() => toggleLeaveType('paid_leave')} className={`flex-1 flex max-w-sm flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all shadow-sm ${((memos || {})[leaveDateStr] || []).some((m: any) => m.type === 'paid_leave') ? 'bg-blue-500/10 border-blue-500/40 text-blue-500 font-bold' : 'bg-card border-app text-secondary hover:bg-card-inner hover:text-primary'}`}>
                        <div className="flex items-center gap-1">
                          <span className="text-xl">🌟</span>
                          {((memos || {})[leaveDateStr] || []).some((m: any) => m.type === 'paid_leave') && <span className="text-[10px] text-blue-500">✅</span>}
                        </div>
                        <span className="text-[11px] md:text-xs tracking-wider mt-1">{t('带薪假')}</span>
                     </button>
                     <button onClick={() => toggleLeaveType('unpaid_leave')} className={`flex-1 flex max-w-sm flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all shadow-sm ${((memos || {})[leaveDateStr] || []).some((m: any) => m.type === 'unpaid_leave') ? 'bg-orange-500/10 border-orange-500/40 text-orange-500 font-bold' : 'bg-card border-app text-secondary hover:bg-card-inner hover:text-primary'}`}>
                        <div className="flex items-center gap-1">
                          <span className="text-xl">🍂</span>
                          {((memos || {})[leaveDateStr] || []).some((m: any) => m.type === 'unpaid_leave') && <span className="text-[10px] text-orange-500">✅</span>}
                        </div>
                        <span className="text-[11px] md:text-xs tracking-wider mt-1">{t('无薪假')}</span>
                     </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 5. SLACKING & OVERTIME COST */}
          <div className="px-4 md:px-8 py-2 mt-2 mb-8 flex flex-col gap-3 max-w-5xl mx-auto w-full">
             <div className="bg-card rounded-2xl p-4 border border-app flex items-center relative overflow-hidden shadow-lg">
                <div className="w-12 h-12 mr-3 relative z-10 flex items-center justify-center filter drop-shadow-lg text-4xl">🐟</div>
                
                <div className="flex-1 z-10">
                   <div className="flex items-center gap-1.5 mb-0.5">
                     <span className="text-xs text-primary font-medium">{t('今日摸鱼')}</span>
                     <span className="text-lg font-mono font-bold text-brand">{Math.floor(slackSecondsToday / 60)}</span>
                     <span className="text-[10px] text-tertiary">{t('分钟')}</span>
                     <button onClick={() => setSlackSecondsToday(0)} className="text-[9px] px-1.5 py-0.5 bg-card-inner border border-app rounded text-secondary hover:text-primary ml-1">{t('归零')}</button>
                   </div>
                   <div className="text-[10px] text-tertiary font-mono">
                     {t('≈ 白赚')} <span className="text-brand font-semibold text-[12px]">{sym}{hide(formatMoney(slackLoss / ex))}</span>
                   </div>
                </div>
                
                <button 
                  className={`z-10 ml-2 px-3 py-1.5 text-[11px] rounded-full border flex items-center gap-1 transition-colors ${
                    isSlacking ? 'bg-brand hover:opacity-90 text-app border-transparent' : 'bg-card-inner hover:bg-app text-primary border-app-strong'
                  }`}
                  onClick={() => {
                    if (!isSlacking && !isCurrentlyWorkingTime) {
                      setToast({ message: t('当前非工作时间，你在自愿加班吗？不算摸鱼哦！'), type: 'info' });
                      return;
                    }
                    setIsSlacking(!isSlacking);
                  }}
                >
                   {isSlacking ? t('正在摸鱼中...') : t('开始摸鱼')}
                </button>
             </div>

             <div className="bg-card rounded-2xl p-4 border border-red-500/20 flex items-center relative overflow-hidden shadow-lg">
                <div className="w-12 h-12 mr-3 relative z-10 flex items-center justify-center filter drop-shadow-lg text-4xl">🏢</div>
                
                <div className="flex-1 z-10">
                   <div className="flex items-center gap-1.5 mb-0.5">
                     <span className="text-xs text-red-500/80 font-medium">{t('义务加班')}</span>
                     <span className="text-lg font-mono font-bold text-red-500">{Math.floor(overtimeSecondsToday / 60)}</span>
                     <span className="text-[10px] text-tertiary">{t('分钟')}</span>
                     <button onClick={() => setOvertimeSecondsToday(0)} className="text-[9px] px-1.5 py-0.5 bg-red-500/10 rounded text-red-500 hover:bg-red-500/20 ml-1">{t('归零')}</button>
                   </div>
                   <div className="text-[10px] text-tertiary font-mono">
                     {t('≈ 损失')} <span className="text-red-500 font-semibold text-[12px]">{sym}{hide(formatMoney(overtimeLoss / ex))}</span>
                   </div>
                </div>
                
                <button 
                  className={`z-10 ml-2 px-3 py-1.5 text-[11px] rounded-full border flex items-center gap-1 transition-colors ${
                    isOvertime ? 'bg-red-500 hover:bg-red-600 text-primary border-transparent' : 'bg-card-inner hover:bg-app text-red-500/80 border-app-strong'
                  }`}
                  onClick={() => setIsOvertime(!isOvertime)}
                >
                   {isOvertime ? t('正在加班中...') : t('开始加班')}
                </button>
             </div>

             <div className="bg-card rounded-2xl p-4 border border-app shadow-lg relative overflow-hidden flex flex-col gap-2">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-3xl rounded-full"></div>
                <div className="flex items-center gap-2 mb-1 z-10">
                   <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center text-xs">🤖</div>
                   <span className="text-xs text-purple-300 font-medium">{t('一键生成摸鱼话术')}</span>
                </div>
                <div className="bg-card-inner p-3 rounded-xl border border-app min-h-[60px] text-[13px] text-primary z-10 font-medium leading-relaxed shadow-inner break-words">
                   "{excuse}"
                </div>
                <button 
                  onClick={generateExcuse}
                  className="w-full py-2.5 mt-1 rounded-xl bg-card-inner hover:bg-app border border-app text-[11px] text-secondary font-bold transition-colors z-10"
                >
                   {t('换个借口被老板抓到了')}
                                              </button>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 md:px-8 py-6 space-y-4 pb-24 max-w-5xl mx-auto w-full">
           <div className="flex items-center justify-between mb-4">
              <div>
                 <h2 className="text-xl font-bold text-primary mb-1">{t('牛马数据中心')}</h2>
                 <p className="text-xs text-tertiary">{t('掌握进度，合理规划摸鱼与离职时刻。')}</p>
              </div>
              <div className="flex items-center gap-2">
                 <button onClick={() => setShowUSD(!showUSD)} className={`text-[10px] px-2 py-1 rounded border transition-colors ${showUSD ? 'border-brand text-brand' : 'border-app-strong text-secondary hover:text-primary'}`}>USD</button>
                 <button onClick={() => setShowMoney(!showMoney)} className="text-secondary hover:text-primary p-1 rounded-full bg-card-inner border border-app">
                    {showMoney ? <Eye size={16} /> : <EyeOff size={16} />}
                 </button>
              </div>
           </div>
           
           <div className="bg-card rounded-2xl p-5 border border-app shadow-xl space-y-4 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full pointer-events-none"></div>
             
             <div>
                <h3 className="text-sm font-semibold text-primary">{t('本月搞钱进度')}</h3>
                <div className="flex items-end gap-2 mt-2">
                   <span className="text-3xl font-mono text-brand font-bold tracking-tight">{sym} {hide(formatMoney(earnedThisMonth / ex))}</span>
                   <span className="text-xs text-tertiary mb-1.5 font-mono">/ {sym} {hide(formatMoney(config.monthlySalary / ex))}</span>
                </div>
                <div className="mt-3 h-2.5 bg-card-inner rounded-full overflow-hidden border border-app">
                   <div className="h-full bg-gradient-to-r from-teal-500 to-[#00FF41] rounded-full shadow-[0_0_10px_rgba(0,255,65,0.5)]" style={{ width: `${Math.min(100, (earnedThisMonth / config.monthlySalary) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-tertiary mt-2 font-mono">
                   <span>{t('已结算进度:')} {((earnedThisMonth / config.monthlySalary) * 100).toFixed(2)}%</span>
                   <span>{t('剩余:')} {sym} {hide(formatMoney((config.monthlySalary - earnedThisMonth) / ex))}</span>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-3 pt-3 border-t border-app relative z-10">
                <div className="bg-card-inner p-3 rounded-xl border border-app flex flex-col justify-center shadow-inner">
                   <div className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><TrendingUp size={10} /> {t('历史总计总收入估算')}</div>
                   <div className="text-sm font-mono text-primary tracking-tight">{sym} {hide(formatMoney((totalEarnedBeforeToday + earnedThisMonth) / ex))}</div>
                </div>
                <div className="bg-card-inner p-3 rounded-xl border border-app flex flex-col justify-center shadow-inner">
                   <div className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><Briefcase size={10} /> {t('累计奉献青春天数')}</div>
                   <div className="text-sm font-mono text-primary">{Math.floor(monthsWorked * currentMonthWorkDays + localTime.getDate())} {t('天')}</div>
                </div>
                <div className="bg-card-inner p-3 rounded-xl border border-brand/10 flex flex-col justify-center shadow-inner">
                   <div className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><span className="text-[10px]">🐟</span> {t('本月摸鱼总收益')}</div>
                   <div className="text-sm font-mono text-brand font-bold">{sym} {hide(formatMoney((slackLoss * (localTime.getDate() * 0.7)) / ex))}</div>
                </div>
                <div className="bg-card-inner p-3 rounded-xl border border-red-500/10 flex flex-col justify-center shadow-inner">
                   <div className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><span className="text-[10px]">🏢</span> {t('本月义务加班送钱')}</div>
                   <div className="text-sm font-mono text-red-500 font-bold">{sym} {hide(formatMoney((overtimeLoss * (localTime.getDate() * 0.8)) / ex))}</div>
                </div>
                <div className="col-span-2 bg-gradient-to-r from-card to-card-inner p-3 rounded-xl border border-app flex justify-between items-center shadow-sm">
                   <div className="flex flex-col">
                      <div className="text-[10px] text-tertiary flex items-center gap-1 mb-0.5">{t('💰 精确时薪折算')}</div>
                      <div className="text-sm font-mono text-primary">{sym} {hide(formatMoney(hourlyRate / ex))} <span className="text-[9px] text-secondary">{t('/小时')}</span></div>
                   </div>
                   <div className="flex flex-col text-right">
                      <div className="text-[10px] text-tertiary flex justify-end items-center gap-1 mb-0.5">{t('👑 全国牛马击败率')}</div>
                      <div className="text-sm font-mono text-brand">{Math.min(99.9, Math.max(1.0, (config.monthlySalary / 10000) * 80)).toFixed(1)}%</div>
                   </div>
                </div>
              </div>
           </div>

           {/* REIMBURSEMENTS SECTION */}
           <div className="bg-card rounded-2xl p-5 border border-app shadow-xl space-y-4 relative overflow-hidden mt-4">
               <div className="flex justify-between items-center mb-1">
                  <h3 className="text-sm font-semibold text-primary">{t('🧾 报销记录 (本月)')}</h3>
                  <button onClick={() => setShowExportModal(true)} className="text-xs text-brand hover:underline">{t('导出/汇总')}</button>
               </div>
               
               {/* Add New */}
               <div className="bg-card-inner p-3 rounded-xl border border-app space-y-3">
                  <div className="text-[10px] text-tertiary">{t('记录今日报销')}</div>
                  <div className="flex gap-2">
                     <input 
                        type="text"
                        placeholder={t('项目说明...')}
                        value={newReimbDesc}
                        onChange={e => setNewReimbDesc(e.target.value)}
                        className="flex-1 bg-card border border-app rounded-lg px-2 py-1.5 text-xs text-primary focus:outline-none focus:border-brand"
                     />
                     <div className="flex w-[120px]">
                        <input 
                           type="number"
                           placeholder={t('金额')}
                           value={newReimbAmount}
                           onChange={e => setNewReimbAmount(e.target.value)}
                           className="w-full bg-card border border-app border-r-0 rounded-l-lg px-2 py-1.5 text-xs text-primary focus:outline-none focus:border-brand"
                        />
                        <select 
                           value={newReimbCurrency}
                           onChange={e => setNewReimbCurrency(e.target.value)}
                           className="bg-card border border-app border-l border-app-strong rounded-r-lg px-1 py-1.5 text-xs text-primary outline-none"
                        >
                           <option value="CNY">¥</option>
                           <option value="USD">$</option>
                           <option value="THB">฿</option>
                           <option value="VND">₫</option>
                        </select>
                     </div>
                  </div>
                  <button 
                     onClick={() => {
                        if (!newReimbDesc || !newReimbAmount) return setToast({ message: t('请输入说明和金额'), type: 'warn' });
                        if (!(Number(newReimbAmount) > 0)) return setToast({ message: t('请输入大于 0 的金额'), type: 'warn' });
                        const newItem = {
                           id: Date.now().toString(),
                           date: new Intl.DateTimeFormat('en-CA', { 
                             timeZone: config.localTimezone,
                             year: 'numeric',
                             month: '2-digit',
                             day: '2-digit'
                           }).format(localTime),
                           desc: newReimbDesc,
                           amount: Number(newReimbAmount),
                           currency: newReimbCurrency
                        };
                        setConfig({
                           ...config,
                           reimbursements: [...(config.reimbursements || []), newItem]
                        });
                        setNewReimbDesc('');
                        setNewReimbAmount('');
                        setToast({ message: t('已添加报销记录'), type: 'info' });
                     }}
                     className="w-full py-2 bg-brand/10 text-brand border border-brand/20 text-xs font-bold rounded-lg hover:bg-brand/20 transition-colors"
                  >
                     {t('+ 记一笔')}
                                                </button>
               </div>

               {/* List latest 3 */}
               <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
                  {(config.reimbursements || [])
                     .filter((r: any) => r.date.startsWith(`${localTime.getFullYear()}-${(localTime.getMonth() + 1).toString().padStart(2, '0')}`))
                     .slice().reverse().map((r: any) => (
                     <div key={r.id} className="flex justify-between items-center text-xs p-2 bg-card-inner rounded-lg border border-app">
                        <div className="flex flex-col">
                           <span className="text-primary truncate max-w-[150px]">{r.desc}</span>
                           <span className="text-[9px] text-tertiary">{r.date}</span>
                        </div>
                        <div className="font-mono text-brand font-bold flex items-center gap-2">
                           {r.currency === 'CNY' ? '¥' : r.currency === 'USD' ? '$' : r.currency === 'THB' ? '฿' : '₫'} {r.amount}
                           <button 
                              onClick={() => setConfig({...config, reimbursements: config.reimbursements.filter((x: any) => x.id !== r.id)})}
                              className="w-5 h-5 flex items-center justify-center rounded-md bg-red-500/10 text-red-500/50 hover:text-red-500 hover:bg-red-500/20 font-sans"
                           >
                              ×
                           </button>
                        </div>
                     </div>
                  ))}
               </div>
           </div>

           {/* Export Modal */}
           {showExportModal && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                 <div className="bg-card border border-app rounded-2xl p-5 shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-bold text-primary mb-4">{t('本月报销汇总计算')}</h3>
                    <div className="space-y-3 mb-6">
                       <label className="text-xs text-secondary font-medium">{t('汇率设定 (转换为人民币)')}</label>
                       <div className="flex items-center justify-between text-xs bg-card-inner p-2 rounded-lg">
                          <span className="text-tertiary">1 USD =</span>
                          <input type="number" step="0.01" value={exportRates.USD_TO_CNY} onChange={e => setExportRates({...exportRates, USD_TO_CNY: Number(e.target.value)})} className="bg-card border border-app rounded w-20 px-2 py-1 outline-none text-primary" />
                       </div>
                       <div className="flex items-center justify-between text-xs bg-card-inner p-2 rounded-lg">
                          <span className="text-tertiary">1 THB =</span>
                          <input type="number" step="0.001" value={exportRates.THB_TO_CNY} onChange={e => setExportRates({...exportRates, THB_TO_CNY: Number(e.target.value)})} className="bg-card border border-app rounded w-20 px-2 py-1 outline-none text-primary" />
                       </div>
                       <div className="flex items-center justify-between text-xs bg-card-inner p-2 rounded-lg">
                          <span className="text-tertiary">1 VND =</span>
                          <input type="number" step="0.0001" value={exportRates.VND_TO_CNY} onChange={e => setExportRates({...exportRates, VND_TO_CNY: Number(e.target.value)})} className="bg-card border border-app rounded w-20 px-2 py-1 outline-none text-primary" />
                       </div>
                    </div>

                    <div className="border-t border-app pt-4 mb-6">
                       <div className="flex justify-between items-center mb-2">
                         <div className="text-xs text-secondary font-medium">{t('汇总结果')}</div>
                         <button 
                            onClick={async () => {
                               const thisMonth = (config.reimbursements || []).filter((r: any) => r.date.startsWith(`${localTime.getFullYear()}-${(localTime.getMonth() + 1).toString().padStart(2, '0')}`));
                               const text = thisMonth.map(r => `${r.date} | ${r.desc} | ${r.amount} ${r.currency}`).join('\n');
                               try {
                                  await navigator.clipboard.writeText(text);
                                  setToast({ message: t('已复制报销明细'), type: 'info' });
                               } catch(e) {
                                  setToast({ message: t('复制失败'), type: 'warn' });
                               }
                            }}
                            className="text-[10px] text-brand hover:underline"
                         >
                            {t('复制明细')}
                                                                   </button>
                       </div>
                       {(() => {
                          const thisMonth = (config.reimbursements || []).filter((r: any) => r.date.startsWith(`${localTime.getFullYear()}-${(localTime.getMonth() + 1).toString().padStart(2, '0')}`));
                          let totalCNY = 0;
                          thisMonth.forEach((r: any) => {
                             if (r.currency === 'CNY') totalCNY += r.amount;
                             if (r.currency === 'USD') totalCNY += r.amount * (exportRates.USD_TO_CNY || 7.2);
                             if (r.currency === 'THB') totalCNY += r.amount * (exportRates.THB_TO_CNY || 0.2);
                             if (r.currency === 'VND') totalCNY += r.amount * (exportRates.VND_TO_CNY || 0.0003);
                          });
                          const totalUSD = totalCNY / (exportRates.USD_TO_CNY || 7.2);
                          return (
                             <div className="space-y-2">
                                <div className="bg-brand/10 text-brand p-3 rounded-xl border border-brand/20 flex flex-col">
                                   <span className="text-[10px] opacity-80 mb-1">{t('总计 (CNY)')}</span>
                                   <span className="text-xl font-bold font-mono">¥ {totalCNY.toFixed(2)}</span>
                                </div>
                                <div className="bg-card-inner text-primary p-3 rounded-xl border border-app flex flex-col">
                                   <span className="text-[10px] text-tertiary mb-1">{t('等值美元 (USD)')}</span>
                                   <span className="text-md font-bold font-mono">$ {totalUSD.toFixed(2)}</span>
                                </div>
                                <div className="text-[10px] text-tertiary max-h-32 overflow-y-auto mt-2">
                                   {thisMonth.map((r: any, i: number) => (
                                      <div key={i} className="flex justify-between border-b border-app/50 py-1.5 last:border-0">
                                         <span className="truncate pr-2">{r.date} {r.desc}</span>
                                         <span className="font-mono whitespace-nowrap">{['CNY','USD'].includes(r.currency)?(r.currency==='CNY'?'¥':'$'):''}{r.amount.toFixed(2)} {r.currency}</span>
                                      </div>
                                   ))}
                                </div>
                             </div>
                          );
                       })()}
                    </div>

                    <button onClick={() => setShowExportModal(false)} className="w-full py-2.5 rounded-xl border border-app-strong text-xs font-bold text-secondary hover:bg-card-inner hover:text-primary transition-colors">{t('关闭')}</button>
                 </div>
              </div>
           )}

          </div>
      )}

      {activeTab === 'profile' && (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 md:px-8 py-8 space-y-4 pb-24 max-w-5xl mx-auto w-full">
           <div className="flex items-center justify-between mb-2">
             <h2 className="text-xl font-bold text-primary">{t('牛马设置中心')}</h2>
             
           </div>
           <p className="text-xs text-secondary mb-4">{t('精准的参数才能算出精准的摸鱼收益。')}</p>
           
           <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand shrink-0">
                 <RefreshCw size={20} />
              </div>
              <div className="flex-1">
                 <p className="text-xs font-bold text-brand mb-0.5">{t('隐私保护')}</p>
                 <p className="text-[10px] text-secondary">{t('你的时间有价值，你的数据也一样。所有信息仅存于本地，收入只有你自己知道。')}</p>
              </div>
           </div>
           <div className="bg-card rounded-2xl p-5 border border-app space-y-5 shadow-lg">
              <div>
                 <label className="text-xs text-secondary mb-1.5 block">{t('每月税后薪资 (人民币)')}</label>
                 <input type="number" 
                   className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-brand font-mono text-base focus:border-brand focus:outline-none transition-colors"
                   value={config.monthlySalary === 0 ? '' : config.monthlySalary}
                   onChange={e => setConfig({...config, monthlySalary: e.target.value === '' ? 0 : Number(e.target.value)})}
                 />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('公共假期地区')}</label>
                    <select 
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.holidayRegion}
                      onChange={e => setConfig({...config, holidayRegion: e.target.value})}
                    >
                      <option value="CN">{t('🇨🇳 中国内地')}</option>
                      <option value="HK">{t('🇭🇰 中国香港')}</option>
                      <option value="TH">{t('🇹🇭 泰国')}</option>
                      <option value="VN">{t('🇻🇳 越南')}</option>
                    </select>
                 </div>
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('休息日设置')}</label>
                    <select 
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.restDays}
                      onChange={e => setConfig({...config, restDays: Number(e.target.value)})}
                    >
                      <option value={2}>{t('双休 (周末)')}</option>
                      <option value={1}>{t('单休 (周日)')}</option>
                    </select>
                 </div>
              </div>
              <div>
                 <label className="text-xs text-secondary mb-1.5 block">{t('每日工作时长 (小时)')} <span className="text-[10px] opacity-60 ml-1">{t('自动计算')}</span></label>
                 <div
                   className="w-full flex items-center bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] text-primary font-mono text-base opacity-70"
                 >
                   {derivedHoursPerDay.toFixed(1)}
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('发薪日 (每月X号)')}</label>
                    <input type="number" 
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.payday === 0 ? '' : config.payday}
                      onChange={e => setConfig({...config, payday: e.target.value === '' ? 0 : Number(e.target.value)})}
                    />
                 </div>
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('入职时间')}</label>
                    <input type="date"
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.joinDate}
                      onChange={e => setConfig({...config, joinDate: e.target.value})}
                    />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('首次发薪时间')}</label>
                    <input type="date"
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.firstPayDate || config.joinDate}
                      onChange={e => setConfig({...config, firstPayDate: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('汇率 (USD/CNY)')}</label>
                    <input type="number" step="0.01"
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.exchangeRateUsd === 0 ? '' : config.exchangeRateUsd}
                      onChange={e => setConfig({...config, exchangeRateUsd: e.target.value === '' ? 0 : Number(e.target.value)})}
                    />
                 </div>
              </div>
              <div>
                 <label className="text-xs text-secondary mb-1.5 block">{t('牛马个性化形象')}</label>
                 <select 
                   className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border text-primary text-base focus:border-brand focus:outline-none transition-colors"
                   value={config.avatarTheme || 'default'}
                   onChange={e => setConfig({...config, avatarTheme: e.target.value})}
                 >
                   <option value="default">{t('默认牛马 🐮')}</option>
                   <option value="cyberpunk">{t('赛博朋克 🤖')}</option>
                   <option value="retro">{t('复古像素 👾')}</option>
                   <option value="classic">{t('经典马儿 🐴')}</option>
                 </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('上班时间')}</label>
                    <input type="time"
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.startTime}
                      onChange={e => setConfig({...config, startTime: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="text-xs text-secondary mb-1.5 block">{t('下班时间')}</label>
                    <input type="time"
                      className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                      value={config.endTime}
                      onChange={e => setConfig({...config, endTime: e.target.value})}
                    />
                 </div>
              </div>
              <div className="flex items-center justify-between pb-1 mt-4">
                 <span className="text-sm font-medium text-primary">{t('是否有午休时长')}</span>
                 <button 
                   className={`w-12 h-6 rounded-full p-1 transition-colors relative ${config.hasLunchBreak ? 'bg-brand' : 'bg-gray-700'}`}
                   onClick={() => setConfig({...config, hasLunchBreak: !config.hasLunchBreak})}
                 >
                   <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.hasLunchBreak ? 'translate-x-6' : 'translate-x-0'}`}></div>
                 </button>
              </div>
              {config.hasLunchBreak && (
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="text-xs text-secondary mb-1.5 block flex items-center gap-1"><span className="text-[10px]">🍚</span> {t('午休开始')}</label>
                      <input type="time"
                        className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                        value={config.lunchStartTime}
                        onChange={e => setConfig({...config, lunchStartTime: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="text-xs text-secondary mb-1.5 block flex items-center gap-1"><span className="text-[10px]">💼</span> {t('午休结束')}</label>
                      <input type="time"
                        className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                        value={config.lunchEndTime}
                        onChange={e => setConfig({...config, lunchEndTime: e.target.value})}
                      />
                   </div>
                </div>
              )}
              <hr className="border-app my-2" />
              <div className="flex items-center justify-between">
                 <label className="text-xs text-secondary font-medium block">{t('自定义倒计时记录')}</label>
                 <button 
                   onClick={() => setConfig({
                     ...config, 
                     customEvents: [...(config.customEvents || []), { id: Math.random().toString(), name: t('新事件'), date: new Intl.DateTimeFormat('en-CA', { timeZone: config.localTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), color: 'purple' }]
                   })}
                   className="text-xs text-brand border border-brand/30 px-3 py-1 rounded-full hover:bg-brand/10 transition-colors"
                 >{t('添加 +')}</button>
              </div>
              <div className="space-y-4">
                 {(config.customEvents || []).map((evt: any, i: number) => (
                    <div key={evt.id} className="p-3 bg-card-inner/50 rounded-xl border border-app relative flex flex-col gap-3">
                       <button 
                         onClick={() => setConfig({
                             ...config, 
                             customEvents: config.customEvents.filter((e: any) => e.id !== evt.id)
                         })}
                         className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500/20"
                       ><span className="text-xs">×</span></button>
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                             <label className="text-[10px] text-tertiary mb-1 block">{t('名称')}</label>
                             <input type="text"
                               className="w-full appearance-none m-0 bg-card border border-app rounded-lg px-2 h-[36px] box-border text-[13px] text-primary focus:border-brand focus:outline-none"
                               value={evt.name}
                               onChange={e => {
                                 const updated = [...config.customEvents];
                                 updated[i].name = e.target.value;
                                 setConfig({...config, customEvents: updated});
                               }}
                             />
                          </div>
                          <div>
                             <label className="text-[10px] text-tertiary mb-1 block">{t('颜色')}</label>
                             <select
                               className="w-full appearance-none m-0 bg-card border border-app rounded-lg px-2 h-[36px] box-border text-[13px] text-primary focus:border-brand focus:outline-none"
                               value={evt.color}
                               onChange={e => {
                                 const updated = [...config.customEvents];
                                 updated[i].color = e.target.value;
                                 setConfig({...config, customEvents: updated});
                               }}
                             >
                                <option value="purple">{t('紫色')}</option>
                                <option value="amber">{t('橙色')}</option>
                                <option value="red">{t('红色')}</option>
                                <option value="green">{t('绿色')}</option>
                                <option value="yellow">{t('黄色')}</option>
                                <option value="blue">{t('蓝色')}</option>
                             </select>
                          </div>
                       </div>
                       <div>
                          <label className="text-[10px] text-tertiary mb-1 block">{t('日期')}</label>
                          <input type="date"
                            className="w-full appearance-none m-0 bg-card border border-app rounded-lg px-3 h-[36px] block box-border text-primary font-mono text-sm focus:border-brand focus:outline-none"
                            value={evt.date}
                            onChange={e => {
                               const updated = [...config.customEvents];
                               updated[i].date = e.target.value;
                               setConfig({...config, customEvents: updated});
                            }}
                          />
                       </div>
                    </div>
                 ))}
                 {(!config.customEvents || config.customEvents.length === 0) && (
                    <div className="text-center py-6 text-tertiary text-xs bg-card-inner/30 rounded-xl border border-app border-dashed">
                      {t('暂无自定义记录')}
                                                      </div>
                 )}
              </div>

              <div>
                 <label className="text-xs text-secondary mb-1.5 block">{t('预期退休日期')}</label>
                 <input type="date"
                   className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary font-mono text-base focus:border-brand focus:outline-none transition-colors"
                   value={config.retirementDate}
                   onChange={e => setConfig({...config, retirementDate: e.target.value})}
                 />
              </div>
           </div>

           <div className="bg-card rounded-2xl p-5 md:p-8 lg:p-10 border border-app space-y-4 shadow-lg max-w-4xl mx-auto mb-4">
               <div>
                  <h3 className="text-sm font-bold text-primary mb-1">{t('循环提醒功能')}</h3>
                  <p className="text-xs text-secondary mb-4">{t('后台稳定运行的定时提醒（如喝水/站立）。')}</p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-xs text-secondary mb-1.5 block">{t('提醒间隔 (分钟)')}</label>
                     <input type="number" 
                       className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-brand font-mono text-base focus:border-brand focus:outline-none transition-colors"
                       value={reminderMins}
                       onChange={e => {
                         const v = Number(e.target.value);
                         setReminderMins(v);
                         if (!isReminderActive) setReminderTimeLeft(v * 60);
                       }}
                     />
                  </div>
                  <div>
                     <label className="text-xs text-secondary mb-1.5 block">{t('提醒内容')}</label>
                     <input type="text" 
                       className="w-full bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border text-primary font-sans text-sm focus:border-brand focus:outline-none transition-colors"
                       value={reminderText}
                       onChange={e => setReminderText(e.target.value)}
                     />
                  </div>
               </div>
               <button
                 onClick={() => {
                    if (!isReminderActive && 'Notification' in window && Notification.permission === "default") {
                       Notification.requestPermission().catch(()=>{});
                    }
                    setIsReminderActive(!isReminderActive);
                    if (!isReminderActive) {
                       setReminderTimeLeft(reminderMins * 60);
                    }
                 }}
                 className={`w-full py-3 rounded-xl font-semibold text-sm transition-all shadow-lg ${isReminderActive ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-brand text-[#141414]'}`}
               >
                 {isReminderActive ? tf('停止提醒 (剩余 {n} 分钟)', { n: Math.floor(reminderTimeLeft / 60) }) : t('开启提醒')}
               </button>
           </div>

           <div className="bg-card rounded-2xl p-5 md:p-8 lg:p-10 border border-app space-y-4 shadow-lg max-w-4xl mx-auto mb-4">
               <div>
                  <h3 className="text-sm font-bold text-primary mb-1">{t('提示音设置')}</h3>
                  <p className="text-xs text-secondary mb-4">{t('设定番茄钟与提醒的提示音。')}</p>
               </div>
               <div className="grid grid-cols-3 gap-4">
                  <div>
                     <label className="text-xs text-secondary mb-1.5 block">{t('番茄钟开始')}</label>
                     <select 
                       className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border text-primary text-sm focus:border-brand focus:outline-none transition-colors"
                       value={config.pomodoroStartSound}
                       onChange={e => {
                         setConfig({...config, pomodoroStartSound: e.target.value});
                         if(e.target.value !== 'none') playAlertSound(e.target.value);
                       }}
                     >
                       <option value="none">{t('无')}</option>
                       <option value="beep">{t('短促 (Beep)')}</option>
                       <option value="bell">{t('清脆 (Bell)')}</option>
                       <option value="chime">{t('和弦 (Chime)')}</option>
                       <option value="digital">{t('电子 (Digital)')}</option>
                     </select>
                  </div>
                  <div>
                     <label className="text-xs text-secondary mb-1.5 block">{t('番茄钟结束')}</label>
                     <select 
                       className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border text-primary text-sm focus:border-brand focus:outline-none transition-colors"
                       value={config.pomodoroEndSound}
                       onChange={e => {
                         setConfig({...config, pomodoroEndSound: e.target.value});
                         if(e.target.value !== 'none') playAlertSound(e.target.value);
                       }}
                     >
                       <option value="none">{t('无')}</option>
                       <option value="beep">{t('短促 (Beep)')}</option>
                       <option value="bell">{t('清脆 (Bell)')}</option>
                       <option value="chime">{t('和弦 (Chime)')}</option>
                       <option value="digital">{t('电子 (Digital)')}</option>
                     </select>
                  </div>
                  <div>
                     <label className="text-xs text-secondary mb-1.5 block">{t('提醒/休息结束')}</label>
                     <select 
                       className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border text-primary text-sm focus:border-brand focus:outline-none transition-colors"
                       value={config.pomodoroBreakSound}
                       onChange={e => {
                         setConfig({...config, pomodoroBreakSound: e.target.value});
                         if(e.target.value !== 'none') playAlertSound(e.target.value);
                       }}
                     >
                       <option value="none">{t('无')}</option>
                       <option value="beep">{t('短促 (Beep)')}</option>
                       <option value="bell">{t('清脆 (Bell)')}</option>
                       <option value="chime">{t('和弦 (Chime)')}</option>
                       <option value="digital">{t('电子 (Digital)')}</option>
                     </select>
                  </div>
               </div>
           </div>

           <div className="bg-card rounded-2xl p-5 md:p-8 lg:p-10 border border-app space-y-5 shadow-lg max-w-4xl mx-auto mb-4">
             
                 <div className="pt-4 border-t border-app-strong"></div>
                 <h3 className="text-sm font-bold text-primary mb-2">{t('自定义购买力换算')}</h3>
                 <div className="grid grid-cols-2 gap-3">
                   <div>
                      <label className="text-xs text-secondary mb-1.5 block">{t('自定义物品名称')}</label>
                      <input type="text" 
                        className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary text-base focus:border-brand focus:outline-none transition-colors"
                        value={config.customItemName}
                        onChange={e => setConfig({...config, customItemName: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="text-xs text-secondary mb-1.5 block">{t('金额 (人民币)')}</label>
                      <input type="number" 
                        className="w-full appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-brand font-mono text-base focus:border-brand focus:outline-none transition-colors"
                        value={config.customItemPrice === 0 ? '' : config.customItemPrice}
                        onChange={e => setConfig({...config, customItemPrice: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                      />
                   </div>
                 </div>

           </div>
           
           
           
           <div className="bg-card rounded-2xl p-5 border border-app space-y-4 shadow-lg mt-4">
              <h3 className="text-sm font-bold text-primary mb-2">{t('配置方案保存')}</h3>
              <div className="flex gap-2 items-center">
                 <input type="text"
                   placeholder={t('输入方案名称，例如: 方案一线城市')}
                   className="flex-1 appearance-none m-0 bg-card-inner border border-app-strong rounded-xl px-3 h-[44px] block box-border placeholder:text-secondary/50 text-primary text-base focus:border-brand focus:outline-none transition-colors"
                   value={currentProfileName}
                   onChange={e => setCurrentProfileName(e.target.value)}
                 />
                 <button 
                   onClick={() => {
                     if (!currentProfileName) return;
                     const newProfiles = [...profiles.filter(p => p.name !== currentProfileName), { name: currentProfileName, config: {...config} }];
                     setProfiles(newProfiles);
                     setCurrentProfileName('');
                   }}
                   className="px-4 py-2 bg-brand text-app font-bold rounded-xl whitespace-nowrap hover:bg-brand-hover"
                 >{t('保存当前')}</button>
              </div>
              {profiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {profiles.map(p => (
                    <div key={p.name} className="flex items-center bg-card-inner border border-app rounded-full px-3 py-1 text-xs">
                       <span className="text-primary mr-2">{p.name}</span>
                       <button onClick={() => setConfig(p.config)} className="text-brand hover:underline mr-2">{t('载入')}</button>
                       <button onClick={() => setProfiles(profiles.filter(x => x.name !== p.name))} className="text-red-500 hover:underline">{t('删除')}</button>
                    </div>
                  ))}
                </div>
              )}
           </div>

           <div className="bg-card rounded-2xl p-5 md:p-8 lg:p-10 border border-brand/20 max-w-4xl mx-auto mt-4">
              <h3 className="text-xs text-brand font-bold mb-3 uppercase tracking-wider">{t('实时时薪预估')}</h3>
              <div className="flex justify-between items-center text-sm mb-1">
                 <span className="text-secondary">{t('时薪:')}</span>
                 <span className="text-primary font-mono">¥ {hourlyRate.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-secondary">{t('分钟薪:')}</span>
                 <span className="text-primary font-mono">¥ {minuteRate.toFixed(2)}</span>
              </div>
           </div>

           <div className="mt-8 text-center opacity-50 flex flex-col gap-1 text-[11px] font-mono text-tertiary pb-8">
              <p>Architect & Author</p>
              <p className="font-semibold text-primary">Barry</p>
              <a href="mailto:barry.bai@hotwavehk.com" className="hover:text-brand transition-colors">barry.bai@hotwavehk.com</a>
              <p className="mt-2 text-[10px] tracking-widest uppercase">Version {APP_VERSION}</p>
           </div>
        </div>
      )}

      
      {activeTab === 'pomodoro' && (
        <div className={`flex-1 overflow-y-auto no-scrollbar px-4 md:px-8 pt-6 pb-24 md:rounded-3xl max-w-4xl mx-auto w-full transition-colors duration-1000 bg-card-inner`}>
           <div className="flex flex-col items-center justify-center min-h-full py-10">
             
             <div className="mb-8 w-full max-w-sm text-center">
               <h2 className="text-2xl font-bold tracking-tight text-primary">{t('沉浸番茄钟')}</h2>
               <p className="text-xs text-secondary mt-1 font-medium">{t('专注一炷香，干完去放飞')}</p>
             </div>

             <div className="w-full max-w-sm bg-card border border-app rounded-[32px] p-6 shadow-2xl relative flex flex-col items-center shrink-0">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full pointer-events-none" />
                 
                 <FocusVisualizer 
                   containerId={pomodoroContainer} 
                   timeLeft={pomodoroTimeLeft}
                   lengthMins={pomodoroLength}
                   isActive={isPomodoroActive}
                 />

                 {/* task input */}
                 <div className="w-full mb-6 relative z-10">
                    <input 
                      type="text" 
                      value={pomodoroTask}
                      onChange={(e) => setPomodoroTask(e.target.value)}
                      placeholder={t('今日待办事项...')} 
                      className="w-full bg-card-inner border border-app rounded-xl p-3 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand shadow-inner text-primary placeholder:text-tertiary"
                    />
                 </div>

                 {/* Focus Income Tracker */}
                 <div className="mb-6 w-full max-w-[200px] flex flex-col items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-brand/5 to-transparent border border-brand/10 relative z-10">
                   <span className="text-[10px] text-tertiary mb-1">{t('本次专注已赚取')}</span>
                   <span className="text-xl font-mono font-bold text-brand shadow-sm">
                     ¥{formatMoney(((pomodoroLength * 60 - pomodoroTimeLeft) / 60) * minuteRate)}
                   </span>
                 </div>

                 {/* buttons */}
                 <div className="flex items-center gap-4 relative z-20 pb-4">
                    {!isPomodoroActive && (pomodoroTimeLeft >= pomodoroLength * 60 - 5) ? (
                       <button 
                         onClick={togglePomodoro} 
                         className="px-10 py-5 bg-brand text-[#141414] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,65,0.4)] hover:scale-105 active:scale-95 transition-all text-lg font-black"
                       >
                         <Play size={24} className="mr-3 fill-current" />
                         {t('开始专注')}
                                                             </button>
                    ) : (
                       <div className="flex gap-4">
                         <button 
                           onClick={togglePomodoro} 
                           className="px-8 py-4 bg-brand text-[#141414] rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all font-bold"
                         >
                           {isPomodoroActive ? (
                             <><Pause size={22} className="mr-2 fill-current" /> {t('暂停')}</>
                           ) : (
                             <><Play size={22} className="mr-2 fill-current" /> {t('继续')}</>
                           )}
                         </button>
                         <button 
                           onClick={resetPomodoro} 
                           className="px-8 py-4 bg-card-inner border border-app text-red-500 rounded-2xl flex items-center justify-center shadow hover:scale-105 active:scale-95 transition-all font-bold"
                         >
                           <Square size={22} className="mr-2 fill-current" /> {t('结束')}
                                                                       </button>
                       </div>
                    )}
                 </div>
             </div>

             <div className="w-full max-w-sm mt-8 space-y-6">
                 <div>
                   <h3 className="text-sm font-bold text-primary mb-3">{t('燃烧时间的容器')}</h3>
                   <div className="grid grid-cols-5 gap-2">
                     {FOCUS_CONTAINERS.map(c => (
                        <button 
                          key={c.id}
                          onClick={() => { setPomodoroContainer(c.id); handlePomodoroLengthChange(c.defaultTime); }}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border ${pomodoroContainer === c.id ? 'bg-brand/10 border-brand/50 text-brand' : 'bg-card border-app text-secondary hover:text-primary'} transition-colors`}
                          title={c.name}
                        >
                           <span className="text-2xl mb-1">{c.emoji}</span>
                           <span className="text-[10px] whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{c.name}</span>
                        </button>
                     ))}
                   </div>
                 </div>

                 <div>
                   <h3 className="text-sm font-bold text-primary mb-3 flex items-center justify-between">
                     <span>{t('环境白噪音')}</span>
                     <span className="text-[10px] text-tertiary">{t('可多选')}</span>
                   </h3>
                   <div className="grid grid-cols-5 gap-2">
                     {[
                       { id: 'rain', name: t('雨声'), emoji: '🌧️' },
                       { id: 'fire', name: t('篝火'), emoji: '🔥' },
                       { id: 'train', name: t('火车'), emoji: '🚂' },
                       { id: 'ocean', name: t('海浪'), emoji: '🌊' },
                       { id: 'birds', name: t('鸟鸣'), emoji: '🐦' },
                       { id: 'wind', name: t('清风'), emoji: '🌬️' },
                       { id: 'stream', name: t('溪流'), emoji: '🏞️' },
                       { id: 'keyboard', name: t('键盘'), emoji: '⌨️' },
                       { id: 'clock', name: t('钟表'), emoji: '🕰️' }
                     ].map(bgm => {
                        const isActiveBg = activeBgms.includes(bgm.id);
                        return (
                          <button 
                            key={bgm.id}
                            onClick={() => {
                               if (isActiveBg) {
                                  setActiveBgms(activeBgms.filter(x => x !== bgm.id));
                                  stopNoise(bgm.id);
                               } else {
                                  setActiveBgms([...activeBgms, bgm.id]);
                                  playNoise(bgm.id);
                               }
                            }}
                            className={`flex flex-col items-center justify-center py-3 rounded-xl border ${isActiveBg ? 'bg-brand/10 border-brand/50 text-brand shadow-[0_0_10px_rgba(0,255,65,0.2)]' : 'bg-card border-app text-secondary hover:text-primary'} transition-all`}
                          >
                             <span className="text-xl mb-1">{bgm.emoji}</span>
                             <span className="text-[10px]">{bgm.name}</span>
                          </button>
                        );
                     })}
                   </div>
                 </div>
             </div>

             {completedPomodoros > 0 && (
                <div className="mt-6 text-sm text-secondary flex items-center gap-2">
                   {t('今日已集齐')} <span className="text-brand font-bold">{completedPomodoros}</span> {t('个番茄 🍅')}
                                              </div>
             )}
           </div>
        </div>
      )}
{activeTab === 'calendar' && (() => {
        let calWorkDays = 0;
        let calRestDays = 0;
        const calDaysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
        for (let date = 1; date <= calDaysInMonth; date++) {
          const d = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), date);
          const dayOfWeek = d.getDay();
          const isStandardWeekend = config.restDays === 2 ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0);
          const isCustomHoliday = isDateCustomHoliday(d, config.holidayRegion);
          const isCustomWorkday = isDateCustomWorkday(d, config.holidayRegion);

          let isRest = (isStandardWeekend || isCustomHoliday) && !isCustomWorkday;
          
          const memoKey = `${calendarDate.getFullYear()}-${(calendarDate.getMonth() + 1).toString().padStart(2, '0')}-${date.toString().padStart(2, '0')}`;
          const dayMemos = (memos || {})[memoKey] || [];
          const isPaidLeave = dayMemos.some((m: any) => m.type === 'paid_leave');
          const isUnpaidLeave = dayMemos.some((m: any) => m.type === 'unpaid_leave');
          
          if (isPaidLeave || isUnpaidLeave) {
             isRest = true;
          }

          if (isRest) {
             calRestDays++;
          } else {
             calWorkDays++;
          }
        }
        
        const getRegionName = (code: string) => {
          switch (code) {
            case 'CN': return t('中国大陆');
            case 'HK': return t('中国香港');
            case 'TH': return t('泰国');
            case 'VN': return t('越南');
            default: return t('本地区');
          }
        };

        return (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 md:px-8 py-8 space-y-4 pb-24 absolute inset-0 top-0 bg-card-inner z-40 md:rounded-3xl max-w-4xl mx-auto w-full">
           <div className="flex items-center justify-between mt-2 mb-2">
              <button onClick={() => setActiveTab('home')} className="p-2 bg-card rounded-full border border-app text-primary">
                 <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-primary">{getRegionName(config.holidayRegion)}{t('工作日历')}</span>
              <div className="flex gap-2">
                 <button onClick={() => setCalendarDate(new Date())} className="px-3 py-1 bg-card rounded-full border border-app text-xs text-primary">
                    {t('今')}
                                             </button>
              </div>
           </div>

           <div className="bg-card rounded-2xl p-3 border border-app flex items-center justify-between shadow-lg">
              <button 
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} 
                className="p-2 bg-card-inner rounded-full border border-app text-brand hover:bg-app"
              ><ChevronLeft size={16} /></button>
              <div className="text-center">
                 <div className="text-lg font-bold text-primary">{calendarDate.getFullYear()}{t('年')}{calendarDate.getMonth() + 1}{t('月')}</div>
                  <div className="text-[10px] text-tertiary">
                    {t('工作日:')} <span className="font-bold text-primary">{calWorkDays}</span>{dayUnit(calWorkDays)} | {t('休息日:')} <span className="font-bold text-primary">{calRestDays}</span>{dayUnit(calRestDays)}
                  </div>
              </div>
              <button 
                 onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} 
                 className="p-2 bg-card-inner rounded-full border border-app text-brand hover:bg-app"
              ><ChevronRight size={16} /></button>
           </div>

            {(() => {
               const isPastMonth = calendarDate.getFullYear() < localTime.getFullYear() || (calendarDate.getFullYear() === localTime.getFullYear() && calendarDate.getMonth() < localTime.getMonth());
               const isFutureMonth = calendarDate.getFullYear() > localTime.getFullYear() || (calendarDate.getFullYear() === localTime.getFullYear() && calendarDate.getMonth() > localTime.getMonth());
               
               let calEarned = 0;
               let calHours = 0;
               let calSlack = 0;
               let calOvertime = 0;
               
               if (isPastMonth) {
                  calEarned = config.monthlySalary;
                  calHours = calWorkDays * derivedHoursPerDay;
                  calSlack = (slackLoss / Math.max(1, localTime.getDate())) * calWorkDays;
                  calOvertime = (overtimeLoss / Math.max(1, localTime.getDate())) * calWorkDays;
               } else if (isFutureMonth) {
                  calEarned = 0;
                  calHours = 0;
                  calSlack = 0;
                  calOvertime = 0;
               } else {
                  calEarned = earnedThisMonth;
                  calHours = hoursThisMonth;
                  calSlack = slackLoss * (localTime.getDate() * 0.7);
                  calOvertime = overtimeLoss * (localTime.getDate() * 0.8);
               }
               
               return (
                 <div className="bg-card rounded-2xl p-4 border border-app grid grid-cols-2 gap-3 shadow-lg relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full"></div>
                   
                   <div className="flex flex-col bg-card-inner p-3 rounded-xl border border-app justify-center mt-1">
                      <span className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><TrendingUp size={10} /> {t('当月总收入')}</span>
                      <span className="text-lg font-mono font-bold text-brand">{sym}{hide(formatMoney(calEarned / ex))}</span>
                   </div>
                   <div className="flex flex-col bg-card-inner p-3 rounded-xl border border-app justify-center mt-1">
                      <span className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><span className="text-[10px]">⏱️</span> {t('当月总工时')}</span>
                      <span className="text-lg font-mono font-bold text-brand">{calHours.toFixed(1)} <span className="text-[10px] text-tertiary font-sans">{t('小时')}</span></span>
                   </div>

                   <div className="flex flex-col bg-card-inner p-3 rounded-xl border border-brand/10 justify-center">
                      <span className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><span className="text-[10px]">🐟</span> {t('月度摸鱼估值')}</span>
                      <span className="text-sm font-mono font-bold text-brand">{sym}{hide(formatMoney(calSlack / ex))}</span>
                   </div>
                   <div className="flex flex-col bg-card-inner p-3 rounded-xl border border-red-500/10 justify-center">
                      <span className="text-[10px] text-tertiary mb-1 flex items-center gap-1"><span className="text-[10px]">🏢</span> {t('月度加班损失')}</span>
                      <span className="text-sm font-mono font-bold text-red-500">{sym}{hide(formatMoney(calOvertime / ex))}</span>
                   </div>
                 </div>
               );
            })()}

            <div className="bg-card rounded-2xl p-4 border border-app shadow-lg relative overflow-hidden">
              <div className="grid grid-cols-7 gap-1 text-center mb-4">
                 {[t('日'),t('一'),t('二'),t('三'),t('四'),t('五'),t('六')].map(d => (
                    <div key={d} className="text-[13px] text-tertiary font-bold py-1">{d}</div>
                 ))}
              </div>
              <CalendarGrid 
                 calendarDate={calendarDate}
                 localTime={localTime}
                 config={config}
                 memos={memos}
                 onDateClick={handleDateClick}
              />
              <div className="text-center mt-6 text-[11px] text-tertiary font-medium bg-card-inner/50 py-2.5 rounded-xl border border-app border-dashed">
                 {t('提示：点击日期记录备忘事项，所有数据均保留在您本地。')}
                                      </div>
              <div className="text-center pt-8 pb-4 opacity-30">
                 <p className="text-[10px] font-mono tracking-widest text-tertiary uppercase">Version {APP_VERSION}</p>
              </div>
            </div>
         </div>
        );
      })()}

      {activeTab === 'visa' && <VisaTab />}

      {activeTab !== 'home' && activeTab !== 'pomodoro' && activeTab !== 'profile' && activeTab !== 'data' && activeTab !== 'calendar' && activeTab !== 'visa' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card-inner z-40 absolute inset-0 top-0">
           <h2 className="text-xl font-bold mb-2">{t('🚧 正在施工')}</h2>
           <p className="text-sm">{t('功能正在开发中...')}</p>
           <p className="text-xs text-secondary mt-1">Please come back later</p>
        </div>
      )}

      
      {/* Memo Modal */}
      <AnimatePresence>
        {selectedMemoDate && (
          <MemoModal 
            key="memo-modal"
            date={selectedMemoDate}
            memos={(memos || {})[selectedMemoDate] || []}
            onClose={handleMemoModalClose}
            onSave={handleMemoModalSave}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
         {showAllCountdowns && (
            <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-md px-0 md:px-4">
               <motion.div 
                 initial={{ y: "100%", opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 exit={{ y: "100%", opacity: 0 }}
                 transition={{ type: "spring", damping: 25, stiffness: 300 }}
                 className="w-full md:max-w-md bg-card rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
               >
                  <div className="p-5 flex justify-between items-center border-b border-app">
                     <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                        <Timer size={20} className="text-brand" />
                        {t('所有记录')}
                                                       </h3>
                     <button onClick={() => setShowAllCountdowns(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-card-inner border border-app text-tertiary hover:text-primary transition-colors">
                        <X size={16} />
                     </button>
                  </div>
                  <div className="p-5 overflow-y-auto space-y-4 no-scrollbar">
                     <div className="grid grid-cols-2 gap-3">
                         <CountdownCard 
                            title={t('下班倒计时')}
                            time={`${pad0(Math.floor(offWorkSecs / 3600))}:${pad0(Math.floor((offWorkSecs % 3600)/60))}:${pad0(offWorkSecs % 60)}`}
                            desc={tf('{time}下班', { time: config.endTime })}
                            progress={100 - (offWorkSecs / (derivedHoursPerDay * 3600)) * 100}
                            icon={<Briefcase size={16} />}
                            color="green"
                         />
                         <CountdownCard 
                            title={isRestDay ? t('距离下个休息日') : t('距离休息日')}
                            time={tDays(daysToNextRestDay)}
                            desc={t('盼望好日子')}
                            progress={100 - (daysToNextRestDay / 7) * 100}
                            icon={<CalendarIcon size={16} />}
                            color="yellow"
                         />
                         <CountdownCard 
                            title={t('距离发薪日')}
                            time={tDays(daysToPayday)}
                            desc={tf('{n}号发薪', { n: config.payday })}
                            progress={100 - (daysToPayday / daysInMonth) * 100}
                            icon={<span className="text-sm">💰</span>}
                            color="amber"
                         />
                         <CountdownCard 
                            title={t('距离退休')}
                            time={tDays(daysToRetire, false)}
                            desc={retireDateObj.toLocaleDateString()}
                            progress={daysToRetire < 0 ? 100 : Math.max(0, 100 - (daysToRetire / (365*30)) * 100)}
                            icon={<span className="text-sm">🪑</span>}
                            color="red"
                         />
                         {(config.customEvents || []).map((evt: any) => {
                            const evtDateObj = new Date(evt.date);
                            const daysToEvt = Math.ceil((evtDateObj.getTime() - localTime.getTime()) / (1000 * 3600 * 24));
                            return (
                              <CountdownCard 
                                 key={evt.id}
                                 title={t(evt.name)}
                                 time={daysToEvt < 0 ? tf('已过去 {d}', { d: tDays(Math.abs(daysToEvt)) }) : tDays(daysToEvt)}
                                 desc={evtDateObj.toLocaleDateString()}
                                 progress={daysToEvt < 0 ? 100 : Math.max(0, 100 - (daysToEvt / 365) * 100)}
                                 icon={<span className="text-sm">⭐</span>}
                                 color={evt.color as keyof typeof colorMap || "purple"}
                              />
                            );
                         })}
                     </div>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

        <div 
          className="fixed bottom-0 left-0 right-0 w-full md:max-w-4xl lg:max-w-6xl xl:max-w-[1400px] mx-auto bg-card-inner/90 backdrop-blur-lg border-t md:border border-app pt-2 px-2 sm:px-4 md:px-16 flex justify-evenly md:justify-between items-center z-50 md:rounded-b-3xl md:rounded-t-none md:bottom-4 xl:rounded-3xl shadow-2xl md:mb-4 xl:mb-0 transition-all duration-300"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
         <NavItem icon={<Home size={22} />} label={t('首页')} active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
         <NavItem icon={<Timer size={22} />} label={t('专注')} active={activeTab === 'pomodoro'} onClick={() => setActiveTab('pomodoro')} />
         <NavItem icon={<CalendarIcon size={22} />} label={t('日历')} active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setCalendarDate(new Date()); }} />
         <NavItem icon={<Globe size={22} />} label={t('签证')} active={activeTab === 'visa'} onClick={() => setActiveTab('visa')} />
         <NavItem icon={<PieChart size={22} />} label={t('数据')} active={activeTab === 'data'} onClick={() => setActiveTab('data')} />
         <NavItem icon={<Settings size={22} />} label={t('设定')} active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
      </div>
      
      {/* Off-screen Share Layout */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        <div ref={shareRef} style={{ width: '375px', backgroundColor: '#0E0E10', color: '#E0E0E0', padding: '24px', borderRadius: '24px', fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden' }}>
          {/* Replaced blur with a simple colored circle to avoid filter issues */}
          <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', backgroundColor: 'rgba(76, 175, 80, 0.1)', borderRadius: '50%' }} />
          
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: '14px', width: '100%', textAlign: 'center' }}>T</span>
              </div>
              <span style={{ fontWeight: 'bold', fontSize: '18px', letterSpacing: '-0.025em' }}>TimeMeter</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#888888', marginBottom: '4px' }}>{t('今日摸鱼收入')}</p>
                <div style={{ fontSize: '36px', fontFamily: 'monospace', fontWeight: 'bold', color: '#4CAF50' }}>¥{formatMoney(earnedToday)}</div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ backgroundColor: '#1A1A1E', padding: '16px', borderRadius: '16px', border: '1px solid #2A2A2E' }}>
                  <p style={{ fontSize: '12px', color: '#888888', marginBottom: '4px' }}>{t('本月累计')}</p>
                  <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: '600' }}>¥{formatMoney(earnedThisMonth)}</div>
                </div>
                <div style={{ backgroundColor: '#1A1A1E', padding: '16px', borderRadius: '16px', border: '1px solid #2A2A2E' }}>
                  <p style={{ fontSize: '12px', color: '#888888', marginBottom: '4px' }}>{t('奶茶换算')}</p>
                  <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>🧋</span> {(earnedToday / MILK_TEA_PRICE).toFixed(1)} {t('杯')}
                                                        </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.2)', padding: '16px', borderRadius: '16px', marginTop: '16px' }}>
                <p style={{ color: '#81C784', fontWeight: '500', fontSize: '14px', lineHeight: '1.6' }}>{t('我今天用 TimeMeter 赚了 ¥')}{formatMoney(earnedToday).split('.')[0]}{t('，相当于')} {Math.floor(earnedToday / MILK_TEA_PRICE)} {t('杯奶茶的自由！')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showShareModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-app p-4 rounded-3xl max-w-sm w-full shadow-2xl flex flex-col items-center"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-semibold text-primary mb-4 text-lg">{t('一键生成分享图')}</h3>
              {shareImgUrl ? (
                <img src={shareImgUrl} alt="Share" className="w-full rounded-2xl shadow-lg border border-app filter brightness-[0.85]" />
              ) : (
                <div className="w-full aspect-[3/4] bg-card-inner rounded-2xl animate-pulse flex items-center justify-center text-secondary text-sm">{t('生成中...')}</div>
              )}
              <p className="text-xs text-secondary mt-4 text-center">{t('长按图片保存或分享给其他人')}</p>
              <button 
                className="w-full mt-4 py-3 bg-brand text-[#141414] font-semibold rounded-xl text-sm"
                onClick={() => setShowShareModal(false)}
              >
                {t('完成')}
                                            </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fortune Modal */}
      <AnimatePresence>
         {fortuneModalOpen && dailyFortune && (
            <motion.div
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
               onClick={() => setFortuneModalOpen(false)}
            >
               <motion.div
                 initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                 className="bg-card border border-app p-6 md:p-8 rounded-3xl max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
                 onClick={e => e.stopPropagation()}
               >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-brand/10 blur-3xl rounded-full"></div>
                 <h3 className="font-bold text-primary mb-6 text-lg tracking-wider">{t('今日专属运势卡')}</h3>
                 
                 <div className="w-24 h-24 rounded-full bg-card-inner border-2 border-app flex items-center justify-center text-5xl mb-4 shadow-inner">
                    {dailyFortune.emoji}
                 </div>
                 
                 <div className={`text-2xl font-black mb-2 ${dailyFortune.color}`}>
                    {dailyFortune.level}
                 </div>
                 
                 <div className="text-sm font-bold text-primary mb-2 px-2">
                    {dailyFortune.text}
                 </div>
                 
                 <div className="text-secondary text-xs leading-relaxed px-4 opacity-80">
                    {dailyFortune.detail}
                 </div>
                 
                 <button 
                   className="w-full mt-8 py-3 bg-card-inner border border-app text-primary font-semibold rounded-xl text-sm hover:bg-app transition-colors"
                   onClick={() => setFortuneModalOpen(false)}
                 >
                   {t('收下运势')}
                                               </button>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-brand text-[#141414] rounded-full shadow-2xl font-bold flex items-center gap-2 border border-brand/50"
          >
            <span>{toast.type === 'warn' ? '⚠️' : 'ℹ️'}</span>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConversionCard({ icon, label, value, unit, color, className = '' }: { icon: React.ReactNode, label: string, value: string, unit: string, color: string, className?: string }) {
  return (
    <div className={`bg-card-inner border border-app rounded-lg p-1.5 flex flex-col items-center justify-center relative overflow-hidden group min-w-0 h-[60px] shrink-0 w-[72px] ${className}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <div className="transition-transform group-hover:scale-110 duration-300">{icon}</div>
        <div className="text-[9px] text-secondary truncate">{label}</div>
      </div>
      <div className="flex items-baseline gap-0.5 text-center px-1">
        <span className={`text-[11px] font-mono font-semibold ${color} truncate`}>{value}</span>
        <span className="text-[8px] text-tertiary shrink-0">{unit}</span>
      </div>
    </div>
  );
}

const colorMap = {
  green: { bg: 'bg-brand/10', text: 'text-brand', border: 'border-brand/20', bar: 'bg-brand shadow-[0_0_8px_rgba(0,255,65,0.4)]' },
  yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20', bar: 'bg-yellow-500' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20', bar: 'bg-amber-500' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20', bar: 'bg-purple-500' },
  red: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20', bar: 'bg-red-500' },
};

function CountdownCard({ title, time, desc, progress, icon, color }: { key?: React.Key, title: string, time: string, desc: string, progress: number, icon: React.ReactNode, color: keyof typeof colorMap }) {
  const styles = colorMap[color];
  const w = Math.max(0, Math.min(100, progress));
  
  return (
    <div className={`min-w-[124px] snap-center bg-card border border-app rounded-2xl p-3 flex flex-col relative`}>
       <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${styles.bg} ${styles.text}`}>
          {icon}
       </div>
       <div className="text-[10px] text-secondary mb-1">{title}</div>
       <div className={`text-xl font-mono font-semibold mb-0.5 tracking-tight ${styles.text}`}>{time}</div>
       <div className="text-[9px] text-tertiary mb-4">{desc}</div>
       
       <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-card-inner border border-app rounded-full overflow-hidden">
             <div className={`h-full ${styles.bar} rounded-full`} style={{ width: `${w}%` }} />
          </div>
          <span className="text-[8px] text-tertiary font-mono w-4 text-right">{Math.round(w)}%</span>
       </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      className="relative flex flex-col items-center justify-center cursor-pointer gap-1 p-2 md:px-4 md:py-2 rounded-2xl transition-all duration-300 hover:bg-white/5 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-brand focus:ring-opacity-50"
      onClick={onClick}
      aria-label={label}
    >
       <div className={`${active ? 'text-brand scale-110' : 'text-tertiary group-hover:text-secondary'} transition-all duration-300 relative z-10`}>
         {icon}
       </div>
       <div className={`text-[10px] md:text-xs transition-all duration-300 ${active ? 'text-brand font-bold' : 'text-tertiary group-hover:text-secondary'} relative z-10`}>
         {label}
       </div>
       {active && (
         <motion.div 
            layoutId="nav-indicator"
            className="absolute bottom-0 w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-brand"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
         />
       )}
    </button>
  );
}

