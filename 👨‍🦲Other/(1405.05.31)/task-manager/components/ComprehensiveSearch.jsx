'use client';
import { useState } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const EMPTY = { subject: '', description: '', assetName: '', building: '', block: '', floor: '', entrance: '', location: '', assetNumber: '', mechSystem: '', specifications: '', propertyCode: '' };

export default function ComprehensiveSearch({ onResult, onClose }) {
  const [f, setF] = useState({ ...EMPTY });
  const [status, setStatus] = useState('current');
  const [start, setStart] = useState(() => new Date(Date.now() - 365 * 86400000));
  const [end, setEnd] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const doSearch = async () => {
    setBusy(true);
    try {
      const se = new Date(end); se.setHours(23, 59, 59, 999);
      const res = await fetch('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, status, start: start.toISOString(), end: se.toISOString() }),
      });
      const d = await res.json();
      if (d.success) { onResult(d.data || []); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[900px] max-w-full max-h-[92vh] overflow-y-auto p-6">
        <h3 className="font-bold mb-4">جستجو جامع (معادل Frm_Asset_Date_Task_Search)</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div><label className="text-xs font-bold">موضوع</label><input className={inp} value={f.subject} onChange={set('subject')} /></div>
          <div><label className="text-xs font-bold">توضیحات</label><input className={inp} value={f.description} onChange={set('description')} /></div>
          <div><label className="text-xs font-bold">دستگاه</label><input className={inp} value={f.assetName} onChange={set('assetName')} /></div>
          <div><label className="text-xs font-bold">ساختمان</label><input className={inp} value={f.building} onChange={set('building')} /></div>
          <div><label className="text-xs font-bold">بلوک</label><input className={inp} value={f.block} onChange={set('block')} /></div>
          <div><label className="text-xs font-bold">طبقه</label><input className={inp} value={f.floor} onChange={set('floor')} /></div>
          <div><label className="text-xs font-bold">ورودی</label><input className={inp} value={f.entrance} onChange={set('entrance')} /></div>
          <div><label className="text-xs font-bold">محل</label><input className={inp} value={f.location} onChange={set('location')} /></div>
          <div><label className="text-xs font-bold">شماره دستگاه</label><input className={inp} value={f.assetNumber} onChange={set('assetNumber')} /></div>
          <div><label className="text-xs font-bold">سیستم</label><input className={inp} value={f.mechSystem} onChange={set('mechSystem')} /></div>
          <div><label className="text-xs font-bold">مشخصات</label><input className={inp} value={f.specifications} onChange={set('specifications')} /></div>
          <div><label className="text-xs font-bold">شماره اموال</label><input className={inp} value={f.propertyCode} onChange={set('propertyCode')} /></div>

          <div className="md:col-span-2 flex items-center gap-4">
            <label className="flex items-center gap-1 text-xs font-bold"><input type="radio" checked={status === 'current'} onChange={() => setStatus('current')} />کارهای در حال انجام</label>
            <label className="flex items-center gap-1 text-xs font-bold"><input type="radio" checked={status === 'completed'} onChange={() => setStatus('completed')} />اتمام‌یافته‌ها</label>
            <label className="flex items-center gap-1 text-xs font-bold"><input type="radio" checked={status === 'all'} onChange={() => setStatus('all')} />کل کارها</label>
          </div>
          <div>
            <label className="text-xs font-bold">از تاریخ</label>
            <DatePicker value={start} onChange={(d) => setStart(d ? d.toDate() : start)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input w-full" />
          </div>
          <div>
            <label className="text-xs font-bold">تا تاریخ</label>
            <DatePicker value={end} onChange={(d) => setEnd(d ? d.toDate() : end)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input w-full" />
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-success" disabled={busy} onClick={doSearch}>{busy ? '...' : 'جستجو'}</button>
          <button className="btn-primary" onClick={() => setF({ ...EMPTY })}>پاک‌کردن</button>
          <button className="btn-danger" onClick={onClose}>لغو</button>
        </div>
      </div>
    </div>
  );
}