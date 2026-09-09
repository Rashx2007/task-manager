'use client';
import { useState, useEffect } from 'react';
import FileBrowser from './FileBrowser';

const DEFAULT_ASSET_FOLDER = 'D:\\(فنّی)';
const SHARE_FOLDER = 'E:\\Share(Tasks)\\Elhami';

export default function FolderModal({ taskId, onClose, onSaved }) {
  const [fileName, setFileName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [asked, setAsked] = useState(false);
  const [allowCopy, setAllowCopy] = useState(true);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [browserInitial, setBrowserInitial] = useState('');
  const [waitingAssetFolder, setWaitingAssetFolder] = useState(false);
  const [assetId, setAssetId] = useState(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // بارگذاری رکورد Folder_tbl + پیش‌فرض هوشمند (پوشهٔ دستگاه + زیرپوشهٔ کار)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/folder?taskId=${taskId}`);
        const d = await r.json();
        if (d.success && d.data) {
          setFileName(d.data.FileName || '');
          if (d.data.FolderPath) { setFolderPath(d.data.FolderPath); return; }
        }
        const res = await fetch(`/api/task-folder?taskId=${taskId}`);
        const t = await res.json();
        if (!t.success) return;
        setAssetId(t.assetId);
        if (t.assetFolder) { setFolderPath(t.subPath); return; }
        if (confirm('پوشه‌ای برای این دستگاه تعیین نشده است. ابتدا پوشهٔ دستگاه را تعیین می‌کنید؟')) {
          setWaitingAssetFolder(true);
          setBrowserInitial(DEFAULT_ASSET_FOLDER);
          setShowFolderBrowser(true);
        }
      } catch {}
    })();
  }, [taskId]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

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

  const copyMirror = async (destDir) => {
    const f = (folderPath || '').trim();
    const n = (fileName || '').trim();
    const src = f || (/^([A-Za-z]:[\\/]|\\\\)/.test(n) ? n : '');
    if (!src) { alert('مسیری برای کپی وجود ندارد.'); return; }
    try {
      const res = await fetch('/api/copy-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: [src], destDir, mirrorDir: true }) });
      const d = await res.json();
      if (d.success) alert('کل محتوای پوشه به‌صورت آینه‌ای کپی شد به:\n' + d.dest);
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

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
      if (d.success) {
        setAsked(true);
        if (allowCopy) await copyMirror(SHARE_FOLDER);
        alert('ذخیره شد.');
        if (onSaved) onSaved();
        onClose();
      } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const handleClose = () => {
    const has = (folderPath || '').trim() || (fileName || '').trim();
    if (has && !asked) {
      setAsked(true);
      if (allowCopy && confirm('طبق تیک «اجازه کپی»، محتوا در پوشهٔ اشتراکی کپی شود؟')) copyMirror(SHARE_FOLDER);
    }
    onClose();
  };

  const openFolderBrowser = async () => {
    let initial = (folderPath || '').trim();
    try {
      const res = await fetch(`/api/task-folder?taskId=${taskId}`);
      const d = await res.json();
      if (d.success) {
        setAssetId(d.assetId);
        if (!d.assetFolder) {
          if (confirm('پوشه‌ای برای این دستگاه تعیین نشده است. ابتدا پوشهٔ دستگاه را تعیین می‌کنید؟')) {
            setWaitingAssetFolder(true);
            setBrowserInitial(DEFAULT_ASSET_FOLDER);
            setShowFolderBrowser(true);
          }
          return;
        }
        initial = d.subPath || initial;
      }
    } catch {}
    setBrowserInitial(initial || DEFAULT_ASSET_FOLDER);
    setShowFolderBrowser(true);
  };

  const openFileBrowser = () => {
    setBrowserInitial((folderPath || '').trim() || DEFAULT_ASSET_FOLDER);
    setShowFileBrowser(true);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[680px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">پوشهٔ ضمائم — کد کار: {taskId}</h3>

        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">مسیر پوشه</label>
          <div className="flex gap-2">
            <input className={inp} dir="ltr" value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
            <button type="button" className="btn-primary whitespace-nowrap" onClick={openFolderBrowser}>انتخاب پوشه...</button>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">نام فایل</label>
          <div className="flex gap-2">
            <input className={inp} dir="ltr" value={fileName} onChange={(e) => setFileName(e.target.value)} />
            <button type="button" className="btn-primary whitespace-nowrap" onClick={openFileBrowser}>انتخاب فایل...</button>
          </div>
        </div>

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
        <FileBrowser
          mode="folder"
          initial={browserInitial || DEFAULT_ASSET_FOLDER}
          title={waitingAssetFolder ? 'تعیین پوشهٔ دستگاه' : 'انتخاب پوشهٔ ضمائم'}
          onSelect={async (p) => {
            setShowFolderBrowser(false);
            if (waitingAssetFolder) {
              setWaitingAssetFolder(false);
              if (assetId) {
                try {
                  await fetch('/api/asset-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId, folderPath: p }) });
                  const res = await fetch(`/api/task-folder?taskId=${taskId}`);
                  const d = await res.json();
                  setFolderPath(d.subPath || p);
                  return;
                } catch {}
              }
              setFolderPath(p);
            } else {
              setFolderPath(p);
            }
          }}
          onClose={() => { setShowFolderBrowser(false); setWaitingAssetFolder(false); }}
        />
      )}
      {showFileBrowser && (
        <FileBrowser
          mode="file"
          initial={browserInitial || folderPath}
          title="انتخاب فایل ضمیمه"
          onSelect={(p) => { setFileName(p); setShowFileBrowser(false); }}
          onClose={() => setShowFileBrowser(false)}
        />
      )}
    </div>
  );
}