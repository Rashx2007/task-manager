"use client";
import { useState, useEffect, useRef } from "react";

import TaskContextHeader from "./TaskContextHeader";

export default function BackupModal({ onClose }) {
  const [folder, setFolder] = useState("F:\\(Task)\\Projects\\DBBackups");
  const [files, setFiles] = useState([]);
  const [selFile, setSelFile] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/backup?root=${encodeURIComponent(folder)}`);
      const d = await res.json();
      if (d.success) setFiles(d.files || []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, [folder]);

  const backup = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const d = await res.json();
      if (d.success) {
        alert("پشتیبان‌گیری انجام شد: " + d.file);
        load();
      } else alert("خطا: " + (d.error || "نامشخص"));
    } catch (e) {
      alert("خطا: " + e.message);
    }
    setBusy(false);
  };

  const restore = async () => {
    const target = restorePath || selFile;
    if (!target) {
      alert("ابتدا یک فایل .bak انتخاب کنید.");
      return;
    }
    if (!confirm("هشدار: تمام داده‌های فعلی با نسخهٔ پشتیبان جایگزین می‌شود. ادامه می‌دهید؟")) return;
    setBusy(true);
    try {
      const body = restorePath ? { path: restorePath } : { file: selFile };
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.success) alert(d.message || "بازگردانی انجام شد.");
      else alert("خطا: " + (d.error || "نامشخص"));
    } catch (e) {
      alert("خطا: " + e.message);
    }
    setBusy(false);
  };

  const pickFolderNative = async () => {
    if (!window.showDirectoryPicker) {
      alert("مرورگر از دیالوگ پوشه پشتیبانی نمی‌کند؛ مسیر را دستی وارد کنید.");
      return;
    }
    try {
      const h = await window.showDirectoryPicker();
      const res = await fetch(`/api/backup?resolveDir=${encodeURIComponent(h.name)}`);
      const d = await res.json();
      if (d.success && d.full) setFolder(d.full);
      else alert(d.error || "پوشه زیر ریشهٔ پشتیبان‌ها پیدا نشد؛ مسیر را دستی وارد کنید.");
    } catch {}
  };

  const pickFileNative = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const res = await fetch(`/api/backup?resolve=${encodeURIComponent(f.name)}&size=${f.size}`);
      const d = await res.json();
      if (d.success && d.full) {
        setRestorePath(d.full);
        setSelFile("");
      } else alert(d.error || "فایل زیر ریشهٔ پشتیبان‌ها پیدا نشد.");
    } catch {}
  };

  const openBackupFolder = async (forRestore = false) => {
    // A manually selected restore file takes priority over the dropdown.
    const filePath = restorePath.trim();
    let target = folder.trim();
    if (forRestore && filePath) {
      const separator = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
      if (separator < 0) {
        alert("برای بازکردن پوشهٔ فایل بازگردانی، مسیر کامل فایل .bak را وارد کنید.");
        return;
      }
      // Keep the separator so a drive root stays F:\ rather than F:.
      target = filePath.slice(0, separator + 1);
    }
    if (!target) {
      alert("ابتدا مسیر پوشهٔ پشتیبان‌ها را وارد کنید.");
      return;
    }
    try {
      const res = await fetch("/api/open-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        alert("خطا در بازکردن پوشه: " + (d.error || "نامشخص"));
      } else if (d.adjusted) {
        alert("پوشهٔ موردنظر پیدا نشد؛ نزدیک‌ترین پوشهٔ موجود باز شد:\n" + d.opened);
      }
    } catch (e) {
      alert("خطا در بازکردن پوشه: " + e.message);
    }
  };

  const inp = "search-input w-full";
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-full max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-4">پشتیبان‌گیری / بازگردانی پایگاه داده</h3>

        <TaskContextHeader className="mb-4" />
        <label className="block text-sm font-bold mb-1">پوشهٔ پشتیبان‌ها</label>
        <div className="flex gap-2 mb-3">
          <input className={inp} dir="ltr" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <button type="button" className="btn-primary whitespace-nowrap" onClick={pickFolderNative}>
            📂 مرور (ویندوز)
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <button className="btn-success" disabled={busy} onClick={backup}>
            💾 پشتیبان‌گیری
          </button>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            disabled={busy}
            onClick={() => openBackupFolder()}
          >
            📂 بازکردن پوشهٔ پشتیبان‌ها
          </button>
        </div>

        <label className="block text-sm font-bold mb-1">فایل‌های موجود (برای بازگردانی)</label>
        <select
          className={inp}
          value={selFile}
          onChange={(e) => {
            setSelFile(e.target.value);
            setRestorePath("");
          }}
        >
          <option value="">(انتخاب کنید)</option>
          {files.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2 mt-2 mb-3">
          <input
            className={inp}
            dir="ltr"
            placeholder="یا مسیر کامل .bak"
            value={restorePath}
            onChange={(e) => setRestorePath(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            📂 انتخاب .bak (ویندوز)
          </button>
          <input ref={fileRef} type="file" accept=".bak" style={{ display: "none" }} onChange={pickFileNative} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-danger" disabled={busy} onClick={restore}>
            بازگردانی
          </button>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            disabled={busy}
            onClick={() => openBackupFolder(true)}
          >
            📂 بازکردن پوشهٔ فایل بازگردانی
          </button>
          <button className="btn-primary" onClick={onClose}>
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}