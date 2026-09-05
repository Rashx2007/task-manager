'use client';
import { useState, useEffect, useRef } from 'react';
import DwgBrowser from './DwgBrowser';

const likeTest = (pattern, s) => {
  const rx = new RegExp('^' + String(pattern).split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return rx.test(s || '');
};
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// ✅ هم‌ارز نام ساختمان‌ها (فارسی/لاتین/کد)
const BUILDING_ALIASES = {
  'مرکزی': 'مرکزی', 'markazi': 'مرکزی', 'mk': 'مرکزی', 'cen': 'مرکزی', 'central': 'مرکزی',
  'سردخانه': 'سردخانه', 'sardkhaneh': 'سردخانه', 'sard': 'سردخانه',
};
// ✅ پارسر مقاوم: حذف کشیده/علائم بیدی + پشتیبانی نام‌های قدیمی و الگوی لاتین جدید
const parseMapName = (name) => {
  let base = toEn(String(name))
    .replace(/\.dwg$/i, '')
    .replace(/[ـ‌‍‎‏‪‫]/g, '') // حذف کشیده «ـ» و علائم جهت‌دار
    .trim();
  const out = { building: '', block: '', floor: '' };
  const mFloor = base.match(/(-?\d+(?:\.\d+)?)\s*$/);
  if (mFloor) { out.floor = String(Number(mFloor[1])); base = base.slice(0, mFloor.index); }
  base = base.replace(/[_\-\s]+$/g, '');
  const mBlock = base.match(/([A-Ca-c])$/);
  if (mBlock) { out.block = mBlock[1].toUpperCase(); base = base.slice(0, mBlock.index); }
  const bRaw = base.replace(/[_\-\s]+$/g, '').trim();
  out.building = BUILDING_ALIASES[bRaw.toLowerCase()] || bRaw;
  return out;
};
// ✅ تکمیل از نام پوشه‌ها در صورت کمبود (مثل: \(بلوک C)\(طبقه 6) )
const parseMapInfo = (full) => {
  const out = parseMapName(String(full).split('\\').pop());
  if (!out.block) { const m = String(full).match(/بلوک[\s_\-]*([A-Ca-c])/); if (m) out.block = m[1].toUpperCase(); }
  if (!out.floor) { const m = String(full).match(/طبقه[\s_\-]*(-?\d+(?:\.\d+)?)/); if (m) out.floor = toEn(m[1]); }
  if (!out.building && /مرکزی|Markazi/i.test(String(full))) out.building = 'مرکزی';
  return out;
};

export default function MapModal({ onPickAsset, onClose, defaults = {} }) {
  const [building, setBuilding] = useState(defaults.building || '');
  const [block, setBlock] = useState(defaults.block || '');
  const [floor, setFloor] = useState(defaults.floor || '');
  const [deviceType, setDeviceType] = useState(defaults.deviceType || '');
  const [map, setMap] = useState(null);
  const [rules, setRules] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [svgText, setSvgText] = useState('');
  const [hashChanged, setHashChanged] = useState(false);
  const [unknown, setUnknown] = useState([]);
  const [newOnMap, setNewOnMap] = useState([]);
  const [orphan, setOrphan] = useState([]);
  const [checked, setChecked] = useState({});
  const [answers, setAnswers] = useState({});
  const [newNames, setNewNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [center, setCenter] = useState(null);
  // مرور فایل نقشه
  const [showBrowse, setShowBrowse] = useState(false);
  const [chosenDwg, setChosenDwg] = useState('');
  // فرم تعریف دستگاه
  const [defineOpen, setDefineOpen] = useState(false);
  const [defineForm, setDefineForm] = useState(null);
  const boxRef = useRef(null);

  const fetchSvg = async (url) => {
    const res = await fetch(url + '?v=' + Date.now());
    const t = await res.text();
    setSvgText(t);
  };

  const load = async (b = building, bl = block, f = floor) => {
    if (!b || !f) { alert('لطفاً «ساختمان» و «طبقه» را وارد کنید تا نقشه بارگذاری شود.'); return; }
    try {
      let res = await fetch(`/api/maps?building=${encodeURIComponent(b)}&block=${encodeURIComponent(bl)}&floor=${encodeURIComponent(f)}`);
      let d = await res.json();
      if (!d.success) { alert('خطا: ' + d.error); return; }
      // ✅ اگر نقشه‌ای ثبت نشده و فایلی انتخاب شده، همین حالا ثبت شود
      if (!d.map && chosenDwg) {
        await fetch('/api/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building: b, block: bl, floor: f, dwgPath: chosenDwg }) });
        res = await fetch(`/api/maps?building=${encodeURIComponent(b)}&block=${encodeURIComponent(bl)}&floor=${encodeURIComponent(f)}`);
        d = await res.json();
      }
      setRules(d.rules || []); setDeviceTypes(d.deviceTypes || []);
      setMap(d.map || null); setTags(d.tags || []); setHashChanged(!!d.hashChanged);
      setCenter(d.map && d.map.CenterX != null ? { x: d.map.CenterX, y: d.map.CenterY } : null);
      if (d.map && d.svgUrl) fetchSvg(d.svgUrl); else setSvgText('');
      // ✅ واکنش خودکار: اولین تبدیل بلافاصله انجام شود
      if (d.map && d.hashChanged && !d.map.SvgPath) {
        const c = await fetch('/api/maps/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId: d.map.MapID }) });
        const cd = await c.json();
        if (cd.success && !cd.unchanged) {
          setHashChanged(false);
          setUnknown(cd.unknownLayers || []); setNewOnMap(cd.newOnMap || []); setOrphan(cd.orphanInDb || []);
          if (cd.svgUrl) fetchSvg(cd.svgUrl);
        }
      }
    } catch (e) { alert('خطا در بارگذاری نقشه: ' + e.message); }
  };

  const convert = async () => {
    if (!map) return;
    setBusy(true);
    try {
      const res = await fetch('/api/maps/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId: map.MapID }) });
      const d = await res.json();
      if (!d.success) { alert('خطا: ' + d.error); return; }
      setHashChanged(false);
      if (!d.unchanged) {
        setUnknown(d.unknownLayers || []); setNewOnMap(d.newOnMap || []); setOrphan(d.orphanInDb || []);
        if (d.svgUrl) fetchSvg(d.svgUrl);
        load();
      }
    } catch (e) { alert('خطا در تبدیل: ' + e.message); }
    setBusy(false);
  };

  // ✅ انتخاب فایل DWG + تشخیص خودکار ساختمان/بلوک/طبقه از نام فایل
  const selectDwg = (full) => {
    const nm = parseMapInfo(full);
    if (nm.building) setBuilding(nm.building);
    if (nm.block) setBlock(nm.block);
    if (nm.floor) setFloor(nm.floor);
    setChosenDwg(full);
    setShowBrowse(false);
    const b = nm.building || building, f = nm.floor || floor;
    if (!b || !f) alert('فایل انتخاب شد؛ لطفاً «ساختمان» و «طبقه» را پر کنید و «بارگذاری» بزنید.');
    else load(b, nm.block || block, f);
  };

  // ✅ تشخیص ورودی از روی ناحیه (فقط ساختمان مرکزی)
  const detectEntrance = (tag) => {
    if (!center || !tag) return '';
    if (!String(building).includes('مرکزی')) return '';
    const dx = tag.x - center.x, dy = tag.y - center.y; // در SVG: شمال = dy منفی
    if (dx < 0 && dy < 0) return '1'; // شمال غربی
    if (dx < 0 && dy >= 0) return '2'; // جنوب غربی
    if (dx >= 0 && dy >= 0) return '3'; // جنوب شرقی
    return '4'; // شمال شرقی
  };

  const applyLayerAnswers = async () => {
    for (const layer of unknown) {
      const a = answers[layer]; if (!a) continue;
      if (a === '__new__') {
        const nm = (newNames[layer] || '').trim(); if (!nm) continue;
        await fetch('/api/maps/layer-rule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layerName: layer, deviceType: nm, isNewType: true }) });
      } else {
        await fetch('/api/maps/layer-rule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layerName: layer, deviceType: a, isNewType: false }) });
      }
    }
    setUnknown([]);
    load();
  };

  const registerChecked = async () => {
    const items = newOnMap.filter((t) => checked[t.text]).map((t) => {
      const layerDev = String(t.layer).replace(/[-_]?text$/i, '');
      const r = rules.find((r) => !r.IsBase && likeTest(r.LayerLike, layerDev));
      const tag = tags.find((x) => x.text === t.text);
      return { text: t.text, deviceType: r ? r.DeviceType : deviceType || 'نامشخص', entrance: detectEntrance(tag) };
    });
    if (!items.length) return;
    const res = await fetch('/api/maps/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building, block, floor, items }) });
    const d = await res.json();
    if (d.success) { setNewOnMap([]); alert(items.length + ' دستگاه ثبت شد.'); load(); }
  };

  const deactivateOrphans = async () => {
    const items = orphan.map((o) => ({ assetId: o.assetId, deactivate: true }));
    await fetch('/api/maps/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    setOrphan([]); alert('دستگاه‌های حذف‌شده از نقشه، «ناموجود» علامت‌گذاری شدند (سابقه حفظ شد).');
  };

  const saveDefine = async () => {
    const res = await fetch('/api/maps/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        building, block, floor,
        items: [{ text: defineForm.tag, deviceType: defineForm.deviceType, entrance: defineForm.entrance, location: defineForm.location, assetNumber: defineForm.assetNumber }]
      })
    });
    const d = await res.json();
    if (d.success && d.ids.length) { setDefineOpen(false); setDefineForm(null); onPickAsset(d.ids[0]); }
    else alert('خطا: ' + d.error);
  };

  // نمایش لایه‌ها
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    box.querySelectorAll('g[data-layer]').forEach((g) => {
      const l = g.getAttribute('data-layer');
      const r = rules.find((r) => likeTest(r.LayerLike, l));
      g.style.display = (r && r.IsBase) || (r && !r.IsBase && deviceType && r.DeviceType === deviceType) ? '' : 'none';
    });
    box.querySelectorAll('text[data-tag]').forEach((t) => { t.style.cursor = 'pointer'; t.setAttribute('fill', '#c0392b'); t.setAttribute('stroke', 'none'); });
  }, [svgText, rules, deviceType]);

  // ✅ کلیک روی برچسب: موجود → انتخاب | ناموجود → پیشنهاد تعریف + فرم خودکار‌پر (با لایهٔ -Text و تشخیص ورودی)
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const onClick = (e) => {
      const el = e.target.closest('[data-tag]'); if (!el) return;
      const txt = el.getAttribute('data-tag');
      const tag = tags.find((t) => t.text === txt);
      if (tag && tag.AssetID) { onPickAsset(tag.AssetID); return; }
      const layer = tag ? tag.Layer : '';
      const deviceLayer = String(layer).replace(/[-_]?text$/i, '');
      const r = rules.find((r) => !r.IsBase && likeTest(r.LayerLike, deviceLayer));
      if (confirm(`دستگاه «${txt}» در دیتابیس نیست. آیا تعریف شود؟`)) {
        setDefineForm({
          deviceType: r ? r.DeviceType : (deviceType || ''),
          tag: txt, building, block, floor,
          entrance: detectEntrance(tag),
          location: '', assetNumber: '',
        });
        setDefineOpen(true);
      }
    };
    box.addEventListener('click', onClick);
    return () => box.removeEventListener('click', onClick);
  }, [tags, rules, building, block, floor, center]);

  const inp = 'search-input';

  return (
    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1100px] max-w-full max-h-[92vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">نقشهٔ طبقه — انتخاب دستگاه</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-2">
          <label className="text-xs font-bold">ساختمان<input className={inp} value={building} onChange={(e) => setBuilding(e.target.value)} /></label>
          <label className="text-xs font-bold">بلوک<input className={inp} value={block} onChange={(e) => setBlock(e.target.value)} /></label>
          <label className="text-xs font-bold">طبقه<input className={inp} value={floor} onChange={(e) => setFloor(e.target.value)} /></label>
          <label className="text-xs font-bold">نوع دستگاه
            <select className={inp} value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>
              <option value="">(انتخاب)</option>
              {deviceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={() => load()}>بارگذاری</button>
          <button className="btn-success" onClick={() => setShowBrowse(true)}>📂 مرور فایل نقشه…</button>          {map && hashChanged && <button className="btn-danger" disabled={busy} onClick={convert}>⚠ فایل اتوکد تغییر کرده — همگام‌سازی</button>}
        </div>

        {unknown.length > 0 && (
          <div className="bg-[#F7C4A5] rounded p-3 mb-2">
            <b>لایه‌های ناشناخته یافت شد؛ برای هر لایه نوع دستگاه را مشخص کنید:</b>
            {unknown.map((l) => (
              <div key={l} className="flex gap-2 items-center mt-2">
                <span className="text-sm font-bold w-40">{l}</span>
                <select className={inp} value={answers[l] || ''} onChange={(e) => setAnswers({ ...answers, [l]: e.target.value })}>
                  <option value="">(انتخاب)</option>
                  {deviceTypes.map((t) => <option key={t} value={t}>{t} (نوع موجود)</option>)}
                  <option value="__new__">نوع جدید…</option>
                </select>
                {answers[l] === '__new__' && <input className={inp} placeholder="نام نوع جدید" value={newNames[l] || ''} onChange={(e) => setNewNames({ ...newNames, [l]: e.target.value })} />}
              </div>
            ))}
            <button className="btn-success mt-2" onClick={applyLayerAnswers}>ذخیرهٔ نگاشت و تبدیل مجدد</button>
          </div>
        )}

        {defineOpen && defineForm && (
          <div className="bg-[#e6f3ef] border border-teal-600 rounded p-3 mb-2">
            <b>تعریف دستگاه جدید (فیلدها خودکار پر شده‌اند):</b>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              <label className="text-xs font-bold">نوع دستگاه<input className={inp} value={defineForm.deviceType} onChange={(e) => setDefineForm({ ...defineForm, deviceType: e.target.value })} /></label>
              <label className="text-xs font-bold">برچسب<input className={inp} value={defineForm.tag} readOnly /></label>
              <label className="text-xs font-bold">ساختمان<input className={inp} value={defineForm.building} onChange={(e) => setDefineForm({ ...defineForm, building: e.target.value })} /></label>
              <label className="text-xs font-bold">بلوک<input className={inp} value={defineForm.block} onChange={(e) => setDefineForm({ ...defineForm, block: e.target.value })} /></label>
              <label className="text-xs font-bold">طبقه<input className={inp} value={defineForm.floor} onChange={(e) => setDefineForm({ ...defineForm, floor: e.target.value })} /></label>
              <label className="text-xs font-bold">ورودی<input className={inp} value={defineForm.entrance} onChange={(e) => setDefineForm({ ...defineForm, entrance: e.target.value })} /></label>
              <label className="text-xs font-bold">محل<input className={inp} value={defineForm.location} onChange={(e) => setDefineForm({ ...defineForm, location: e.target.value })} /></label>
              <label className="text-xs font-bold">شماره دستگاه<input className={inp} value={defineForm.assetNumber} onChange={(e) => setDefineForm({ ...defineForm, assetNumber: e.target.value })} /></label>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn-success" onClick={saveDefine}>ثبت دستگاه و انتخاب</button>
              <button className="btn-danger" onClick={() => { setDefineOpen(false); setDefineForm(null); }}>انصراف</button>
            </div>
          </div>
        )}

        {newOnMap.length > 0 && (
          <div className="bg-[#e6f3ef] border border-teal-600 rounded p-3 mb-2 max-h-40 overflow-auto">
            <b>دستگاه‌های روی نقشه که در دیتابیس نیستند:</b>
            {newOnMap.map((t) => (
              <label key={t.text} className="block text-sm mt-1">
                <input type="checkbox" className="ml-2" checked={!!checked[t.text]} onChange={(e) => setChecked({ ...checked, [t.text]: e.target.checked })} />
                {t.text} <span className="text-xs text-gray-500">(لایه: {t.layer})</span>
              </label>
            ))}
            <button className="btn-success mt-2" onClick={registerChecked}>ثبت دستگاه‌های انتخاب‌شده</button>
          </div>
        )}

        {orphan.length > 0 && (
          <div className="bg-[#FC7470]/30 border border-red-500 rounded p-3 mb-2">
            <b>در دیتابیس هستند ولی روی نقشهٔ جدید نیستند:</b>
            {orphan.map((o) => <div key={o.assetId} className="text-sm">کد {o.assetId} — {o.tag}</div>)}
            <button className="btn-danger mt-2" onClick={deactivateOrphans}>علامت «ناموجود در نقشه» (حفظ سابقه)</button>
          </div>
        )}

        <div ref={boxRef} className="bg-white rounded border border-gray-400 overflow-auto" style={{ height: '55vh' }}
          dangerouslySetInnerHTML={{ __html: svgText || '<div style="padding:40px;text-align:center">نقشه‌ای بارگذاری نشده</div>' }} />
        <div className="text-[11px] text-gray-600 mt-1">
          کلیک روی برچسب: انتخاب دستگاه موجود یا تعریف دستگاه جدید | قرارداد نام فایل: ساختمان_بلوک_طبقه.dwg | قرارداد لایهٔ برچسب: «لایهٔ دستگاه + ‎-Text» | ورودی‌های مرکزی از روی ناحیهٔ نقشه تشخیص داده می‌شود.
        </div>
      </div>

      {/* ✅ دیالوگ مرور پوشه‌ها */}
      {showBrowse && <DwgBrowser defaultPath="D:\\(فنی)" onClose={() => setShowBrowse(false)} onSelect={selectDwg} />}
    </div>
  );
}