'use client';
import { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];

const pad = (n) => String(n).padStart(2, '0');
const fromWall = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
};
const toWall = (d) => {
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
};
const to12 = (h24) => { const ampm = h24 >= 12 ? 'PM' : 'AM'; let h = h24 % 12; if (h === 0) h = 12; return { h, ampm }; };
const fmtTime = (d) => { const { h, ampm } = to12(d.getHours()); return `${pad(h)}:${pad(d.getMinutes())} ${ampm}`; };

// ✅ پارس هوشمند: ۱-۲ رقم → ساعت با دقیقه 00 | ۳ رقم → اگر دوتای اول 00-23 بود ساعت و سومی دقیقه | ۴ رقم → HH:MM
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

// ✅ انتخابگر ساعت دایره‌ای دومرحله‌ای (مثل Google Keep اندروید)
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

// ✅ ورودی ساعت متنی هوشمند + دکمهٔ بازکردن انتخابگر دایره‌ای
function TimeInput({ value, onChange }) {
  const [text, setText] = useState(fmtTime(value));
  const [showClock, setShowClock] = useState(false);
  useEffect(() => { setText(fmtTime(value)); }, [value]);
  const commit = () => {
    const p = parseTimeText(text);
    if (p) { const d = new Date(value); d.setHours(p.hh, p.mm, 0, 0); onChange(d); setText(fmtTime(d)); }
    else setText(fmtTime(value));
  };
  return (
    <div className="relative flex items-center gap-1">
      <input className="search-input w-full" dir="ltr" value={text} placeholder="HH:MM AM/PM"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <button type="button" className="btn-primary px-2" title="انتخابگر ساعت" onClick={() => setShowClock((s) => !s)}>🕒</button>
      {showClock && <ClockPicker date={value} onClose={() => setShowClock(false)} onConfirm={(d) => { onChange(d); setText(fmtTime(d)); setShowClock(false); }} />}
    </div>
  );
}

