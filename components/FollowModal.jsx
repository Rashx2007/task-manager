'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import useDraftGuard from './useDraftGuard';
import TodayPlugin from './TodayPlugin';

const shamsiStampOf = (d) => '\u200F✏ ' + new DateObject({ date: d, calendar: persian }).format('YYYY.MM.DD') + ' ';
const shamsiStamp = () => shamsiStampOf(new Date());
const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');

const pad = (n) => String(n).padStart(2, '0');
const toWallISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
const fromWall = (iso) => {
  if (!iso) return null;
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
};
const toPicker = (d) => (d ? new DateObject({ date: d, calendar: persian, locale: persian_fa }) : null);

// ---------- اجزای ساعت — مانند فرم الویت و زمان ----------
const to12 = (h24) => { const ampm = h24 >= 12 ? 'PM' : 'AM'; let h = h24 % 12; if (h === 0) h = 12; return { h, ampm }; };
const fmtTime = (d) => { const { h, ampm } = to12(d.getHours()); return `${pad(h)}:${pad(d.getMinutes())} ${ampm}`; };
const parseTimeText = (raw) => {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  let hh = null, mm = null;
  if (digits.length <= 2) { hh = +digits; mm = 0; }
  else if (digits.length === 3) {
    const first2 = +digits.slice(0, 2);
    if (first2 <= 23) { hh = first2; mm = +digits.slice(2); }
    else { hh = +digits.slice(0, 1); mm = +digits.slice(1); }
  } else { hh = +digits.slice(0, 2); mm = +digits.slice(2, 4); }
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
};

