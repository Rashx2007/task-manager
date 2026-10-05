'use client';

// ✅ دکمهٔ «امروز» زیر اعداد تقویم — با کال‌بک مستقیم onToday (بدون وابستگی به onChange داخلی کتابخانه)
export default function TodayPlugin({ onToday }) {
  return (
    <>
      <style>{`
        .rmdp-calendar { position: relative !important; padding-bottom: 36px !important; }
        .rmdp-today-wrap { position: absolute; bottom: 4px; left: 0; right: 0; display: flex; justify-content: center; padding: 0; }
        .rmdp-today-wrap button { font-size: 11px !important; padding: 2px 16px !important; border-radius: 999px; background: #0891b2; color: #fff; border: none; cursor: pointer; }
      `}</style>
      <div className="rmdp-today-wrap">
        <button type="button" onClick={() => onToday && onToday(new Date())}>امروز</button>
      </div>
    </>
  );
}