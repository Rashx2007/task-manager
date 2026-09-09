'use client';

import { useState, useEffect, useRef } from 'react';import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];
const HOURS = Array.from({ length: 13 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR') : '-');

export default function TimeDateModal({ taskId, finished, onClose, onSaved }) {
  const [info, setInfo] = useState(null);
  const [priority, setPriority] = useState('');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [saving, setSaving] = useState(false);

  const isFixed = priority === 'زمان انجام ثابت';

// داخل هر مودال (TaskForm و TimeDateModal) اضافه کنید:
useEffect(() => {
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';   // قفل اسکرول صفحهٔ زمینه (مورد ۷)
  return () => { document.body.style.overflow = prev; };
}, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/timedate?taskId=${taskId}`);
        const d = await res.json();
        if (d.success) {
          setInfo(d);
          if (d.timeDate) {
            setPriority(d.timeDate.Priorities || '');
            const dur = String(d.timeDate.Durationtime || '0:0:0').split(':');
            setHours(parseInt(dur[0], 10) || 0);
            setMinutes(parseInt(dur[1], 10) || 0);
            if (d.timeDate.DueDateTime) setStart(new Date(d.timeDate.DueDateTime));
            if (d.timeDate.EndDateTime) setEnd(new Date(d.timeDate.EndDateTime));
          }
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [taskId]);


// بستن با ESC
useEffect(() => {
  const h = (e) => { if (e.key === 'Escape') onClose(); };
  window.addEventListener('keydown', h);
  return () => window.removeEventListener('keydown', h);
}, [onClose]);

  const handleOk = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/timedate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          priority,
          finished: finished ? 1 : 0,
          hours,
          minutes,
          dueDateTime: start ? start.toISOString() : null,
          endDateTime: end ? end.toISOString() : null,
        }),
      });
      const d = await res.json();
      if (d.success) {
        alert(finished ? 'کار اتمام یافت!' : 'زمان کار با موفقیت ثبت شد.');
        if (onSaved) onSaved();
        onClose();
      } else if (d.conflict) {
        const lines = (d.overlapping || [])
          .map((r) => `کد ${r.TaskID} | ${fmtFa(r.DueDateTime)} تا ${fmtFa(r.EndDateTime)}`)
          .join('\n');
        alert(`این کار با کارهای دارای زمان انجام ثابت تداخل دارد:\n${lines}\nلطفاً زمان دیگری انتخاب کنید.`);
      } else {
        alert(d.error || 'خطا');
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    } finally {
      setSaving(false);
    }
  };

    const okRef = useRef(null);
  okRef.current = handleOk;

  // شورتکات: Esc = لغو ، Ctrl+Enter = تأیید
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); if (okRef.current) okRef.current(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
        <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[860px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-2">الویت و زمان — کد کار: {taskId}</h3>
        {info?.submit && (
          <div className="text-sm text-gray-700 mb-4">
            زمان ثبت: {fmtFa(info.submit.Submit_Date)}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">الویت</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="search-input w-full">
              <option value="">(انتخاب کنید)</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">برآورد زمانی (ساعت)</label>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={isFixed} className="search-input w-full disabled:opacity-50">
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">برآورد زمانی (دقیقه)</label>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={isFixed} className="search-input w-full disabled:opacity-50">
              {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
          </div>

          {isFixed && (
            <>
              <div>
                <label className="block text-sm font-bold mb-1">زمان برنامه‌ای آغاز</label>
                <DatePicker value={start} onChange={(d) => setStart(d && d.toDate ? d.toDate() : d)}
                  calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
                  inputClass="search-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">زمان برنامه‌ای پایان</label>
                <DatePicker value={end} onChange={(d) => setEnd(d && d.toDate ? d.toDate() : d)}
                  calendar={persian} locale={persian_fa} format="YYYY/MM/DD HH:mm" enableTimePicker
                  inputClass="search-input w-full" />
              </div>
            </>
          )}
        </div>

        {/* معادل dGV_Fixed_Tasks */}
        <div className="mt-6">
          <h4 className="font-bold mb-2">کارهای دارای زمان انجام ثابت (در حال انجام)</h4>
          <table className="task-table">
            <thead>
              <tr>
                <th>کدکار</th><th>الویت</th><th>طول بازه</th><th>زمان آغاز</th><th>زمان پایان</th><th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {(!info?.fixedTasks || info.fixedTasks.length === 0) && (
                <tr><td colSpan={6} className="text-center">موردی وجود ندارد</td></tr>
              )}
              {(info?.fixedTasks || []).map((r) => (
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

        <div className="flex gap-3 mt-6">
          <button onClick={handleOk} disabled={saving} className="btn-success">
            {saving ? 'در حال ثبت...' : 'تأیید'}
          </button>
           <button onClick={onClose} className="btn-danger">لغو</button>
          <span className="text-xs text-gray-600 mr-auto self-center">
            Ctrl+Enter = تأیید · Esc = لغو · کلیک بیرون = بستن
          </span>
        </div>
      </div>
    </div>
  );
}