import { t, toKey } from "./i18n";
import React, { useState, useEffect, useMemo } from 'react';
import { Plane, Star, Trash2, Calendar as CalendarIcon, MapPin, ChevronRight, ArrowLeft } from 'lucide-react';

type VisaData = {
  id: string;
  type: string;
  country: string;
  effectiveDate: string;
  expiryDate: string;
};

type TravelRecord = {
  id: string;
  type: 'entry' | 'exit';
  date: string;
  port: string;
};

// Stored values are the Chinese keys below (language-independent); always display them via t().
const COUNTRIES = ['越南', '泰国', '其他'];
const VIETNAM_PORTS = [
  '友谊关', '东兴', '老街口岸', '胡志明市机场', '河内机场',
  '岘港机场', '芽庄机场', '富国岛机场', '芒街口岸', '高平口岸',
  '谅山口岸', '同登口岸', '其他'
];
const THAILAND_PORTS = [
  '曼谷素万那普机场 (BKK)', '曼谷廊曼机场 (DMK)', '普吉岛机场 (HKT)', '清迈机场 (CNX)', '其他'
];
const ALL_PORTS = [...VIETNAM_PORTS, ...THAILAND_PORTS, '未知口岸'];

const VISA_TYPES = [
  '旅游签 (Tourist)',
  '商务签 (Business)',
  '工作签 (Work)',
  '学生签 (Student)',
  '探亲签 (Family)'
];

// Older versions saved these fields in whatever language was active; map them back to the keys.
const normVisa = (v: VisaData): VisaData => ({ ...v, type: toKey(v.type, VISA_TYPES), country: toKey(v.country, COUNTRIES) });
const normRecord = (r: TravelRecord): TravelRecord => ({ ...r, port: toKey(r.port, ALL_PORTS) });

// 'YYYY-MM-DD' -> local midnight (new Date('YYYY-MM-DD') would be UTC and shift the day)
const parseLocal = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
};
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

const pad0 = (n: number) => n.toString().padStart(2, '0');

