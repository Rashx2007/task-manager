'use client';
import { useState, useEffect } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];

// ✅ رشتهٔ ساعت‌دیواری سرور → Date محلی (بدون شیفت منطقه زمانی)
const fromWall = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
};
// ✅ Date محلی → رشتهٔ ساعت‌دیواری برای ارسال به سرور
const toWall = (d) => {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}Z`;
};

export default function TimeDateModal({ taskId, onClose, onSaved }) {
  const [priority, setPriority] = useState('نامشخص');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date(Date.now() + 30 * 60000));
  const [busy, setBusy] = useState(false);

  const isFixed = priority === 'زمان انجام ثابت';

  // ✅ معادل Frm_TimeDate_Load: لود الویت انتخابی، زمان‌های شروع/پایان و برآورد زمانی فعلی هنگام ورود
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
            setHours(parts[0] || 0);
            setMinutes(parts[1] || 0);
          }
          const sd = fromWall(src.TDDue || src.DueDateTime);
          const ed = fromWall(src.TDEnd || src.EndDateTime);
          if (sd) setStart(sd);
          if (ed) setEnd(ed);
        }
      } catch {}
    })();
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
      if (!start || !end || end <= start) { alert('زمان برنامه‌ای پایان باید بعد از زمان برنامه‌ای آغاز باشد.'); return; }
      body.startLocal = toWall(start);
      body.endLocal = toWall(end);
    } else {
      if (!((Number(hours) >= 0 && Number(minutes) > 0) || (Number(hours) > 0 && Number(minutes) >= 0))) { alert('برآورد زمانی صحیح وارد کنید.'); return; }
      body.hours = Number(hours);
      body.minutes = Number(minutes);
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

  return (
    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">الویت و زمان — کد کار: {taskId}</h3>
          <button onClick={onClose} className="text-xl">✕</button>
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
              <label className="block text-sm font-bold mb-1">زمان شروع (سررسید)</label>
              <DatePicker value={start} onChange={(d) => setStart(d ? d.toDate() : null)}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker inputClass={inp} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">زمان پایان</label>
              <DatePicker value={end} onChange={(d) => setEnd(d ? d.toDate() : null)}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker inputClass={inp} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-bold mb-1">برآورد زمانی — ساعت</label>
              <input type="number" min="0" max="200" value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">دقیقه</label>
              <input type="number" min="0" max="59" step="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inp} />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={save} disabled={busy} className="btn-success flex-1">{busy ? 'در حال ذخیره...' : 'ثبت'}</button>
          <button onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </div>
    </div>
  );
}