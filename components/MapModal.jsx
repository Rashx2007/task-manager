'use client';
import { useState, useEffect, useRef } from 'react';

const likeTest = (pattern, s) => {
  const rx = new RegExp('^' + String(pattern).split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return rx.test(s || '');
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
  const boxRef = useRef(null);

  // ✅ نسخهٔ اصلاح‌شده (بدون پرانتز اضافه)
  const fetchSvg = async (url) => {
    const res = await fetch(url + '?v=' + Date.now());
    const t = await res.text();
    setSvgText(t);
  };

  const load = async () => {
    if (!building || !floor) return;
    const res = await fetch(`/api/maps?building=${encodeURIComponent(building)}&block=${encodeURIComponent(block)}&floor=${encodeURIComponent(floor)}`);
    const d = await res.json();
    if (!d.success) { alert('خطا: ' + d.error); return; }
    setRules(d.rules || []); setDeviceTypes(d.deviceTypes || []);
    setMap(d.map || null); setTags(d.tags || []); setHashChanged(!!d.hashChanged);
    if (d.map && d.svgUrl) fetchSvg(d.svgUrl); else setSvgText('');
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

  const createMap = async () => {
    const dwgPath = prompt('مسیر کامل فایل DWG این طبقه:');
    if (!dwgPath) return;
    await fetch('/api/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building, block, floor, dwgPath }) });
    await load();
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
    convert();
  };

  const registerChecked = async () => {
    const items = newOnMap.filter((t) => checked[t.text]).map((t) => {
      const r = rules.find((r) => !r.IsBase && likeTest(r.LayerLike, t.layer));
      return { text: t.text, deviceType: r ? r.DeviceType : deviceType || 'نامشخص' };
    });
    if (!items.length) return;
    const res = await fetch('/api/maps/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building, block, floor, items }) });
    const d = await res.json();
    if (d.success) { setNewOnMap([]); alert(items.length + ' دستگاه ثبت شد.'); }
  };

  const deactivateOrphans = async () => {
    const items = orphan.map((o) => ({ assetId: o.assetId, deactivate: true }));
    await fetch('/api/maps/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    setOrphan([]); alert('دستگاه‌های حذف‌شده از نقشه، «ناموجود» علامت‌گذاری شدند (سابقه حفظ شد).');
  };

  // نمایش لایه‌ها: پایه همیشه + لایه‌های نوع دستگاه انتخابی
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    box.querySelectorAll('g[data-layer]').forEach((g) => {
      const l = g.getAttribute('data-layer');
      const r = rules.find((r) => likeTest(r.LayerLike, l));
      g.style.display = (r && r.IsBase) || (r && !r.IsBase && deviceType && r.DeviceType === deviceType) ? '' : 'none';
    });
    box.querySelectorAll('text[data-tag]').forEach((t) => { t.style.cursor = 'pointer'; t.setAttribute('fill', '#c0392b'); t.setAttribute('stroke', 'none'); });
  }, [svgText, rules, deviceType]);

  // کلیک روی برچسب → پُرکردن فرم دستگاه یا ایجاد آن
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const onClick = (e) => {
      const el = e.target.closest('[data-tag]'); if (!el) return;
      const txt = el.getAttribute('data-tag');
      const tag = tags.find((t) => t.text === txt);
      if (tag && tag.AssetID) { onPickAsset(tag.AssetID); return; }
      const r = rules.find((r) => !r.IsBase && likeTest(r.LayerLike, tag ? tag.Layer : ''));
      const dt = prompt(`دستگاه «${txt}» در دیتابیس نیست. نوع دستگاه برای ایجاد:`, r ? r.DeviceType : '');
      if (!dt) return;
      (async () => {
        const res = await fetch('/api/maps/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building, block, floor, items: [{ text: txt, deviceType: dt }] }) });
        const d = await res.json();
        if (d.success && d.ids.length) onPickAsset(d.ids[0]);
      })();
    };
    box.addEventListener('click', onClick);
    return () => box.removeEventListener('click', onClick);
  }, [tags, rules, building, block, floor]);

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
          <button className="btn-primary" onClick={load}>بارگذاری</button>
          {!map && <button className="btn-success" onClick={createMap}>تعریف نقشهٔ جدید</button>}
          {map && hashChanged && <button className="btn-danger" disabled={busy} onClick={convert}>⚠ فایل اتوکد تغییر کرده — همگام‌سازی</button>}
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
        <div className="text-[11px] text-gray-600 mt-1">کلیک روی برچسب/دستگاه: پُرشدن فرم دستگاه یا ایجاد دستگاه جدید | لایه‌های دیوار/پارتیشن همیشه روشن‌اند.</div>
      </div>
    </div>
  );
}