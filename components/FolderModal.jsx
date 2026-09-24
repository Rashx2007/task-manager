"use client";
import { useState, useEffect } from "react";
import FileBrowser from "./FileBrowser";
import { showToast } from "@/lib/toast";

const isAbs = (p) => /^([A-Za-z]:[\/\\])/.test(String(p || "").trim());

export default function FolderModal({ taskId, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [browse, setBrowse] = useState(null); // 'folder' | 'file'

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/folder?taskId=${taskId}`);
        const d = await res.json();
        if (d.success) setForm(d.data || { FolderPath: "", FileName: "", AllowShareCopy: 0 });
      } catch {
        setForm({ FolderPath: "", FileName: "", AllowShareCopy: 0 });
      }
    })();
  }, [taskId]);

  // ✅ فقط متن فیلد پوشه
  const folderOnly = () => String(form?.FolderPath || "").trim();

  // ✅ مسیر فایل: اگر مطلق بود فقط خودش، وگرنه پوشه + نام فایل
  const fileFull = () => {
    const f = String(form?.FileName || "").trim();
    const d = folderOnly();
    if (!f) return "";
    if (isAbs(f)) return f;
    if (!d) return f;
    return d.replace(/[\/\\]+$/, "") + "\\" + f;
  };

  const openPath = async (p, select, label) => {
    if (!p) {
      showToast("مسیری ثبت نشده است.", "warn");
      return;
    }
    try {
      const res = await fetch("/api/open-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p, select }),
      });
      const d = await res.json();
      if (!d.success) showToast(d.error || "بازکردن مسیر ممکن نشد.", "error");
      else if (d.adjusted)
        showToast(`مسیر دقیقِ ${label} یافت نشد؛ نزدیک‌ترین مسیر موجود باز شد:\n${d.opened}`, "warn");
      else showToast(`${label} باز شد.`, "success", 2500);
    } catch {
      showToast("خطا در ارتباط با سرور.", "error");
    }
  };

  const copyText = async (p, label) => {
    if (!p) {
      showToast("مسیری برای کپی وجود ندارد.", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(p);
      showToast(`${label} در کلیپ‌بورد کپی شد.`, "success", 2500);
    } catch {
      showToast("کپی ممکن نشد.", "error");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          FolderPath: folderOnly(),
          FileName: String(form?.FileName || "").trim(),
          AllowShareCopy: form?.AllowShareCopy ? 1 : 0,
        }),
      });
      const d = await res.json();
      if (d.success) {
        showToast("ذخیره شد.", "success", 2500);
        if (onSaved) onSaved();
        onClose();
      } else showToast("خطا: " + (d.error || "نامشخص"), "error");
    } catch {
      showToast("خطا در ارتباط با سرور.", "error");
    }
    setSaving(false);
  };

  const inp = "search-input w-full";
  if (!form) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[640px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">پوشهٔ ضمائم — کد کار: {taskId}</h3>

        <label className="block text-sm font-bold mb-1">مسیر پوشه</label>
        <div className="flex gap-2 mb-3">
          <input
            className={inp}
            dir="ltr"
            value={form.FolderPath || ""}
            onChange={(e) => setForm({ ...form, FolderPath: e.target.value })}
          />
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setBrowse("folder")}>
            انتخاب پوشه...
          </button>
        </div>

        <label className="block text-sm font-bold mb-1">نام فایل</label>
        <div className="flex gap-2 mb-3">
          <input
            className={inp}
            dir="ltr"
            value={form.FileName || ""}
            onChange={(e) => setForm({ ...form, FileName: e.target.value })}
          />
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setBrowse("file")}>
            انتخاب فایل...
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm font-bold mb-4">
          <input
            type="checkbox"
            checked={!!form.AllowShareCopy}
            onChange={(e) => setForm({ ...form, AllowShareCopy: e.target.checked ? 1 : 0 })}
          />
          اجازه کپی فایل‌ها در پوشهٔ اشتراکی
        </label>

        <div className="flex flex-wrap gap-2 justify-end">
          <button className="btn-success" disabled={saving} onClick={save}>
            ذخیره
          </button>
          <button type="button" className="btn-primary" onClick={() => openPath(folderOnly(), false, "پوشه")}>
            بازکردن پوشه
          </button>
          <button type="button" className="btn-primary" onClick={() => openPath(fileFull(), true, "فایل")}>
            بازکردن فایل
          </button>
          <button type="button" className="btn-primary" onClick={() => copyText(folderOnly(), "مسیر پوشه")}>
            کپی مسیر
          </button>
          <button type="button" className="btn-primary" onClick={() => copyText(fileFull(), "مسیر فایل")}>
            کپی فایل
          </button>
          <button className="btn-danger" onClick={onClose}>
            بستن
          </button>
        </div>
      </div>

      {browse && (
        <FileBrowser
          defaultPath={folderOnly() || "D:\\"}
          onClose={() => setBrowse(null)}
          onSelect={(p) => {
            if (browse === "folder") setForm({ ...form, FolderPath: p });
            else setForm({ ...form, FileName: p });
            setBrowse(null);
          }}
        />
      )}
    </div>
  );
}