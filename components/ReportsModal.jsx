// components/ReportsModal.jsx
'use client';
import { useState } from 'react';
import ReportViewer from './ReportViewer';

const REPORTS = [
  {
    group: 'گزارش لیست کارها',
    items: [
      { title: 'گزارش لیست کارها (Text)', type: 'task-list-text', output: 'text' },
      { title: 'گزارش لیست کارها (Excel)', type: 'task-list-excel', output: 'excel' },
      { title: 'گزارش لیست کارهای ثابت (Text)', type: 'fixed-tasks-text', output: 'text' },
      { title: 'گزارش لیست کارهای ثابت (Excel)', type: 'fixed-tasks-excel', output: 'excel' },
    ],
  },
  {
    group: 'گزارش درخواست‌ها',
    items: [
      { title: 'گزارش درخواست‌ها (Text)', type: 'request-text', output: 'text' },
      { title: 'گزارش درخواست‌ها (Excel - ۵ شیت)', type: 'requests-excel', output: 'excel' },
    ],
  },
  {
    group: 'گزارش انجام‌دهنده کارها',
    items: [
      { title: 'گزارش انجام‌دهنده کارها (Excel)', type: 'functor-excel', output: 'excel' },
    ],
  },
  {
    group: 'گزارش کار روزانه',
    items: [
      { title: 'گزارش کار روزانه (Text)', type: 'daily-text', output: 'text', needsDateRange: true },
    ],
  },
  {
    group: 'گزارش اقدامات و پروژه‌ها',
    items: [
      { title: 'گزارش اقدامات و پروژه‌ها (Text)', type: 'considerable-text', output: 'text', needsDateRange: true, withTaskIdToggle: true },
    ],
  },
  {
    group: 'گزارش کارها بر اساس تاریخ (Text)',
    items: [
      { title: 'گزارش کلی کارها بر اساس تاریخ', type: 'all-tasks-text', output: 'text', needsDateRange: true },
      { title: 'گزارش کارهای انجام شده بر اساس تاریخ', type: 'finished-tasks-text', output: 'text', needsDateRange: true },
      { title: 'گزارش کارهای انجام شده بر اساس تاریخ و دستگاه (Excel)', type: 'asset-date-excel', output: 'excel', needsDateRange: true, needsAsset: true },
    ],
  },
  {
    group: 'گزارش کارها بر اساس تاریخ (Excel)',
    items: [
      { title: 'گزارش کلی کارها بر اساس تاریخ', type: 'all-tasks-excel', output: 'excel', needsDateRange: true },
      { title: 'گزارش کارهای انجام شده بر اساس تاریخ', type: 'finished-tasks-excel', output: 'excel', needsDateRange: true },
    ],
  },
];

export default function ReportsModal({ onClose }) {
  const [active, setActive] = useState(null);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[720px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-teal-800/20">
            <h3 className="text-lg font-bold">📊 گزارش‌ها</h3>
            <button type="button" onClick={onClose} className="text-xl">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {REPORTS.map((g) => (
              <div key={g.group}>
                <div className="text-sm font-bold text-teal-900 mb-2 border-b border-teal-700/30 pb-1">{g.group}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {g.items.map((it) => (
                    <button key={it.type} onClick={() => setActive(it)} className="btn-primary text-right">
                      {it.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {active && <ReportViewer config={active} onClose={() => setActive(null)} />}
    </>
  );
}