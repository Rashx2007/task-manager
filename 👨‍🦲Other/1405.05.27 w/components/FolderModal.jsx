'use client';
import { useState, useEffect } from 'react';
import FileBrowser from './FileBrowser';

const SHARE_FOLDER = 'E:\\Share(Tasks)\\Elhami';

export default function FolderModal({ taskId, onClose, onSaved }) {
  const [fileName, setFileName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [asked, setAsked] = useState(false);
  const [allowCopy, setAllowCopy] = useState(true); // ✅ #3
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [fileBrowserBase, setFileBrowserBase] = useState('');
  const [pendingFileAfterFolder, setPendingFileAfterFolder] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (taskId) {
      fetch(`/api/folder?taskId=${taskId}`).then((r) => r.json()).then((d) => {
        if (d.success && d.data) { setFileName(d.data.FileName || ''); setFolderPath(d.data.FolderPath || ''); }
      }).catch(() => {});
    }
  }, [taskId]);

  const fullPath = () => {
    const f = (folderPath || '').trim();
    const n = (fileName || '').trim();
    if (!n) return f;
    if (/^([A-Za-z]:[\\/]|\\\\)/.test(n)) return n;
    if (!f) return n;
    const base = /[\\/]$/.test(f) ? f.slice(0, -1) : f;
    if (base.endsWith(n)) return base;
    return base + '\\' + n;
  };

  const openPath = async (p) => {
    try {
      const res = await fetch('/api/open-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
      const d = await res.json();
      if (!d.success) alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const copyPath = async () => {
    const p = fullPath();
    if (!p) { alert('مسیری برای کپی وجود ندارد.'); return; }
    try { await navigator.clipboard.writeText(p); alert('مسیر در کلیپ‌بورد کپی شد.'); }
    catch { alert('کپی ممکن نشد.'); }
  };

  // ✅ #4: پیش‌فرض مرورگر فایل = پوشهٔ دستگاه؛ اگر نبود، اول تعیین پوشه
  const openFileBrowser = async () => {
    let base = (folderPath || '').trim();
    if (!base) {
      try {
        const res = await fetch(`/api/asset-folder?taskId=${taskId}`);
        const d = await res.json();
        if (d.success && d.folderPath) { base = d.folderPath; setFolderPath(base); }
      } catch {}
    }
    if (!base) {
      if (confirm('پوشه‌ای برای این کار/دستگاه تعیین نشده است. ابتدا پوشه را تعیین می‌کنید؟')) {
        setPendingFileAfterFolder(true);
        setShowFolderBrowser(true);
      }
      return;
    }
    setFileBrowserBase(base);
    setShowFileBrowser(true);
  };

  // ✅ #2: کپی آینه‌ای کل محتوای پوشه
  const copyMirror = async (destDir) => {
    const f = (folderPath || '').trim();
    const n = (fileName || '').trim();
    const src = f || (/^([A-Za-z]:[\\/]|\\\\)/.test(n) ? n : '');
    if (!src) { alert('مسیری برای کپی وجود ندارد.'); return; }
    try {
      const res = await fetch('/api/copy-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: [src], destDir, mirrorDir: true }),
      });
      const d = await res.json();
      if (d.success) alert('کل محتوای پوشه به‌صورت آینه‌ای کپی شد به:\n' + d.dest);
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  // ✅ #3: تأیید اجازه کپی قبل از عمل
  const handleCopyClick = async () => {
    setAsked(true);
    if (!confirm('کل محتوای پوشه در مقصد آینه‌ای کپی شود؟')) return;
    const d = prompt('پوشهٔ مقصد برای کپی:', SHARE_FOLDER);
    if (d) await copyMirror(d);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, fileName, folderPath }) });
      const d = await res.json();
      if (d.success) { alert('ذخیره شد.'); if (onSaved) onSaved(); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const handleClose = () => {
    if (allowCopy && !asked && ((folderPath || '').trim() || (fileName || '').trim())) {
      setAsked(true);
      if (confirm('فایل‌ها/پوشه در پوشهٔ اشتراکی کپی شوند؟')) copyMirror(SHARE_FOLDER);
    }
    onClose();
  };

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
         onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[680px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">پوشهٔ ضمائم — کد کار: {taskId}</h3>

        {/* ✅ #1: پوشه بالا */}
        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">مسیر پوشه</label>
          <div className="flex gap-2">
            <input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} className={inp} dir="ltr" />
            <button type="button" className="btn-primary whitespace-nowrap"
                    onClick={() => { setPendingFileAfterFolder(false); setShowFolderBrowser(true); }}>انتخاب پوشه...</button>
          </div>
        </div>

        {/* ✅ #1: فایل پایین */}
        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">نام فایل</label>
          <div className="flex gap-2">
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} className={inp} dir="ltr" />
            <button type="button" className="btn-primary whitespace-nowrap" onClick={openFileBrowser}>انتخاب فایل...</button>
          </div>
        </div>

        {/* ✅ #3: اجازه کپی */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} className="w-4 h-4" />
          <span className="text-sm font-bold">اجازه کپی فایل‌ها در پوشهٔ اشتراکی</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={saving} className="btn-success">{saving ? '...' : 'ذخیره'}</button>
          <button onClick={() => openPath(folderPath)} disabled={!folderPath} className="btn-primary">بازکردن پوشه</button>
          <button onClick={() => openPath(fullPath())} disabled={!folderPath && !fileName} className="btn-primary">بازکردن فایل</button>
          <button onClick={copyPath} disabled={!folderPath && !fileName} className="btn-primary">کپی مسیر</button>
          <button onClick={handleCopyClick} disabled={!folderPath && !fileName} className="btn-primary">کپی فایل</button>
          <button onClick={handleClose} className="btn-danger">بستن</button>
        </div>
      </div>

      {showFolderBrowser && (
        <FileBrowser mode="folder" initial={folderPath} title="انتخاب پوشه"
          onSelect={(p) => {
            setFolderPath(p); setShowFolderBrowser(false);
            if (pendingFileAfterFolder) { setPendingFileAfterFolder(false); setFileBrowserBase(p); setShowFileBrowser(true); }
          }}
          onClose={() => { setShowFolderBrowser(false); setPendingFileAfterFolder(false); }} />
      )}
      {showFileBrowser && (
        <FileBrowser mode="file" initial={fileBrowserBase || folderPath} title="انتخاب فایل ضمیمه"
          onSelect={(p) => { setFileName(p); setShowFileBrowser(false); }}
          onClose={() => setShowFileBrowser(false)} />
      )}
    </div>
  );
}