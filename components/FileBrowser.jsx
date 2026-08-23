'use client';
import { useState, useEffect, useCallback } from 'react';

const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const FILE_BADGE = { pdf: '📕', doc: '📘', docx: '📘', rtf: '📘', xls: '📗', xlsx: '📗', csv: '📗', ppt: '📙', pptx: '📙', dwg: '📐', dxf: '📐', zip: '🗜️', rar: '🗜️', txt: '📝', mp4: '🎬', avi: '🎬', mkv: '🎬', mp3: '🎵' };

// ✅ کارت پوشه با بندانگشتیِ اولین تصویر داخل آن
function FolderThumb({ path, name, onClick }) {
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    let on = true;
    fetch(`/api/folder-preview?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => { if (on && d.preview) setPrev(d.preview); })
      .catch(() => {});
    return () => { on = false; };
  }, [path]);
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 rounded border p-2 w-[110px] h-[110px] justify-between bg-white hover:bg-teal-50">
      {prev
        ? <img src={`/api/serve-file?path=${encodeURIComponent(prev)}`} alt="" className="w-full h-16 object-cover rounded" />
        : <div className="text-4xl">📁</div>}
      <div className="text-[11px] font-bold truncate w-full text-center" title={name}>{name}</div>
    </button>
  );
}

// ✅ کارت فایل: تصویر برای عکس‌ها، نشان برای PDF/Word/Excel/نقشه
function FileThumb({ f, active, onClick }) {
  const ext = extOf(f.name);
  const isImg = IMG_EXT.includes(ext);
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded border p-2 w-[110px] h-[110px] justify-between ${active ? 'bg-[#FC7470]' : 'bg-white hover:bg-orange-50'}`}>
      {isImg
        ? <img src={`/api/serve-file?path=${encodeURIComponent(f.path)}`} alt="" className="w-full h-16 object-cover rounded" />
        : <div className="text-4xl">{FILE_BADGE[ext] || '📄'}</div>}
      <div className="text-[11px] font-bold truncate w-full text-center" title={f.name}>{f.name}</div>
    </button>
  );
}

export default function FileBrowser({ mode = 'folder', initial = '', title, onSelect, onClose }) {
  const [view, setView] = useState('thumb');
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState('');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pathInput, setPathInput] = useState('');

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

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setPathInput(t.trim()); load(t.trim()); }
    } catch { alert('دسترسی به کلیپ‌بورد ممکن نشد؛ داخل کادر Ctrl+V بزنید.'); }
  };

  // ✅ بازکردن پوشه یا اجرای فایل خارج از برنامه (ویندوز)
  const openOutside = async (p) => {
    if (!p) return;
    try {
      const res = await fetch('/api/open-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
      const d = await res.json();
      if (!d.success) alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const confirmSel = () => {
    if (mode === 'folder') { if (current) onSelect(current); }
    else if (selected) onSelect(selected.path);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[780px] max-w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-teal-700">
          <h3 className="font-bold">{title || (mode === 'folder' ? 'انتخاب پوشه' : 'انتخاب فایل')}</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button className="btn-primary px-3" onClick={() => load(parent)} disabled={!current} title="یک سطح بالا">↑</button>
            <input className="search-input w-full" value={pathInput} dir="ltr"
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goInput(); }}
              placeholder="مسیر را تایپ/بچسبانید و Enter بزنید" />
            <button className="btn-primary px-3" onClick={pasteFromClipboard} title="چسباندن از کلیپ‌بورد">📋</button>
            <button className="btn-primary px-3" onClick={() => setView(view === 'thumb' ? 'list' : 'thumb')} title="تغییر نما: بندانگشتی/فهرست">
              {view === 'thumb' ? '☰' : '🖼️'}
            </button>
            <button className="btn-primary px-3"
              onClick={() => openOutside(mode === 'file' && selected ? selected.path : current)}
              title={mode === 'file' && selected ? 'اجرای فایل انتخاب‌شده در ویندوز' : 'بازکردن این پوشه در ویندوز'}>
              {mode === 'file' && selected ? '▶' : '🗔'}
            </button>
          </div>

          <div className="overflow-y-auto bg-white rounded border border-gray-300" style={{ minHeight: 260, maxHeight: 420 }}>
            {loading && <div className="p-3 text-sm">در حال بارگذاری...</div>}
            {!loading && err && <div className="p-3 text-sm text-red-600">{err}</div>}

            {!loading && !err && view === 'list' && (
              <>
                <div className="px-3 py-1 bg-teal-100 text-xs font-bold">پوشه‌ها</div>
                {folders.length === 0 && <div className="p-2 text-xs text-gray-500">پوشه‌ای نیست.</div>}
                {folders.map((f) => (
                  <button key={f.path} className="w-full text-right px-3 py-2 hover:bg-teal-100 border-b border-gray-100 text-sm" onClick={() => load(f.path)}>
                    📁 {f.name}
                  </button>
                ))}
                {mode === 'file' && (
                  <>
                    <div className="px-3 py-1 bg-orange-100 text-xs font-bold">فایل‌ها</div>
                    {files.length === 0 && <div className="p-2 text-xs text-gray-500">فایلی نیست.</div>}
                    {files.map((f) => (
                      <button key={f.path}
                        className={`w-full text-right px-3 py-2 border-b border-gray-100 text-sm ${selected && selected.path === f.path ? 'bg-[#FC7470]' : 'hover:bg-orange-100'}`}
                        onClick={() => setSelected(f)}>
                        {FILE_BADGE[extOf(f.name)] || '📄'} {f.name}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}

            {!loading && !err && view === 'thumb' && (
              <div className="p-3 flex flex-wrap gap-2">
                {folders.map((f) => (
                  <FolderThumb key={f.path} path={f.path} name={f.name} onClick={() => load(f.path)} />
                ))}
                {mode === 'file' && files.map((f) => (
                  <FileThumb key={f.path} f={f} active={selected && selected.path === f.path} onClick={() => setSelected(f)} />
                ))}
                {folders.length === 0 && (mode !== 'file' || files.length === 0) && (
                  <div className="p-2 text-xs text-gray-500">موردی نیست.</div>
                )}
              </div>
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