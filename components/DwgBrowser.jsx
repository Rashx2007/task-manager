'use client';
import { useState, useEffect } from 'react';

const imgUrl = (p) => (p ? `/api/file-img?path=${encodeURIComponent(p)}` : null);

export default function DwgBrowser({ onClose, onSelect, defaultPath = 'D:\\(فنی)', title = 'انتخاب فایل نقشه (DWG)' }) {
  const [drives, setDrives] = useState([]);
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState('');
  const [isRoot, setIsRoot] = useState(false);
  const [dirs, setDirs] = useState([]);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState('grid');

  const load = async (p) => {
    try {
      const res = await fetch(`/api/browse-dwg?path=${encodeURIComponent(p || '')}`);
      const d = await res.json();
      if (!d.success) {
        if (p) { load(''); return; } // مسیر پیش‌فرض نبود → صفحهٔ درایوها
        alert('خطا: ' + d.error); return;
      }
      if (d.drives) {
        setDrives(d.drives); setCurrent(''); setDirs([]); setFiles([]); setIsRoot(false); setSelected('');
      } else {
        setDrives([]); setCurrent(d.current); setParent(d.parent); setIsRoot(!!d.isRoot);
        setDirs(d.dirs || []); setFiles(d.files || []); setSelected('');
      }
    } catch (e) { alert('خطا در مرور: ' + e.message); }
  };

  useEffect(() => { load(defaultPath); }, []);

  const join = (name) => (current.endsWith('\\') ? current + name : current + '\\' + name);
  const goUp = () => {
    if (!current) return;
    if (isRoot) load('');
    else load(parent);
  };
  // ✅ چسباندن مسیر از کلیپ‌بورد
  const pastePath = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) { alert('کلیپ‌بورد خالی است.'); return; }
      load(t);
    } catch { alert('دسترسی به کلیپ‌بورد ممکن نشد (مرورگر اجازه نداد).'); }
  };
  // ✅ باز کردن پوشهٔ جاری در ویندوز
  const openInWindows = async () => {
    if (!current) return;
    const res = await fetch(`/api/open-folder?path=${encodeURIComponent(current)}`);
    const d = await res.json();
    if (!d.success) alert('خطا: ' + d.error);
  };

  const Thumb = ({ src }) => (src ? <img src={src} alt="" className="h-16 w-20 object-cover rounded border bg-white" /> : null);

  return (
    <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[900px] max-w-full max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-teal-700">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="flex items-center gap-2 p-3">
          <button className="btn-primary px-3" onClick={goUp} disabled={!current} title="سطح بالاتر / درایوها">⬆</button>
          <button className="btn-primary px-3" onClick={pastePath} title="چسباندن مسیر از کلیپ‌بورد">📋</button>
          <button className="btn-primary px-3" onClick={openInWindows} disabled={!current} title="باز کردن این پوشه در ویندوز">🖥</button>
          <input dir="ltr" className="search-input flex-1" value={current || '(انتخاب درایو)'} readOnly />
          <button className={`px-3 ${view === 'grid' ? 'btn-primary' : 'btn'}`} onClick={() => setView('grid')} title="نمایش شبکه‌ای با بندانگشتی">▦</button>
          <button className={`px-3 ${view === 'list' ? 'btn-primary' : 'btn'}`} onClick={() => setView('list')} title="نمایش لیستی">☰</button>
        </div>

        <div className="flex-1 overflow-auto bg-white mx-3 rounded border p-3" style={{ minHeight: 300 }}>
          {drives.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {drives.map((d) => (
                <button key={d} className="border rounded p-3 hover:bg-teal-50 text-sm font-bold flex items-center gap-2" onClick={() => load(d)}>
                  <span className="text-3xl">💽</span> <span dir="ltr">{d}</span>
                </button>
              ))}
            </div>
          )}

          {current && view === 'grid' && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {dirs.map((d) => (
                <button key={'d' + d.name} className="border rounded p-2 hover:bg-teal-50 flex flex-col items-center gap-1" onClick={() => load(join(d.name))}>
                  {d.preview ? <Thumb src={imgUrl(d.preview)} /> : <span className="text-4xl">📁</span>}
                  <span className="text-[11px] font-bold break-all text-center">{d.name}</span>
                </button>
              ))}
              {files.map((f) => (
                <button key={'f' + f.name} className={`border rounded p-2 flex flex-col items-center gap-1 ${selected === f.name ? 'bg-yellow-100 ring-2 ring-teal-600' : 'hover:bg-yellow-50'}`} onClick={() => setSelected(f.name)}>
                  {f.preview ? <Thumb src={imgUrl(f.preview)} /> : <span className="text-4xl">🗺</span>}
                  <span className="text-[11px] font-bold break-all text-center" dir="ltr">{f.name}</span>
                </button>
              ))}
              {dirs.length === 0 && files.length === 0 && <div className="col-span-full text-center text-gray-500 py-10">این پوشه خالی است.</div>}
            </div>
          )}

          {current && view === 'list' && (
            <div>
              {dirs.map((d) => (
                <div key={'d' + d.name} className="px-2 py-1 hover:bg-teal-50 cursor-pointer text-sm flex items-center gap-2" onClick={() => load(join(d.name))}>
                  {d.preview ? <img src={imgUrl(d.preview)} alt="" className="h-8 w-10 object-cover rounded border" /> : <span>📁</span>} {d.name}
                </div>
              ))}
              {files.map((f) => (
                <div key={'f' + f.name} className={`px-2 py-1 cursor-pointer text-sm flex items-center gap-2 ${selected === f.name ? 'bg-yellow-100 font-bold' : 'hover:bg-yellow-50'}`} onClick={() => setSelected(f.name)}>
                  {f.preview ? <img src={imgUrl(f.preview)} alt="" className="h-8 w-10 object-cover rounded border" /> : <span>🗺</span>} <span dir="ltr">{f.name}</span>
                </div>
              ))}
              {dirs.length === 0 && files.length === 0 && <div className="text-center text-gray-500 py-10">این پوشه خالی است.</div>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-3 border-t border-teal-700">
          <button className="btn-success" disabled={!selected} onClick={() => onSelect(join(selected))}>انتخاب این نقشه</button>
          <button className="btn-danger" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </div>
  );
}