export function VisaTab() {
  const [toast, setToast] = useState<string|null>(null);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), 2500); return () => clearTimeout(h); }, [toast]);

  const [visas, setVisas] = useState<VisaData[]>(() => {
    try {
      const saved = localStorage.getItem('my_visas');
      return saved ? (JSON.parse(saved) as VisaData[]).map(normVisa) : [];
    } catch (e) { return []; }
  });

  const [records, setRecords] = useState<TravelRecord[]>(() => {
    try {
      const saved = localStorage.getItem('my_travel_records');
      return saved ? (JSON.parse(saved) as TravelRecord[]).map(normRecord) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    localStorage.setItem('my_visas', JSON.stringify(visas));
  }, [visas]);

  useEffect(() => {
    localStorage.setItem('my_travel_records', JSON.stringify(records));
  }, [records]);

  // View state: 'main' | 'edit-visa' | 'edit-records'
  const [view, setView] = useState<'main' | 'edit-visa' | 'edit-records'>('main');

  // --- Calculations ---
  const activeVisa = visas[0]; // For simplicity, we manage the first visa or allow editing the first
  const isExpired = useMemo(() => {
    if (!activeVisa || !activeVisa.expiryDate) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return parseLocal(activeVisa.expiryDate).getTime() < today.getTime();
  }, [activeVisa]);
  const remainingDays = useMemo(() => {
    if (!activeVisa || !activeVisa.expiryDate) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.max(0, dayDiff(today, parseLocal(activeVisa.expiryDate)));
  }, [activeVisa]);

  const statusColor = useMemo(() => {
     if (!activeVisa) return '#9E9E9E';
     if (remainingDays >= 31) return '#4CAF50'; // 安全
     if (remainingDays >= 16) return '#FFB300'; // 警告
     if (remainingDays >= 8) return '#FF6F00';  // 危险
     return '#E53935'; // 紧急
  }, [remainingDays, activeVisa]);

  const { currentStay, yearTotal } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearEnd = new Date(today.getFullYear(), 11, 31);

    // Days of a stay (both ends inclusive) that fall inside the current calendar year
    const daysInThisYear = (start: Date, end: Date) => {
      const from = start.getTime() > yearStart.getTime() ? start : yearStart;
      const to = end.getTime() < yearEnd.getTime() ? end : yearEnd;
      return Math.max(0, dayDiff(from, to) + 1);
    };

    // Ascending by date; on the same day an entry comes before an exit (same-day trips)
    const asc = [...records].sort((a, b) =>
      parseLocal(a.date).getTime() - parseLocal(b.date).getTime() ||
      (a.type === b.type ? 0 : a.type === 'entry' ? -1 : 1)
    );

    let yTotal = 0;
    let currStay = 0;
    let activeEntry: Date | null = null;

    for (const r of asc) {
      if (r.type === 'entry') {
        activeEntry = parseLocal(r.date);
      } else if (activeEntry) {
        yTotal += daysInThisYear(activeEntry, parseLocal(r.date));
        activeEntry = null;
      }
    }

    if (activeEntry) {
      // currently staying
      currStay = Math.max(0, dayDiff(activeEntry, today) + 1);
      yTotal += daysInThisYear(activeEntry, today);
    }

    return { currentStay: currStay, yearTotal: yTotal };
  }, [records]);


  // --- Sub-View: Edit Visa ---
  const [editingVisa, setEditingVisa] = useState<Partial<VisaData>>({});
  // "其他" country: the typed name lives in its own state so the input stays mounted while typing
  const [countryIsOther, setCountryIsOther] = useState(false);
  const [customCountry, setCustomCountry] = useState('');
  const openEditVisa = () => {
    if (visas.length > 0) {
      setEditingVisa(visas[0]);
      const c = visas[0].country;
      const other = !!c && c !== COUNTRIES[0] && c !== COUNTRIES[1];
      setCountryIsOther(other);
      setCustomCountry(other && c !== '其他' ? c : '');
    } else {
      setCountryIsOther(false);
      setCustomCountry('');
      setEditingVisa({ type: VISA_TYPES[0], country: COUNTRIES[0], effectiveDate: '', expiryDate: '' });
    }
    setView('edit-visa');
  };

  const saveVisa = () => {
    if (!editingVisa.type || !editingVisa.country || !editingVisa.effectiveDate || !editingVisa.expiryDate) {
      setToast(t('请填写完整信息')); return;
    }
    if (parseLocal(editingVisa.expiryDate).getTime() < parseLocal(editingVisa.effectiveDate).getTime()) {
      setToast(t('到期日期不能早于生效日期')); return;
    }
    const newVisa = { id: editingVisa.id || Date.now().toString(), ...editingVisa } as VisaData;
    setVisas([newVisa]);
    setView('main');
  };

  const deleteVisa = () => {
    setVisas([]);
    setView('main');
  };

  // --- Sub-View: Edit Records ---
  const [newRecType, setNewRecType] = useState<'entry'|'exit'>('entry');
  const [newRecDate, setNewRecDate] = useState('');
  const [newRecPortDropdown, setNewRecPortDropdown] = useState('其他');
  const [newRecPortCustom, setNewRecPortCustom] = useState('');

  const activeCountryContext = activeVisa?.country || '';
  const portOptions = useMemo(
    () => activeCountryContext === '越南' ? VIETNAM_PORTS : activeCountryContext === '泰国' ? THAILAND_PORTS : ['其他'],
    [activeCountryContext]
  );
  
  useEffect(() => {
     if (portOptions.length > 1) {
        setNewRecPortDropdown(portOptions[0]);
     } else {
        setNewRecPortDropdown('其他');
     }
  }, [activeCountryContext, portOptions]);

  const saveRecord = () => {
    if (!newRecDate) { setToast(t('请选择日期')); return; }
    const port = newRecPortDropdown === '其他' ? (newRecPortCustom.trim() || '未知口岸') : newRecPortDropdown;
    const rec: TravelRecord = {
      id: Date.now().toString(),
      type: newRecType,
      date: newRecDate,
      port: port
    };
    setRecords([rec, ...records]);
    setNewRecDate('');
    setNewRecPortCustom('');
  };

  const toastEl = toast && (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">{toast}</div>
  );

  if (view === 'edit-visa') {
    return (
      <div className="flex-1 w-full absolute inset-0 z-40 flex flex-col pt-12 pb-24 overflow-y-auto md:rounded-3xl md:max-w-4xl mx-auto" style={{background: 'linear-gradient(180deg, #0288D1 0%, #03A9F4 20%, #F5F7FA 20%, #F5F7FA 100%)'}}>
        {toastEl}
        <div className="px-4 flex items-center justify-between mb-6">
          <button onClick={() => setView('main')} className="text-white p-2 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <span className="text-white font-bold text-lg">{t('编辑签证')}</span>
          <div className="w-8 shrink-0"></div>
        </div>

        <div className="px-4">
          <div className="bg-white rounded-[24px] p-6 shadow-sm space-y-6 mb-6">
            <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
              <div className="w-12 h-12 bg-[#E3F2FD] rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-2xl">🌍</span>
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-[11px] text-gray-400 font-bold mb-1">{t('国家')}</label>
                <select 
                  className="font-bold text-lg text-gray-800 bg-transparent border-none p-0 focus:ring-0 outline-none w-full"
                  value={countryIsOther ? '其他' : (editingVisa.country || COUNTRIES[0])}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '其他') {
                      setCountryIsOther(true);
                      setEditingVisa({...editingVisa, country: customCountry.trim() || '其他'});
                    } else {
                      setCountryIsOther(false);
                      setEditingVisa({...editingVisa, country: v});
                    }
                  }}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
                </select>
                {countryIsOther && (
                  <input 
                    type="text" 
                    placeholder={t('输入国家名称')}
                    className="font-bold text-base text-gray-800 bg-transparent border-b border-[#0288D1] p-1 mt-2 focus:ring-0 outline-none w-full"
                    value={customCountry}
                    onChange={e => {
                      setCustomCountry(e.target.value);
                      setEditingVisa({...editingVisa, country: e.target.value.trim() || '其他'});
                    }}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
              <div className="w-12 h-12 bg-[#FFF3E0] rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-2xl">🥟</span>
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-[11px] text-gray-400 font-bold mb-1">{t('签证类型')}</label>
                <select 
                  className="font-bold text-lg text-gray-800 bg-transparent border-none p-0 focus:ring-0 outline-none w-full"
                  value={editingVisa.type || ''}
                  onChange={e => setEditingVisa({...editingVisa, type: e.target.value})}
                >
                  {VISA_TYPES.map(vt => <option key={vt} value={vt}>{t(vt)}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
              <div className="w-12 h-12 bg-[#E1F5FE] rounded-2xl flex items-center justify-center text-[#03A9F4] shrink-0">
                <CalendarIcon size={24} />
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-[11px] text-gray-400 font-bold mb-1">{t('生效日期')}</label>
                <input 
                  type="date"
                  className="font-bold text-lg text-gray-800 bg-transparent border-none p-0 focus:ring-0 outline-none w-full"
                  value={editingVisa.effectiveDate || ''}
                  onChange={e => setEditingVisa({...editingVisa, effectiveDate: e.target.value})}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pb-2">
              <div className="w-12 h-12 bg-[#FFF3E0] rounded-2xl flex items-center justify-center text-[#FF9800] shrink-0">
                <CalendarIcon size={24} />
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-[11px] text-gray-400 font-bold mb-1">{t('到期日期')}</label>
                <input 
                  type="date"
                  className="font-bold text-lg text-gray-800 bg-transparent border-none p-0 focus:ring-0 outline-none w-full"
                  value={editingVisa.expiryDate || ''}
                  onChange={e => setEditingVisa({...editingVisa, expiryDate: e.target.value})}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={deleteVisa}
                className="flex-1 bg-gray-50 text-gray-400 font-bold rounded-full py-3.5 flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
               >
                <Trash2 size={16} /> {t('删除')}
                                          </button>
              <button 
                onClick={saveVisa}
                className="flex-[2] bg-[#0288D1] text-white font-bold rounded-full py-3.5 shadow-md flex items-center justify-center gap-2 hover:brightness-110 transition-colors"
               >
                <div className="w-2 h-2 bg-white rounded-full"></div>
                {t('保存')}
                                          </button>
            </div>
          </div>

          <div className="bg-white rounded-[24px] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#0288D1] font-bold mb-6 text-sm">
               <MapPin size={18} /> {t('状态提醒规则')}
                                    </div>
            <div className="space-y-4">
               <div className="flex justify-between items-center text-sm font-bold">
                 <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-[#4CAF50]"></div><span className="text-gray-700">{t('安全')}</span></div>
                 <span className="text-gray-400">{t('剩余30天以上')}</span>
               </div>
               <div className="flex justify-between items-center text-sm font-bold">
                 <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-[#FFB300]"></div><span className="text-gray-700">{t('警告')}</span></div>
                 <span className="text-gray-400">{t('剩余16-30天')}</span>
               </div>
               <div className="flex justify-between items-center text-sm font-bold">
                 <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-[#FF6F00]"></div><span className="text-gray-700">{t('危险')}</span></div>
                 <span className="text-gray-400">{t('剩余8-15天')}</span>
               </div>
               <div className="flex justify-between items-center text-sm font-bold">
                 <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-[#E53935]"></div><span className="text-gray-700">{t('紧急')}</span></div>
                 <span className="text-gray-400">{t('剩余7天以内')}</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'edit-records') {
    return (
      <div className="flex-1 w-full absolute inset-0 z-40 flex flex-col pt-12 pb-24 overflow-y-auto md:rounded-3xl md:max-w-4xl mx-auto" style={{background: 'linear-gradient(180deg, #0288D1 0%, #03A9F4 15%, #F5F7FA 15%, #F5F7FA 100%)'}}>
        {toastEl}
        <div className="px-4 flex items-center justify-between mb-6 text-white pt-2">
          <button onClick={() => setView('main')} className="p-2 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <span className="font-bold text-lg tracking-tight">{t('出入境记录')}</span>
          <div className="w-8 shrink-0"></div>
        </div>

        <div className="px-4 space-y-6">
          <div className="bg-white rounded-[24px] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-primary font-bold mb-6 text-sm">
               <div className="w-3 h-3 bg-[#0288D1] rounded-full"></div>
               {t('登记新行程')}
                                    </div>
            
            <div className="flex bg-gray-50 rounded-2xl p-1 mb-6 border border-gray-100">
               <button 
                 onClick={() => setNewRecType('entry')}
                 className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${newRecType === 'entry' ? 'bg-white text-[#4CAF50] shadow-sm' : 'text-gray-400'}`}
               >
                 {t('入境')}
                                           </button>
               <button 
                 onClick={() => setNewRecType('exit')}
                 className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${newRecType === 'exit' ? 'bg-white text-[#FFB300] shadow-sm' : 'text-gray-400'}`}
               >
                 {t('出境')}
                                           </button>
            </div>

            <div className="space-y-4 mb-6">
               <div className="flex items-center bg-gray-50 rounded-2xl px-4 py-1 h-[56px] border border-gray-100 focus-within:border-[#0288D1] transition-colors">
                  <CalendarIcon size={20} className="text-gray-400 mr-3 shrink-0" />
                  <input type="date" value={newRecDate} onChange={e => setNewRecDate(e.target.value)} className="w-full bg-transparent border-none text-base font-bold text-[#0288D1] focus:ring-0 outline-none" />
               </div>
               <div className="flex flex-col bg-gray-50 rounded-2xl px-4 py-2 border border-gray-100 focus-within:border-[#0288D1] transition-colors">
                  <div className="flex items-center">
                     <MapPin size={20} className="text-gray-400 mr-3 shrink-0" />
                     <select 
                        value={newRecPortDropdown} 
                        onChange={e => setNewRecPortDropdown(e.target.value)} 
                        className="w-full bg-transparent border-none text-base font-bold text-[#0288D1] focus:ring-0 outline-none p-0 h-[40px]"
                     >
                        {portOptions.map(p => <option key={p} value={p}>{t(p)}</option>)}
                     </select>
                  </div>
                  {newRecPortDropdown === '其他' && (
                     <div className="flex items-center mt-1 pb-1 pl-8">
                       <input 
                          type="text" 
                          placeholder={t('输入自定义口岸...')} 
                          value={newRecPortCustom} 
                          onChange={e => setNewRecPortCustom(e.target.value)} 
                          className="w-full bg-transparent border-b border-[#0288D1]/30 text-base font-bold text-[#0288D1] focus:ring-0 outline-none p-1" 
                       />
                     </div>
                  )}
               </div>
            </div>

            <button onClick={saveRecord} className="w-full bg-[#0288D1] text-white font-bold rounded-full py-4 text-sm shadow-md hover:brightness-110 transition-colors">
              {t('保存登记')}
                                    </button>
          </div>

          <div className="px-1">
             <div className="flex items-center gap-2 text-gray-400 text-xs font-bold mb-4">
               <CalendarIcon size={14} /> {t('行程历史')}
                                     </div>
             <div className="space-y-4">
               {records.map(rec => (
                  <div key={rec.id} className="bg-white rounded-[24px] p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-bold text-lg ${rec.type === 'entry' ? 'bg-[#E8F5E9] text-[#4CAF50]' : 'bg-[#FFF8E1] text-[#FFCA28]'}`}>
                          {rec.type === 'entry' ? t('入') : t('出')}
                       </div>
                       <div className="flex flex-col">
                          <span className="font-bold text-gray-800 text-lg tracking-tight mb-0.5">{rec.date}</span>
                          <span className="text-gray-400 text-xs font-bold">{t(rec.port)}</span>
                       </div>
                    </div>
                    <button 
                      onClick={() => { if (window.confirm(t('确定删除这条出入境记录吗？'))) setRecords(records.filter(r => r.id !== rec.id)); }}
                      className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
               ))}
               {records.length === 0 && (
                 <div className="text-center py-10 opacity-50 text-sm font-bold text-gray-500">{t('暂无记录')}</div>
               )}
             </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Main View ---
  return (
    <div className="flex-1 w-full absolute inset-0 z-40 flex flex-col pt-12 md:rounded-3xl md:max-w-4xl mx-auto" style={{background: 'linear-gradient(180deg, #0288D1 0%, #03A9F4 25%, #F5F7FA 25%, #F5F7FA 100%)'}}>
        {toastEl}
       <div className="px-6 flex justify-between items-start mb-8 text-white pt-2">
          <div className="flex flex-col">
             <h1 className="text-[28px] font-bold tracking-tight mb-1">{t('出国管家')}</h1>
             <span className="text-xs font-bold tracking-widest opacity-90 uppercase">OVERSEAS BUTLER</span>
          </div>
          <div className="w-16 h-16 bg-white rounded-[20px] shadow-lg flex items-center justify-center shrink-0 border-[3px] border-white/20">
             <Plane size={28} className="text-[#03A9F4]" />
          </div>
       </div>

       <div className="px-4 space-y-4 flex-1 overflow-y-auto pb-32 no-scrollbar">
          {/* Visa Status Card */}
          <div 
             onClick={openEditVisa}
             className="bg-white rounded-[28px] p-6 shadow-sm flex items-center justify-between cursor-pointer hover:scale-[1.01] transition-transform"
          >
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[#E1F5FE] rounded-[20px] flex items-center justify-center text-[#03A9F4] shrink-0">
                   <Star size={24} fill="currentColor" />
                </div>
                <div className="flex flex-col">
                   <span className="text-gray-400 font-bold text-xs mb-1">{t('签证状态')}</span>
                   <span className="font-bold text-gray-800 text-lg tracking-tight">
                     {activeVisa ? t(activeVisa.type) : t('未设置签证')}
                   </span>
                </div>
             </div>
             <div className="flex items-center gap-2">
                <div className="flex flex-col items-end">
                   {isExpired ? (
                     <span className="text-[24px] font-bold leading-none tracking-tighter" style={{color: statusColor}}>{t('已过期')}</span>
                   ) : (
                     <>
                       <span className="text-[32px] font-bold leading-none tracking-tighter shadow-sm" style={{color: statusColor}}>
                           {activeVisa ? remainingDays : '-'}
                       </span>
                       <span className="text-[10px] text-gray-400 font-bold mt-1">{t('天剩余')}</span>
                     </>
                   )}
                </div>
                <ChevronRight size={18} className="text-gray-300" />
             </div>
          </div>

          {/* Records Status Card */}
          <div 
             onClick={() => setView('edit-records')}
             className="bg-white rounded-[28px] p-6 shadow-sm flex items-center justify-between cursor-pointer hover:scale-[1.01] transition-transform"
          >
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[#E8F5E9] rounded-[20px] flex items-center justify-center text-[#4CAF50] shrink-0">
                   <Plane size={24} fill="currentColor"/>
                </div>
                <div className="flex flex-col">
                   <span className="text-gray-400 font-bold text-xs mb-1">{t('出入境记录')}</span>
                   <span className="font-bold text-gray-800 text-lg tracking-tight">{t('本次停留')} {currentStay} {t('天')}</span>
                </div>
             </div>
             <div className="flex items-center gap-2">
                <div className="flex flex-col items-end">
                   <span className="text-[32px] font-bold text-[#00E676] leading-none tracking-tighter">{yearTotal}</span>
                   <span className="text-[10px] text-gray-400 font-bold mt-1">{t('年度天数')}</span>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
             </div>
          </div>
       </div>
    </div>
  );
}
