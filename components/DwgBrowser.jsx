'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function DwgBrowser({ defaultPath = '', onClose, onSelect }) {
  const [path, setPath] = useState('');
  const [roots, setRoots] = useState([]);
  const [dirs, setDirs] = useState([]);
  const [files, setFiles] = useState([]);
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const nativeRef = useRef(null);
  const startedRef = useRef(false);

  const load = useCallback(async (p) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/browse-dwg?path=${encodeURIComponent(p || '')}`);
      const d = await res.json();
      if (d.success) {
        setPath(d.path || '');
        setRoots(d.roots || []);
        setDirs(d.dirs || []);
        setFiles(d.files || []);
        setMsg('');
      } else setMsg('خطا: ' + d.error);
    } catch {
      setMsg('خطا در ارتباط با سرور');
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    load(defaultPath || '');
  }, [defaultPath, load]);

  const up = () => {
    if (!path) { load(''); return; }
    const parts = path.replace(/[\\/]+$/, '').split(/[\\/]+/);
    if (parts.length <= 1) { load(''); return; }
    parts.pop();
    load(parts.join('\\'));
  };

  // ✅ انتخاب با دیالوگ بومی ویندوز → سرور مسیر واقعی را resolve می‌کند
  const pickNative = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const res = await fetch('/api/browse-dwg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, size: f.size }),
      });
      const d = await res.json();
      if (d.success && d.full) onSelect(d.full);
      else setMsg(d.error || 'فایل انتخاب‌شده در ریشه‌های نقشه یافت نشد؛ از مرور سرور استفاده کنید.');
    } catch {
      setMsg('خطا در ارتباط با سرور');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1000px] max-w-full max-h-[92vh] flex flex-col p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">انتخاب فایل نقشه (DWG)</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="flex gap-2 items-center mb-2">
          <button type="button" className="btn-primary px-3" title="یک سطح بالا" onClick={up}>↑</button>
          <button type="button" className="btn-primary px-3" title="به‌روزآوری" onClick={() => load(path)}>🔄</button>
          <input className="search-input flex-1" dir="ltr" value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(path); }} />
          <button type="button" className="btn-primary px-3" title="رفتن به مسیر" onClick={() => load(path)}>➜</button>
          <button type="button" className="btn-success px-3" title="دیالوگ بازکردن فایل ویندوز"
            onClick={() => nativeRef.current && nativeRef.current.click()}>🗔 دیالوگ ویندوز</button>
          <input ref={nativeRef} type="file" accept=".dwg" style={{ display: 'none' }} onChange={pickNative} />
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          {roots.map((r) => (
            <button key={r} type="button" className="btn-primary px-2 py-1 text-xs" onClick={() => load(r)}>{r}</button>
          ))}
        </div>

        {msg && <div className="mb-2 bg-red-100 text-red-800 rounded px-2 py-1 text-sm font-bold">{msg}</div>}

        <div className="flex-1 min-h-[300px] overflow-auto bg-white rounded border border-gray-400">
          {busy && <div className="p-3 text-sm font-bold">در حال خواندن…</div>}
          {!busy && dirs.length === 0 && files.length === 0 && (
            <div className="p-3 text-sm text-gray-600">موردی یافت نشد؛ مسیر را بررسی کنید یا از «دیالوگ ویندوز» استفاده کنید.</div>
          )}
          {dirs.map((d) => (
            <div key={d.full} className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-teal-50 border-b border-gray-100"
              onDoubleClick={() => load(d.full)}>
              <span>📁</span><span className="text-sm font-bold">{d.name}</span>
              <button type="button" className="btn-primary px-2 py-0.5 text-xs mr-auto" onClick={() => load(d.full)}>بازکن</button>
            </div>
          ))}
          {files.map((f) => (
            <div key={f.full}
              className={`flex items-center gap-2 px-3 py-1 cursor-pointer border-b border-gray-100 ${sel === f.full ? 'bg-teal-200' : 'hover:bg-teal-50'}`}
              onClick={() => setSel(f.full)}
              onDoubleClick={() => onSelect(f.full)}>
              <span>📄</span><span className="text-sm">{f.name}</span>
              <span className="text-[11px] text-gray-500 mr-auto">{f.size ? (f.size / 1024 / 1024).toFixed(1) + ' MB' : ''}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <button type="button" className="btn-success" disabled={!sel} onClick={() => sel && onSelect(sel)}>انتخاب این نقشه</button>
          <button type="button" className="btn-danger" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </div>
  );
}