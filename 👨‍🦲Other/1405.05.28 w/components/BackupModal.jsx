'use client';
import { useState, useEffect, useCallback } from 'react';
import FolderBrowser from './FolderBrowser';

export default function BackupModal({ onClose }) {
  const [folder, setFolder] = useState('C:\\DBBackups');
  const [showBrowser, setShowBrowser] = useState(false);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadFiles = useCallback(async (f) => {
    try {
      const res = await fetch(`/api/backup?folder=${encodeURIComponent(f)}`);
      const d = await res.json();
      if (d.success) setFiles(d.files || []);
    } catch {}
  }, []);

  useEffect(() => { loadFiles(folder); }, [folder, loadFiles]);

  const doBackup = async () => {
    if (!folder.trim()) { setMsg('مسیر پوشه را مشخص کنید.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/backup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }),
      });
      const d = await res.json();
      if (d.success) { setMsg('✅ پشتیبان ایجاد شد: ' + d.file); loadFiles(folder); }
      else setMsg('❌ خطا: ' + d.error);
    } catch { setMsg('❌ خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  const doRestore = async () => {
    const file = manual.trim() || selected;
    if (!file) { setMsg('ابتدا یک فایل .bak انتخاب کنید.'); return; }
    if (!confirm('هشدار: داده‌های فعلی با فایل پشتیبان جایگزین می‌شود. ادامه می‌دهید؟')) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }),
      });
      const d = await res.json();
      if (d.success) setMsg('✅ بازگردانی با موفقیت انجام شد.');
      else setMsg('❌ خطا: ' + d.error);
    } catch { setMsg('❌ خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[640px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">پشتیبان‌گیری / بازگردانی پایگاه داده</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        {/* پوشه مقصد + دکمه مرور */}
        <label className="block text-sm font-bold mb-1">پوشهٔ پشتیبان‌ها</label>
        <div className="flex gap-2 mb-3">
          <input className="search-input flex-1" value={folder} onChange={(e) => setFolder(e.target.value)} dir="ltr" />
          <button className="btn-primary px-4" onClick={() => setShowBrowser(true)}>مرور...</button>
        </div>

        <button className="btn-success mb-5" disabled={busy} onClick={doBackup}>💾 پشتیبان‌گیری</button>

        <label className="block text-sm font-bold mb-1">فایل‌های موجود (برای بازگردانی)</label>
        <select className="search-input w-full mb-2" value={selected} onChange={(e) => setSelected(e.target.value)} dir="ltr">
          <option value="">(انتخاب کنید)</option>
          {files.map((f) => (
            <option key={f.name} value={folder.endsWith('\\') ? folder + f.name : folder + '\\' + f.name}>
              {f.name} — {(f.size / 1024 / 1024).toFixed(1)} MB
            </option>
          ))}
        </select>
        <input className="search-input w-full mb-3" value={manual} onChange={(e) => setManual(e.target.value)}
               placeholder="یا مسیر کامل فایل .bak را وارد کنید" dir="ltr" />

        <button className="btn-danger" disabled={busy} onClick={doRestore}>♻️ بازگردانی</button>

        {msg && <div className="mt-4 text-sm font-bold whitespace-pre-wrap">{msg}</div>}
      </div>

      {showBrowser && (
        <FolderBrowser
          initial={folder}
          onSelect={(p) => { setFolder(p); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}