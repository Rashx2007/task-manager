// components/SearchPanel.jsx
'use client';
import LoadingIndicator from "./LoadingIndicator";
import { useState, useRef, useEffect } from 'react';
import { showToast } from '@/lib/toast';

export default function SearchPanel({ onResult, onClose, onLoadingChange }) {
  const [taskID, setTaskID] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [busy, setBusy] = useState(false);
  const sequenceRef = useRef(0);
  useEffect(() => () => { sequenceRef.current++; onLoadingChange?.(false); }, [onLoadingChange]);

  // ✅ انحصار متقابل: وجود مقدار در هر فیلد → دو فیلد دیگر غیرفعال
  const hasTask = taskID.trim() !== '';
  const hasReq = requestNumber.trim() !== '';
  const hasProp = propertyCode.trim() !== '';

  const doSearch = async () => {
    const token = ++sequenceRef.current;
    const payload = { taskID, requestNumber, propertyCode };
    setBusy(true); onLoadingChange?.(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (token !== sequenceRef.current) return;
      if (d.success) onResult(d.data || [], { kind: 'simple', payload });
      else showToast('خطا: ' + (d.error || 'نامشخص'), 'error');
    } catch {
      showToast('خطا در ارتباط با سرور.', 'error');
    }
    if (token === sequenceRef.current) { setBusy(false); onLoadingChange?.(false); }
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
          {busy ? <LoadingIndicator inline label="جستجوی کار" /> : 'جستجو'}
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