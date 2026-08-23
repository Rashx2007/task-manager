'use client';
import { useState, useEffect } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];
const p2 = (n) => String(n).padStart(2, '0');
const wallToLocal = (s) => {
  const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date();
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
};
const localToWall = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const fmtFa = (d) => d.toLocaleString('fa-IR');
const toPicker = (d) => new DateObject({ date: d, calendar: persian, locale: persian_fa });

export default function TimeDateModal({ taskId, onClose, onSaved }) {
  const [priority, setPriority] = useState('3.متوسط');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date(Date.now() + 30 * 60000));
  const [fixedTasks, setFixedTasks] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [saving, setSaving] = useState(false);
  const isFixed = priority === 'زمان انجام ثابت';

  useEffect(() => {
    fetch(`/api/timedate?taskId=${taskId}`).then((r) => r.json()).then((d) => {
      if (d.success && d.data) {
        setPriority(d.data.Priorities || '3.متوسط');
        const p = String(d.data.Durationtime || '0:30:0').split(':');
        setHours(Number(p[0]) || 0); setMinutes(Number(p[1]) || 30);
        if (d.data.DueDateTime) setStart(wallToLocal(d.data.DueDateTime));
        if (d.data.EndDateTime) setEnd(wallToLocal(d.data.EndDateTime));
      }
      if (d.fixed) setFixedTasks(d.fixed);
    }).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    if (isFixed) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ taskId, preview: '1', priority, hours, minutes });
      fetch(`/api/timedate?${qs}`).then((r) => r.json()).then((d) => {
        if (d.success && d.preview) { setStart(wallToLocal(d.preview.due)); setEnd(wallToLocal(d.preview.end)); }
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [taskId, priority, hours, minutes, isFixed]);

  const save = async () => {
    setSaving(true); setConflicts([]);
    try {
      const res = await fetch('/api/timedate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, priority, hours, minutes, startLocal: localToWall(start), endLocal: localToWall(end) }),
      });
      const d = await res.json();
      if (d.success) { alert('ذخیره شد.'); if (onSaved) onSaved(); onClose(); }
      else if (d.overlap) { setConflicts(d.conflicts || []); alert('تداخل زمانی با کارهای ثابت! ردیف‌های متداخل قرمز شدند.'); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const inp = 'search-input w-full';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[780px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-4">الویت و زمان — کد کار: {taskId}</h3>
        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">الویت</label>
          <select className={inp} value={priority} onChange={(e) => { setPriority(e.target.value); setConflicts([]); }}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-sm font-bold mb-1">برآورد (ساعت)</label>
            <select className={inp} value={hours} disabled={isFixed} onChange={(e) => setHours(Number(e.target.value))}>
              {Array.from({ length: 13 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
          <div><label className="block text-sm font-bold mb-1">برآورد (دقیقه)</label>
            <select className={inp} value={minutes} disabled={isFixed} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="block text-sm font-bold mb-1">زمان برنامه‌ای آغاز</label>
            {isFixed ? <DatePicker value={toPicker(start)} onChange={(d) => { if (d) { setStart(d.toDate()); setConflicts([]); } }} calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker inputClass={inp} />
              : <input className={inp} value={fmtFa(start)} disabled />}</div>
          <div><label className="block text-sm font-bold mb-1">زمان برنامه‌ای پایان</label>
            {isFixed ? <DatePicker value={toPicker(end)} onChange={(d) => { if (d) { setEnd(d.toDate()); setConflicts([]); } }} calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker inputClass={inp} />
              : <input className={inp} value={fmtFa(end)} disabled />}</div>
        </div>
        <div className="mb-4">
          <h4 className="font-bold mb-2">کارهای دارای زمان انجام ثابت (جاری)</h4>
          <div className="overflow-auto max-h-[240px] rounded border border-gray-300">
            <table className="task-table w-full min-w-[640px]">
              <thead><tr><th>کدکار</th><th>الویت</th><th>طول بازه</th><th>آغاز</th><th>پایان</th><th>وضعیت</th></tr></thead>
              <tbody>
                {fixedTasks.length === 0 && <tr><td colSpan={6} className="text-center py-4">موردی نیست</td></tr>}
                {fixedTasks.map((t) => (
                  <tr key={t.TaskID} style={conflicts.map(Number).includes(Number(t.TaskID)) ? { background: '#FC7470' } : undefined}>
                    <td>{t.TaskID}</td><td>{t.Priorities}</td><td>{t.Durationtime}</td>
                    <td>{fmtFa(wallToLocal(t.DueDateTime))}</td><td>{fmtFa(wallToLocal(t.EndDateTime))}</td><td>جاری</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="btn-success">{saving ? '...' : 'تأیید'}</button>
          <button onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </div>
    </div>
  );
}