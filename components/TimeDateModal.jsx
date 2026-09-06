'use client';
import { useState, useEffect, useRef } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import TodayPlugin from './TodayPlugin';

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
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

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

// انتخابگر ۲۴ساعته دوحلقه‌ای؛ دقیقه با کلیک/درگ و بسته‌شدن خودکار
function ClockPicker({ date, onConfirm }) {
  const [stage, setStage] = useState('hour');
  const [hour, setHour] = useState(date.getHours());
  const [minute, setMinute] = useState(date.getMinutes());
  const faceRef = useRef(null);
  const dragRef = useRef(false);

  const hours = [];
  for (let h = 1; h <= 12; h++) hours.push({ h, ring: 'inner' });
  for (let h = 13; h <= 23; h++) hours.push({ h, ring: 'outer' });
  hours.push({ h: 0, ring: 'outer' });

  const minuteFromEvent = (e) => {
    const rect = faceRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return Math.round(deg / 6) % 60;
  };

  const onPointerDown = (e) => {
    if (stage !== 'minute') return;
    e.preventDefault();
    dragRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    setMinute(minuteFromEvent(e));
  };
  const onPointerMove = (e) => { if (dragRef.current && stage === 'minute') setMinute(minuteFromEvent(e)); };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = false;
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    onConfirm(d);
  };

  const handAngle = ((stage === 'hour' ? (hour % 12) * 30 : minute * 6) * Math.PI) / 180;
  const handR = stage === 'hour' ? (hour === 0 || hour > 12 ? 62 : 40) : 62;
  const hx = 100 + handR * Math.sin(handAngle);
  const hy = 100 - handR * Math.cos(handAngle);

  return (
    <div dir="ltr">
      <div
        ref={faceRef}
        className="relative w-60 h-60 mx-auto rounded-full bg-gray-100 select-none"
        style={{ touchAction: 'none', cursor: 'pointer' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = false; }}
      >
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <line x1="100" y1="100" x2={hx} y2={hy} stroke="#0891b2" strokeWidth="2" />
          <circle cx="100" cy="100" r="4" fill="#0891b2" />
          <circle cx={hx} cy={hy} r="10" fill="#0891b2" opacity="0.3" />
        </svg>
        {stage === 'hour'
          ? hours.map(({ h, ring }) => {
              const ang = ((h % 12) * 30 * Math.PI) / 180;
              const R = ring === 'inner' ? 26 : 40;
              const x = 50 + R * Math.sin(ang);
              const y = 50 - R * Math.cos(ang);
              return (
                <button
                  key={h}
                  type="button"
                  className={`absolute w-7 h-7 -ml-3 -mt-3 rounded-full text-xs font-bold ${hour === h ? 'bg-teal-600 text-white' : 'hover:bg-teal-100'}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => { setHour(h); setStage('minute'); }}
                >
                  {toFa(pad(h))}
                </button>
              );
            })
          : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
              const ang = (m * 6 * Math.PI) / 180;
              const x = 50 + 40 * Math.sin(ang);
              const y = 50 - 40 * Math.cos(ang);
              return (
                <span
                  key={m}
                  className="absolute w-7 h-7 -ml-3 -mt-3 flex items-center justify-center text-xs font-bold pointer-events-none"
                  style={{ left: `${x}%`, top: `${y}%`, color: minute === m ? '#0891b2' : '#333' }}
                >
                  {toFa(pad(m))}
                </span>
              );
            })}
      </div>
      <div className="text-center text-sm mt-2 font-bold" dir="ltr">{toFa(pad(hour))} : {toFa(pad(minute))}</div>
      <div className="text-center text-[11px] text-gray-500 mt-1">
        {stage === 'hour' ? 'ساعت را انتخاب کنید (۲۴ ساعته)' : 'دقیقه: کلیک یا بکشید و رها کنید'}
      </div>
    </div>
  );
}

// ورودی ساعت ۲۴ساعته + فلش بالا/پایین + انتخابگر دایره‌ای
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
  const onKeyDown = (e) => {
    if (e.key === 'Enter') { commit(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const caret = e.target.selectionStart != null ? e.target.selectionStart : text.length;
      const colon = text.indexOf(':');
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      const d = new Date(value);
      if (caret <= colon) d.setHours((d.getHours() + delta + 24) % 24);
      else d.setMinutes((d.getMinutes() + delta + 60) % 60);
      onChange(d);
    }
  };
  return (
    <div className="relative flex items-center gap-1">
      <input
        ref={inputRef}
        className="search-input w-full"
        dir="ltr"
        value={text}
        placeholder="HH:MM"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="btn-primary px-2" title="انتخابگر ساعت" onClick={() => setShowClock((s) => !s)}>🕒</button>
      {showClock && (
        <div className="absolute z-[60] top-full mt-1 left-0 bg-white rounded-lg shadow-xl p-3 w-72" onClick={(e) => e.stopPropagation()}>
          <ClockPicker date={value} onConfirm={(d) => { onChange(d); setShowClock(false); if (inputRef.current) inputRef.current.focus(); }} />
        </div>
      )}
    </div>
  );
}

export default function TimeDateModal({ taskId, onClose, onSaved }) {
  const [priority, setPriority] = useState('نامشخص');
  const [hours, setHours] = useState('00');
  const [minutes, setMinutes] = useState('30');
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  // تفکیک: تاریخ پایان و ساعت/دقیقهٔ پایان مستقل از هم همگام می‌شوند
  const [endDateTouched, setEndDateTouched] = useState(false);
  const [endTimeTouched, setEndTimeTouched] = useState(false);

  const effEnd = new Date(endDateTouched ? end : start);
  effEnd.setHours(
    endTimeTouched ? end.getHours() : start.getHours(),
    endTimeTouched ? end.getMinutes() : start.getMinutes(),
    0,
    0
  );

  const startRef = useRef(start);
  startRef.current = start;
  const endRef = useRef(effEnd);
  endRef.current = effEnd;

  const [busy, setBusy] = useState(false);
  const [fixedRows, setFixedRows] = useState([]);

  const isFixed = priority === 'زمان انجام ثابت';

  // تغییر تاریخ شروع → فقط تاریخ پایان همگام شود
  const changeStartDate = (d) => {
    const nd = new Date(d);
    nd.setHours(start.getHours(), start.getMinutes(), 0, 0);
    setStart(nd);
    setEndDateTouched(false);
  };
  // تغییر ساعت شروع → فقط ساعت/دقیقهٔ پایان همگام شود
  const changeStartTime = (t) => {
    setStart(t);
    setEndTimeTouched(false);
  };
  // تغییر دستی تاریخ پایان → استقلال تاریخ پایان
  const changeEndDate = (d) => {
    const nd = new Date(d);
    nd.setHours(endRef.current.getHours(), endRef.current.getMinutes(), 0, 0);
    setEnd(nd);
    setEndDateTouched(true);
  };
  // تغییر دستی ساعت پایان → استقلال ساعت پایان
  const changeEndTime = (t) => {
    setEnd(t);
    setEndTimeTouched(true);
  };

  // فلش بالا/پایین روی المان تاریخ: سال/ماه/روز بسته به جای نشانگر (شمسی)
  const onDateArrow = (e, which) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    e.preventDefault();
    const val = el.value || '';
    const caret = el.selectionStart != null ? el.selectionStart : val.length;
    const i1 = val.indexOf('/');
    const i2 = val.lastIndexOf('/');
    let seg = 'day';
    if (i1 !== -1 && caret <= i1) seg = 'year';
    else if (i2 !== -1 && caret > i1 && caret <= i2) seg = 'month';
    const delta = e.key === 'ArrowUp' ? 1 : -1;
    const cur = which === 'start' ? start : endRef.current;
    try {
      const parts = new DateObject({ date: cur, calendar: persian }).format('YYYY/MM/DD').split('/').map((x) => parseInt(x, 10));
      let y = parts[0];
      let m = parts[1];
      let dd = parts[2];
      if (seg === 'year') y += delta;
      else if (seg === 'month') m += delta;
      else dd += delta;
      const nd = new DateObject({ year: y, month: m, day: dd, calendar: persian }).toDate();
      if (which === 'start') changeStartDate(nd);
      else changeEndDate(nd);
    } catch (err) {}
  };

  const onDurArrow = (e, kind) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? 1 : -1;
    if (kind === 'h') setHours((v) => pad(Math.min(23, Math.max(0, (parseInt(v, 10) || 0) + delta))));
    else setMinutes((v) => pad(Math.min(59, Math.max(0, (parseInt(v, 10) || 0) + delta))));
  };

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
          if (ed) {
            setEnd(ed);
            setEndDateTouched(true);
            setEndTimeTouched(true);
          }
        }
      } catch (err) {}
    })();
    fetch('/api/load-data?type=fixed')
      .then((r) => r.json())
      .then((d) => { if (d.success) setFixedRows(d.data || []); })
      .catch(() => {});
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
      const s = startRef.current;
      const e2 = endRef.current;
      if (!s || !e2 || e2 <= s) { alert('زمان برنامه‌ای پایان باید بعد از زمان برنامه‌ای آغاز باشد.'); return; }
      body.startLocal = toWall(s);
      body.endLocal = toWall(e2);
    } else {
      const h = Number(hours);
      const m = Number(minutes);
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59 || !((h >= 0 && m > 0) || (h > 0 && m >= 0))) { alert('برآورد زمانی صحیح وارد کنید.'); return; }
      body.hours = h;
      body.minutes = m;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/timedate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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
    } catch (err) { alert('خطا در ارتباط با سرور'); }
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
            <div onKeyDown={(e) => onDateArrow(e, 'start')}>
              <label className="block text-sm font-bold mb-1">تاریخ شروع (سررسید)</label>
              <DatePicker value={start} onChange={(d) => { if (d) changeStartDate(d.toDate()); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} plugins={[<TodayPlugin />]} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">ساعت شروع</label>
              <TimeInput value={start} onChange={changeStartTime} />
            </div>
            <div onKeyDown={(e) => onDateArrow(e, 'end')}>
              <label className="block text-sm font-bold mb-1">تاریخ پایان</label>
              <DatePicker value={effEnd} onChange={(d) => { if (d) changeEndDate(d.toDate()); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} plugins={[<TodayPlugin />]} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">ساعت پایان</label>
              <TimeInput value={effEnd} onChange={changeEndTime} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-bold mb-1">برآورد زمانی — ساعت (00-23)</label>
              <input dir="ltr" className={inp} value={hours}
                onChange={(e) => setHours(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={() => { const v = parseInt(hours, 10); setHours(pad(isNaN(v) ? 0 : Math.min(23, v))); }}
                onKeyDown={(e) => onDurArrow(e, 'h')} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">دقیقه (00-59)</label>
              <input dir="ltr" className={inp} value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={() => { const v = parseInt(minutes, 10); setMinutes(pad(isNaN(v) ? 0 : Math.min(59, v))); }}
                onKeyDown={(e) => onDurArrow(e, 'm')} />
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