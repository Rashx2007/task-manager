'use client';
import { useState, useEffect, useRef } from 'react';

const pad = (n) => String(n).padStart(2, '0');
// ---------- اجزای ساعت ۲۴ساعته — همسان با مودال الویت و زمان ----------
const toFa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
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
  const onPointerMove = (e) => {
    if (dragRef.current && stage === 'minute') setMinute(minuteFromEvent(e));
  };
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
      <div className="text-center text-sm mt-2 font-bold" dir="ltr">
        {toFa(pad(hour))} : {toFa(pad(minute))}
      </div>
      <div className="text-center text-[11px] text-gray-500 mt-1">
        {stage === 'hour' ? 'ساعت را انتخاب کنید (۲۴ ساعته)' : 'دقیقه: کلیک یا بکشید و رها کنید'}
      </div>
    </div>
  );
}

// ورودی ساعت ۲۴ساعته + فلش بالا/پایین + انتخابگر دایره‌ای
export function TimeInput({ value, onChange, open, onToggle, onClose }) {
  const [text, setText] = useState(fmtTime(value));
  const inputRef = useRef(null);
  useEffect(() => { setText(fmtTime(value)); }, [value]);
  const commit = () => {
    const p = parseTimeText(text);
    if (p) {
      const d = new Date(value);
      d.setHours(p.hh, p.mm, 0, 0);
      onChange(d);
      setText(fmtTime(d));
    } else setText(fmtTime(value));
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
      <button type="button" className="btn-primary px-2" title="انتخابگر ساعت" onClick={onToggle}>🕒</button>
      {open && (
        <div className="absolute z-[60] top-full mt-1 left-0 bg-white rounded-lg shadow-xl p-3 w-72" onClick={(e) => e.stopPropagation()}>
          <ClockPicker
            date={value}
            onConfirm={(d) => {
              onChange(d);
              setText(fmtTime(d));
              onClose();
              if (inputRef.current) inputRef.current.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
