'use client';
import { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];

const pad = (n) => String(n).padStart(2, '0');
const toFa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
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

// ✅ انتخابگر دایره‌ای با عقربه + پشتیبانی درگ (ماوس/لمس) برای ساعت و دقیقه — مشابه تصویر مرجع
function ClockPicker({ date, onChange }) {
  const [stage, setStage] = useState('hour');
  const faceRef = useRef(null);
  const dragRef = useRef(false);

  const h24 = date.getHours();
  const mm = date.getMinutes();
  const { h: h12, ampm } = to12(h24);

  // ✅ AM/PM بلافاصله اثر می‌کند
  const setAmpm = (a) => {
    if (a === ampm) return;
    const d = new Date(date);
    d.setHours((h24 % 12) + (a === 'PM' ? 12 : 0), d.getMinutes(), 0, 0);
    onChange(d);
  };

  const angleFromEvent = (e) => {
    const rect = faceRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  };

  const apply = (e) => {
    const deg = angleFromEvent(e);
    const d = new Date(date);
    if (stage === 'hour') {
      const v = Math.round(deg / 30) % 12;
      const h12sel = v === 0 ? 12 : v;
      d.setHours((h12sel % 12) + (ampm === 'PM' ? 12 : 0), d.getMinutes(), 0, 0);
    } else {
      const v = Math.round(deg / 6) % 60; // ✅ هر دقیقه‌ای بین مضارب ۵ با درگ
      d.setMinutes(v);
    }
    onChange(d);
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    dragRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    apply(e);
  };
  const onPointerMove = (e) => { if (dragRef.current) apply(e); };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = false;
    if (stage === 'hour') setStage('minute'); // رها کردن در مرحلهٔ ساعت → مرحلهٔ دقیقه
  };

  const nums = stage === 'hour' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const sel = stage === 'hour' ? h12 : mm;
  const ang = ((stage === 'hour' ? (h12 % 12) * 30 : mm * 6) * Math.PI) / 180;
  const hx = 100 + 62 * Math.sin(ang), hy = 100 - 62 * Math.cos(ang);

  return (
    <div dir="ltr">
      <div className="flex justify-center gap-2 mb-2">
        <button type="button" onClick={() => setAmpm('AM')} className={`px-3 py-1 rounded text-xs font-bold ${ampm === 'AM' ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>AM</button>
        <button type="button" onClick={() => setAmpm('PM')} className={`px-3 py-1 rounded text-xs font-bold ${ampm === 'PM' ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>PM</button>
      </div>
      <div ref={faceRef} className="relative w-56 h-56 mx-auto rounded-full bg-gray-100 select-none"
        style={{ touchAction: 'none', cursor: 'pointer' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = false; }}>
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <line x1="100" y1="100" x2={hx} y2={hy} stroke="#0891b2" strokeWidth="2" />
          <circle cx="100" cy="100" r="4" fill="#0891b2" />
          <circle cx={hx} cy={hy} r="11" fill="#0891b2" opacity="0.3" />
        </svg>
        {nums.map((n, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const x = 50 + 40 * Math.sin(a);
          const y = 50 - 40 * Math.cos(a);
          return (
            <span key={i} className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center text-sm font-bold pointer-events-none"
              style={{ left: `${x}%`, top: `${y}%`, color: sel === n ? '#0891b2' : '#333' }}>
              {stage === 'hour' ? toFa(n) : toFa(pad(n))}
            </span>
          );
        })}
      </div>
      <div className="text-center text-[11px] text-gray-500 mt-2">
        {stage === 'hour' ? 'ساعت: کلیک یا بکشید؛ با رها کردن به مرحلهٔ دقیقه می‌رود' : 'دقیقه: کلیک یا بکشید (۰۰ تا ۹)'}
      </div>
    </div>
  );
}

// ✅ ورودی ساعت متنی هوشمند + انتخابگر دایره‌ای زنده
function TimeInput({ value, onChange }) {
  const [text, setText] = useState(fmtTime(value));
  const [showClock, setShowClock] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { setText(fmtTime(value)); }, [value]);
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
      {showClock && (
        <div className="absolute z-[60] top-full mt-1 left-0 bg-white rounded-lg shadow-xl p-3 w-64" onClick={(e) => e.stopPropagation()}>
          <ClockPicker date={value} onChange={(d) => { onChange(d); setText(fmtTime(d)); }} />
          <div className="text-center text-sm mt-2 font-bold" dir="ltr">{fmtTime(value)}</div>
          <div className="flex justify-center mt-2">
            <button type="button" className="btn-danger px-3 py-1 text-xs" onClick={() => { setShowClock(false); if (inputRef.current) inputRef.current.focus(); }}>بستن</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimeDateModal({ taskId, onClose, onSaved }) {
  const [priority, setPriority] = useState('نامشخص');
  const [hours, setHours] = useState('00');
  const [minutes, setMinutes] = useState('30');
  const [start, setStartState] = useState(new Date());
  const [end, setEndState] = useState(new Date());
  const startRef = useRef(start);
  const endRef = useRef(end);
  const endTouchedRef = useRef(false); // ✅ پایان دستی تغییر کرده؟
  const [busy, setBusy] = useState(false);
  const [fixedRows, setFixedRows] = useState([]);

  const setStart = (d) => { startRef.current = d; setStartState(d); };
  const setEnd = (d) => { endRef.current = d; setEndState(d); };
  const isFixed = priority === 'زمان انجام ثابت';

  // ✅ شروع تغییر کرد → پایان هم مطابق آن (تا وقتی پایان دستی عوض شود)
  const changeStartDate = (d) => {
    const nd = new Date(d); nd.setHours(startRef.current.getHours(), startRef.current.getMinutes(), 0, 0);
    setStart(nd);
    if (!endTouchedRef.current) { const ne = new Date(nd); ne.setHours(endRef.current.getHours(), endRef.current.getMinutes(), 0, 0); setEnd(ne); }
  };
  const changeStartTime = (t) => {
    setStart(t);
    if (!endTouchedRef.current) { const ne = new Date(endRef.current); ne.setHours(t.getHours(), t.getMinutes(), 0, 0); setEnd(ne); }
  };
  // ✅ تغییر دستی پایان → اعمال و قطع همگام‌سازی خودکار
  const changeEndDate = (d) => {
    endTouchedRef.current = true;
    const nd = new Date(d); nd.setHours(endRef.current.getHours(), endRef.current.getMinutes(), 0, 0);
    setEnd(nd);
  };
  const changeEndTime = (t) => { endTouchedRef.current = true; setEnd(t); };

  // ✅ لود مقادیر فعلی + جدول ثابت‌ها
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
          if (ed) { setEnd(ed); endTouchedRef.current = true; }
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
              <DatePicker value={start} onChange={(d) => { if (d) changeStartDate(d.toDate()); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">ساعت شروع</label>
              <TimeInput value={start} onChange={changeStartTime} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">تاریخ پایان</label>
              <DatePicker value={end} onChange={(d) => { if (d) changeEndDate(d.toDate()); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">ساعت پایان</label>
              <TimeInput value={end} onChange={changeEndTime} />
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