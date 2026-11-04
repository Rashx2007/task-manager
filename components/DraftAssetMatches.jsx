"use client";
import { useEffect, useRef } from "react";

// A resolved task must not silently pick one of several matching devices.
export default function DraftAssetMatches({ matches, onChoose, onClose }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <section role="dialog" aria-modal="true" aria-labelledby="draft-asset-matches-title" dir="rtl" className="w-full max-w-xl max-h-[85vh] overflow-auto rounded-xl bg-[#CCE6DF] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="draft-asset-matches-title" className="text-lg font-bold text-teal-900">انتخاب دستگاه</h2><p className="mt-2 text-sm text-slate-700">چند دستگاه با مشخصات پیش‌نویس مطابقت دارند. دستگاه موردنظر را انتخاب کنید.</p></div>
          <button type="button" className="btn-danger shrink-0" onClick={onClose}>بستن</button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {matches.map((item) => (
            <button key={String(item.AssetID)} type="button" onClick={() => onChoose(item)} className="w-full break-words rounded-lg border border-teal-300 bg-white px-4 py-3 text-right text-sm text-slate-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
              <span className="block font-bold text-teal-900">{item.AssetName || "دستگاه بدون نام"} — کد {item.AssetID}</span>
              <span className="mt-1 block">شماره: {item.AssetNumber ?? "-"} | ساختمان: {item.Building || "-"} | بلوک: {item.Block || "-"} | طبقه: {item.Floor ?? "-"}</span>
              <span className="mt-1 block">ورودی: {item.Entrance || "-"} | قسمت: {item.Location || "-"} | سیستم: {item.MechSystem || "-"}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
