'use client';
import { useState } from 'react';

export default function Toolbar({
  onNewTask, onEdit, onDelete, onComplete,
  onSearch, onComprehensiveSearch, onRefresh, onReport, onBackup,
  onAssets, onSettings, onPersons, onCorrectPrio, onPriorityIncrease, disableNew = false,
}) {
  const [prioOpen, setPrioOpen] = useState(false);
  const buttons = [
    { label: 'جدید', icon: '➕', action: onNewTask, color: 'bg-teal-500 hover:bg-teal-600', disabled: disableNew },
    { label: 'ویرایش', icon: '✏️', action: onEdit, color: 'bg-blue-500 hover:bg-blue-600' },
    { label: 'حذف', icon: '🗑️', action: onDelete, color: 'bg-red-500 hover:bg-red-600' },
    { label: 'اتمام کار', icon: '✅', action: onComplete, color: 'bg-green-500 hover:bg-green-600' },
    { label: 'جستجو', icon: '🔍', action: onSearch, color: 'bg-purple-500 hover:bg-purple-600' },
    { label: 'جستجو جامع', icon: '🔎', action: onComprehensiveSearch, color: 'bg-indigo-500 hover:bg-indigo-600' },
    { label: 'گزارش', icon: '📊', action: onReport, color: 'bg-pink-500 hover:bg-pink-600' },
    { label: 'بروزرسانی', icon: '🔄', action: onRefresh, color: 'bg-orange-500 hover:bg-orange-600' },
    { label: 'پشتیبان', icon: '💾', action: onBackup, color: 'bg-slate-500 hover:bg-slate-600' },
    { label: 'دستگاه‌ها', icon: '🛠️', action: onAssets, color: 'bg-teal-600 hover:bg-teal-700' },
    { label: 'اشخاص', icon: '📇', action: onPersons, color: 'bg-lime-600 hover:bg-lime-700' },
    { label: 'تنظیمات', icon: '⚙️', action: onSettings, color: 'bg-gray-600 hover:bg-gray-700' },
  ];

  return (
    <div className="bg-[#D8C9B4] shadow-md p-2">
      <div className="bg-[#F7C4A5] rounded-t px-4 py-2 mb-2">
        <h1 className="text-xl font-bold text-[#1D1A31]">سیستم مدیریت کارها (امور)</h1>
      </div>
      <div className="flex flex-wrap gap-2 px-2">
        {buttons.map((btn) => (
          <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
            className={`${btn.color} text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed`}>
            <span>{btn.icon}</span><span>{btn.label}</span>
          </button>
        ))}

        {/* منوی آبشاری الویت — معادل منوی دسکتاپ */}
        <div className="relative">
          <button onClick={() => setPrioOpen((o) => !o)}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center gap-2 text-sm">
            🎯 الویت ▾
          </button>
          {prioOpen && (
            <div className="absolute z-50 mt-1 w-44 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
              <button className="w-full text-right px-3 py-2 hover:bg-teal-100 text-sm font-bold"
                onClick={() => { setPrioOpen(false); onPriorityIncrease && onPriorityIncrease(); }}>
                ویرایش الویت
              </button>
              <button className="w-full text-right px-3 py-2 hover:bg-teal-100 text-sm font-bold"
                onClick={() => { setPrioOpen(false); onCorrectPrio && onCorrectPrio(); }}>
                اصلاح عبارت
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}