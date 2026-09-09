'use client';
import { useState, useEffect, useMemo } from 'react';

const EMPTY = { AssetName:'', AssetNumber:'', PropertyCode:'', SerialNumber:'', Building:'', Block:'', Floor:'', Entrance:'', Location:'', MechSystem:'', Specifications:'', FolderPath:'' };
const distinct = (arr) => [...new Set(arr.map((x) => (x == null ? '' : String(x))).filter((x) => x !== ''))].sort();

export default function AssetsModal({ onClose }) {
  const [tab, setTab] = useState('devices');
  const [all, setAll] = useState([]);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ Building:'', Block:'', Floor:'', Entrance:'', Location:'', MechSystem:'', AssetName:'', AssetNumber:'' });
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [names, setNames] = useState([]);
  const [systems, setSystems] = useState([]);
  const [newName, setNewName] = useState('');
  const [newSystem, setNewSystem] = useState('');

  const loadAll = async () => { const r = await fetch('/api/assets').then((x) => x.json()); if (r.success) setAll(r.data); };
  const loadBase = async () => { const r = await fetch('/api/base-info').then((x) => x.json()); if (r.success) { setNames(r.names); setSystems(r.systems); } };
  useEffect(() => { loadAll(); loadBase(); }, []);

  // فیلتر آبشاری
  const cascaded = useMemo(() => {
    let list = all;
    const q = search.trim();
    if (q) list = list.filter((a) => Object.values(a).some((v) => v != null && String(v).includes(q)));
    for (const [k, v] of Object.entries(f)) if (v) list = list.filter((a) => String(a[k] ?? '') === v);
    return list;
  }, [all, f, search]);

  const opt = (key, source) => distinct(source.map((a) => a[key]));
  const setFlt = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); };

  const startAdd = () => { setForm({ ...EMPTY }); setEditingId(null); setMsg(''); };
  const startEdit = (a) => { setForm({ ...EMPTY, ...a }); setEditingId(a.AssetID); setMsg(''); };

  const save = async () => {
    if (!form.AssetName || !form.Building) { setMsg('نام دستگاه و ساختمان الزامی است.'); return; }
    setSaving(true); setMsg('');
    try {
      const res = editingId
        ? await fetch(`/api/assets/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await res.json();
      if (d.success) { setForm(null); setEditingId(null); loadAll(); }
      else setMsg('خطا: ' + d.error);
    } catch { setMsg('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const del = async (a) => {
    if (!confirm(`آیا از حذف دستگاه کد ${a.AssetID} مطمئن هستید؟`)) return;
    const res = await fetch(`/api/assets/${a.AssetID}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) loadAll(); else alert(d.error);
  };

  const addBase = async (kind, value) => {
    const r = await fetch('/api/base-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, value }) });
    const d = await r.json();
    if (d.success) loadBase(); else alert(d.error);
  };

  const inp = 'search-input w-full';
  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1000px] max-w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">مدیریت دستگاه‌ها و اطلاعات پایه</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>
        <div className="flex gap-2 px-6 py-2 border-b border-teal-700">
          <button className={tab === 'devices' ? 'btn-success' : 'btn-primary'} onClick={() => setTab('devices')}>دستگاه‌ها</button>
          <button className={tab === 'base' ? 'btn-success' : 'btn-primary'} onClick={() => setTab('base')}>اطلاعات پایه</button>
        </div>

        <div className="p-6 overflow-y-auto overscroll-contain">
          {tab === 'devices' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <input className={inp} placeholder="جستجوی سراسری..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inp} value={f.Building} onChange={setFlt('Building')}><option value="">ساختمان</option>{opt('Building', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={f.Block} onChange={setFlt('Block')}><option value="">بلوک</option>{opt('Block', all.filter((a) => !f.Building || a.Building === f.Building)).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={f.Floor} onChange={setFlt('Floor')}><option value="">طبقه</option>{opt('Floor', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={f.Entrance} onChange={setFlt('Entrance')}><option value="">ورودی</option>{opt('Entrance', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={f.Location} onChange={setFlt('Location')}><option value="">محل</option>{opt('Location', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={f.MechSystem} onChange={setFlt('MechSystem')}><option value="">سیستم</option>{opt('MechSystem', all).map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inp} value={f.AssetName} onChange={setFlt('AssetName')}><option value="">دستگاه</option>{opt('AssetName', all).map((x) => <option key={x}>{x}</option>)}</select>
                <button className="btn-success" onClick={startAdd}>+ دستگاه جدید</button>
              </div>

              <div className="overflow-x-auto mb-4">
                <table className="task-table w-full min-w-[900px]">
                  <thead><tr><th>کد</th><th>دستگاه</th><th>شماره</th><th>ساختمان</th><th>بلوک</th><th>طبقه</th><th>ورودی</th><th>محل</th><th>سیستم</th><th>اموال</th><th>عملیات</th></tr></thead>
                  <tbody>
                    {cascaded.map((a) => (
                      <tr key={a.AssetID}>
                        <td>{a.AssetID}</td><td>{a.AssetName}</td><td>{a.AssetNumber}</td><td>{a.Building}</td><td>{a.Block}</td><td>{a.Floor}</td><td>{a.Entrance}</td><td>{a.Location}</td><td>{a.MechSystem}</td><td>{a.PropertyCode}</td>
                        <td className="flex gap-1">
                          <button className="btn-primary px-2 py-1 text-xs" onClick={() => startEdit(a)}>ویرایش</button>
                          <button className="btn-danger px-2 py-1 text-xs" onClick={() => del(a)}>حذف</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {form && (
                <div className="bg-white rounded p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><label className="text-xs font-bold">نام دستگاه *</label><input className={inp} value={form.AssetName} onChange={(e) => setForm({ ...form, AssetName: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">شماره</label><input className={inp} value={form.AssetNumber} onChange={(e) => setForm({ ...form, AssetNumber: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">ساختمان *</label><input className={inp} value={form.Building} onChange={(e) => setForm({ ...form, Building: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">بلوک</label><input className={inp} value={form.Block} onChange={(e) => setForm({ ...form, Block: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">طبقه</label><input className={inp} value={form.Floor} onChange={(e) => setForm({ ...form, Floor: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">ورودی</label><input className={inp} value={form.Entrance} onChange={(e) => setForm({ ...form, Entrance: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">محل</label><input className={inp} value={form.Location} onChange={(e) => setForm({ ...form, Location: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">سیستم</label><input className={inp} value={form.MechSystem} onChange={(e) => setForm({ ...form, MechSystem: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">کد اموال</label><input className={inp} value={form.PropertyCode} onChange={(e) => setForm({ ...form, PropertyCode: e.target.value })} /></div>
                  <div><label className="text-xs font-bold">شماره سریال</label><input className={inp} value={form.SerialNumber} onChange={(e) => setForm({ ...form, SerialNumber: e.target.value })} /></div>
                  <div className="col-span-2"><label className="text-xs font-bold">مشخصات</label><input className={inp} value={form.Specifications} onChange={(e) => setForm({ ...form, Specifications: e.target.value })} /></div>
                  <div className="col-span-2"><label className="text-xs font-bold">مسیر پوشه</label><input className={inp} value={form.FolderPath} onChange={(e) => setForm({ ...form, FolderPath: e.target.value })} /></div>
                  <div className="col-span-full flex gap-2">
                    <button className="btn-success" disabled={saving} onClick={save}>{saving ? '...' : 'ذخیره'}</button>
                    <button className="btn-danger" onClick={() => { setForm(null); setEditingId(null); }}>انصراف</button>
                  </div>
                  {msg && <div className="col-span-full text-red-600 text-sm">{msg}</div>}
                </div>
              )}
            </>
          )}

          {tab === 'base' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold mb-2">نام دستگاه‌ها (AssetNames)</h4>
                <div className="flex gap-2 mb-2">
                  <input className={inp} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام جدید..." />
                  <button className="btn-success" onClick={() => { addBase('name', newName); setNewName(''); }}>افزودن</button>
                </div>
                <div className="max-h-64 overflow-y-auto bg-white rounded border p-2">{names.map((n) => <div key={n.AssetNameID} className="py-1 border-b">{n.AssetName}</div>)}</div>
              </div>
              <div>
                <h4 className="font-bold mb-2">سیستم‌های مکانیکی (MechSystems)</h4>
                <div className="flex gap-2 mb-2">
                  <input className={inp} value={newSystem} onChange={(e) => setNewSystem(e.target.value)} placeholder="سیستم جدید..." />
                  <button className="btn-success" onClick={() => { addBase('system', newSystem); setNewSystem(''); }}>افزودن</button>
                </div>
                <div className="max-h-64 overflow-y-auto bg-white rounded border p-2">{systems.map((s) => <div key={s.MechSystemsID} className="py-1 border-b">{s.MechSystem}</div>)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}