// components/ReportViewer.jsx
"use client";
import { useState, useRef } from "react";
import DatePicker from "react-multi-date-picker";
import { showToast } from "@/lib/toast";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

export default function ReportViewer({ config, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [withTaskId, setWithTaskId] = useState(false);
  const [assetName, setAssetName] = useState("");
  const bufferRef = useRef(null);

  const generate = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (config.needsDateRange) {
        if (!start || !end) {
          showToast("لطفاً بازه زمانی را انتخاب کنید.", "warn");
          setLoading(false);
          return;
        }
        params.set("start", start.toDate().toISOString());
        params.set("end", end.toDate().toISOString());
      }
      if (config.withTaskIdToggle)
        params.set("withTaskId", withTaskId ? "1" : "0");
      if (config.needsAsset && assetName.trim())
        params.set("assetName", assetName.trim());

      const res = await fetch(`/api/reports/${config.type}?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast("خطا: " + (d.error || res.statusText), "error");
        setLoading(false);
        return;
      }

      if (config.output === "text") {
        const d = await res.json();
        setFileName(d.fileName);
        setContent({ kind: "text", text: d.content });
      } else {
        // Excel: buffer + نام فایل از header
        const buf = await res.arrayBuffer();
        bufferRef.current = buf;
        const fn = res.headers.get("X-File-Name") || "report.xlsx";
        setFileName(fn);
        setContent({ kind: "excel", size: buf.byteLength });
        showToast(
          "گزارش تولید شد؛ آمادهٔ مشاهده و ذخیره است.",
          "success",
          2500,
        );
      }
    } catch (e) {
      showToast("خطا در تولید گزارش: " + e.message, "error");
    }
    setLoading(false);
  };

  const save = async () => {
    if (!content || !fileName) return;
    const data =
      content.kind === "text"
        ? new Blob([content.text], { type: "text/plain;charset=utf-8" })
        : new Blob([bufferRef.current], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });

    const ext = fileName.split(".").pop() || "txt";
    let saved = false;

    // ✅ دیالوگ Save بومی ویندوز (مرورگرهای مدرن)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            { description: "گزارش", accept: { [data.type]: ["." + ext] } },
          ],
        });
        const w = await handle.createWritable();
        await w.write(data);
        await w.close();
        saved = true;
      } catch (e) {
        if (e.name === "AbortError") return; // کاربر واقعاً لغو کرد
      }
    }

    // ✅ fallback: دانلود معمولی
    if (!saved) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 100);
    }

    // ✅ بازکردن خودکار فایلِ تازه‌ذخیره‌شده از سمت سرور
    try {
      const r = await fetch("/api/open-recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, openFolder: false }),
      });
      const d = await r.json();
      if (d.success) showToast("فایل ذخیره و باز شد:\n" + d.path, "success");
      else
        showToast("فایل ذخیره شد؛ ولی برای باز کردن خودکار پیدا نشد.", "warn");
    } catch {
      showToast("فایل ذخیره شد.", "success", 2500);
    }
    onClose();
  };

  const inp = "search-input w-full";

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[900px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-teal-800/20">
          <h3 className="text-lg font-bold">{config.title}</h3>
          <button type="button" onClick={onClose} className="text-xl">
            ✕
          </button>
        </div>

        <div className="p-4 border-b border-teal-800/20 flex flex-wrap gap-3 items-end">
          {config.needsDateRange && (
            <>
              <div>
                <label className="block text-xs font-bold mb-1">از تاریخ</label>
                <DatePicker
                  value={start}
                  onChange={setStart}
                  calendar={persian}
                  locale={persian_fa}
                  format="YYYY/MM/DD"
                  inputClass={inp}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">تا تاریخ</label>
                <DatePicker
                  value={end}
                  onChange={setEnd}
                  calendar={persian}
                  locale={persian_fa}
                  format="YYYY/MM/DD"
                  inputClass={inp}
                />
              </div>
            </>
          )}
          {config.withTaskIdToggle && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={withTaskId}
                onChange={(e) => setWithTaskId(e.target.checked)}
              />
              <span className="text-sm font-bold">با کد کار</span>
            </label>
          )}
          {config.needsAsset && (
            <div>
              <label className="block text-xs font-bold mb-1">
                دستگاه/مجموعه (اختیاری)
              </label>
              <input
                className={inp}
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="مثلاً فن‌کویل"
              />
            </div>
          )}
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading ? "در حال تولید..." : "تولید گزارش"}
          </button>
          {content && (
            <>
              <button onClick={save} className="btn-success">
                💾 ذخیره / دانلود
              </button>
              <span className="text-xs text-teal-900">فایل: {fileName}</span>
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 bg-white">
          {!content && (
            <div className="text-center text-gray-500 py-8">
              برای مشاهده، ابتدا گزارش را تولید کنید.
            </div>
          )}
          {content?.kind === "text" && (
            <pre
              className="whitespace-pre-wrap font-[Vazirmatn] text-sm leading-relaxed text-gray-800"
              dir="rtl"
            >
              {content.text}
            </pre>
          )}
          {content?.kind === "excel" && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <div className="text-lg font-bold text-teal-900 mb-2">
                گزارش Excel آماده است
              </div>
              <div className="text-sm text-gray-600 mb-6">
                حجم: {(content.size / 1024).toFixed(1)} KB
              </div>
              <div className="text-xs text-gray-500">
                برای ذخیره با دیالوگ ویندوز، دکمه «💾 ذخیره / دانلود» را بزنید.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
