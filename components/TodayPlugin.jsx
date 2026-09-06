'use client';
import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

// ✅ دکمهٔ «امروز» داخل تقویم — به‌صورت پلاگین react-multi-date-picker
export default function TodayPlugin({ onChange }) {
  return (
    <div className="flex justify-center pt-1 pb-2">
      <button
        type="button"
        className="btn-primary px-4 py-1 text-xs"
        onClick={() => onChange(new DateObject({ calendar: persian, locale: persian_fa }))}
      >
        امروز
      </button>
    </div>
  );
}