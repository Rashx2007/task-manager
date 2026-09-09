'use client';
import { useState, useEffect, useRef } from 'react';
import DwgBrowser from './DwgBrowser';

const likeTest = (pattern, s) => {
  const rx = new RegExp('^' + String(pattern).split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return rx.test(s || '');
};
const toEn = (s) => String(s)
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, (d) => '٠١٣٤٥٧٨٩'.indexOf(d));

const BUILDING_ALIASES = {
  'مرکزی': 'مرکزی', 'markazi': 'مرکزی', 'mk': 'مرکزی', 'cen': 'مرکزی', 'central': 'مرکزی',
  'سردخانه': 'سردخانه', 'sardkhaneh': 'سردخانه', 'sard': 'سردخانه',
};

const decodeFloor = (t) => {
  let s = String(t);
  let neg = false;
  if (/^M/i.test(s)) { neg = true; s = s.slice(1); }
  if (s.includes('-')) s = s.replace('-', '.');
  const v = Number(s);
  return isNaN(v) ? '' : String(neg ? -v : v);
};

const parseMapName = (name) => {
  let base = toEn(String(name)).replace(/\.dwg$/i, '').replace(/[ـ‌‍‎‏‪‫]/g, '').trim();
  const out = { building: '', block: '', floor: '' };
    // ✅ الگوی استاندارد جدید: ساختمان_بلوک_طبقه
  const m3 = base.match(/^(.+?)_([A-CX])_(M?\d+(?:-\d+)?)$/i);
  if (m3) {
    out.building = BUILDING_ALIASES[m3[1]] || BUILDING_ALIASES[m3[1].toLowerCase()] || m3[1];
    out.block = m3[2].toUpperCase() === 'X' ? '' : m3[2].toUpperCase();
    out.floor = decodeFloor(m3[3]);
    return out;
  }
  const mFloor = base.match(/(-?\d+(?:\.\d+)?)\s*$/);
  if (mFloor) { out.floor = String(Number(mFloor[1])); base = base.slice(0, mFloor.index); }
  base = base.replace(/[_\-\s]+$/g, '');
  const mBlock = base.match(/([A-Ca-c])$/);
  if (mBlock) { out.block = mBlock[1].toUpperCase(); base = base.slice(0, mBlock.index); }
  const bRaw = base.replace(/[_\-\s]+$/g, '').trim();
  out.building = BUILDING_ALIASES[bRaw.toLowerCase()] || BUILDING_ALIASES[bRaw] || bRaw;
  return out;
};

