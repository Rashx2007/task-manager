// components/FolderModal.jsx
"use client";
import { useState, useEffect } from "react";
import FileBrowser from "./FileBrowser";
import { showToast, showConfirm } from "@/lib/toast";

const DEFAULT_ASSET_FOLDER = "D:\\(فنّی)";
const SHARE_FOLDER = "E:\\Share(Tasks)\\Elhami";

export default function FolderModal({ taskId, onClose, onSaved }) {
  const [fileName, setFileName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowCopy, setAllowCopy] = useState(true);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [browserInitial, setBrowserInitial] = useState("");
  const [waitingAssetFolder, setWaitingAssetFolder] = useState(false);
  const [assetId, setAssetId] = useState(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/folder?taskId=${taskId}`);
        const d = await r.json();
        if (d.success && d.data) {
          setFileName(d.data.FileName || "");
          setAllowCopy(
            d.data.AllowedToCopyFiles == null
              ? true
              : !!d.data.AllowedToCopyFiles,
          );
          if (d.data.FolderPath) {
            setFolderPath(d.data.FolderPath);
            return;
          }
        }
        const res = await fetch(`/api/task-folder?taskId=${taskId}`);
        const t = await res.json();
        if (!t.success) return;
        setAssetId(t.assetId);
        if (t.assetFolder) {
          setFolderPath(t.subPath);
          return;
        }
        if (
          confirm(
            "پوشه‌ای برای این دستگاه تعیین نشده است. ابتدا پوشهٔ دستگاه را تعیین می‌کنید؟",
          )
        ) {
          setWaitingAssetFolder(true);
          setBrowserInitial(DEFAULT_ASSET_FOLDER);
          setShowFolderBrowser(true);
        }
      } catch {}
    })();
  }, [taskId]);

  // ✅ Esc فقط وقتی FileBrowser باز نیست، خود FolderModal را می‌بندد (بستن ساده)
  useEffect(() => {
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (showFolderBrowser || showFileBrowser) return;
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, showFolderBrowser, showFileBrowser]);

  // ✅ مسیر مطلق = شروع با درایو و جداکننده (اسلش یا بک‌اسلش)
  const isAbs = (p) => /^[A-Za-z]:[\/\\]/.test(String(p || "").trim());
  const fullPath = () => {
    const f = (folderPath || "").trim();
    const n = (fileName || "").trim();
    if (!n) return f;
    if (isAbs(n)) return n;
    if (!f) return n;
    const base = /[\/\\]$/.test(f) ? f.slice(0, -1) : f;
        if (base.endsWith(n)) return base;
    return base + '\\' + n;
  };

  // ✅ بازکردن پوشهٔ آینه‌ای: چند نامزد می‌فرستیم و سرور اولین مسیر موجود را باز می‌کند
  const openShareMirror = async () => {
    const f = String(folderPath || '').trim();
    if (!f) { showToast('مسیر پوشه ثبت نشده است.', 'warn'); return; }
    const rel = f.replace(/^[A-Za-z]:/, '').replace(/\//g, '\\');
    const base = f.replace(/[\/\\]+$/, '').split(/[\/\\]/).pop();
    const candidates = [
      SHARE_FOLDER + (rel.startsWith('\\') ? rel : '\\' + rel), // ساختار کامل نسبی
      SHARE_FOLDER + '\\' + base, // فقط نام پوشهٔ آخر
      SHARE_FOLDER, // ریشهٔ اشتراکی
    ];
    try {
      const res = await fetch('/api/open-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates }),
      });
      const d = await res.json();
      if (!d.success) showToast(d.error || 'بازکردن مسیر ممکن نشد.', 'error');
      else if (d.adjusted)
        showToast('پوشهٔ آینه‌ای این کار یافت نشد؛ نزدیک‌ترین پوشهٔ موجود باز شد:\n' + d.opened, 'warn');
      else showToast('پوشهٔ آینه‌ای این کار باز شد.', 'success', 2500);
    } catch { showToast('خطا در ارتباط با سرور.', 'error'); }
  };

  const openPath = async (p) => {
    if (!p) {
      showToast("مسیری ثبت نشده است.", "warn");
      return;
    }
    try {
      const res = await fetch("/api/open-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const d = await res.json();
      if (!d.success) showToast(d.error || "بازکردن مسیر ممکن نشد.", "error");
      else if (d.adjusted)
        showToast(
          "مسیر دقیق یافت نشد؛ نزدیک‌ترین پوشهٔ موجود باز شد:\n" + d.opened,
          "warn",
        );
      else showToast("مسیر در ویندوز باز شد.", "success", 2500);
    } catch {
      showToast("خطا در ارتباط با سرور.", "error");
    }
  };

  const copyPath = async () => {
    const p = fullPath();
    if (!p) {
      showToast("مسیری برای کپی وجود ندارد.", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(p);
      showToast("مسیر در کلیپ‌بورد کپی شد.", "success", 2500);
    } catch {
      showToast("کپی ممکن نشد.", "error");
    }
  };

  const copyMirror = async (destDir) => {
    const f = (folderPath || "").trim();
    const n = (fileName || "").trim();
    const src = f || (isAbs(n) ? n : "");
    if (!src) {
      showToast("مسیری برای کپی وجود ندارد.", "warn");
      return;
    }
    try {
      const res = await fetch("/api/copy-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: [src], destDir, mirrorDir: true }),
      });
      const d = await res.json();
      if (d.success)
        showToast(
          "کل محتوای پوشه به‌صورت آینه‌ای کپی شد به:\n" + d.dest,
          "success",
        );
      else showToast("خطا: " + (d.error || "نامشخص"), "error");
    } catch {
      showToast("خطا در ارتباط با سرور.", "error");
    }
  };

  // ✅ گزینهٔ ۲: همگام‌سازی دستی با پرسش و با احترام به تیک «اجازه کپی»
  const syncShare = async () => {
    const src = (folderPath || "").trim();
    if (!src) {
      showToast("مسیر پوشه ثبت نشده است.", "warn");
      return;
    }
    if (!allowCopy) {
      showToast(
        "تیک «اجازه کپی فایل‌ها در پوشهٔ اشتراکی» خاموش است؛ ابتدا آن را فعال کنید.",
        "warn",
      );
      return;
    }
    showConfirm(
      `کل محتوای پوشهٔ فعلی با پوشهٔ اشتراکی همگام‌سازی (آینه‌ای) شود؟\nمقصد: ${SHARE_FOLDER}`,
      {
        type: "warn",
        confirmText: "همگام‌سازی",
        cancelText: "انصراف",
        onConfirm: () => copyMirror(SHARE_FOLDER),
      },
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          FileName: fileName,
          fileName,
          FolderPath: folderPath,
          folderPath,
          AllowedToCopyFiles: allowCopy ? 1 : 0,
          allowCopy,
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

  const openFolderBrowser = async () => {
    let initial = (folderPath || "").trim();
    try {
      const res = await fetch(`/api/task-folder?taskId=${taskId}`);
      const d = await res.json();
      if (d.success) {
        setAssetId(d.assetId);
        if (!d.assetFolder) {
          if (
            confirm(
              "پوشه‌ای برای این دستگاه تعیین نشده است. ابتدا پوشهٔ دستگاه را تعیین می‌کنید؟",
            )
          ) {
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
    setBrowserInitial((folderPath || "").trim() || DEFAULT_ASSET_FOLDER);
    setShowFileBrowser(true);
  };

  const inp = "search-input w-full";
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[680px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">
          پوشهٔ ضمائم — کد کار: {taskId}
        </h3>

        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">مسیر پوشه</label>
          <div className="flex gap-2">
            <input
              className={inp}
              dir="ltr"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={openFolderBrowser}
            >
              انتخاب پوشه...
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">نام فایل</label>
          <div className="flex gap-2">
            <input
              className={inp}
              dir="ltr"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={openFileBrowser}
            >
              انتخاب فایل...
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={allowCopy}
            onChange={(e) => setAllowCopy(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-bold">
            اجازه کپی فایل‌ها در پوشهٔ اشتراکی
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openPath(folderPath)}
            disabled={!folderPath}
            className="btn-primary w-full"
          >
            📁 بازکردن پوشه
          </button>
          <button
            type="button"
            onClick={() => openPath(fullPath())}
            disabled={!folderPath && !fileName}
            className="btn-primary w-full"
          >
            📄 بازکردن فایل
          </button>
          <button
            type="button"
            onClick={copyPath}
            disabled={!folderPath && !fileName}
            className="btn-primary w-full"
          >
            ⧉ کپی مسیر
          </button>
          <button
            type="button"
            onClick={syncShare}
            disabled={!folderPath}
            className="btn-primary w-full"
          >
            🔄 همگام‌سازی با پوشهٔ اشتراکی
          </button>
          <button
            type="button"
            onClick={openShareMirror}
            disabled={!folderPath}
            className="btn-primary w-full sm:col-span-2"
          >
            📂 بازکردن پوشهٔ اشتراکی (آینهٔ این کار)
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-teal-800/20">
          <button
            onClick={save}
            disabled={saving}
            className="btn-success flex-1"
          >
            {saving ? "..." : "ذخیره"}
          </button>
          <button onClick={onClose} className="btn-danger flex-1">
            بستن
          </button>
        </div>
      </div>

      {showFolderBrowser && (
        <FileBrowser
          mode="folder"
          initial={browserInitial || DEFAULT_ASSET_FOLDER}
          title={
            waitingAssetFolder ? "تعیین پوشهٔ دستگاه" : "انتخاب پوشهٔ ضمائم"
          }
          onSelect={async (p) => {
            setShowFolderBrowser(false);
            if (waitingAssetFolder) {
              setWaitingAssetFolder(false);
              if (assetId) {
                try {
                  await fetch("/api/asset-folder", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assetId, folderPath: p }),
                  });
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
          onClose={() => {
            setShowFolderBrowser(false);
            setWaitingAssetFolder(false);
          }}
        />
      )}
      {showFileBrowser && (
        <FileBrowser
          mode="file"
          initial={browserInitial || folderPath}
          title="انتخاب فایل ضمیمه"
          onSelect={(p) => {
            setFileName(p);
            setShowFileBrowser(false);
          }}
          onClose={() => setShowFileBrowser(false)}
        />
      )}
    </div>
  );
}
