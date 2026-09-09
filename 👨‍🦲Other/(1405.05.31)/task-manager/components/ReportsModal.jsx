'use client';
import { useState } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const TYPES = {
  tasks_list: { label: 'گزارش لیست کارها', date: false, cols: [['TaskID','کد'],['AssetName','دستگاه'],['AssetNumber','شماره'],['Building','ساختمان'],['Location','محل'],['TaskTtl','موضوع'],['Descriptions','توضیحات'],['Priorities','الویت'],['DueFa','زمان'],['SubmitFa','تاریخ ثبت']] },
  fixed_tasks: { label: 'گزارش لیست کارهای ثابت', date: false, cols: [['TaskID','کد'],['Priorities','الویت'],['Durationtime','طول بازه'],['StartFa','زمان شروع'],['EndFa','زمان اتمام'],['Complited','وضعیت']] },
  requests_undone: { label: 'گزارش خریدهای انجام‌نشده', date: false, cols: [['TaskID','کد کار'],['RequestNumber','شماره درخواست'],['RegisterNumber','شماره ثبت'],['TaskTtl','موضوع'],['RequestFa','تاریخ درخواست'],['Buyer','کارپرداز'],['Status','وضعیت'],['FundingFa','تاریخ تأمین'],['Priorities','الویت']] },
  requests_done: { label: 'گزارش خریدهای انجام‌شده', date: false, cols: [['TaskID','کد کار'],['RequestNumber','شماره درخواست'],['RegisterNumber','شماره ثبت'],['TaskTtl','موضوع'],['RequestFa','تاریخ درخواست'],['Buyer','کارپرداز'],['Status','وضعیت'],['FundingFa','تاریخ تأمین'],['Complited','اتمام']] },
  without_request: { label: 'گزارش کارهای بدون درخواست', date: false, cols: [['TaskID','کد کار'],['TaskTtl','موضوع'],['Descriptions','شرح'],['Complited','وضعیت'],['Priorities','الویت']] },
  undone_tasks: { label: 'گزارش کارهای در حال انجام', date: false, cols: [['TaskID','کد'],['AssetName','دستگاه'],['Building','ساختمان'],['Location','محل'],['TaskTtl','عنوان'],['Priorities','الویت'],['DueFa','تاریخ شروع'],['EndFa','تاریخ اتمام']] },
  done_tasks: { label: 'گزارش کارهای اتمام‌یافته', date: false, cols: [['TaskID','کد'],['AssetName','دستگاه'],['Building','ساختمان'],['Location','محل'],['TaskTtl','عنوان'],['Priorities','الویت'],['DueFa','تاریخ شروع'],['EndFa','تاریخ اتمام']] },
  tasks_functor: { label: 'گزارش انجام‌دهنده کارها', date: false, cols: [['TaskID','کد'],['Functor','انجام‌دهنده'],['AssetName','دستگاه'],['TaskTtl','موضوع'],['Priorities','الویت'],['DueFa','نوبت'],['SubmitFa','تاریخ ثبت']] },
  daily: { label: 'گزارش کار روزانه', date: true, cols: [['TaskID','کد'],['AssetName','دستگاه'],['TaskTtl','عنوان'],['Description','توضیحات'],['DoneFa','تاریخ انجام']] },
  considerable: { label: 'گزارش اقدامات و پروژه‌ها', date: true, cols: [['TaskID','کد'],['IsConsiderableAction','اقدام/پروژه'],['AssetName','دستگاه'],['TaskTtl','عنوان'],['SubmitFa','تاریخ ثبت'],['FinishFa','تاریخ اتمام'],['Complited','وضعیت']] },
  all_by_date: { label: 'گزارش کلی کارها بر اساس تاریخ', date: true, cols: [['TaskID','کد'],['AssetName','دستگاه'],['TaskTtl','عنوان'],['Descriptions','شرح'],['SubmitFa','تاریخ ثبت'],['FinishFa','تاریخ انجام'],['Complited','وضعیت']] },
  finished_by_date: { label: 'گزارش کارهای انجام‌شده بر اساس تاریخ', date: true, cols: [['TaskID','کد'],['AssetName','دستگاه'],['TaskTtl','عنوان'],['SubmitFa','تاریخ ثبت'],['FinishFa','تاریخ اتمام'],['Complited','وضعیت']] },
  asset_date: { label: 'بر اساس تاریخ و دستگاه', date: true, asset: true, cols: [['TaskID','کد'],['AssetName','دستگاه'],['AssetNumber','شماره'],['Building','ساختمان'],['Location','محل'],['TaskTtl','موضوع'],['Priorities','الویت'],['StatusFa','وضعیت'],['DueFa','زمان شروع'],['EndFa','زمان اتمام']] },
};

const EMPTY_ASSET = { subject: '', description: '', assetName: '', building: '', block: '', floor: '', entrance: '', location: '', assetNumber: '', mechSystem: '', specifications: '', propertyCode: '' };