export default function TimeDateModal({ taskId, onClose, onSaved }) {
  const [priority, setPriority] = useState('نامشخص');
  const [hours, setHours] = useState('00');
  const [minutes, setMinutes] = useState('30');
  const [start, setStartState] = useState(new Date());
  const [end, setEndState] = useState(new Date(Date.now() + 30 * 60000));
  const startRef = useRef(start);
  const endRef = useRef(end);
  const [busy, setBusy] = useState(false);
  const [fixedRows, setFixedRows] = useState([]);

  const setStart = (d) => { startRef.current = d; setStartState(d); };
  const setEnd = (d) => { endRef.current = d; setEndState(d); };
  const isFixed = priority === 'زمان انجام ثابت';

  // ✅ لود مقادیر فعلی (الویت، شروع/پایان، برآورد زمانی) + جدول کارهای زمان ثابت
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        const d = await res.json();
        if (d.success && d.data) {
          const src = d.data;
          const prio = src.TDP || src.Priorities || '';
          if (prio) setPriority(prio);
          if (src.Durationtime) {
            const parts = String(src.Durationtime).split(':').map((x) => parseInt(x, 10) || 0);
            setHours(pad(parts[0] || 0));
            setMinutes(pad(parts[1] || 0));
          }
          const sd = fromWall(src.TDDue || src.DueDateTime);
          const ed = fromWall(src.TDEnd || src.EndDateTime);
          if (sd) setStart(sd);
          if (ed) setEnd(ed);
        }
      } catch {}
    })();
    fetch('/api/load-data?type=fixed').then((r) => r.json()).then((d) => { if (d.success) setFixedRows(d.data || []); }).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const save = async () => {
    if (!priority || priority === 'نامشخص') { alert('لطفاً الویت را انتخاب کنید!'); return; }
    const body = { taskId, priority };
    if (isFixed) {
      const s = startRef.current, e2 = endRef.current;
      if (!s || !e2 || e2 <= s) { alert('زمان برنامه‌ای پایان باید بعد از زمان برنامه‌ای آغاز باشد.'); return; }
      body.startLocal = toWall(s);
      body.endLocal = toWall(e2);
    } else {
      const h = Number(hours), m = Number(minutes);
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59 || !((h >= 0 && m > 0) || (h > 0 && m >= 0))) { alert('برآورد زمانی صحیح وارد کنید.'); return; }
      body.hours = h;
      body.minutes = m;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/timedate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.success) {
        alert('الویت و زمان با موفقیت ثبت شد.');
        if (onSaved) onSaved();
        onClose();
      } else if (d.overlap) {
        alert('این بازه با کارهای زمان ثابت زیر تداخل دارد:\n' + (d.conflicts || []).map((c) => `کد کار: ${c}`).join('\n'));
      } else {
        alert('خطا: ' + d.error);
      }
    } catch { alert('خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  const inp = 'search-input w-full';
  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');

  return (
    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}
        className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[720px] max-w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">الویت و زمان — کد کار: {taskId}</h3>
          <button type="button" onClick={onClose} className="text-xl">✕</button>
        </div>

        <label className="block text-sm font-bold mb-1">الویت</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inp}>
          {!PRIORITIES.includes(priority) && <option value={priority}>{priority}</option>}
          <option value="نامشخص">(انتخاب کنید)</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        {isFixed ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-bold mb-1">تاریخ شروع (سررسید)</label>
              <DatePicker value={start} onChange={(d) => { if (!d) return; const nd = d.toDate(); nd.setHours(startRef.current.getHours(), startRef.current.getMinutes(), 0, 0); setStart(nd); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">ساعت شروع</label>
              <TimeInput value={start} onChange={setStart} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">تاریخ پایان</label>
              <DatePicker value={end} onChange={(d) => { if (!d) return; const nd = d.toDate(); nd.setHours(endRef.current.getHours(), endRef.current.getMinutes(), 0, 0); setEnd(nd); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">ساعت پایان</label>
              <TimeInput value={end} onChange={setEnd} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-bold mb-1">برآورد زمانی — ساعت (00-23)</label>
              <input dir="ltr" className={inp} value={hours}
                onChange={(e) => setHours(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={() => { const v = parseInt(hours, 10); setHours(pad(isNaN(v) ? 0 : Math.min(23, v))); }} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">دقیقه (00-59)</label>
              <input dir="ltr" className={inp} value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={() => { const v = parseInt(minutes, 10); setMinutes(pad(isNaN(v) ? 0 : Math.min(59, v))); }} />
            </div>
          </div>
        )}

        {/* ✅ جدول کارهای دارای زمان انجام ثابت (معادل dGV_Fixed_Tasks دسکتاپ) */}
        <div className="mt-4">
          <label className="block text-sm font-bold mb-1">کارهای دارای زمان انجام ثابت (برای انتخاب بازهٔ خالی)</label>
          <div className="overflow-auto max-h-48 rounded border border-teal-700">
            <table className="task-table w-full min-w-[560px]">
              <thead>
                <tr><th>کدکار</th><th>الویت</th><th>طول بازه</th><th>زمان آغاز</th><th>زمان پایان</th><th>وضعیت</th></tr>
              </thead>
              <tbody>
                {fixedRows.length === 0 && <tr><td colSpan={6} className="text-center py-3">موردی وجود ندارد</td></tr>}
                {fixedRows.map((r) => (
                  <tr key={r.TaskID}>
                    <td>{r.TaskID}</td>
                    <td>{r.Priorities}</td>
                    <td>{r.Durationtime}</td>
                    <td>{fmtFa(r.DueDateTime)}</td>
                    <td>{fmtFa(r.EndDateTime)}</td>
                    <td>{Number(r.Complited) === 1 ? 'اتمام' : 'جاری'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button type="submit" disabled={busy} className="btn-success flex-1">{busy ? 'در حال ذخیره...' : 'ثبت'}</button>
          <button type="button" onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </form>
    </div>
  );
}