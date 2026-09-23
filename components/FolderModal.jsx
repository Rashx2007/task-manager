"use client";
import { useState, useEffect } from "react";
import FileBrowser from "./FileBrowser";
import { showToast } from "@/lib/toast";

const SHARE_FOLDER = "E:\\Share(Tasks)";

const isAbs = (p) => /^([A-Za-z]:[\/\\]|[\/\\][\/\\])/.test(String(p || ""));
// ✅ هرگز مسیر مطلق را به پوشه نمی‌چسبانیم
const joinPath = (folder, file) => {
  const f = String(file || "").trim();
  const d = String(folder || "").trim();
  if (!f) return d;
  if (isAbs(f)) return f;
  if (!d) return f;
  return d.replace(/[\/\\]+$/, "") + "\\" + f;
};

export default function FolderModal({ taskId, onClose, onSaved }) {
  const [folder, setFolder] = useState("");
  const [file, setFile] = useState("");
  const [saving, setSaving] = useState(false);
  const [browse, setBrowse] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/folder?taskId=${taskId}`);
        const d = await res.json();
        if (d.success && d.data) {
          setFolder(String(d.data.FolderPath || ""));
          setFile(String(d.data.FileName || ""));
        }
      } catch {}
    })();
  }, [taskId]);

  const callOpen = async (p, select) => {
    const res = await fetch("/api/open-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p, select }),
    });
    return res.json();
  };

  const openFolder = async () => {
    const p = String(folder || "").trim();
    if (!p) { showToast("مسیر پوشه ثبت نشده است.", "warn"); return; }
    try {
      const d = await callOpen(p, false);
      if (!d.success) showToast(d.error || "بازکردن پوشه ممکن نشد.", "error");
      else if (d.adjusted) showToast("مسیر دقیق یافت نشد؛ نزدیک‌ترین پوشهٔ موجود باز شد:\n" + d.opened, "warn");
      else showToast("پوشه باز شد.", "success", 2500);
    } catch { showToast("خطا در ارتباط با سرور.", "error"); }
  };

  const openFile = async () => {
    if (!file) { showToast("فایلی ثبت نشده است.", "warn"); return; }
    const p = joinPath(folder, file);
    try {
      const d = await callOpen(p, true);
      if (!d.success) showToast(d.error || "بازکردن فایل ممکن نشد.", "error");
      else if (d.adjusted) showToast("مسیر دقیق یافت نشد؛ نزدیک‌ترین مسیر موجود باز شد:\n" + d.opened, "warn");
      else showToast("فایل باز شد.", "success", 2500);
    } catch { showToast("خطا در ارتباط با سرور.", "error"); }
  };

  const copyPath = async () => {
    const p = joinPath(folder, file);
    if (!p) { showToast("مسیری برای کپی وجود ندارد.", "warn"); return; }
    try {
      await navigator.clipboard.writeText(p);
      showToast("مسیر در کلیپ‌بورد کپی شد.", "success", 2500);
    } catch { showToast("کپی ممکن نشد.", "error"); }
  };

  const copyMirror = async () => {
    const src = String(folder || "").trim();
    if (!src) { showToast("پوشهٔ مبدأ ثبت نشده است.", "warn"); return; }
    if (!confirm("کل محتوای پوشه به‌صورت آینه‌ای در مقصد اشتراکی کپی شود؟")) return;
    try {
      const res = await fetch("/api/folder/mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src, dest: SHARE_FOLDER }),
      });
      const d = await res.json();
      if (d.success) showToast("کل محتوای پوشه به‌صورت آینه‌ای کپی شد به:\n" + d.dest, "success");
      else showToast("خطا: " + (d.error || "نامشخص"), "error");
    } catch { showToast("خطا در ارتباط با سرور.", "error"); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          FolderPath: String(folder || "").trim(),
          FileName: String(file || "").trim(),
        }),
      });
      const d = await res.json();
      if (d.success) {
        showToast("ذخیره شد.", "success", 2500);
        if (onSaved) onSaved();
        onClose();
      } else showToast("خطا: " + (d.error || "نامشخص"), "error");
    } catch { showToast("خطا در ارتباط با سرور.", "error"); }
    setSaving(false);
  };

  const inp = "search-input w-full";
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">پوشهٔ ضمائم — کد کار: {taskId}</h3>

        <label className="block text-sm font-bold mb-1">مسیر پوشه</label>
        <div className="flex gap-2 mb-3">
          <input className={inp} dir="ltr" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setBrowse(true)}>
            📂 مرور
          </button>
        </div>

        <label className="block text-sm font-bold mb-1">فایل انتخابی (اختیاری)</label>
        <input
          className={inp + " mb-4"}
          dir="ltr"
          value={file}
          onChange={(e) => setFile(e.target.value)}
          placeholder="نام فایل داخل پوشه، یا مسیر کامل فایل"
        />

        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" className="btn-primary" onClick={openFolder}>📁 بازکردن پوشه</button>
          <button type="button" className="btn-primary" onClick={openFile}>📄 بازکردن فایل</button>
          <button type="button" className="btn-primary" onClick={copyPath}>⧉ کپی مسیر</button>
          <button type="button" className="btn-primary" onClick={copyMirror}>🪞 کپی آینه‌ای</button>
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn-success" disabled={saving} onClick={save}>ذخیره</button>
          <button className="btn-danger" onClick={onClose}>بستن</button>
        </div>
      </div>

      {browse && (
        <FileBrowser
          defaultPath={folder || "D:\\"}
          onClose={() => setBrowse(false)}
          onSelect={(p) => { setFolder(p); setBrowse(false); }}
        />
      )}
    </div>
  );
}