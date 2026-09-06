'use client';

// ✅ دکمهٔ «امروز» زیر اعداد تقویم — با کال‌بک مستقیم onToday (بدون وابستگی به onChange داخلی کتابخانه)
export default function TodayPlugin({ onToday }) {
  return (
    <>
      <style>{`
        .rmdp-calendar { flex-wrap: wrap !important; }
        .rmdp-today-wrap {
          order: 99;
          flex-basis: 100%;
          display: flex;
          justify-content: center;
          padding: 4px 0 6px;
        }
        .rmdp-today-wrap button {
          font-size: 11px !important;
          padding: 2px 16px !important;
          border-radius: 8px;
          background: #0891b2;
          color: #fff;
          border: none;
          cursor: pointer;
        }
      `}</style>
      <div className="rmdp-today-wrap">
        <button type="button" onClick={() => onToday && onToday(new Date())}>امروز</button>
      </div>
    </>
  );
}