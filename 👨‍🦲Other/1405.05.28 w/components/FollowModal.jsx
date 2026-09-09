'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import useDraftGuard from './useDraftGuard';

// ✏ + تاریخ شمسی + RLM (\u200F) برای راست‌چینی پایدار حتی بعد از پاک‌کردن متن
const shamsiStamp = () => '\u200F✏ ' + new DateObject({ date: new Date(), calendar: persian }).format('YYYY.MM.DD') + ' ';
const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR') : '-');

export default function FollowModal({ taskId, subject, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [text, setTextState] = useState(shamsiStamp);
  const textRef = useRef(text);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [copyToDesc, setCopyToDesc] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);

  const { touch, markSaved } = useDraftGuard(() => textRef.current);
  const setText = (v, guard = true) => { textRef.current = v; setTextState(v); if (guard) touch(v); };

  // فوکوس روی شرح پیگیری هنگام باز شدن
  useEffect(() => {
    const t = setTimeout(() => {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
    }, 60);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/follow?taskId=${taskId}`);
      const d = await res.json();
      if (d.success) setRows(d.rows || []);
    } catch {}
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const setCaret = (pos) => requestAnimationFrame(() => {
    const ta = taRef.current;
    if (ta) ta.selectionStart = ta.selectionEnd = pos;
  });

  // معادل FLWDescriptionTxt_KeyDown در دسکتاپ
  const handleKeyDown = (e) => {
    const ta = taRef.current;
    const value = textRef.current;
    const isSpace = e.code === 'Space' || e.key === ' ';
    if (e.ctrlKey && e.altKey && (isSpace || e.key === 'Enter')) {
      e.preventDefault();
      const nv = value + '\n             ⚡  ';
      setText(nv); setCaret(nv.length);
      return;
    }
    if (e.ctrlKey && !e.altKey && isSpace) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      const selected = value.slice(s, en);
      const nv = selected
        ? value.slice(0, s) + value.slice(en) + '\n       📌  ' + selected
        : value + '\n       📌  ';
      setText(nv); setCaret(nv.length);
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey) {
      if (ta.selectionStart >= value.length) {
        e.preventDefault();
        const nv = value + '\n' + shamsiStamp();
        setText(nv); setCaret(nv.length);
      }
    }
  };

  const resetEditor = () => {
    setEditingId(null);
    setText(shamsiStamp(), false);
    setStart(new Date()); setEnd(new Date());
    setTimeout(() => { const ta = taRef.current; if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; } }, 30);
  };

  const save = async () => {
    if (!text.trim()) { alert('متن پیگیری خالی است!'); return; }
    setBusy(true);
    try {
      const res = editingId
        ? await fetch('/api/follow', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followId: editingId, description: text, dueDateTime: start.toISOString(), endDateTime: end.toISOString() }) })
        : await fetch('/api/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, description: text, dueDateTime: start.toISOString(), endDateTime: end.toISOString(), updateDescription: copyToDesc }) });
      const d = await res.json();
      if (d.success) { markSaved(); alert('مورد با موفقیت ثبت شد.'); resetEditor(); load(); if (onSaved) onSaved(); }
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
      if (d.success) { markSaved(); resetEditor(); load(); }
    } catch {}
  };

  const pickRow = (r) => {
    setEditingId(r.FollowID);
    setText(r.Description || '', false);
    if (r.DueDateTime) setStart(new Date(r.DueDateTime));
    if (r.EndDateTime) setEnd(new Date(r.EndDateTime));
    setTimeout(() => taRef.current?.focus(), 30);
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
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            className="search-input w-full"
            style={{ direction: 'rtl', textAlign: 'right', lineHeight: '2' }}
          />
          <div className="text-[11px] text-gray-600 mt-1">
            Enter در انتهای متن: سطر جدید با ✏ تاریخ شمسی | Ctrl+Space: بند 📌 | Ctrl+Alt+Space: زیربند ⚡
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-sm font-bold mb-1">زمان شروع</label>
              <DatePicker value={start} onChange={(d) => setStart(d ? d.toDate() : new Date())}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
                inputClass="search-input w-full" />
            </div>
            <div onMouseEnter={() => setEnd(new Date())}
                 title="با عبور ماوس (مثل دسکتاپ)، زمان پایان به لحظهٔ فعلی تنظیم می‌شود">
              <label className="block text-sm font-bold mb-1">زمان پایان</label>
              <DatePicker value={end} onChange={(d) => setEnd(d ? d.toDate() : new Date())}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
                inputClass="search-input w-full" />
            </div>
            <label className="flex items-end gap-2 pb-2 cursor-pointer">
              <input type="checkbox" checked={copyToDesc} onChange={(e) => setCopyToDesc(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm font-bold">کپی متن در شرح کار</span>
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={busy} className="btn-success">{editingId ? 'ویرایش پیگیری' : 'ذخیره پیگیری'}</button>
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