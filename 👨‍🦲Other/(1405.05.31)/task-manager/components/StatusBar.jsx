'use client';

export default function StatusBar({ count, today }) {
  return (
    <div className="fixed bottom-0 right-0 left-0 bg-[#5F7470] text-white text-xs px-4 py-1 flex justify-between">
      <span>تعداد کارهای نمایش‌داده‌شده: {count}</span>
      <span>امروز: {today}</span>
    </div>
  );
}