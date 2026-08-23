'use client';
import { useState, useEffect } from 'react';

export default function SettingsModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ startWork: '07:30', restStart: '12:00', restEnd: '13:00', endWork: '16:00', ignore: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => { if (d.success && d.data) setForm(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await res.json();
      if (d.success) { alert('تنظیمات ذخیره شد.'); if (onSaved) onSaved(); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[440px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">تنظیمات ساعات کاری</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-bold mb-1">شروع کار</label><input type="time" value={form.startWork} onChange={(e) => setForm({ ...form, startWork: e.target.value })} className={inp} /></div>
          <div><label className="block text-sm font-bold mb-1">پایان کار</label><input type="time" value={form.endWork} onChange={(e) => setForm({ ...form, endWork: e.target.value })} className={inp} /></div>
          <div><label className="block text-sm font-bold mb-1">شروع استراحت</label><input type="time" value={form.restStart} onChange={(e) => setForm({ ...form, restStart: e.target.value })} className={inp} /></div>
          <div><label className="block text-sm font-bold mb-1">پایان استراحت</label><input type="time" value={form.restEnd} onChange={(e) => setForm({ ...form, restEnd: e.target.value })} className={inp} /></div>
        </div>
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={form.ignore} onChange={(e) => setForm({ ...form, ignore: e.target.checked })} className="w-4 h-4" />
          <span className="text-sm font-bold">نادیده گرفتن تنظیمات زمانی</span>
        </label>
        <div className="flex gap-3 mt-6">
          <button onClick={save} disabled={saving} className="btn-success">{saving ? 'در حال ذخیره...' : 'تأیید'}</button>
          <button onClick={onClose} className="btn-danger">انصراف</button>
        </div>
      </div>
    </div>
  );
}