'use client';
import { useState, useEffect, useCallback } from 'react';

const EMPTY = { PersonName: '', OfficeName: '', WorkTellNumber1: '', WorkTellNumber2: '', WorkTellNumber3: '', MobileTellNumber1: '', MobileTellNumber2: '', MobileTellNumber3: '', Address: '' };

export default function PersonsModal({ onClose }) {
  const [list, setList] = useState([]);
  const [term, setTerm] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (t) => {
    try {
      const res = await fetch(`/api/persons?term=${encodeURIComponent(t || '')}`);
      const d = await res.json();
      if (d.success) setList(d.data || []);
    } catch {}
  }, []);
  useEffect(() => { load(''); }, [load]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.PersonName || !form.PersonName.trim()) { alert('نام شخص را وارد کنید.'); return; }
    setSaving(true);
    try {
      const res = editingId
        ? await fetch(`/api/persons/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/persons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await res.json();
      if (d.success) { setForm(null); setEditingId(null); load(term); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm('آیا از حذف این شخص مطمئن هستید؟')) return;
    try {
      const res = await fetch(`/api/persons/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) load(term); else alert(d.error);
    } catch {}
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[900px] max-w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">مدیریت اشخاص (دفترچه تلفن)</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="p-6 overflow-y-auto overscroll-contain">
          {form === null ? (
            <>
              <div className="flex gap-2 mb-4">
                <input className={inp} placeholder="جستجو (نام، دفتر، شماره، آدرس)..." value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') load(term); }} />
                <button className="btn-primary whitespace-nowrap" onClick={() => load(term)}>جستجو</button>
                <button className="btn-success whitespace-nowrap" onClick={() => { setForm({ ...EMPTY }); setEditingId(null); }}>+ شخص جدید</button>
              </div>
              <div className="overflow-auto rounded border border-gray-300" style={{ maxHeight: '55vh' }}>
                <table className="task-table w-full min-w-[800px]">
                  <thead>
                    <tr><th>نام</th><th>دفتر/سمت</th><th>داخلی ۱</th><th>موبایل ۱</th><th>آدرس</th><th>عملیات</th></tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && <tr><td colSpan={6} className="text-center py-6">موردی یافت نشد</td></tr>}
                    {list.map((p) => (
                      <tr key={p.PersonID}>
                        <td>{p.PersonName}</td>
                        <td>{p.OfficeName}</td>
                        <td>{p.WorkTellNumber1}</td>
                        <td>{p.MobileTellNumber1}</td>
                        <td>{p.Address}</td>
                        <td className="whitespace-nowrap">
                          <button className="btn-primary px-2 py-1 text-xs ml-1" onClick={() => { setForm({ ...EMPTY, ...p }); setEditingId(p.PersonID); }}>ویرایش</button>
                          <button className="btn-danger px-2 py-1 text-xs" onClick={() => del(p.PersonID)}>حذف</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2"><label className="text-sm font-bold">نام *</label><input className={inp} value={form.PersonName} onChange={set('PersonName')} /></div>
              <div><label className="text-sm font-bold">دفتر/سمت</label><input className={inp} value={form.OfficeName} onChange={set('OfficeName')} /></div>
              <div><label className="text-sm font-bold">داخلی ۱</label><input className={inp} value={form.WorkTellNumber1} onChange={set('WorkTellNumber1')} /></div>
              <div><label className="text-sm font-bold">داخلی ۲</label><input className={inp} value={form.WorkTellNumber2} onChange={set('WorkTellNumber2')} /></div>
              <div><label className="text-sm font-bold">داخلی ۳</label><input className={inp} value={form.WorkTellNumber3} onChange={set('WorkTellNumber3')} /></div>
              <div><label className="text-sm font-bold">موبایل ۱</label><input className={inp} value={form.MobileTellNumber1} onChange={set('MobileTellNumber1')} /></div>
              <div><label className="text-sm font-bold">موبایل ۲</label><input className={inp} value={form.MobileTellNumber2} onChange={set('MobileTellNumber2')} /></div>
              <div><label className="text-sm font-bold">موبایل ۳</label><input className={inp} value={form.MobileTellNumber3} onChange={set('MobileTellNumber3')} /></div>
              <div className="md:col-span-3"><label className="text-sm font-bold">آدرس</label><textarea className={inp} rows={2} value={form.Address} onChange={set('Address')} /></div>
              <div className="md:col-span-3 flex gap-2">
                <button className="btn-success" disabled={saving} onClick={save}>{saving ? '...' : 'ذخیره'}</button>
                <button className="btn-danger" onClick={() => { setForm(null); setEditingId(null); }}>انصراف</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}