'use client';
import { useState } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const TYPES = [
  { id: 'tasks_list', label: 'گزارش لیست کارها (در حال انجام)' },
  { id: 'fixed_tasks', label: 'گزارش لیست کارهای زمان ثابت' },
  { id: 'requests_undone', label: 'گزارش خریدهای انجام‌نشده' },
  { id: 'requests_done', label: 'گزارش خریدهای انجام‌شده' },
  { id: 'without_request', label: 'گزارش کارهای بدون درخواست' },
  { id: 'tasks_functor', label: 'گزارش انجام‌دهنده کارها' },
  { id: 'daily', label: 'گزارش کار روزانه (بازه تاریخ)', needsDate: true },
  { id: 'considerable', label: 'گزارش اقدامات و پروژه‌ها (بازه تاریخ)', needsDate: true },
  { id: 'all_by_date', label: 'گزارش کلی کارها بر اساس تاریخ انجام', needsDate: true },
  { id: 'finished_by_date', label: 'گزارش کارهای انجام‌شده بر اساس تاریخ', needsDate: true },
];

const COLS = {
  tasks_list: [['TaskID','کد'],['AssetName','دستگاه'],['AssetNumber','شماره'],['Building','ساختمان'],['Location','محل'],['TaskTtl','موضوع'],['Descriptions','توضیحات'],['Priorities','الویت'],['DueFa','زمان'],['SubmitFa','تاریخ ثبت']],
  fixed_tasks: [['TaskID','کد'],['Priorities','الویت'],['Durationtime','طول بازه'],['StartFa','زمان شروع'],['EndFa','زمان پایان'],['Complited','وضعیت']],
  requests_undone: [['TaskID','کد کار'],['RequestNumber','شماره درخواست'],['RegisterNumber','شماره ثبت'],['TaskTtl','موضوع'],['Descriptions','شرح'],['ReqFa','تاریخ درخواست'],['Buyer','کارپرداز'],['Status','وضعیت'],['FundFa','تاریخ تأمین'],['Priorities','الویت']],
  requests_done: [['TaskID','کد کار'],['RequestNumber','شماره درخواست'],['RegisterNumber','شماره ثبت'],['TaskTtl','موضوع'],['ReqFa','تاریخ درخواست'],['Buyer','کارپرداز'],['Status','وضعیت'],['Complited','اتمام']],
  without_request: [['TaskID','کد کار'],['TaskTtl','موضوع'],['Descriptions','شرح'],['Priorities','الویت'],['Complited','وضعیت']],
  tasks_functor: [['TaskID','کد'],['Functor','انجام‌دهنده'],['AssetName','دستگاه'],['AssetNumber','شماره'],['Building','ساختمان'],['Location','محل'],['TaskTtl','موضوع'],['DueFa','نوبت'],['SubmitFa','تاریخ ثبت']],
  daily: [['TaskID','کد'],['AssetName','دستگاه'],['AssetNumber','شماره'],['Building','ساختمان'],['Location','محل'],['TaskTtl','عنوان'],['Description','توضیحات'],['DoneDate','تاریخ انجام']],
  considerable: [['TaskID','کد'],['IsConsiderableAction','اقدام/پروژه'],['AssetName','دستگاه'],['AssetNumber','شماره'],['Building','ساختمان'],['Location','محل'],['TaskTtl','عنوان'],['SubmitFa','تاریخ ثبت'],['FinishFa','تاریخ اتمام']],
  all_by_date: [['TaskID','کد'],['IsConsiderableAction','اقدام/پروژه'],['AssetName','دستگاه'],['AssetNumber','شماره'],['TaskTtl','عنوان'],['Descriptions','شرح'],['SubmitFa','تاریخ ثبت'],['FinishFa','تاریخ انجام'],['Complited','وضعیت']],
  finished_by_date: [['TaskID','کد'],['IsConsiderableAction','اقدام/پروژه'],['AssetName','دستگاه'],['AssetNumber','شماره'],['TaskTtl','عنوان'],['Descriptions','شرح'],['SubmitFa','تاریخ ثبت'],['FinishFa','تاریخ انجام']],
};

export default function ReportsModal({ onClose }) {
  const [type, setType] = useState('tasks_list');
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; });
  const [end, setEnd] = useState(() => new Date());
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const current = TYPES.find((t) => t.id === type);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ type });
      if (current?.needsDate) { qs.set('start', start.toISOString()); qs.set('end', end.toISOString()); }
      const res = await fetch(`/api/reports?${qs}`);
      const d = await res.json();
      setRows(d.success ? d.rows : []);
    } catch { setRows([]); }
    setLoading(false);
  };

  const exportCsv = () => {
    if (!rows || !rows.length) { alert('ردیفی برای خروجی وجود ندارد.'); return; }
    const cols = COLS[type];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + cols.map((c) => esc(c[1])).join(',') + '\n' +
      rows.map((r) => cols.map((c) => esc(r[c[0]])).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `گزارش (${new Date().toLocaleDateString('fa-IR')}).csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[900px] max-w-[95vw] max-h-[90vh] flex flex-col p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">گزارش‌گیری</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-bold mb-1">نوع گزارش</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setRows(null); }} className="search-input w-full">
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {current?.needsDate && (<>
            <div><label className="block text-sm font-bold mb-1">از تاریخ</label>
              <DatePicker value={start} onChange={(d) => setStart(d?.toDate() || start)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input" /></div>
            <div><label className="block text-sm font-bold mb-1">تا تاریخ</label>
              <DatePicker value={end} onChange={(d) => setEnd(d?.toDate() || end)} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass="search-input" /></div>
          </>)}
          <button onClick={load} className="btn-success">پیش‌نمایش</button>
          <button onClick={exportCsv} className="btn-primary">خروجی اکسل (CSV)</button>
        </div>
        <div className="flex-1 overflow-auto bg-white rounded border">
          {loading && <div className="p-4">در حال بارگذاری...</div>}
          {!loading && rows && (
            <table className="w-full text-xs">
              <thead className="bg-[#F7C4A5] sticky top-0"><tr>{COLS[type].map((c) => <th key={c[0]} className="p-2 text-right">{c[1]}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 300).map((r, i) => (
                <tr key={i} className="border-b">{COLS[type].map((c) => <td key={c[0]} className="p-2 align-top">{String(r[c[0]] ?? '')}</td>)}</tr>))}</tbody>
            </table>)}
          {!loading && rows && <div className="p-2 text-xs">تعداد کل: {rows.length}</div>}
        </div>
      </div>
    </div>
  );
}