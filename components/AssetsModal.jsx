'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import FileBrowser from './FileBrowser';

const DEFAULT_ASSET_FOLDER = 'D:\\(فنّی)';

const distinct = (arr) =>
  [...new Set(arr.map((x) => (x == null ? '' : String(x))).filter((x) => x !== '' && x !== '-'))]
    .sort((a, b) => a.localeCompare(b, 'fa', { numeric: true }));

const sameVal = (a, b) => {
  const sa = String(a ?? '').trim();
  const sb = String(b ?? '').trim();
  if (sa === sb) return true;
  const na = Number(sa);
  const nb = Number(sb);
  return !isNaN(na) && !isNaN(nb) && sa !== '' && sb !== '' && na === nb;
};

// ✅ ترتیب آبشاری پیشنهادها (مانند دسکتاپ)
const CASCADE_ORDER = [
  'Building', 'Block', 'Floor', 'Entrance', 'Location',
  'MechSystem', 'AssetName', 'AssetNumber',
  'Specifications', 'PropertyCode', 'SerialNumber',
];

// ✅ کمبوباکس واقعی: input + دکمهٔ ▾ + لیست بازشو + فیلتر زنده با تایپ
function ComboInput({ value, onChange, options, placeholder, disabled, className }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const shown = (options || []).filter((v) => !q || String(v).includes(q));
  return (
    <div ref={wrapRef} className="relative">
      <input
        className={className}
        style={{ paddingLeft: '26px' }}
        value={value ?? ''}
        placeholder={placeholder || ''}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      <button
        type="button"
        className="combo-btn"
        disabled={disabled}
        onClick={() => { setQ(''); setOpen((o) => !o); }}
      >▾</button>
      {open && (
        <div className="combo-list">
          {shown.length === 0 && <div className="combo-empty">گزینه‌ای نیست</div>}
          {shown.map((v) => (
            <button key={v} type="button" className="combo-item" onClick={() => { onChange(v); setOpen(false); setQ(''); }}>
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssetsModal({ onClose, onNewTaskWithAsset, onSelectAsset = null, preset = null, onAssetSaved = null }) {
  const [tab, setTab] = useState('devices');
  const [all, setAll] = useState([]);
  const [search, setSearch] = useState('');
  const [flt, setFlt] = useState({ Building: '', Block: '', Floor: '', Entrance: '', Location: '', MechSystem: '', AssetName: '' });
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [base, setBase] = useState({ names: [], systems: [] });
  const [newName, setNewName] = useState('');
  const [newSystem, setNewSystem] = useState('');

  const loadAll = useCallback(async () => {
    try { const r = await fetch('/api/assets'); const d = await r.json(); if (d.success) setAll(d.data || []); } catch {}
  }, []);
  const loadBase = useCallback(async () => {
    try { const r = await fetch('/api/base-info'); const d = await r.json(); if (d.success) setBase({ names: d.names || [], systems: d.systems || [] }); } catch {}
  }, []);
  useEffect(() => { loadAll(); loadBase(); }, [loadAll, loadBase]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const filtered = all.filter((a) => {
    const q = search.trim();
    if (q) {
      const hay = [a.AssetID, a.AssetName, a.AssetNumber, a.Building, a.Block, a.Floor, a.Entrance, a.Location, a.MechSystem, a.Specifications, a.PropertyCode, a.SerialNumber]
        .map((v) => String(v ?? '')).join(' ');
      if (!hay.includes(q)) return false;
    }
    for (const [k, v] of Object.entries(flt)) if (v && String(a[k] ?? '') !== v) return false;
    return true;
  });

  const opt = (key, src) => distinct(src.map((a) => a[key]));
  const setF = (k) => (e) => setFlt({ ...flt, [k]: e.target.value });

  // ✅ گزینه‌های آبشاری هر فیلد بر اساس فیلدهای قبلیِ پرشده
  const cascadeOptions = (field) => {
    if (!form) return [];
    const idx = CASCADE_ORDER.indexOf(field);
    if (idx < 0) return [];
    let rows = all;
    for (let i = 0; i < idx; i++) {
      const k = CASCADE_ORDER[i];
      const v = String(form[k] ?? '').trim();
      if (!v) continue;
      rows = rows.filter((r) => sameVal(r[k], v));
    }
    return distinct(rows.map((r) => r[field]));
  };

  // ✅✅ «محل»: آبشاری فقط تا سطح ساختمان؛ اگر خالی بود، کل محل‌های دیتابیس
  //    (تا با تایپ، همیشه پیشنهاد وجود داشته باشد)
  const locationOptions = () => {
    if (!form) return [];
    const byBuilding = form.Building ? all.filter((r) => sameVal(r.Building, form.Building)) : all;
    let opts = distinct(byBuilding.map((r) => r.Location));
    if (opts.length === 0) opts = distinct(all.map((r) => r.Location));
    return opts;
  };

  const optionsFor = (field) =>
    field === 'Location' ? locationOptions() : cascadeOptions(field);

  const setFormField = (k, v) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const startAdd = (pre = null) => {
    setEditingId(null);
    setForm({
      AssetName: '', AssetNumber: '', Building: '', Block: '-', Floor: '', Entrance: '', Location: '',
      MechSystem: '', Specifications: '', PropertyCode: '0', SerialNumber: '0', FolderPath: DEFAULT_ASSET_FOLDER,
      ...(pre || {}),
      AssetNumber: pre && pre.AssetNumber != null && String(pre.AssetNumber).trim() !== '' ? String(pre.AssetNumber) : '',
      Floor: pre && pre.Floor != null && String(pre.Floor).trim() !== '' ? String(pre.Floor) : '',
      Block: pre && pre.Block ? String(pre.Block) : '-',
    });
  };

  useEffect(() => {
    if (preset) {
      setTab('devices');
      startAdd(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (a) => {
    setEditingId(a.AssetID);
    setForm({ ...a, FolderPath: a.FolderPath || '' });
  };

  const save = async () => {
    if (!form.AssetName || !form.Building) { alert('نام دستگاه و ساختمان الزامی است.'); return; }
    setSaving(true);
    try {
      const res = editingId
        ? await fetch(`/api/assets/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await res.json();
      if (d.success) {
        alert('ذخیره شد.');
        const newId = d.AssetID || d.assetId || d.id || null;
        try {
          if (!editingId && preset && preset.MapTag && newId) {
            await fetch('/api/maps/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: [{ assetId: newId, text: preset.MapTag }] }),
            });
          }
        } catch {}
        if (onAssetSaved) onAssetSaved(newId, form);
        setForm(null); setEditingId(null); loadAll();
      } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm('آیا از حذف این دستگاه مطمئن هستید؟')) return;
    try {
      const r = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) loadAll(); else alert(d.error);
    } catch {}
  };

  const addBase = async (kind, value) => {
    const r = await fetch('/api/base-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, value }) });
    const d = await r.json();
    if (d.success) loadBase(); else alert(d.error);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1150px] max-w-[98vw] max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">مدیریت دستگاه‌ها و اطلاعات پایه</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="flex gap-2 px-6 py-2 border-b border-teal-700">
          <button className={tab === 'devices' ? 'btn-success' : 'btn-primary'} onClick={() => { setTab('devices'); setForm(null); }}>دستگاه‌ها</button>
          <button className={tab === 'base' ? 'btn-success' : 'btn-primary'} onClick={() => setTab('base')}>اطلاعات پایه</button>
        </div>

        <div className="p-5 overflow-auto overscroll-contain">
          {tab === 'devices' && form === null && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <input className={inp} placeholder="جستجوی سراسری..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inp} value={flt.Building} onChange={setF('Building')}><option value="">ساختمان</option>{opt('Building', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={flt.Block} onChange={setF('Block')}><option value="">بلوک</option>{opt('Block', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={flt.Floor} onChange={setF('Floor')}><option value="">طبقه</option>{opt('Floor', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={flt.Entrance} onChange={setF('Entrance')}><option value="">ورودی</option>{opt('Entrance', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={flt.Location} onChange={setF('Location')}><option value="">محل</option>{opt('Location', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={flt.MechSystem} onChange={setF('MechSystem')}><option value="">سیستم</option>{opt('MechSystem', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={flt.AssetName} onChange={setF('AssetName')}><option value="">دستگاه</option>{opt('AssetName', all).map((x) => <option key={x}>{x}</option>)}</select>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {!onSelectAsset && (
                  <>
                    <button className="btn-success" onClick={() => startAdd()}>+ دستگاه جدید</button>
                    <button className="btn-primary" disabled={!selectedAsset}
                      title={selectedAsset ? 'ایجاد کار جدید برای: ' + selectedAsset.AssetName : 'ابتدا یک دستگاه را از جدول انتخاب کنید'}
                      onClick={() => onNewTaskWithAsset && onNewTaskWithAsset(selectedAsset.AssetID)}>+ کار جدید با این دستگاه</button>
                  </>
                )}
                {onSelectAsset && <div className="text-sm font-bold text-teal-800 py-2">یک دستگاه را انتخاب کنید تا به فرم کار برگردد.</div>}
              </div>
              <div className="overflow-auto overscroll-contain rounded border border-gray-300" style={{ maxHeight: '52vh' }}>
                <table className="task-table w-full min-w-[1080px]">
                  <thead>
                    <tr><th>کد</th><th>دستگاه</th><th>شماره</th><th>ساختمان</th><th>بلوک</th><th>طبقه</th><th>ورودی</th><th>محل</th><th>سیستم</th><th>اموال</th><th>عملیات</th></tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && <tr><td colSpan={11} className="text-center py-6">موردی یافت نشد</td></tr>}
                    {filtered.map((a) => (
                      <tr
                        key={a.AssetID}
                        onClick={() => (onSelectAsset ? onSelectAsset(a.AssetID) : setSelectedAsset(a))}
                        className={selectedAsset?.AssetID === a.AssetID ? 'task-row-selected' : ''}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{a.AssetID}</td>
                        <td>{a.AssetName}</td>
                        <td>{a.AssetNumber ?? ''}</td>
                        <td>{a.Building}</td>
                        <td>{a.Block}</td>
                        <td>{a.Floor}</td>
                        <td>{a.Entrance}</td>
                        <td>{a.Location}</td>
                        <td>{a.MechSystem}</td>
                        <td>{a.PropertyCode ?? ''}</td>
                        <td className="whitespace-nowrap">
                          <button className="btn-primary px-2 py-1 text-xs ml-1" onClick={(e) => { e.stopPropagation(); startEdit(a); }}>ویرایش</button>
                          <button className="btn-danger px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); del(a.AssetID); }}>حذف</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'devices' && form !== null && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-[700px]">
              {preset && !editingId && (
                <div className="md:col-span-4 bg-yellow-100 rounded p-2 text-sm font-bold">
                  🗺 این دستگاه پیش‌پر شده است؛ پس از بررسی/ویرایش، ذخیره کنید یا انصراف بزنید.
                </div>
              )}

              <div>
                <label className="text-sm font-bold">ساختمان *</label>
                <ComboInput className={inp} value={form.Building} onChange={(v) => setFormField('Building', v)} options={optionsFor('Building')} />
              </div>
              <div>
                <label className="text-sm font-bold">بلوک</label>
                <ComboInput className={inp} value={form.Block} onChange={(v) => setFormField('Block', v)} options={optionsFor('Block')} />
              </div>
              <div>
                <label className="text-sm font-bold">طبقه</label>
                <ComboInput className={inp} value={form.Floor} onChange={(v) => setFormField('Floor', v)} options={optionsFor('Floor')} />
              </div>
              <div>
                <label className="text-sm font-bold">ورودی</label>
                <ComboInput className={inp} value={form.Entrance} onChange={(v) => setFormField('Entrance', v)} options={optionsFor('Entrance')} />
              </div>

              <div>
                <label className="text-sm font-bold">محل</label>
                <ComboInput className={inp} value={form.Location} onChange={(v) => setFormField('Location', v)} options={optionsFor('Location')} placeholder="تایپ کنید تا پیشنهاد داده شود..." />
              </div>
              <div>
                <label className="text-sm font-bold">سیستم</label>
                <ComboInput className={inp} value={form.MechSystem} onChange={(v) => setFormField('MechSystem', v)} options={optionsFor('MechSystem')} />
              </div>
              <div>
                <label className="text-sm font-bold">نام دستگاه *</label>
                <ComboInput className={inp} value={form.AssetName} onChange={(v) => setFormField('AssetName', v)} options={optionsFor('AssetName')} />
              </div>
              <div>
                <label className="text-sm font-bold">شماره</label>
                <ComboInput className={inp} value={form.AssetNumber} onChange={(v) => setFormField('AssetNumber', v)} options={optionsFor('AssetNumber')} />
              </div>

              <div>
                <label className="text-sm font-bold">کد اموال</label>
                <ComboInput className={inp} value={form.PropertyCode} onChange={(v) => setFormField('PropertyCode', v)} options={optionsFor('PropertyCode')} />
              </div>
              <div>
                <label className="text-sm font-bold">شماره سریال</label>
                <ComboInput className={inp} value={form.SerialNumber} onChange={(v) => setFormField('SerialNumber', v)} options={optionsFor('SerialNumber')} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-bold">مشخصات</label>
                <ComboInput className={inp} value={form.Specifications} onChange={(v) => setFormField('Specifications', v)} options={optionsFor('Specifications')} />
              </div>

              <div className="md:col-span-4">
                <label className="text-sm font-bold">مسیر پوشه</label>
                <div className="flex gap-2">
                  <input className={inp} dir="ltr" value={form.FolderPath || ''} onChange={(e) => setForm({ ...form, FolderPath: e.target.value })} />
                  <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setShowBrowser(true)}>مرور پوشه‌ها...</button>
                </div>
              </div>

              <div className="md:col-span-4 flex gap-2 mt-2">
                <button className="btn-success" disabled={saving} onClick={save}>{saving ? '...' : 'ذخیره'}</button>
                <button className="btn-danger" onClick={() => { setForm(null); setEditingId(null); }}>انصراف</button>
              </div>
            </div>
          )}

          {tab === 'base' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold mb-2">نام دستگاه‌ها (AssetNames)</h4>
                <div className="flex gap-2 mb-2">
                  <input className={inp} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام جدید..." />
                  <button className="btn-success whitespace-nowrap" onClick={() => { addBase('name', newName); setNewName(''); }}>افزودن</button>
                </div>
                <div className="max-h-64 overflow-auto bg-white rounded border p-2">
                  {base.names.map((n) => <div key={n.AssetNameID} className="py-1 border-b">{n.AssetName}</div>)}
                </div>
              </div>
              <div>
                <h4 className="font-bold mb-2">سیستم‌های مکانیکی (MechSystems)</h4>
                <div className="flex gap-2 mb-2">
                  <input className={inp} value={newSystem} onChange={(e) => setNewSystem(e.target.value)} placeholder="سیستم جدید..." />
                  <button className="btn-success whitespace-nowrap" onClick={() => { addBase('system', newSystem); setNewSystem(''); }}>افزودن</button>
                </div>
                <div className="max-h-64 overflow-auto bg-white rounded border p-2">
                  {base.systems.map((s) => <div key={s.MechSystemsID} className="py-1 border-b">{s.MechSystem}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBrowser && (
        <FileBrowser
          mode="folder"
          initial={form?.FolderPath || DEFAULT_ASSET_FOLDER}
          title="انتخاب پوشه دستگاه"
          onSelect={(p) => { setForm({ ...form, FolderPath: p }); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}