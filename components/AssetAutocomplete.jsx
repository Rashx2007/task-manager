"use client";
import { useEffect, useId, useRef, useState } from "react";
import { normalizeDigits, normalizeFa } from "@/lib/assetRules";

// برخلاف datalist بومی، متن گزینه‌ها چندخطی است و زیر کنترل، داخل فرم قرار می‌گیرد.
export default function AssetAutocomplete({ assets, value, formatAsset, onChange, onSelect, className }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const normalized = (text) => normalizeFa(normalizeDigits(text));
  const selectedText = assets.some((asset) => formatAsset(asset) === value);
  const search = selectedText ? "" : normalized(value);
  const shown = assets.filter((asset) => !search || normalized(formatAsset(asset)).includes(search));

  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open && activeIndex >= 0) listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const choose = (asset) => {
    onSelect(asset);
    onChange(formatAsset(asset));
    setOpen(false);
    setActiveIndex(-1);
  };
  const handleKeyDown = (event) => {
    if (event.nativeEvent?.isComposing || event.isComposing) return;
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); setActiveIndex(-1); return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation(); setOpen(true);
      setActiveIndex((previous) => {
        if (!shown.length) return -1;
        const current = open && previous >= 0 && previous < shown.length ? previous : -1;
        return event.key === "ArrowDown" ? (current + 1) % shown.length
          : current < 0 ? shown.length - 1 : (current - 1 + shown.length) % shown.length;
      });
    } else if (event.key === "Enter" && open) {
      // Enter داخل انتخابگر نباید تصادفاً فرم کار را ذخیره کند.
      event.preventDefault(); event.stopPropagation();
      if (shown[activeIndex]) choose(shown[activeIndex]);
    } else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={rootRef} className="flex-1 min-w-0" dir="rtl"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <input className={className} role="combobox" aria-label="دستگاه/مجموعه"
        aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && shown[activeIndex] ? `${listId}-${shown[activeIndex].AssetID}` : undefined}
        autoComplete="off" placeholder="تایپ کنید یا از لیست انتخاب کنید..." value={value}
        onFocus={() => { setOpen(true); setActiveIndex(-1); }}
        onClick={() => setOpen(true)} onKeyDown={handleKeyDown}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1); }} />
      {open && <div ref={listRef} id={listId} role="listbox" aria-label="گزینه‌های دستگاه"
        className="mt-1 rounded border border-teal-700/40 bg-white text-teal-950"
        style={{ maxHeight: 240, overflowY: "auto", overflowX: "hidden" }}>
        {shown.map((asset, index) => <button key={asset.AssetID} id={`${listId}-${asset.AssetID}`}
          type="button" role="option" tabIndex={-1} aria-selected={formatAsset(asset) === value}
          className="block w-full border-b border-teal-700/20 p-2 text-right hover:bg-teal-50"
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "normal", background: activeIndex === index ? "#ccfbf1" : undefined }}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(asset)}>
          {formatAsset(asset)}
        </button>)}
        {!shown.length && <p className="p-2 text-sm" role="status">دستگاهی مطابق متن پیدا نشد.</p>}
      </div>}
      {value && <p className="mt-1 text-xs text-gray-700" aria-label="متن کامل دستگاه"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</p>}
    </div>
  );
}
