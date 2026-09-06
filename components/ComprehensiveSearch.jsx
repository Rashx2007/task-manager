'use client';
import { useState, useEffect, useRef } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import TodayPlugin from './TodayPlugin';

const STORAGE_KEY = 'comprehensive_search_last';

const toEn = (s) => String(s)
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/−/g, '-');

// ✅ نرمال‌سازی فارسی (فاز ۱)
const normalizeFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();

const normalizeBlock = (b) => {
  if (!b) return null;
  const u = b.toUpperCase();
  if (u === 'A' || u === 'آ' || u === 'ا') return 'A';
  if (u === 'B' || u === 'ب') return 'B';
  if (u === 'C' || u === 'س') return 'C';
  return b;
};

const DEFAULT_START = () => new Date('2018-03-21');
const DEFAULT_END = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 10); return d; };
const EMPTY_F = { subject: '', description: '', mechSystem: '', assetName: '', assetNumber: '', building: '', block: '', floor: '', entrance: '', location: '', specifications: '' };

export default function ComprehensiveSearch({ onResult, onClose }) {
  const [status, setStatus] = useState('current');
  const [f, setF] = useState({ ...EMPTY_F });
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);

  // ✅ فاز ۲
  const [quick, setQuick] = useState('');
  const [counts, setCounts] = useState(null);
  const [facets, setFacets] = useState({ buildings: [], deviceTypes: [], priorities: [] });
  const [facetFilters, setFacetFilters] = useState({ building: '', deviceType: '', priority: '' });

  const [devices, setDevices] = useState([]);
  const [smartText, setSmartText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState('انتخاب دستگاه');
  const sel = useRef({ subject: '', description: '', type: '', building: '', block: '', floor: '', entrance: '', location: '' });

  // ✅ بازیابی آخرین جستجو (فاز ۱)
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.status) setStatus(saved.status);
      if (saved.f) setF({ ...EMPTY_F, ...saved.f });
      if (saved.start) { const d = new Date(saved.start); if (!isNaN(d.getTime())) setStart(d); }
      if (saved.end) { const d = new Date(saved.end); if (!isNaN(d.getTime())) setEnd(d); }
      if (saved.smartText) setSmartText(saved.smartText);
      if (saved.quick) setQuick(saved.quick);
      if (saved.facetFilters) setFacetFilters(saved.facetFilters);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/smart-search?kind=devices').then((r) => r.json()).then((d) => { if (d.success) setDevices(d.rows || []); }).catch(() => {});
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const distinct = (arr) => [...new Set(arr.filter((x) => x !== null && String(x) !== ''))];
  const resetSel = () => { sel.current = { subject: '', description: '', type: '', building: '', block: '', floor: '', entrance: '', location: '' }; };

  const filteredDevices = () => devices.filter((d) =>
    (!sel.current.subject || d.Subject === sel.current.subject) &&
    (!sel.current.description || d.Description === sel.current.description) &&
    (!sel.current.type || d.DeviceType === sel.current.type) &&
    (!sel.current.building || d.Building === sel.current.building) &&
    (!sel.current.block || d.Block === sel.current.block) &&
    (!sel.current.floor || String(d.Floor) === sel.current.floor) &&
    (!sel.current.entrance || d.Entrance === sel.current.entrance) &&
    (!sel.current.location || d.Location === sel.current.location)
  );

  const show = (items, statusText) => {
    if (items.length > 0) { setSuggestions(items); setDeviceStatus(statusText); }
    else { setSuggestions([]); setDeviceStatus('موردی یافت نشد'); }
  };
  const loadDeviceTypes = (filter) => show(distinct(devices.filter((d) => !filter || (d.DeviceType || '').includes(filter)).map((d) => d.DeviceType)).sort((a, b) => a.localeCompare(b, 'fa')), 'لطفاً نوع دستگاه را انتخاب کنید:');
  const loadSubjects = (filter) => show(distinct(devices.filter((d) => !filter || (d.Subject || '').includes(filter)).map((d) => d.Subject)).sort(), 'لطفاً موضوع مورد نظر را انتخاب کنید:');
  const loadDescriptions = (filter) => show(distinct(devices.filter((d) => !filter || (d.Description || '').includes(filter)).map((d) => d.Description)).sort(), 'لطفاً توضیحات مورد نظر را انتخاب کنید:');
  const showBuildings = () => { const b = distinct(filteredDevices().map((d) => d.Building)).sort(); if (b.length) show(b, 'لطفاً ساختمان مورد نظر را انتخاب کنید:'); else showBlocks(); };
  const showBlocks = () => { const b = distinct(filteredDevices().map((d) => d.Block)).filter((x) => x !== '-').sort(); if (b.length) show(b, `بلوک ساختمان ${sel.current.building} را انتخاب کنید:`); else showFloors(); };
  const showFloors = () => { const fl = distinct(filteredDevices().map((d) => String(d.Floor))).sort(); if (fl.length) show(fl, 'طبقه مورد نظر را انتخاب کنید:'); else showEntrances(); };
  const showEntrances = () => { const en = distinct(filteredDevices().map((d) => d.Entrance)).filter((x) => x !== '-').sort(); if (en.length) show(en, 'ورودی مورد نظر را انتخاب کنید:'); else showLocations(); };
  const showLocations = () => { const lo = distinct(filteredDevices().map((d) => d.Location)).sort(); if (lo.length) show(lo, 'محل مورد نظر را انتخاب کنید:'); else showNumbers(); };
  const showNumbers = () => {
    const nu = distinct(filteredDevices().map((d) => String(d.DeviceNumber))).sort((a, b) => Number(a) - Number(b));
    if (nu.length > 1) show(nu, 'شماره دستگاه را انتخاب کنید:');
    else if (nu.length === 1) finalize(filteredDevices()[0]);
    else { setSuggestions([]); setDeviceStatus('دستگاهی با این مشخصات یافت نشد'); }
  };
  const showDeviceTypesFor = () => show(distinct(filteredDevices().map((d) => d.DeviceType)).sort(), 'انواع دستگاه برای انتخاب شما:');

  // ✅ جستجو + ذخیرهٔ آخرین جستجو + نرمال‌سازی + شمارنده‌ها
  const doSearchWith = async (extra = {}, facetOverride = null) => {
    const p = (n) => String(n).padStart(2, '0');
    const wall = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const s = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0) : null;
    const e2 = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59) : null;

    const mergedF = { ...f, ...extra };
    const TEXT_KEYS = ['subject', 'description', 'mechSystem', 'assetName', 'building', 'block', 'entrance', 'location', 'specifications', 'propertyCode'];
    const normalizedF = {};
    for (const k of Object.keys(mergedF)) {
      const v = mergedF[k];
      normalizedF[k] = (typeof v === 'string' && TEXT_KEYS.includes(k)) ? normalizeFa(v) : v;
    }
    const facetsToUse = facetOverride !== null ? facetOverride : facetFilters;

    const payload = {
      ...normalizedF,
      status,
      start: s ? wall(s) : null,
      end: e2 ? wall(e2) : null,
      onlyFixed: extra.onlyFixed === true,
      onlyTemp: extra.onlyTemp === true,
      quick: normalizeFa(quick),
      facetBuilding: facetsToUse.building || '',
      facetDeviceType: facetsToUse.deviceType || '',
      facetPriority: facetsToUse.priority || '',
      withCounts: true,
    };

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ status, f: { ...f, ...extra }, start: start ? start.toISOString() : null, end: end ? end.toISOString() : null, smartText, quick, facetFilters: facetsToUse })); } catch {}

    try {
      const res = await fetch('/api/comprehensive-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.success) {
        if (onResult) onResult(d.data || []);
        setCounts(d.counts || null);
        setFacets(d.facets || { buildings: [], deviceTypes: [], priorities: [] });
      } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const finalize = (device) => {
    const validBlock = (device.Block === 'A' || device.Block === 'B' || device.Block === 'C') ? device.Block : '';
    const extra = { assetName: device.DeviceType || '', assetNumber: String(device.DeviceNumber ?? ''), building: device.Building || '', block: validBlock, floor: device.Floor != null ? String(device.Floor) : '', entrance: device.Entrance || '', location: device.Location || '' };
    setSuggestions([]); setDeviceStatus('انتخاب دستگاه');
    setSmartText(`${device.DeviceType} (شماره: ${device.DeviceNumber})`);
    setF({ ...f, ...extra });
    doSearchWith(extra);
  };

  const onSmartChange = (raw) => {
    setSmartText(raw);
    const input = toEn(raw).trim();
    if (!input) { resetSel(); setSuggestions([]); setDeviceStatus('انتخاب دستگاه'); return; }
    const m = input.match(/^[طxX](?<floor>-[1-3]|0.5|[1-9]|1[0-8])(?<block>[a-cA-Cآابس])?$/);
    if (m) { resetSel(); sel.current.floor = m.groups.floor; sel.current.block = normalizeBlock(m.groups.block) || ''; showBuildings(); return; }
    if (input.startsWith('د ')) { resetSel(); loadDeviceTypes(input.slice(2).trim()); return; }
    if (input.startsWith('م ')) { resetSel(); loadSubjects(input.slice(2).trim()); return; }
    if (input.startsWith('ت ')) { resetSel(); loadDescriptions(input.slice(2).trim()); return; }
    resetSel(); loadDeviceTypes(input);
  };

  const onSuggestionClick = (value) => {
    const st = deviceStatus.trim();
    if (st === 'لطفاً موضوع مورد نظر را انتخاب کنید:') { sel.current.subject = value; showDeviceTypesFor(); return; }
    if (st === 'لطفاً توضیحات مورد نظر را انتخاب کنید:') { sel.current.description = value; showDeviceTypesFor(); return; }
    if (st === 'لطفاً نوع دستگاه را انتخاب کنید:' || st.startsWith('انواع دستگاه برای')) { sel.current.type = value; showBuildings(); return; }
    if (st.startsWith('لطفاً ساختمان مورد نظر را انتخاب کنید')) { sel.current.building = value; showBlocks(); return; }
    if (st.startsWith('بلوک ساختمان')) { sel.current.block = value; showFloors(); return; }
    if (st.startsWith('طبقه مورد نظر را انتخاب کنید')) { sel.current.floor = value; showEntrances(); return; }
    if (st.startsWith('ورودی مورد نظر را انتخاب کنید')) { sel.current.entrance = value; showLocations(); return; }
    if (st.startsWith('محل مورد نظر را انتخاب کنید')) { sel.current.location = value; showNumbers(); return; }
    if (st.startsWith('شماره دستگاه را انتخاب کنید')) { const dev = filteredDevices().find((d) => String(d.DeviceNumber) === value); if (dev) finalize(dev); }
  };

  const submit = (e) => { if (e && e.preventDefault) e.preventDefault(); doSearchWith({}); };

  // ✅ رفع باگ: همهٔ پریست‌ها ابتدا state را به حالت پیش‌فرض می‌برند
  const resetToDefaults = () => {
    setStatus('current');
    setF({ ...EMPTY_F });
    setStart(DEFAULT_START());
    setEnd(DEFAULT_END());
    setSmartText('');
    setQuick('');
    resetSel();
    setSuggestions([]);
    setDeviceStatus('انتخاب دستگاه');
    setFacetFilters({ building: '', deviceType: '', priority: '' });
  };

  const clear = () => {
    resetToDefaults();
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  // ✅ پریست‌ها: ابتدا reset کامل، سپس تنظیمات خاص آن پریست
  const applyPreset = (preset) => {
    resetToDefaults();
    const now = new Date();
    const todayDO = new DateObject({ date: new Date(), calendar: persian, locale: persian_fa });

    if (preset === 'today') {
      const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      setStart(d1); setEnd(d2);
      setTimeout(() => doSearchWith({}), 0);
      return;
    }
    if (preset === 'thisWeek') {
      const dow = todayDO.weekDay;
      const daysBack = dow === 1 ? 0 : dow - 1;
      const satDO = new DateObject({ date: new Date(), calendar: persian, locale: persian_fa });
      satDO.subtract(daysBack, 'days');
      const friDO = new DateObject({ date: satDO.toDate(), calendar: persian, locale: persian_fa });
      friDO.add(6, 'days');
      const s = satDO.toDate(); s.setHours(0, 0, 0, 0);
      const e2 = friDO.toDate(); e2.setHours(23, 59, 59, 999);
      setStart(s); setEnd(e2);
      setTimeout(() => doSearchWith({}), 0);
      return;
    }
    if (preset === 'overdue') {
      setStart(DEFAULT_START());
      const e2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      setEnd(e2);
      setTimeout(() => doSearchWith({}), 0);
      return;
    }
    if (preset === 'completedThisMonth') {
      setStatus('completed');
      const firstDO = new DateObject({ year: todayDO.year, month: todayDO.month.number, day: 1, calendar: persian, locale: persian_fa });
      const s = firstDO.toDate(); s.setHours(0, 0, 0, 0);
      const e2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      setStart(s); setEnd(e2);
      setTimeout(() => doSearchWith({}), 0);
      return;
    }
    if (preset === 'fixed') {
      setTimeout(() => doSearchWith({ onlyFixed: true }), 0);
      return;
    }
    if (preset === 'temp') {
      setTimeout(() => doSearchWith({ onlyTemp: true }), 0);
      return;
    }
  };

  // ✅ فاز ۲: کلیک روی facet → افزودن/حذف فیلتر facet
  const toggleFacet = (kind, value) => {
    setFacetFilters((prev) => {
      const next = { ...prev, [kind]: prev[kind] === value ? '' : value };
      setTimeout(() => doSearchWith({}, next), 0);
      return next;
    });
  };

  const inp = 'search-input w-full';

  return (
    <div className="bg-[#5F7470] p-4 mx-4 mt-2 rounded-lg shadow-lg" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-lg">جستجوی جامع کارها</h3>
        <button onClick={onClose} className="text-white text-xl">✕</button>
      </div>

      {/* ✅ فاز ۲: جستجوی سریع یکپارچه */}
      <div className="mb-3 bg-white p-2 rounded">
        <label className="block text-sm font-bold mb-1">🔍 جستجوی سریع (همه‌جا: موضوع، توضیحات، دستگاه، ساختمان، برچسب، درخواست‌کننده…)</label>
        <input className={inp} value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="هر چیزی را تایپ کنید و Enter بزنید…" />
      </div>

      {/* ✅ فاز ۲: تب‌های شمارنده‌دار */}
      {counts && (
        <div className="mb-3 bg-white p-2 rounded flex gap-2 flex-wrap items-center">
          <span className="text-sm font-bold ml-2">وضعیت:</span>
          {[['current', 'جاری', counts.currentCount], ['completed', 'اتمام‌یافته', counts.completedCount], ['all', 'همه', counts.allCount]].map(([v, l, n]) => (
            <button key={v} type="button"
              onClick={() => { setStatus(v); setTimeout(() => doSearchWith({}), 0); }}
              className={`px-3 py-1 rounded text-sm font-bold ${status === v ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {l} <span className="inline-block min-w-[22px] px-1 rounded-full bg-white/20 text-xs">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* ✅ ردیف چیپ‌های پریست */}
      <div className="mb-3 bg-[#F7C4A5] p-2 rounded flex flex-wrap gap-2 items-center">
        <span className="font-bold text-sm whitespace-nowrap">جستجوی سریع:</span>
        <button type="button" onClick={() => applyPreset('today')} className="btn-primary px-3 py-1 text-xs">امروز</button>
        <button type="button" onClick={() => applyPreset('thisWeek')} className="btn-primary px-3 py-1 text-xs">این هفته</button>
        <button type="button" onClick={() => applyPreset('overdue')} className="btn-primary px-3 py-1 text-xs">سررسید گذشته</button>
        <button type="button" onClick={() => applyPreset('completedThisMonth')} className="btn-primary px-3 py-1 text-xs">اتمام‌یافتهٔ این ماه</button>
        <button type="button" onClick={() => applyPreset('fixed')} className="btn-primary px-3 py-1 text-xs">زمان ثابت</button>
        <button type="button" onClick={() => applyPreset('temp')} className="btn-primary px-3 py-1 text-xs">موقتی/نامشخص‌ها</button>
        <button type="button" onClick={clear} className="btn-danger px-3 py-1 text-xs mr-auto">پاک کردن حافظه</button>
      </div>

      {/* ---------- facetهای فعال ---------- */}
      {(facetFilters.building || facetFilters.deviceType || facetFilters.priority) && (
        <div className="mb-3 bg-yellow-100 p-2 rounded flex flex-wrap gap-2 items-center">
          <span className="text-sm font-bold">فیلترهای فعال:</span>
          {facetFilters.building && (
            <button type="button" onClick={() => toggleFacet('building', facetFilters.building)} className="px-2 py-1 bg-yellow-300 rounded text-xs">
              ساختمان: {facetFilters.building} ✕
            </button>
          )}
          {facetFilters.deviceType && (
            <button type="button" onClick={() => toggleFacet('deviceType', facetFilters.deviceType)} className="px-2 py-1 bg-yellow-300 rounded text-xs">
              دستگاه: {facetFilters.deviceType} ✕
            </button>
          )}
          {facetFilters.priority && (
            <button type="button" onClick={() => toggleFacet('priority', facetFilters.priority)} className="px-2 py-1 bg-yellow-300 rounded text-xs">
              الویت: {facetFilters.priority} ✕
            </button>
          )}
        </div>
      )}

      {/* ---------- جستجوی هوشمند دستگاه ---------- */}
      <div className="relative mb-3 bg-[#F7C4A5] p-2 rounded">
        <div className="flex items-center gap-2">
          <input value={smartText} onChange={(e) => onSmartChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            className="search-input flex-1" placeholder="مثلاً: ط14 ، د فن‌کویل ، م موضوع ، ت توضیحات" />
          <span className="font-bold text-sm whitespace-nowrap">{deviceStatus}</span>
        </div>
        {suggestions.length > 0 && (
          <ul className="absolute z-50 bg-white border border-gray-300 rounded shadow-lg max-h-56 overflow-auto w-1/2 mt-1">
            {suggestions.map((s, i) => (
              <li key={i} onClick={() => onSuggestionClick(s)} className="px-3 py-2 hover:bg-teal-100 cursor-pointer text-sm">{s}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- وضعیت و بازهٔ تاریخ ---------- */}
      <div className="flex gap-4 mb-3 bg-[#F7C4A5] p-2 rounded flex-wrap items-center">
        {[['current', 'کارهای جاری'], ['completed', 'اتمام‌یافته'], ['all', 'همه کارها']].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" className="w-4 h-4" checked={status === v} onChange={() => setStatus(v)} />
            <span className="font-bold text-sm">{l}</span>
          </label>
        ))}
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">زمان آغاز:</span>
          <DatePicker value={start} onChange={(d) => setStart(d ? d.toDate() : null)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input" plugins={[<TodayPlugin onToday={(d) => setStart(d)} />]} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">زمان پایان:</span>
          <DatePicker value={end} onChange={(d) => setEnd(d ? d.toDate() : null)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input" plugins={[<TodayPlugin onToday={(d) => setEnd(d)} />]} />
        </div>
      </div>

      {/* ---------- فرم فیلترها ---------- */}
      <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className="text-white text-sm">موضوع</label><input className={inp} value={f.subject} onChange={set('subject')} /></div>
        <div><label className="text-white text-sm">توضیحات</label><input className={inp} value={f.description} onChange={set('description')} /></div>
        <div><label className="text-white text-sm">بلوک</label><input className={inp} value={f.block} onChange={set('block')} /></div>
        <div><label className="text-white text-sm">ورودی</label><input className={inp} value={f.entrance} onChange={set('entrance')} /></div>
        <div><label className="text-white text-sm">دستگاه</label><input className={inp} value={f.assetName} onChange={set('assetName')} /></div>
        <div><label className="text-white text-sm">ساختمان</label><input className={inp} value={f.building} onChange={set('building')} /></div>
        <div><label className="text-white text-sm">طبقه</label><input className={inp} value={f.floor} onChange={set('floor')} /></div>
        <div><label className="text-white text-sm">قسمت</label><input className={inp} value={f.location} onChange={set('location')} /></div>
        <div><label className="text-white text-sm">شماره دستگاه</label><input className={inp} value={f.assetNumber} onChange={set('assetNumber')} /></div>
        <div><label className="text-white text-sm">سیستم</label><input className={inp} value={f.mechSystem} onChange={set('mechSystem')} /></div>
        <div><label className="text-white text-sm">مشخصات</label><input className={inp} value={f.specifications} onChange={set('specifications')} /></div>
        <div className="hidden md:block" />
        <div className="col-span-full flex gap-2">
          <button type="submit" className="btn-success flex-1">جستجو</button>
          <button type="button" onClick={clear} className="btn-danger">پاک کردن</button>
          <button type="button" onClick={onClose} className="btn-primary">بستن</button>
        </div>
      </form>

      {/* ✅ فاز ۲: facetهای قابل‌کلیک */}
      {facets && (facets.buildings.length > 0 || facets.deviceTypes.length > 0 || facets.priorities.length > 0) && (
        <div className="mt-4 bg-white p-3 rounded">
          <div className="text-sm font-bold mb-2">باریک‌کردن نتیجه (کلیک کنید):</div>
          {facets.buildings.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-bold ml-1">ساختمان:</span>
              {facets.buildings.slice(0, 10).map((b) => (
                <button key={b.name} type="button"
                  onClick={() => toggleFacet('building', b.name)}
                  className={`inline-block px-2 py-1 mx-1 my-1 rounded text-xs ${facetFilters.building === b.name ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-teal-100'}`}>
                  {b.name} ({b.count})
                </button>
              ))}
            </div>
          )}
          {facets.deviceTypes.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-bold ml-1">نوع دستگاه:</span>
              {facets.deviceTypes.slice(0, 10).map((b) => (
                <button key={b.name} type="button"
                  onClick={() => toggleFacet('deviceType', b.name)}
                  className={`inline-block px-2 py-1 mx-1 my-1 rounded text-xs ${facetFilters.deviceType === b.name ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-teal-100'}`}>
                  {b.name} ({b.count})
                </button>
              ))}
            </div>
          )}
          {facets.priorities.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-bold ml-1">الویت:</span>
              {facets.priorities.slice(0, 10).map((b) => (
                <button key={b.name} type="button"
                  onClick={() => toggleFacet('priority', b.name)}
                  className={`inline-block px-2 py-1 mx-1 my-1 rounded text-xs ${facetFilters.priority === b.name ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-teal-100'}`}>
                  {b.name} ({b.count})
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}