// ✅ تجزیهٔ کامل: اول نام فایل، بعد تک‌تک بخش‌های مسیر پوشه، بعد کل مسیر
const parseMapInfo = (full) => {
  const out = { building: '', block: '', floor: '' };
  const segs = String(full).split(/[\\/]+/).filter(Boolean);
  const fname = segs.pop() || '';
  const nm = parseMapName(fname);
  out.building = nm.building || ''; out.block = nm.block || ''; out.floor = nm.floor || '';
  for (const s of segs) {
    const t = toEn(s).trim();
    if (!out.block) { const m = t.match(/^(بلوک|block)[\s_\-]*([A-Ca-c])$/i); if (m) out.block = m[2].toUpperCase(); }
    if (!out.floor) { const m = t.match(/^(طبقه|floor)[\s_\-]*(-?\d+(?:\.\d+)?)$/i); if (m) out.floor = String(Number(m[2])); }
    if (!out.building) {
      if (BUILDING_ALIASES[t]) out.building = BUILDING_ALIASES[t];
      else if (BUILDING_ALIASES[t.toLowerCase()]) out.building = BUILDING_ALIASES[t.toLowerCase()];
    }
    if (!out.building || !out.block || !out.floor) {
      const pn = parseMapName(t);
      if (!out.building && pn.building && pn.building !== t) out.building = pn.building;
      if (!out.block && pn.block) out.block = pn.block;
      if (!out.floor && pn.floor) out.floor = pn.floor;
    }
  }
  if (!out.building && /مرکزی|Markazi/i.test(String(full))) out.building = 'مرکزی';
  if (!out.building && /سردخانه|Sardkhaneh/i.test(String(full))) out.building = 'سردخانه';
  if (!out.block) { const m = String(full).match(/بلوک[\s_\-]*([A-Ca-c])/); if (m) out.block = m[1].toUpperCase(); }
  if (!out.floor) { const m = String(full).match(/طبقه[\s_\-]*(-?\d+(?:\.\d+)?)/); if (m) out.floor = toEn(m[1]); }
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

// ✅ پاک‌سازی متن‌های SVG: حذف کدهای MTEXT + تلاش برای رفع mojibake
const fixText = (s) => {
  if (!s) return s || '';
  let t = String(s);
  t = t.replace(/\\[fFHwWqQcCTAa][^;\\]*;/g, '');
  t = t.replace(/\\[Pp~]/g, ' ');
  t = t.replace(/[{}]/g, '');
  t = t.replace(/\\([^\\])/g, '$1');
  try {
    const u = decodeURIComponent(escape(t));
    if (u && /[\u0600-\u06FF]/.test(u)) t = u;
  } catch {}
  return t.replace(/\s+/g, ' ').trim();
};

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

  const [open, setOpen] = useState({ unknown: true, newOnMap: true, orphan: true });
  const toggleSec = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false });
  const boxRef = useRef(null);
  const msgTimerRef = useRef(null);

  const say = (m, ms = 4000) => {
    setStatusMsg(m);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    if (ms) msgTimerRef.current = setTimeout(() => setStatusMsg(''), ms);
  };

  const fetchSvg = async (url) => {
    try {
      const res = await fetch(url + '?v=' + Date.now());
      if (!res.ok || !(res.headers.get('content-type') || '').includes('svg')) {
        setSvgText('');
        say('فایل SVG نقشه یافت نشد (404)؛ ابتدا «🔄 تبدیل مجدد» یا «⚠ همگام‌سازی» را بزنید.', 8000);
        return;
      }
      const t = await res.text();
      setSvgText(t);
      setZoom(1); setPan({ x: 0, y: 0 });
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
      if (!d.success) { alert('خطا: ' + d.error); setBusy(false); return; }
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
    say(`فایل انتخاب شد: ساختمان=${nm.building || '؟'} بلوک=${nm.block || '؟'} طبقه=${nm.floor || '؟'}`, 6000);
    const b = nm.building || building, f = nm.floor || floor;
    if (!b || !f) alert('«ساختمان» و «طبقه» از نام فایل/مسیر خوانده نشد؛ لطفاً دستی پر کنید و «بارگذاری» بزنید.');
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

  // ✅ نمایش لایه‌ها + پاک‌سازی متن‌ها + مرکز
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    // پاک‌سازی و اصلاح متن‌ها (قبل از هر چیز)
    box.querySelectorAll('text').forEach((t) => {
      const fixed = fixText(t.textContent);
      if (fixed !== t.textContent) t.textContent = fixed;
      if (t.hasAttribute('data-tag')) t.setAttribute('data-tag', fixed);
    });
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
        circle.setAttribute('cx', center.x); circle.setAttribute('cy', center.y); circle.setAttribute('r', 10);
        circle.setAttribute('fill', '#dc2626'); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', 2);
        g.appendChild(circle);
        if (centerMode) {
          const vb = svgEl.viewBox.baseVal;
          const w = vb && vb.width ? vb.width : 1400;
          const h = vb && vb.height ? vb.height : 900;
          const hl = document.createElementNS(ns, 'line');
          hl.setAttribute('x1', 0); hl.setAttribute('y1', center.y); hl.setAttribute('x2', w); hl.setAttribute('y2', center.y);
          hl.setAttribute('stroke', '#dc2626'); hl.setAttribute('stroke-width', 1); hl.setAttribute('stroke-dasharray', '4,4');
          g.appendChild(hl);
          const vl = document.createElementNS(ns, 'line');
          vl.setAttribute('x1', center.x); vl.setAttribute('y1', 0); vl.setAttribute('x2', center.x); vl.setAttribute('y2', h);
          vl.setAttribute('stroke', '#dc2626'); vl.setAttribute('stroke-width', 1); vl.setAttribute('stroke-dasharray', '4,4');
          g.appendChild(vl);
        }
        svgEl.appendChild(g);
      }
    }
  }, [svgText, rules, deviceType, center, map, centerMode]);

  // ✅ کلیک روی برچسب با پیام‌های وضعیت
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const onClick = async (e) => {
      if (dragRef.current.moved) { dragRef.current.moved = false; return; }
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
            say('مرکز نقشه تنظیم شد.', 3000);
            return;
          }
        }
      }
      const el = e.target.closest('[data-tag]');
      if (!el) return;
      const txt = el.getAttribute('data-tag') || '';
      say(`برچسب «${txt}» — در حال بررسی…`, 0);
      const tag = tags.find((t) => t.text === txt);
      if (tag && tag.AssetID) {
        say(`دستگاه کد ${tag.AssetID} از قبل ثبت شده؛ انتخاب شد.`, 3000);
        if (onPickAsset) onPickAsset(tag.AssetID);
        return;
      }
      const layer = tag ? tag.Layer : (el.getAttribute('data-layer') || '');
      const r = ruleForLayer(rules, layer);
      const inferredType = r ? r.DeviceType : (deviceType || '');
      const numMatch = txt.match(/^\s*-?\d+(?:\.\d+)?\s*$/);
      const deviceNumber = numMatch ? String(parseInt(txt, 10)) : '';
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
          say(`دستگاه کد ${d.assetId} یافت شد؛ انتخاب شد.`, 3000);
          if (onPickAsset) onPickAsset(d.assetId);
        } else if (onOpenDefineDevice) {
          say('دستگاه در دیتابیس نیست؛ فرم ثبت/ویرایش باز شد…', 4000);
          onOpenDefineDevice(d.preset);
        } else {
          say('خطا: مودال تعریف دستگاه در دسترس نیست.', 5000);
          alert(`دستگاه «${txt}» در دیتابیس نیست و مودال تعریف دستگاه متصل نشده است.`);
        }
      } catch (err) {
        say('خطا در بررسی دستگاه: ' + err.message, 6000);
        alert('خطا در بررسی دستگاه: ' + err.message);
      }
    };
    box.addEventListener('click', onClick);
    return () => box.removeEventListener('click', onClick);
  }, [tags, rules, building, block, floor, center, centerMode, map, deviceType, onPickAsset, onOpenDefineDevice]);

  // ✅ زوم با چرخ ماوس
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => Math.min(8, Math.max(0.2, z * factor)));
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  // ✅ درگ بدون setPointerCapture (تا کلیک دکمه‌ها و برچسب‌ها سالم بماند)
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
  };
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY;
      if (Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4) d.moved = true;
      d.lastX = e.clientX; d.lastY = e.clientY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    };
    const up = () => { dragRef.current.active = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const zoomIn = () => setZoom((z) => Math.min(8, z * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(0.2, z / 1.25));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

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
          {map && <button className={centerMode ? 'btn-danger' : 'btn-primary'} onClick={() => setCenterMode((v) => !v)} title="تعیین مرکز نقشه">🎯</button>}
        </div>

        {statusMsg && <div className="mb-2 bg-teal-100 text-teal-900 rounded px-2 py-1 text-sm font-bold">{statusMsg}</div>}

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

        {orphan.length > 0 && (
          <Sec k="orphan" open={open.orphan} onToggle={toggleSec} title="⚠ در دیتابیس هستند ولی روی نقشه نیستند" badge={orphan.length} color="bg-[#FC7470]/30">
            {orphan.map((o) => <div key={o.assetId} className="text-sm">کد {o.assetId} — {o.tag}</div>)}
            <button className="btn-danger mt-2" onClick={deactivateOrphans}>علامت «ناموجود» (حفظ سابقه)</button>
          </Sec>
        )}

        <div ref={boxRef}
          className="relative bg-white rounded border border-gray-400 overflow-hidden select-none"
          style={{ height: '60vh', cursor: 'grab' }}
          onPointerDown={onPointerDown}
        >
          <style>{`
            .mapzoom-wrap{width:100%;height:100%;background:#fff;}
            .mapzoom-wrap svg{width:100%;height:100%;display:block;background:#fff;shape-rendering:geometricPrecision;}
            .mapzoom-wrap svg line,.mapzoom-wrap svg path,.mapzoom-wrap svg polyline,.mapzoom-wrap svg polygon,.mapzoom-wrap svg circle,.mapzoom-wrap svg ellipse{stroke:#1f2937 !important;}
            .mapzoom-wrap svg text{font-weight:600;}
            .mapzoom-wrap svg text[data-tag]{font-weight:800;}
          `}</style>
          <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 bg-white/90 rounded shadow p-1">
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
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', willChange: 'transform' }}
            dangerouslySetInnerHTML={{ __html: svgText || '<div style="padding:40px;text-align:center">نقشه‌ای بارگذاری نشده</div>' }}
          />
        </div>
        <div className="text-[11px] text-gray-600 mt-1">
          چرخ ماوس = زوم | کشیدن = جابه‌جایی | کلیک روی برچسب قرمز = انتخاب/ثبت | 🎯 نقطهٔ قرمز = مرکز نقشه
        </div>
      </div>
      {showBrowse && <DwgBrowser defaultPath="D:\\(فنی)" onClose={() => setShowBrowse(false)} onSelect={selectDwg} />}
    </div>
  );
}