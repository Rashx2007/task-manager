'use client';

export default function Toolbar({
  onNewTask, onEdit, onDelete, onComplete,
  onSearch, onComprehensiveSearch, onRefresh, onReport, onBackup, onSettings,
onMoveFixed, onCorrectPrio, disableNew = false,
}) {
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
	{ label: 'تنظیمات', icon: '⚙️', action: onSettings, color: 'bg-gray-600 hover:bg-gray-700' },
	{ label: 'جلو بردن ثابت‌ها', icon: '⏩', action: onMoveFixed, color: 'bg-cyan-600 hover:bg-cyan-700' },
{ label: 'اصلاح الویت‌ها', icon: '', action: onCorrectPrio, color: 'bg-fuchsia-600 hover:bg-fuchsia-700' },
  ];

  return (
    <div className="bg-[#D8C9B4] shadow-md p-2">
      <div className="bg-[#F7C4A5] rounded-t px-4 py-2 mb-2">
        <h1 className="text-xl font-bold text-[#1D1A31]">سیستم مدیریت کارها (امور)</h1>
      </div>
      <div className="flex flex-wrap gap-2 px-2">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            onClick={btn.action}
            disabled={btn.disabled}
            className={`${btn.color} text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span>{btn.icon}</span>
            <span>{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}