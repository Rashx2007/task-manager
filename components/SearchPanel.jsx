// components/SearchPanel.jsx
'use client';
import { useState } from 'react';
import { showToast } from '@/lib/toast';

export default function SearchPanel({ onResult, onClose }) {
  const [taskID, setTaskID] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [busy, setBusy] = useState(false);

  // ✅ انحصار متقابل: وجود مقدار در هر فیلد → دو فیلد دیگر غیرفعال
  const hasTask = taskID.trim() !== '';
  const hasReq = requestNumber.trim() !== '';
  const hasProp = propertyCode.trim() !== '';

  const doSearch = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskID, requestNumber, propertyCode }),
      });
      const d = await res.json();
      if (d.success) onResult(d.data || []);
      else showToast('خطا: ' + (d.error || 'نامشخص'), 'error');
    } catch {
      showToast('خطا در ارتباط با سرور.', 'error');
    }
    setBusy(false);
  };

  // ✅ پاک‌کردن = خالی‌کردن هر سه → هر سه دوباره فعال
  const clearAll = () => {
    setTaskID('');
    setRequestNumber('');
    setPropertyCode('');
  };

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    } else if (e.key === 'Escape') onClose();
  };

  const inp = 'search-input w-full';
  const dis = 'opacity-50 cursor-not-allowed';

  return (
    <div className="bg-[#95ABB9] border-b border-teal-900/30 p-3" dir="rtl">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-bold mb-1">کد کار</label>
          <input
            className={inp + (hasReq || hasProp ? ' ' + dis : '')}
            value={taskID}
            onChange={(e) => setTaskID(e.target.value)}
            disabled={hasReq || hasProp}
            onKeyDown={onKey}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-bold mb-1">شماره درخواست/ثبت</label>
          <input
            className={inp + (hasTask || hasProp ? ' ' + dis : '')}
            value={requestNumber}
            onChange={(e) => setRequestNumber(e.target.value)}
            disabled={hasTask || hasProp}
            onKeyDown={onKey}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-bold mb-1">شماره اموال</label>
          <input
            className={inp + (hasTask || hasReq ? ' ' + dis : '')}
            value={propertyCode}
            onChange={(e) => setPropertyCode(e.target.value)}
            disabled={hasTask || hasReq}
            onKeyDown={onKey}
          />
        </div>

        <button
          type="button"
          className="btn-primary whitespace-nowrap"
          onClick={doSearch}
          disabled={busy || (!hasTask && !hasReq && !hasProp)}
          title="Enter"
        >
          {busy ? '...' : 'جستجو'}
        </button>
        <button type="button" className="btn-primary whitespace-nowrap" onClick={clearAll}>
          پاک‌کردن
        </button>
        <button type="button" className="btn-danger whitespace-nowrap" onClick={onClose}>
          بستن
        </button>
      </div>
    </div>
  );
}