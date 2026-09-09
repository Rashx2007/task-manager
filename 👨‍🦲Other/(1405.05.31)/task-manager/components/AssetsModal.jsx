'use client';
import { useState, useEffect, useCallback } from 'react';
import FileBrowser from './FileBrowser';

const DEFAULT_ASSET_FOLDER = 'D:\\(فنّی)';

const distinct = (arr) =>
  [...new Set(arr.map((x) => (x == null ? '' : String(x))).filter((x) => x !== '' && x !== '-'))]
    .sort((a, b) => a.localeCompare(b, 'fa'));

export default function AssetsModal({ onClose, onNewTaskWithAsset, onSelectAsset = null }) {
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

  const startAdd = () => {
    setEditingId(null);
    setForm({ AssetName: '', AssetNumber: '', Building: '', Block: '-', Floor: '', Entrance: '', Location: '', MechSystem: '', Specifications: '', PropertyCode: '0', SerialNumber: '0', FolderPath: DEFAULT_ASSET_FOLDER });
  };
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
      if (d.success) { alert('ذخیره شد.'); setForm(null); setEditingId(null); loadAll(); }
      else alert('خطا: ' + d.error);
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
                    <button className="btn-success" onClick={startAdd}>+ دستگاه جدید</button>
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
              <div>
                <label className="text-sm font-bold">نام دستگاه *</label>
                <input className={inp} list="asset-names" value={form.AssetName || ''} onChange={(e) => setForm({ ...form, AssetName: e.target.value })} />
                <datalist id="asset-names">{base.names.map((n) => <option key={n.AssetNameID} value={n.AssetName} />)}</datalist>
              </div>
              <div><label className="text-sm font-bold">شماره</label><input className={inp} value={form.AssetNumber ?? ''} onChange={(e) => setForm({ ...form, AssetNumber: e.target.value })} /></div>
              <div>
                <label className="text-sm font-bold">ساختمان *</label>
                <input className={inp} list="buildings-list" value={form.Building || ''} onChange={(e) => setForm({ ...form, Building: e.target.value })} />
                <datalist id="buildings-list">{opt('Building', all).map((b) => <option key={b} value={b} />)}</datalist>
              </div>
              <div><label className="text-sm font-bold">بلوک</label><input className={inp} value={form.Block ?? ''} onChange={(e) => setForm({ ...form, Block: e.target.value })} /></div>
              <div><label className="text-sm font-bold">طبقه</label><input className={inp} value={form.Floor ?? ''} onChange={(e) => setForm({ ...form, Floor: e.target.value })} /></div>
              <div><label className="text-sm font-bold">ورودی</label><input className={inp} value={form.Entrance ?? ''} onChange={(e) => setForm({ ...form, Entrance: e.target.value })} /></div>
              <div><label className="text-sm font-bold">محل</label><input className={inp} value={form.Location ?? ''} onChange={(e) => setForm({ ...form, Location: e.target.value })} /></div>
              <div>
                <label className="text-sm font-bold">سیستم</label>
                <input className={inp} list="mech-systems" value={form.MechSystem ?? ''} onChange={(e) => setForm({ ...form, MechSystem: e.target.value })} />
                <datalist id="mech-systems">{base.systems.map((s) => <option key={s.MechSystemsID} value={s.MechSystem} />)}</datalist>
              </div>
              <div><label className="text-sm font-bold">کد اموال</label><input className={inp} value={form.PropertyCode ?? ''} onChange={(e) => setForm({ ...form, PropertyCode: e.target.value })} /></div>
              <div><label className="text-sm font-bold">شماره سریال</label><input className={inp} value={form.SerialNumber ?? ''} onChange={(e) => setForm({ ...form, SerialNumber: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="text-sm font-bold">مشخصات</label><input className={inp} value={form.Specifications ?? ''} onChange={(e) => setForm({ ...form, Specifications: e.target.value })} /></div>

              <div className="md:col-span-3">
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