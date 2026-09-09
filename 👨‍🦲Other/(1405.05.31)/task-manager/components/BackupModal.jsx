'use client';
import { useState, useEffect } from 'react';
import FileBrowser from './FileBrowser';

export default function BackupModal({ onClose }) {
  const [folder, setFolder] = useState('C:\\DBBackups');
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  const loadFiles = async (f) => {
    try {
      const res = await fetch(`/api/backup/files?folder=${encodeURIComponent(f || folder)}`);
      const d = await res.json();
      if (d.success) setFiles(d.files || []);
    } catch {}
  };
  useEffect(() => { loadFiles(folder); }, [folder]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const doBackup = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) });
      const d = await res.json();
      if (d.success) { alert('پشتیبان‌گیری انجام شد:\n' + d.file); loadFiles(folder); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  const doRestore = async () => {
    const file = manual || selected;
    if (!file) { alert('فایلی برای بازگردانی انتخاب نشده.'); return; }
    if (!confirm('هشدار: پایگاه داده فعلی با فایل انتخابی جایگزین می‌شود. ادامه می‌دهید؟')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });
      const d = await res.json();
      if (d.success) alert('بازگردانی با موفقیت انجام شد.');
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setBusy(false);
  };

  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-4">پشتیبان‌گیری / بازگردانی پایگاه داده</h3>

        <label className="block text-sm font-bold mb-1">پوشهٔ پشتیبان‌ها</label>
        <div className="flex gap-2 mb-3">
          <input className={inp} dir="ltr" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setShowBrowser(true)}>مرور...</button>
        </div>

        <button onClick={doBackup} disabled={busy} className="btn-success mb-5">💾 پشتیبان‌گیری</button>

        <label className="block text-sm font-bold mb-1">فایل‌های موجود (برای بازگردانی)</label>
        <select className={inp + ' mb-2'} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">(انتخاب کنید)</option>
          {files.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input className={inp + ' mb-3'} dir="ltr" placeholder="یا مسیر کامل فایل .bak را وارد کنید" value={manual} onChange={(e) => setManual(e.target.value)} />

        <div className="flex gap-2">
          <button onClick={doRestore} disabled={busy} className="btn-danger">♻ بازگردانی</button>
          <button onClick={onClose} className="btn-primary">بستن</button>
        </div>
      </div>

      {showBrowser && (
        <FileBrowser
          mode="folder"
          initial={folder}
          title="انتخاب پوشهٔ پشتیبان"
          onSelect={(p) => { setFolder(p); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}