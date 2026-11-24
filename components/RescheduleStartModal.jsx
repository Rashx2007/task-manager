'use client';
import { useState } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import TodayPlugin from './TodayPlugin';
import { TimeInput } from './ClockTimeInput';

const pad = (n) => String(n).padStart(2, '0');
// پیش‌فرض: زمان فعلی رُندشده به بالا تا ضریب ۵ دقیقه (سرور دوباره اعتبارسنجی می‌کند).
const defaultStart = () => new Date(Math.ceil(Date.now() / 300000) * 300000);
const toPicker = (d) => new DateObject({ date: d, calendar: persian, locale: persian_fa });

export default function RescheduleStartModal({ onCancel, onConfirm }) {
  const [start, setStart] = useState(defaultStart);
  const [openClock, setOpenClock] = useState(false);
  const ok = start instanceof Date && !isNaN(start);
  const changeDate = (d) => {
    const n = new Date(start);
    n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setStart(n);
  };
  const submit = () => {
    if (!ok) return;
    onConfirm(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`);
  };
  const inp = 'search-input w-full';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl p-5 w-[34rem] max-w-[95vw]">
        <h3 className="font-bold mb-1">مرتب‌سازی بدون کارهای زمان ثابت</h3>
        <p className="text-xs text-gray-600 mb-3">زمان شروع اولین کار را مشخص کنید؛ دقیقهٔ شروع به ضریب ۵ رُند می‌شود و ساعات و روزهای کاری رعایت می‌گردد.</p>
        <div className="border border-teal-600 rounded-lg p-3 bg-[#e6f3ef]">
          <label className="block text-sm font-bold mb-1">زمان شروع</label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <DatePicker value={toPicker(start)} onChange={(d) => { if (d) changeDate(d.toDate()); }}
                calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp}
                plugins={[<TodayPlugin onToday={(d) => changeDate(d)} />]} />
            </div>
            <div className="w-44 shrink-0">
              <TimeInput value={start} onChange={setStart} open={openClock}
                onToggle={() => setOpenClock((v) => !v)} onClose={() => setOpenClock(false)} />
            </div>
          </div>
        </div>
        <button className="btn-primary w-full mt-3" onClick={() => onConfirm(null)}>شروع خودکار از اولین زمان مجاز (دقیقهٔ مضرب ۵)</button>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-danger" onClick={onCancel}>انصراف</button>
          <button className="btn-primary disabled:opacity-50" disabled={!ok} onClick={submit}>مرتب‌سازی</button>
        </div>
      </div>
    </div>
  );
}