function ClockPicker({ date, onConfirm, onClose }) {
  const [stage, setStage] = useState('hour');
  const [h24, setH24] = useState(date.getHours());
  const [mm, setMm] = useState(date.getMinutes());
  const [ampm, setAmpm] = useState(date.getHours() >= 12 ? 'PM' : 'AM');
  const nums = stage === 'hour' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const sel = stage === 'hour' ? to12(h24).h : mm;
  const setAmpmSafe = (a) => { if (a !== ampm) { setAmpm(a); setH24((h) => (h % 12) + (a === 'PM' ? 12 : 0)); } };
  const pick = (n) => {
    if (stage === 'hour') { setH24((n % 12) + (ampm === 'PM' ? 12 : 0)); setStage('minute'); }
    else { const d = new Date(date); d.setHours(h24, n, 0, 0); onConfirm(d); }
  };
  return (
    <div className="absolute z-[60] top-full mt-1 left-0 bg-white rounded-lg shadow-xl p-3 w-64" dir="ltr" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-center gap-2 mb-2">
        <button type="button" onClick={() => setAmpmSafe('AM')} className={`px-3 py-1 rounded text-xs font-bold ${ampm === 'AM' ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>AM</button>
        <button type="button" onClick={() => setAmpmSafe('PM')} className={`px-3 py-1 rounded text-xs font-bold ${ampm === 'PM' ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>PM</button>
      </div>
      <div className="relative w-52 h-52 mx-auto rounded-full bg-gray-100">
        {nums.map((n, i) => {
          const ang = (i * 30) * Math.PI / 180;
          const x = 50 + 40 * Math.sin(ang);
          const y = 50 - 40 * Math.cos(ang);
          return (
            <button key={i} type="button" onClick={() => pick(n)}
              className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full text-sm font-bold ${sel === n ? 'bg-teal-600 text-white' : 'hover:bg-teal-100'}`}
              style={{ left: `${x}%`, top: `${y}%` }}>
              {stage === 'hour' ? n : pad(n)}
            </button>
          );
        })}
      </div>
      <div className="text-center text-sm mt-2 font-bold">{pad(to12(h24).h)}:{pad(mm)} {ampm}</div>
      <div className="text-center text-[11px] text-gray-500 mt-1">{stage === 'hour' ? 'ساعت را انتخاب کنید' : 'دقیقه را انتخاب کنید'}</div>
      <div className="flex justify-center mt-2"><button type="button" className="btn-danger px-3 py-1 text-xs" onClick={onClose}>بستن</button></div>
    </div>
  );
}

function TimeInput({ value, onChange }) {
  const [text, setText] = useState(fmtTime(value));
  const [showClock, setShowClock] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { setText(fmtTime(value)); }, [value]);
  const refocus = () => setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 0);
  const commit = () => {
    const p = parseTimeText(text);
    if (p) { const d = new Date(value); d.setHours(p.hh, p.mm, 0, 0); onChange(d); setText(fmtTime(d)); }
    else setText(fmtTime(value));
  };
  return (
    <div className="relative flex items-center gap-1">
      <input ref={inputRef} className="search-input w-full" dir="ltr" value={text} placeholder="HH:MM AM/PM"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <button type="button" className="btn-primary px-2" title="انتخابگر ساعت" onClick={() => setShowClock((s) => !s)}>🕒</button>
      {showClock && <ClockPicker date={value}
        onClose={() => { setShowClock(false); refocus(); }}
        onConfirm={(d) => { onChange(d); setText(fmtTime(d)); setShowClock(false); refocus(); }} />}
    </div>
  );
}

export default function FollowModal({ taskId, subject, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [text, setTextState] = useState(shamsiStamp);
  const textRef = useRef(text);
  // ✅ شروع و پایان = لحظهٔ باز شدن مودال
  const [start, setStartState] = useState(() => new Date());
  const [end, setEndState] = useState(() => new Date());
  const startRef = useRef(start);
  const endRef = useRef(end);
  const endTouchedRef = useRef(false);
  const startTouchedRef = useRef(false);
  // ✅ لحظهٔ نشستن متن در باکس (کلیک روی ردیف) — مبنای «زمان شروع» ردیف جدید
  const loadedAtRef = useRef(null);
  // ✅ آیا زمان‌ها از ردیف بارگذاری‌شده آمده‌اند (نه تنظیم دستی کاربر)؟
  const rowTimesRef = useRef(false);
  const [copyToDesc, setCopyToDesc] = useState(true); // ✅ پیش‌فرض همیشه فعال
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);

  const { touch, markSaved, draft } = useDraftGuard(() => textRef.current, 'draft_follow_' + taskId);
  const setText = (v, guard = true) => { textRef.current = v; setTextState(v); if (guard) touch(v); };

  // ✅ بازیابی متنِ ذخیره‌شده پس از بسته‌شدن ناگهانی مودال (فقط یک‌بار هنگام ورود)
  useEffect(() => {
    if (draft && draft.trim() && draft !== textRef.current) {
      if (confirm('متن پیگیری ذخیره‌شدهٔ قبلی یافت شد؛ بازیابی شود؟')) setText(draft, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStart = (d) => { startRef.current = d; setStartState(d); };
  const setEnd = (d) => { endRef.current = d; setEndState(d); };

  const changeStartDate = (d) => {
    startTouchedRef.current = true;
    const nd = new Date(d); nd.setHours(startRef.current.getHours(), startRef.current.getMinutes(), 0, 0);
    setStart(nd);
    if (!endTouchedRef.current) { const ne = new Date(nd); ne.setHours(endRef.current.getHours(), endRef.current.getMinutes(), 0, 0); setEnd(ne); }
  };
  const changeStartTime = (t) => {
    startTouchedRef.current = true;
    setStart(t);
    if (!endTouchedRef.current) { const ne = new Date(endRef.current); ne.setHours(t.getHours(), t.getMinutes(), 0, 0); setEnd(ne); }
  };
  const changeEndDate = (d) => {
    endTouchedRef.current = true;
    const nd = new Date(d); nd.setHours(endRef.current.getHours(), endRef.current.getMinutes(), 0, 0);
    setEnd(nd);
  };
  const changeEndTime = (t) => { endTouchedRef.current = true; setEnd(t); };

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
    } catch { }
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

    const handleKeyDown = (e) => {
    const ta = taRef.current;
    if (!ta) return;
    const value = textRef.current;
    const isSpace = e.code === 'Space' || e.key === ' ' || e.keyCode === 32;
    const isEnter = e.key === 'Enter';
    // ⚡ زیربند: Ctrl+Alt+Space یا Ctrl+Alt+Enter
        if (e.ctrlKey && e.altKey && (isSpace || e.key === 'Enter')) {
      e.preventDefault();
      const nv = value + '\n' + ' '.repeat(13) + '⚡ ';
      setText(nv); setCaret(nv.length);
      return;
    }
    if (e.ctrlKey && !e.altKey && isSpace) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      const selected = value.slice(s, en);
      const nv = selected
        ? value.slice(0, s) + value.slice(en) + '\n' + ' '.repeat(9) + '📌 ' + selected
        : value + '\n' + ' '.repeat(9) + '📌 ';
      setText(nv); setCaret(nv.length);
      return;
    }
    // ✏ سطر جدید با تاریخ، فقط در انتهای متن
    if (isEnter && !e.ctrlKey && !e.altKey) {
      if (ta.selectionStart >= value.length) {
        e.preventDefault();
        const nv = value + '\n' + shamsiStamp();
        setText(nv); setCaret(nv.length);
      }
    }
  };

  // ✅ ردیف جدید: شروع = لحظهٔ زدن دکمه
  // ✅ «ردیف جدید»: اگر متن از یک ردیف نشسته باشد، متن فعلی + زمان‌ها = پیش‌نویس ردیفِ جدید
    // ✅ «ردیف جدید»: اگر متن از یک ردیف نشسته باشد → همان محتوا با تاریخ اصلاح‌شده و زمان‌های
  //    محاسبه‌شده (خودکار یا دستی) بلافاصله به‌عنوان ردیف پیگیریِ جدید در دیتابیس ثبت می‌شود،
  //    در جدول مودال نمایش داده می‌شود و در صورت فعال‌بودن «کپی متن در شرح کار» در شرح کار هم کپی می‌شود؛
  //    سپس ویرایشگر برای جلسهٔ تازه پاک می‌شود. در غیر این صورت = پاک‌سازی کاملِ قبلی.
  const resetEditor = async () => {
    const seated = loadedAtRef.current;
    if (seated && textRef.current.trim()) {
      // شروع = زمان نشستن متن (مگر تنظیم دستی) | پایان = لحظهٔ کلیک «ردیف جدید» (مگر تنظیم دستی)
      const ns = startTouchedRef.current ? startRef.current : seated;
      const ne = endTouchedRef.current ? endRef.current : new Date();
      rowTimesRef.current = false;
      if (ne < ns) { alert('زمان پایان نباید قبل از زمان شروع باشد.'); return; }
      // ✅ تاریخ داخل باکس = تاریخ همان ردیف جدید
      const newText = textRef.current.replace(/\u200F?✏ \d{4}\.\d{2}\.\d{2}/, shamsiStampOf(ns));
      setText(newText, false);
      setBusy(true);
      try {
        const res = await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            description: newText,
            dueDateTime: toWallISO(ns),
            endDateTime: toWallISO(ne),
            updateDescription: copyToDesc, // ✅ کپی در شرح کار (سمت سرور) در صورت فعال‌بودن
          }),
        });
        const d = await res.json();
        if (!d.success) { alert('خطا در ثبت ردیف جدید: ' + d.error); setBusy(false); return; }
        markSaved();
        await load();            // ✅ ردیف جدید در جدول همین مودال
        if (onSaved) onSaved();  // ✅ به‌روزرسانی والد (شرح کار در مودال ویرایش)
      } catch { alert('خطا در ارتباط با سرور'); setBusy(false); return; }
      setBusy(false);
    }
    // شروع جلسهٔ تازه
    setEditingId(null);
    setText(shamsiStamp(), false);
    const now = new Date();
    setStart(now);
    setEnd(now);
    startTouchedRef.current = false;
    endTouchedRef.current = false;
    rowTimesRef.current = false;
    loadedAtRef.current = null;
    setTimeout(() => {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
    }, 30);
  };

  const save = async () => {
    if (!text.trim()) { alert('متن پیگیری خالی است!'); return; }
    const s = startRef.current;
    // ✅ پایان = لحظهٔ زدن دکمه ذخیره (مگر اینکه دستی تغییر کرده یا ردیفی برای ویرایش باز شده باشد)
    const e2 = endTouchedRef.current || rowTimesRef.current ? endRef.current : new Date();
    setEnd(e2);
    if (e2 < s) { alert('زمان پایان نباید قبل از زمان شروع باشد.'); return; }
    setBusy(true);
    try {
      const res = editingId
        ? await fetch('/api/follow', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followId: editingId, taskId, description: text, dueDateTime: toWallISO(s), endDateTime: toWallISO(e2), updateDescription: copyToDesc })
        })
        : await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, description: text, dueDateTime: toWallISO(s), endDateTime: toWallISO(e2), updateDescription: copyToDesc })
        });
      const d = await res.json();
      if (d.success) {
        markSaved();
        alert('مورد با موفقیت ثبت شد.');
        load();
        if (onSaved) onSaved();
      } else {
        alert('خطا: ' + d.error);
      }
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
    } catch { }
  };

  const pickRow = (r) => {
    setEditingId(r.FollowID);
    setText(r.Description || '', false);
    const sd = fromWall(r.DueDateTime); if (sd) setStart(sd);
    const ed = fromWall(r.EndDateTime); if (ed) setEnd(ed);
    endTouchedRef.current = false;   // زمان‌ها از ردیف آمده‌اند، نه دستی
    startTouchedRef.current = false;
    rowTimesRef.current = true;      // ✅ علامت «زمان‌های ردیف» برای حالت ویرایش
    loadedAtRef.current = new Date(); // ✅ لحظهٔ نشستن متن در باکس
    setTimeout(() => taRef.current?.focus(), 30);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[860px] max-w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">سوابق پیگیری — کد کار: {taskId}{subject ? ` | ${subject}` : ''}</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="p-6 overflow-y-auto overscroll-contain">
          <label className="block text-sm font-bold mb-1">شرح پیگیری</label>
                   <textarea
            ref={taRef}
            dir="rtl"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            className={inp}
            style={{ direction: 'rtl', textAlign: 'right', lineHeight: '2', fontFamily: 'inherit', fontSize: '13px' }}
          />
          <div className="text-[11px] text-gray-600 mt-1">
            Enter در انتهای متن: سطر جدید با ✏ تاریخ | Ctrl+Space یا Ctrl+Enter: بند 📌 | Ctrl+Alt+Space یا Ctrl+Alt+Enter: زیربند ⚡
          </div>

          {/* ✅ ساعت در کنار تاریخ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="border border-teal-600 rounded-lg p-3 bg-[#e6f3ef]">
              <label className="block text-sm font-bold mb-1">زمان شروع</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <DatePicker value={toPicker(start)} onChange={(d) => { if (d) changeStartDate(d.toDate()); }}
                    calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} plugins={[<TodayPlugin onToday={(d) => changeStartDate(d)} />]} />
                </div>
                <div className="w-44 shrink-0"><TimeInput value={start} onChange={changeStartTime} /></div>
              </div>
            </div>
            <div className="border border-teal-600 rounded-lg p-3 bg-[#e6f3ef]">
              <label className="block text-sm font-bold mb-1">زمان پایان</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <DatePicker value={toPicker(end)} onChange={(d) => { if (d) changeEndDate(d.toDate()); }}
                    calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} plugins={[<TodayPlugin onToday={(d) => changeEndDate(d)} />]} />
                </div>
                <div className="w-44 shrink-0"><TimeInput value={end} onChange={changeEndTime} /></div>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={copyToDesc} onChange={(e) => setCopyToDesc(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-bold">کپی متن در شرح کار</span>
          </label>

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
                <tr>
                  <th>کد</th>
                  <th>شرح</th>
                  <th>زمان شروع</th>
                  <th>زمان پایان</th>
                  <th>مدت</th>
                  <th>الویت</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-4">ردیفی وجود ندارد</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.FollowID}
                    onClick={() => pickRow(r)}
                    className={editingId === r.FollowID ? 'bg-[#FC7470]' : ''}
                    style={{ cursor: 'pointer' }}
                  >
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