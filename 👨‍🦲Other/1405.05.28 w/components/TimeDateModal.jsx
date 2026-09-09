'use client';
import { useState, useEffect } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];
const pad = (n) => String(n).padStart(2, '0');
// ✅ ارسال زمان به‌صورت «دیوارهٔ محلی» بدون تبدیل UTC (رفع جابه‌جایی +۳:۳۰)
const fmtLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR') : '-');
const toPicker = (d) => new DateObject({ date: d, calendar: persian, locale: persian_fa });

export default function TimeDateModal({ taskId, onClose, onSaved }) {
  const [priority, setPriority] = useState('3.متوسط');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [start, setStart] = useState(new Date());
  const [submitInfo, setSubmitInfo] = useState('');
  const [fixedTasks, setFixedTasks] = useState([]);
  const [saving, setSaving] = useState(false);

  const durMs = (hours * 3600 + minutes * 60) * 1000;
  const end = new Date(start.getTime() + durMs);

  useEffect(() => {
    fetch(`/api/timedate?taskId=${taskId}`).then((r) => r.json()).then((d) => {
      if (d.success && d.data) {
        setPriority(d.data.Priorities || '3.متوسط');
        const p = String(d.data.Durationtime || '0:30:0').split(':');
        setHours(Number(p[0]) || 0); setMinutes(Number(p[1]) || 0);
        if (d.data.DueDateTime) setStart(new Date(d.data.DueDateTime));
        if (d.data.Submit_Date) setSubmitInfo(new Date(d.data.Submit_Date).toLocaleString('fa-IR'));
      }
      if (d.fixed) setFixedTasks(d.fixed);
    }).catch(() => {});
  }, [taskId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/timedate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, priority, hours, minutes, startLocal: fmtLocal(start) }),
      });
      const d = await res.json();
      if (d.success) { alert('ذخیره شد.'); if (onSaved) onSaved(); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[760px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-1">الویت و زمان — کد کار: {taskId}</h3>
        {submitInfo && <div className="text-xs text-gray-700 mb-3">زمان ثبت: {submitInfo}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-sm font-bold mb-1">الویت</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="search-input w-full">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">برآورد زمانی (ساعت)</label>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="search-input w-full">
              {Array.from({ length: 13 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">برآورد زمانی (دقیقه)</label>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="search-input w-full">
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">زمان برنامه‌ای آغاز</label>
            {/* ✅ انتخابگر تاریخ + ساعت (بدون تایپ دستی) */}
            <DatePicker value={toPicker(start)} onChange={(d) => setStart(d ? d.toDate() : new Date())}
              calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
              inputClass="search-input w-full" />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold mb-1">زمان برنامه‌ای پایان</label>
          <input readOnly value={fmtFa(end)} className="search-input w-full bg-[#C5D5C5]" />
        </div>

        <div className="mb-4">
          <h4 className="font-bold mb-2">کارهای دارای زمان انجام ثابت (در حال انجام)</h4>
          <div className="overflow-auto max-h-[260px] rounded border">
            <table className="task-table w-full min-w-[640px]">
              <thead><tr><th>کدکار</th><th>الویت</th><th>طول بازه</th><th>زمان آغاز</th><th>زمان پایان</th><th>وضعیت</th></tr></thead>
              <tbody>
                {fixedTasks.map((t) => (
                  <tr key={t.TaskID} className={t.TaskID === taskId ? 'bg-[#FC7470]' : ''}>
                    <td>{t.TaskID}</td><td>{t.Priorities}</td><td>{t.Durationtime}</td>
                    <td>{fmtFa(t.DueDateTime)}</td><td>{fmtFa(t.EndDateTime)}</td><td>جاری</td>
                  </tr>
                ))}
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