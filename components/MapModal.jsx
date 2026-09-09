'use client';
import { useState, useEffect, useRef } from 'react';
import DwgBrowser from './DwgBrowser';

const likeTest = (pattern, s) => {
  const rx = new RegExp('^' + String(pattern).split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return rx.test(s || '');
};
const toEn = (s) => String(s)
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const BUILDING_ALIASES = {
  'مرکزی': 'مرکزی', 'markazi': 'مرکزی', 'mk': 'مرکزی', 'cen': 'مرکزی', 'central': 'مرکزی',
  'سردخانه': 'سردخانه', 'sardkhaneh': 'سردخانه', 'sard': 'سردخانه',
};

const parseMapName = (name) => {
  let base = toEn(String(name)).replace(/\.dwg$/i, '').replace(/[ـ‌‍‎‏‪‫]/g, '').trim();
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

const parseMapInfo = (full) => {
  const out = parseMapName(String(full).split('\\').pop());
  if (!out.block) { const m = String(full).match(/بلوک[\s_\-]*([A-Ca-c])/); if (m) out.block = m[1].toUpperCase(); }
  if (!out.floor) { const m = String(full).match(/طبقه[\s_\-]*(-?\d+(?:\.\d+)?)/); if (m) out.floor = toEn(m[1]); }
  if (!out.building && /مرکزی|Markazi/i.test(String(full))) out.building = 'مرکزی';
  return out;
};

const ruleForLayer = (rules, L) => {
  let r = rules.find((r) => !r.IsBase && likeTest(r.LayerLike, L));
  if (r) return r;
  const stripped = String(L).replace(/[-_ ]?(Text|Num|Numbers|Nums|Tag|Label)s?$/i, '');
  r = rules.find((r) => !r.IsBase && likeTest(r.LayerLike, stripped));
  if (r) return r;
  return rules.find((r) => {
    const bp = String(r.LayerLike).replace(/%.*$/, '');
    return bp && String(L).toLowerCase().startsWith(bp.toLowerCase());
  }) || null;
};

// ✅ کامپوننت جمع‌شونده در سطح ماژول (بدون remount → بدون پرش فوکوس)
function Sec({ k, title, badge, open, onToggle, children, color = 'bg-[#F7C4A5]' }) {
  return (
    <div className={`mb-2 ${color} rounded`}>
      <button type="button" onClick={() => onToggle(k)} className="w-full flex items-center justify-between px-2 py-1 font-bold text-sm">
        <span>{title}{badge ? <span className="mr-2 bg-white/70 rounded px-1 text-xs">{badge}</span> : null}</span>
        <span className="text-xs">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="px-2 pb-2">{children}</div> : null}
    </div>
  );
}

export default function MapModal({ onPickAsset, onOpenDefineDevice, onClose, defaults = {} }) {
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
  const [center, setCenter] = useState(null);
  const [unknown, setUnknown] = useState([]);
  const [newOnMap, setNewOnMap] = useState([]);
  const [orphan, setOrphan] = useState([]);
  const [checked, setChecked] = useState({});
  const [answers, setAnswers] = useState({});
  const [newNames, setNewNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [centerMode, setCenterMode] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [chosenDwg, setChosenDwg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // ✅ state جمع‌شوندگی بخش‌ها
  const [open, setOpen] = useState({ unknown: true, newOnMap: true, orphan: true });
  const toggleSec = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // ✅ state زوم و pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });

  const boxRef = useRef(null);

  const fetchSvg = async (url) => {
    try {
      const res = await fetch(url + '?v=' + Date.now());
      const t = await res.text();
      setSvgText(t);
      setZoom(1); setPan({ x: 0, y: 0 });
      zoomRef.current = 1; panRef.current = { x: 0, y: 0 };
    } catch {}
  };

  const load = async (b = building, bl = block, f = floor) => {
    if (!b || !f) { alert('لطفاً «ساختمان» و «طبقه» را وارد کنید.'); return; }
    try {
      let res = await fetch(`/api/maps?building=${encodeURIComponent(b)}&block=${encodeURIComponent(bl)}&floor=${encodeURIComponent(f)}`);
      let d = await res.json();
      if (!d.success) { alert('خطا: ' + d.error); return; }
      if (!d.map && chosenDwg) {
        await fetch('/api/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building: b, block: bl, floor: f, dwgPath: chosenDwg }) });
        res = await fetch(`/api/maps?building=${encodeURIComponent(b)}&block=${encodeURIComponent(bl)}&floor=${encodeURIComponent(f)}`);
        d = await res.json();
      }
      setRules(d.rules || []); setDeviceTypes(d.deviceTypes || []);
      setMap(d.map || null); setTags(d.tags || []); setHashChanged(!!d.hashChanged);
      setCenter(d.map && d.map.CenterX != null ? { x: d.map.CenterX, y: d.map.CenterY } : null);
      if (d.map && d.svgUrl) fetchSvg(d.svgUrl); else setSvgText('');
      if (d.map && d.hashChanged && !d.map.SvgPath) {
        const c = await fetch('/api/maps/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId: d.map.MapID, force: true }) });
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
      const res = await fetch('/api/maps/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId: map.MapID, force: true }) });
      const d = await res.json();
      if (!d.success) { alert('خطا: ' + d.error); return; }
      setHashChanged(false);
      if (!d.unchanged) {
        setUnknown(d.unknownLayers || []); setNewOnMap(d.newOnMap || []); setOrphan(d.orphanInDb || []);
        if (d.svgUrl) fetchSvg(d.svgUrl);
        await load();
      }
    } catch (e) { alert('خطا در تبدیل: ' + e.message); }
    setBusy(false);
  };

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

  const detectEntrance = (tag) => {
    if (!center || !tag) return '';
    if (!String(building).includes('مرکزی')) return '';
    const dx = tag.x - center.x, dy = tag.y - center.y;
    if (dx < 0 && dy < 0) return '1';
    if (dx < 0 && dy >= 0) return '2';
    if (dx >= 0 && dy >= 0) return '3';
    return '4';
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
      const r = ruleForLayer(rules, t.layer);
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
    setOrphan([]);
    alert('دستگاه‌های حذف‌شده از نقشه، «ناموجود» علامت‌گذاری شدند (سابقه حفظ شد).');
  };

  // ✅ نمایش لایه‌ها + رسم نقطهٔ مرکز روی SVG
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    box.querySelectorAll('g[data-layer]').forEach((g) => {
      const l = g.getAttribute('data-layer');
      const isB = rules.some((r) => r.IsBase && likeTest(r.LayerLike, l));
      const r = ruleForLayer(rules, l);
      g.style.display = isB || (r && (!deviceType || r.DeviceType === deviceType)) ? '' : 'none';
    });
    box.querySelectorAll('text[data-tag]').forEach((t) => {
      t.style.cursor = 'pointer';
      t.setAttribute('fill', '#c0392b');
      t.setAttribute('stroke', 'none');
      t.setAttribute('pointer-events', 'all');
    });

    const existing = box.querySelector('#map-center-marker');
    if (existing) existing.remove();
    if (center && map) {
      const svgEl = box.querySelector('svg');
      if (svgEl) {
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        g.id = 'map-center-marker';
        g.setAttribute('style', 'pointer-events:none;opacity:0.7;');
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', center.x);
        circle.setAttribute('cy', center.y);
        circle.setAttribute('r', 10);
        circle.setAttribute('fill', '#dc2626');
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', 2);
        g.appendChild(circle);
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', center.x);
        txt.setAttribute('y', center.y + 28);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', '#dc2626');
        txt.setAttribute('font-size', '11');
        txt.setAttribute('font-weight', 'bold');
        txt.textContent = 'مرکز';
        g.appendChild(txt);
        if (centerMode) {
          const vb = svgEl.viewBox.baseVal;
          const w = vb && vb.width ? vb.width : 1400;
          const h = vb && vb.height ? vb.height : 900;
          const hLine = document.createElementNS(ns, 'line');
          hLine.setAttribute('x1', 0); hLine.setAttribute('y1', center.y);
          hLine.setAttribute('x2', w); hLine.setAttribute('y2', center.y);
          hLine.setAttribute('stroke', '#dc2626'); hLine.setAttribute('stroke-width', 1);
          hLine.setAttribute('stroke-dasharray', '4,4');
          g.appendChild(hLine);
          const vLine = document.createElementNS(ns, 'line');
          vLine.setAttribute('x1', center.x); vLine.setAttribute('y1', 0);
          vLine.setAttribute('x2', center.x); vLine.setAttribute('y2', h);
          vLine.setAttribute('stroke', '#dc2626'); vLine.setAttribute('stroke-width', 1);
          vLine.setAttribute('stroke-dasharray', '4,4');
          g.appendChild(vLine);
        }
        svgEl.appendChild(g);
      }
    }
  }, [svgText, rules, deviceType, center, map, centerMode]);

  // ✅ کلیک روی برچسب: چک تطابق کامل → انتخاب یا باز کردن AssetsModal با preset
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const onClick = async (e) => {
      if (dragRef.current.moved) { dragRef.current.moved = false; return; }
      // حالت تعیین مرکز
      if (centerMode && map) {
        const svgEl = box.querySelector('svg');
        if (svgEl && svgEl.createSVGPoint) {
          const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          const m = svgEl.getScreenCTM();
          if (m) {
            const p = pt.matrixTransform(m.inverse());
            await fetch('/api/maps/center', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId: map.MapID, x: p.x, y: p.y }) });
            setCenter({ x: p.x, y: p.y });
            setCenterMode(false);
            setStatusMsg('مرکز نقشه تنظیم شد.');
            setTimeout(() => setStatusMsg(''), 2000);
            return;
          }
        }
      }
      const el = e.target.closest('[data-tag]'); if (!el) return;
      const txt = el.getAttribute('data-tag');
      const tag = tags.find((t) => t.text === txt);
      // ✅ اگر دستگاه از قبل روی این برچسب لینک شده است، انتخاب مستقیم
      if (tag && tag.AssetID) {
        if (onPickAsset) onPickAsset(tag.AssetID);
        return;
      }
      const layer = tag ? tag.Layer : '';
      const r = ruleForLayer(rules, layer);
      const inferredType = r ? r.DeviceType : (deviceType || '');
      const numMatch = txt.match(/^\s*-?\d+(?:\.\d+)?\s*$/);
      const deviceNumber = numMatch ? String(parseInt(txt, 10)) : '';

      // چک تطابق کامل در دیتابیس
      try {
        const res = await fetch('/api/assets/match-or-prefill', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceType: inferredType, deviceNumber, building, block, floor,
            entrance: detectEntrance(tag), location: '', mechSystem: '', mapTag: txt,
          }),
        });
        const d = await res.json();
        if (d.found) {
          if (onPickAsset) onPickAsset(d.assetId);
        } else if (onOpenDefineDevice) {
          onOpenDefineDevice(d.preset);
        } else {
          alert(`دستگاه «${txt}» در دیتابیس نیست و مودال دستگاه در دسترس نمی‌باشد.`);
        }
      } catch (err) {
        alert('خطا در بررسی دستگاه: ' + err.message);
      }
    };
    box.addEventListener('click', onClick);
    return () => box.removeEventListener('click', onClick);
  }, [tags, rules, building, block, floor, center, centerMode, map, deviceType, onPickAsset, onOpenDefineDevice]);

  // ✅ کنترل زوم با wheel (passive:false برای preventDefault واقعی)
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => {
        const nz = Math.min(8, Math.max(0.2, z * factor));
        zoomRef.current = nz;
        return nz;
      });
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  // ✅ کنترل drag/pan
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    const totalDx = Math.abs(e.clientX - dragRef.current.startX);
    const totalDy = Math.abs(e.clientY - dragRef.current.startY);
    if (totalDx > 4 || totalDy > 4) dragRef.current.moved = true;
    dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY;
    setPan((p) => { const np = { x: p.x + dx, y: p.y + dy }; panRef.current = np; return np; });
  };
  const onPointerUp = (e) => {
    dragRef.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };
  const zoomIn = () => setZoom((z) => { const nz = Math.min(8, z * 1.25); zoomRef.current = nz; return nz; });
  const zoomOut = () => setZoom((z) => { const nz = Math.max(0.2, z / 1.25); zoomRef.current = nz; return nz; });
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; };

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
          <button className="btn-success" onClick={() => setShowBrowse(true)}>📂 مرور فایل نقشه…</button>
          {map && hashChanged && <button className="btn-danger" disabled={busy} onClick={convert}>⚠ همگام‌سازی</button>}
          {map && <button className="btn-primary" disabled={busy} onClick={convert} title="تبدیل مجدد">🔄</button>}
          {map && <button className={centerMode ? 'btn-danger' : 'btn-primary'} onClick={() => setCenterMode((v) => !v)} title="تعیین مرکز نقشه برای تشخیص ورودی‌ها">🎯</button>}
        </div>

        {statusMsg && <div className="mb-2 bg-teal-100 text-teal-900 rounded px-2 py-1 text-sm">{statusMsg}</div>}

        {/* ✅ بخش جمع‌شونده: لایه‌های ناشناخته */}
        {unknown.length > 0 && (
          <Sec k="unknown" open={open.unknown} onToggle={toggleSec} title="⚠ لایه‌های ناشناخته" badge={unknown.length}>
            {unknown.map((l) => (
              <div key={l} className="flex gap-2 items-center mt-2">
                <span className="text-sm font-bold w-40">{l}</span>
                <select className={inp} value={answers[l] || ''} onChange={(e) => setAnswers({ ...answers, [l]: e.target.value })}>
                  <option value="">(انتخاب)</option>
                  {deviceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="__new__">نوع جدید…</option>
                </select>
                {answers[l] === '__new__' && <input className={inp} placeholder="نام نوع جدید" value={newNames[l] || ''} onChange={(e) => setNewNames({ ...newNames, [l]: e.target.value })} />}
              </div>
            ))}
            <button className="btn-success mt-2" onClick={applyLayerAnswers}>ذخیرهٔ نگاشت و تبدیل مجدد</button>
          </Sec>
        )}

        {/* ✅ بخش جمع‌شونده: دستگاه‌های روی نقشه که در دیتابیس نیستند */}
        {newOnMap.length > 0 && (
          <Sec k="newOnMap" open={open.newOnMap} onToggle={toggleSec} title="🆕 دستگاه‌های جدید روی نقشه (بدون ثبت)" badge={newOnMap.length}>
            <div className="max-h-40 overflow-auto">
              {newOnMap.map((t) => (
                <label key={t.text} className="block text-sm mt-1">
                  <input type="checkbox" className="ml-2" checked={!!checked[t.text]} onChange={(e) => setChecked({ ...checked, [t.text]: e.target.checked })} />
                  {t.text} <span className="text-xs text-gray-500">(لایه: {t.layer})</span>
                </label>
              ))}
            </div>
            <button className="btn-success mt-2" onClick={registerChecked}>ثبت دستگاه‌های انتخاب‌شده</button>
          </Sec>
        )}

        {/* ✅ بخش جمع‌شونده: یتیم‌ها */}
        {orphan.length > 0 && (
          <Sec k="orphan" open={open.orphan} onToggle={toggleSec} title="⚠ در دیتابیس هستند ولی روی نقشه نیستند" badge={orphan.length} color="bg-[#FC7470]/30">
            {orphan.map((o) => <div key={o.assetId} className="text-sm">کد {o.assetId} — {o.tag}</div>)}
            <button className="btn-danger mt-2" onClick={deactivateOrphans}>علامت «ناموجود» (حفظ سابقه)</button>
          </Sec>
        )}

        {/* ✅ کانتینر نقشه با زوم/pan */}
        <div ref={boxRef}
          className="relative bg-white rounded border border-gray-400 overflow-hidden select-none"
          style={{ height: '60vh', cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <style>{`.mapzoom-wrap{width:100%;height:100%;} .mapzoom-wrap svg{width:100%;height:100%;display:block;}`}</style>
          <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 bg-white/90 rounded shadow p-1" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn-primary px-2 py-1 text-sm" onClick={zoomIn} title="بزرگ‌نمایی">+</button>
            <button type="button" className="btn-primary px-2 py-1 text-sm" onClick={zoomOut} title="کوچک‌نمایی">−</button>
            <button type="button" className="btn-primary px-2 py-1 text-sm" onClick={resetView} title="بازنشانی">⟲</button>
          </div>
          <div className="absolute top-2 right-2 z-20 bg-white/90 rounded shadow px-2 py-1 text-xs font-bold">
            زوم: {Math.round(zoom * 100)}٪
            {center && <span className="mr-2 text-red-600">🎯</span>}
            {centerMode && <span className="mr-2 text-orange-600">کلیک روی نقشه</span>}
          </div>
          <div className="mapzoom-wrap"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
            dangerouslySetInnerHTML={{ __html: svgText || '<div style="padding:40px;text-align:center">نقشه‌ای بارگذاری نشده</div>' }}
          />
        </div>
        <div className="text-[11px] text-gray-600 mt-1">
          چرخ ماوس = زوم | کشیدن = جابه‌جایی | کلیک روی برچسب قرمز = انتخاب/ثبت | 🎯 نقطهٔ قرمز = مرکز نقشه برای تشخیص ورودی‌ها
        </div>
      </div>
      {showBrowse && <DwgBrowser defaultPath="D:\\(فنی)" onClose={() => setShowBrowse(false)} onSelect={selectDwg} />}
    </div>
  );
}