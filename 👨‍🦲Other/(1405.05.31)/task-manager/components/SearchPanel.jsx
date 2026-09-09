'use client';
import { useState } from 'react';

export default function SearchPanel({ onResult, onClose }) {
  const [taskID, setTaskID] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [busy, setBusy] = useState(false);

  const doSearch = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskID, requestNumber, propertyCode }),
      });
      const d = await res.json();
      if (d.success) { onResult(d.data || []); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  return (
    <div className="bg-[#CCE6DF] border-b border-teal-700 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-bold mb-1">کد کار</label>
          <input className="search-input" value={taskID} onChange={(e) => setTaskID(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">شماره درخواست/ثبت</label>
          <input className="search-input" value={requestNumber} onChange={(e) => setRequestNumber(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">شماره اموال</label>
          <input className="search-input" value={propertyCode} onChange={(e) => setPropertyCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        </div>
        <button className="btn-success" disabled={busy} onClick={doSearch}>{busy ? '...' : 'جستجو'}</button>
        <button className="btn-danger" onClick={onClose}>بستن</button>
      </div>
    </div>
  );
}