export default function ReportsModal({ onClose }) {
  const [type, setType] = useState('tasks_list');
  const [status, setStatus] = useState('current');
  const [asset, setAsset] = useState({ ...EMPTY_ASSET });
  const [start, setStart] = useState(() => new Date(Date.now() - 30 * 86400000));
  const [end, setEnd] = useState(() => new Date());
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const cfg = TYPES[type];

  const setA = (k) => (e) => setAsset({ ...asset, [k]: e.target.value });

  const load = async () => {
    setLoading(true);
    try {
      if (type === 'asset_date') {
        const se = new Date(end); se.setHours(23, 59, 59, 999);
        const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...asset, status, start: start.toISOString(), end: se.toISOString() }) });
        const d = await res.json();
        if (d.success) {
          setRows((d.data || []).map((r) => ({
            ...r,
            DueFa: r.DueDateTime ? new Date(r.DueDateTime).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-',
EndFa: r.EndDateTime ? new Date(r.EndDateTime).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-',
            StatusFa: Number(r.Complited) === 1 ? 'اتمام' : 'جاری',
          })));
        } else setRows([]);
      } else {
        const qs = new URLSearchParams({ type });
        if (cfg.date) { qs.set('start', start.toISOString()); qs.set('end', end.toISOString()); }
        const res = await fetch(`/api/reports?${qs}`);
        const d = await res.json();
        setRows(d.success ? (d.rows || []) : []);
      }
    } catch { setRows([]); }
    setLoading(false);
  };

  const exportCsv = () => {
    if (!rows || !rows.length) { alert('ردیفی برای خروجی وجود ندارد.'); return; }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + cfg.cols.map((c) => esc(c[1])).join(',') + '\n' +
      rows.map((r) => cfg.cols.map((c) => esc(r[c[0]])).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cfg.label} (${new Date().toLocaleDateString('fa-IR')}).csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1000px] max-w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">گزارش‌گیری</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4 border-b border-teal-700">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-bold mb-1">نوع گزارش</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setRows(null); }} className={inp}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {cfg.date && (<>
            <div><label className="block text-sm font-bold mb-1">از تاریخ</label>
              <DatePicker value={start} onChange={(d) => setStart(d ? d.toDate() : start)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input" /></div>
            <div><label className="block text-sm font-bold mb-1">تا تاریخ</label>
              <DatePicker value={end} onChange={(d) => setEnd(d ? d.toDate() : end)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input" /></div>
          </>)}
          {cfg.asset && (
            <div>
              <label className="block text-sm font-bold mb-1">وضعیت</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp}>
                <option value="current">جاری</option><option value="completed">اتمام‌یافته</option><option value="all">همه</option>
              </select>
            </div>
          )}
          <button onClick={load} className="btn-success">پیش‌نمایش</button>
          <button onClick={exportCsv} className="btn-primary">خروجی اکسل (CSV)</button>
        </div>

        {cfg.asset && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-6 py-3 border-b border-teal-700 bg-[#bfd8d0]">
            <div><label className="text-xs font-bold">موضوع</label><input className={inp} value={asset.subject} onChange={setA('subject')} /></div>
            <div><label className="text-xs font-bold">توضیحات</label><input className={inp} value={asset.description} onChange={setA('description')} /></div>
            <div><label className="text-xs font-bold">دستگاه</label><input className={inp} value={asset.assetName} onChange={setA('assetName')} /></div>
            <div><label className="text-xs font-bold">شماره دستگاه</label><input className={inp} value={asset.assetNumber} onChange={setA('assetNumber')} /></div>
            <div><label className="text-xs font-bold">ساختمان</label><input className={inp} value={asset.building} onChange={setA('building')} /></div>
            <div><label className="text-xs font-bold">بلوک</label><input className={inp} value={asset.block} onChange={setA('block')} /></div>
            <div><label className="text-xs font-bold">طبقه</label><input className={inp} value={asset.floor} onChange={setA('floor')} /></div>
            <div><label className="text-xs font-bold">ورودی</label><input className={inp} value={asset.entrance} onChange={setA('entrance')} /></div>
            <div><label className="text-xs font-bold">محل</label><input className={inp} value={asset.location} onChange={setA('location')} /></div>
            <div><label className="text-xs font-bold">سیستم</label><input className={inp} value={asset.mechSystem} onChange={setA('mechSystem')} /></div>
            <div><label className="text-xs font-bold">مشخصات</label><input className={inp} value={asset.specifications} onChange={setA('specifications')} /></div>
            <div><label className="text-xs font-bold">شماره اموال</label><input className={inp} value={asset.propertyCode} onChange={setA('propertyCode')} /></div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {loading && <div className="text-center py-8">در حال بارگذاری...</div>}
          {!loading && rows && (
            <>
              <table className="task-table w-full min-w-[900px]">
                <thead><tr>{cfg.cols.map((c) => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 300).map((r, i) => (
                    <tr key={i}>{cfg.cols.map((c) => <td key={c[0]}>{String(r[c[0]] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs mt-2">تعداد کل: {rows.length}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}