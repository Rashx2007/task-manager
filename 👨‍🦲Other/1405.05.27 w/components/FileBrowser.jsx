'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export default function FileBrowser({ mode = 'folder', initial = '', title, onSelect, onClose }) {
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState('');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pathInput, setPathInput] = useState('');
  const inputRef = useRef(null);

  const load = useCallback(async (p) => {
    setLoading(true); setErr(''); setSelected(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(p || '')}`);
      const d = await res.json();
      if (d.success) {
        setCurrent(d.current || ''); setPathInput(d.current || '');
        setParent(d.parent || ''); setFolders(d.folders || []); setFiles(d.files || []);
      } else { setErr(d.error || 'خطا'); setFolders([]); setFiles([]); }
    } catch { setErr('خطا در ارتباط با سرور'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(initial || ''); }, [initial, load]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const goInput = () => { const p = pathInput.trim(); if (p) load(p); };

  // ✅ #5: چسباندن آدرس از کلیپ‌بورد
  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setPathInput(t.trim()); load(t.trim()); }
    } catch {
      alert('دسترسی به کلیپ‌بورد ممکن نشد؛ داخل کادر کلیک کنید و Ctrl+V بزنید.');
      inputRef.current?.focus();
    }
  };

  const confirmSel = () => {
    if (mode === 'folder') { if (current) onSelect(current); }
    else if (selected) onSelect(selected.path);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[680px] max-w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-teal-700">
          <h3 className="font-bold">{title || (mode === 'folder' ? 'انتخاب پوشه' : 'انتخاب فایل')}</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {/* نوار آدرس: قابل تایپ + چسباندن + Enter */}
          <div className="flex items-center gap-2">
            <button className="btn-primary px-3" onClick={() => load(parent)} disabled={!current} title="یک سطح بالا">↑</button>
            <input ref={inputRef} className="search-input w-full" value={pathInput} dir="ltr"
                   onChange={(e) => setPathInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') goInput(); }}
                   placeholder="مسیر را تایپ/بچسبانید و Enter بزنید" />
            <button className="btn-primary px-3" onClick={pasteFromClipboard} title="چسباندن از کلیپ‌بورد">📋</button>
          </div>

          <div className="overflow-y-auto bg-white rounded border border-gray-300" style={{ minHeight: 240, maxHeight: 380 }}>
            {loading && <div className="p-3 text-sm">در حال بارگذاری...</div>}
            {!loading && err && <div className="p-3 text-sm text-red-600">{err}</div>}
            {!loading && !err && (
              <>
                {/* ✅ پوشه‌ها بالا */}
                <div className="px-3 py-1 bg-teal-100 text-xs font-bold">پوشه‌ها</div>
                {folders.length === 0 && <div className="p-2 text-xs text-gray-500">پوشه‌ای نیست.</div>}
                {folders.map((f) => (
                  <button key={f.path} className="w-full text-right px-3 py-2 hover:bg-teal-100 border-b border-gray-100 text-sm" onClick={() => load(f.path)}>
                    📁 {f.name}
                  </button>
                ))}
                {/* ✅ فایل‌ها پایین */}
                {mode === 'file' && (
                  <>
                    <div className="px-3 py-1 bg-orange-100 text-xs font-bold">فایل‌ها</div>
                    {files.length === 0 && <div className="p-2 text-xs text-gray-500">فایلی نیست.</div>}
                    {files.map((f) => (
                      <button key={f.path}
                        className={`w-full text-right px-3 py-2 border-b border-gray-100 text-sm ${selected && selected.path === f.path ? 'bg-[#FC7470]' : 'hover:bg-orange-100'}`}
                        onClick={() => setSelected(f)}>
                        📄 {f.name}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn-success" onClick={confirmSel} disabled={mode === 'folder' ? !current : !selected}>
              {mode === 'folder' ? 'انتخاب این پوشه' : 'انتخاب این فایل'}
            </button>
            <button className="btn-danger" onClick={onClose}>انصراف</button>
          </div>
        </div>
      </div>
    </div>
  );
}