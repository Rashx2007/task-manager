'use client';
import { useState, useEffect, useCallback } from 'react';

export default function FolderBrowser({ initial = '', onSelect, onClose }) {
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState('');
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (p) => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(p || '')}`);
      const d = await res.json();
      if (d.success) {
        setCurrent(d.current || '');
        setParent(d.parent || '');
        setFolders(d.folders || []);
      } else {
        setErr(d.error || 'خطا');
        setFolders([]);
      }
    } catch {
      setErr('خطا در ارتباط با سرور');
      setFolders([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(initial || ''); }, [initial, load]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center">
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[80vh] flex flex-col p-4">
        <h3 className="font-bold mb-3">انتخاب پوشه</h3>

        <div className="flex items-center gap-2 mb-3">
          <button
            className="btn-primary px-3"
            title="یک سطح بالا"
            onClick={() => load(current === '' ? '' : parent)}
          >
            ↑
          </button>
          <input className="search-input flex-1" value={current || '(انتخاب درایو)'} readOnly dir="ltr" />
        </div>

        <div className="flex-1 overflow-y-auto bg-white rounded border border-gray-300 min-h-[220px] max-h-[320px]">
          {loading && <div className="p-3 text-sm">در حال بارگذاری...</div>}
          {!loading && err && <div className="p-3 text-sm text-red-600">{err}</div>}
          {!loading && !err && folders.length === 0 && <div className="p-3 text-sm">پوشه‌ای وجود ندارد.</div>}
          {!loading && !err && folders.map((f) => (
            <button
              key={f.path}
              className="w-full text-right px-3 py-2 hover:bg-teal-100 border-b border-gray-100 text-sm"
              onClick={() => load(f.path)}
            >
              📁 {f.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <button className="btn-success" disabled={!current} onClick={() => onSelect(current)}>
            انتخاب این پوشه
          </button>
          <button className="btn-danger" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </div>
  );
}