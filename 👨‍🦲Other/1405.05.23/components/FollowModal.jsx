'use client';
import { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR') : '-');

export default function FollowModal({ taskId, subject, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [copyToDesc, setCopyToDesc] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/follow?taskId=${taskId}`);
      const d = await res.json();
      if (d.success) setRows(d.rows || []);
    } catch {}
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  // قفل اسکرول زمینه + بستن با ESC
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  // معادل FLWDescriptionTxt_KeyDown: اینتر در انتهای متن → سطر جدید با تاریخ
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const el = e.target;
      if (el.selectionStart >= el.value.length) {
        e.preventDefault();
        const d = new Date();
        const stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        setText((t) => t + '\n✏ ' + stamp + ' ');
      }
    }
  };

  const resetEditor = () => { setEditingId(null); setText(''); setStart(new Date()); setEnd(new Date()); };

  const save = async () => {
    if (!text.trim()) { alert('متن پیگیری خالی است!'); return; }
    setBusy(true);
    try {
      const body = { taskId, description: text, dueDateTime: start.toISOString(), endDateTime: end.toISOString(), updateDescription: copyToDesc };
      const res = editingId
        ? await fetch('/api/follow', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followId: editingId, description: text, dueDateTime: start.toISOString(), endDateTime: end.toISOString() }) })
        : await fetch('/api/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.success) { alert('مورد با موفقیت ثبت شد.'); resetEditor(); load(); if (onSaved) onSaved(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  const del = async () => {
    if (!editingId) { alert('ابتدا یک ردیف را انتخاب کنید.'); return; }
    if (!confirm('آیا از حذف این مورد مطمئن هستید؟')) return;
    try {
      const res = await fetch(`/api/follow?id=${editingId}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) { resetEditor(); load(); }
    } catch {}
  };

  const pickRow = (r) => {
    setEditingId(r.FollowID);
    setText(r.Description || '');
    if (r.DueDateTime) setStart(new Date(r.DueDateTime));
    if (r.EndDateTime) setEnd(new Date(r.EndDateTime));
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[860px] max-w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">سوابق پیگیری — کد کار: {taskId}{subject ? ` | ${subject}` : ''}</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="p-6 overflow-y-auto overscroll-contain">
          <label className="block text-sm font-bold mb-1">شرح پیگیری</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
                    rows={5} className="search-input w-full"
                    placeholder="با Enter در انتهای متن، سطر جدید با تاریخ اضافه می‌شود (✏)" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-sm font-bold mb-1">زمان برنامه‌ای آغاز</label>
              <DatePicker value={start} onChange={(d) => setStart(d ? d.toDate() : start)}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
                inputClass="search-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">زمان برنامه‌ای پایان</label>
              <DatePicker value={end} onChange={(d) => setEnd(d ? d.toDate() : end)}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
                inputClass="search-input w-full" />
            </div>
            <label className="flex items-end gap-2 pb-2 cursor-pointer">
              <input type="checkbox" checked={copyToDesc} onChange={(e) => setCopyToDesc(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm font-bold">کپی متن در شرح کار</span>
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={busy} className="btn-success">
              {editingId ? 'ویرایش پیگیری' : 'ذخیره پیگیری'}
            </button>
            <button onClick={del} className="btn-danger">حذف ردیف پیگیری</button>
            <button onClick={resetEditor} className="btn-primary">ردیف جدید</button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="task-table w-full min-w-[700px]">
              <thead>
                <tr><th>کد</th><th>شرح</th><th>زمان شروع</th><th>زمان پایان</th><th>مدت</th><th>الویت</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="text-center">ردیفی وجود ندارد</td></tr>}
                {rows.map((r) => (
                  <tr key={r.FollowID} onClick={() => pickRow(r)}
                      className={editingId === r.FollowID ? 'bg-[#FC7470]' : ''}>
                    <td>{r.FollowID}</td>
                    <td>{r.Description}</td>
                    <td>{fmtFa(r.DueDateTime)}</td>
                    <td>{fmtFa(r.EndDateTime)}</td>
                    <td>{r.Duration}</td>
                    <td>{r.Priorities}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-teal-700">
          <button onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </div>
    </div>
  );
}