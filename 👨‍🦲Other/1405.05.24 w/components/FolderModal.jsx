'use client';
import { useState, useEffect } from 'react';

export default function FolderModal({ taskId, onClose, onSaved }) {
  const [fileName, setFileName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

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

  // ساخت هوشمند مسیر فایل — بدون تکرار هیچ قسمت از آدرس
  const filePath = () => {
    const f = (folderPath || '').trim();
    const n = (fileName || '').trim();
    if (!n) return f;
    // اگر «نام فایل» خودش مسیر کامل است (مثل D:\... یا \\server\...)، همان را برگردان
    if (/^([A-Za-z]:[\\/]|\\\\)/.test(n)) return n;
    if (!f) return n;
    // حذف اسلش انتهایی مسیر پوشه
    const base = /[\\/]$/.test(f) ? f.slice(0, -1) : f;
    // اگر مسیر پوشه از قبل با نام فایل تمام می‌شود، تکرار نکن
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">پوشهٔ ضمائم — کد کار: {taskId}</h3>
        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">نام فایل</label>
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} className="search-input w-full" dir="ltr" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-bold mb-1">مسیر پوشه</label>
          <input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} className="search-input w-full" dir="ltr" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={saving} className="btn-success">{saving ? '...' : 'ذخیره'}</button>
          <button onClick={() => openPath(folderPath)} disabled={!folderPath} className="btn-primary">بازکردن پوشه</button>
                    <button onClick={() => openPath(filePath())} disabled={!folderPath || !fileName} className="btn-primary">بازکردن فایل</button>
          <button onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </div>
    </div>
  );
}