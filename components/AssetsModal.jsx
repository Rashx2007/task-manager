"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import FileBrowser from "./FileBrowser";
import { showConfirm } from "@/lib/toast";

const DEFAULT_ASSET_FOLDER = "D:\\(فنّی)";
const distinct = (arr) =>
  [
    ...new Set(
      arr
        .map((x) => (x == null ? "" : String(x)))
        .filter((x) => x !== "" && x !== "-"),
    ),
  ].sort((a, b) => a.localeCompare(b, "fa", { numeric: true }));
const sameVal = (a, b) => {
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  if (sa === sb) return true;
  const na = Number(sa);
  const nb = Number(sb);
  return !isNaN(na) && !isNaN(nb) && sa !== "" && sb !== "" && na === nb;
};
const CASCADE_ORDER = [
  "Building",
  "Block",
  "Floor",
  "Entrance",
  "Location",
  "MechSystem",
  "AssetName",
  "AssetNumber",
  "Specifications",
  "PropertyCode",
  "SerialNumber",
];

function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const shown = (options || []).filter((v) => !q || String(v).includes(q));
  return (
    <div ref={wrapRef} className="relative">
      <input
        className={className}
        style={{ paddingLeft: "26px" }}
        value={value ?? ""}
        placeholder={placeholder || ""}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      <button
        type="button"
        className="combo-btn"
        disabled={disabled}
        onClick={() => {
          setQ("");
          setOpen((o) => !o);
        }}
      >
        ▾
      </button>
      {open && (
        <div className="combo-list">
          {shown.length === 0 && (
            <div className="combo-empty">گزینه‌ای نیست</div>
          )}
          {shown.map((v) => (
            <button
              key={v}
              type="button"
              className="combo-item"
              onClick={() => {
                onChange(v);
                setOpen(false);
                setQ("");
              }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssetsModal({
  onClose,
  onNewTaskWithAsset,
  onSelectAsset = null,
  preset = null,
  initialAssetId = null,
  onAssetSaved = null,
}) {
  const [tab, setTab] = useState("devices");
  const [all, setAll] = useState([]);
  const [search, setSearch] = useState("");
  const [flt, setFlt] = useState({
    AssetID: "",
    Building: "",
    Block: "",
    Floor: "",
    Entrance: "",
    Location: "",
    MechSystem: "",
    AssetName: "",
  });
  const initializedAssetIdRef = useRef(null);
  const pendingSelectionRef = useRef(null);
  useEffect(() => () => { pendingSelectionRef.current = null; }, []);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  // ✅ دستگاهی که می‌خواهیم مسیر پوشه‌اش را تنظیم کنیم (وقتی پوشه ندارد/پیدا نشد)
  const [folderAskAsset, setFolderAskAsset] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [formHint, setFormHint] = useState("");
  const [base, setBase] = useState({ names: [], systems: [] });
  const [selectedBaseSystemId, setSelectedBaseSystemId] = useState("");
  const [selectedBaseAssetNameId, setSelectedBaseAssetNameId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSystem, setNewSystem] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const r = await fetch("/api/assets");
      const d = await r.json();
      if (d.success) setAll(d.data || []);
    } catch { }
  }, []);
  const loadBase = useCallback(async () => {
    try {
      const r = await fetch("/api/base-info");
      const d = await r.json();
      if (d.success) {
        const systems = d.systems || [];
        setBase({ names: d.names || [], systems });
        setSelectedBaseSystemId((current) =>
          systems.some((s) => sameVal(s.MechSystemsID, current))
            ? current
            : String(systems[0]?.MechSystemsID ?? ""),
        );
      }
    } catch { }
  }, []);
  useEffect(() => {
    loadAll();
    loadBase();
  }, [loadAll, loadBase]);

  // مقدار اولیه فقط یک بار از دستگاه فرم کار خوانده می‌شود؛ بازخوانی جدول فیلترهای کاربر را بازنویسی نمی‌کند.
  useEffect(() => {
    if (preset || initialAssetId == null || initialAssetId === "") return;
    const key = String(initialAssetId);
    if (initializedAssetIdRef.current === key) return;
    const asset = all.find((a) => String(a.AssetID) === key);
    if (!asset) return;
    initializedAssetIdRef.current = key;
    setSelectedAsset(asset);
    setSearch("");
    setFlt((current) => Object.fromEntries(
      Object.keys(current).map((field) => [field, String(asset[field] ?? "")]),
    ));
  }, [all, initialAssetId, preset]);

  const clearFilters = () => {
    setSearch("");
    setFlt((current) => Object.fromEntries(Object.keys(current).map((field) => [field, ""])));
  };

  const selectAsset = (asset) => {
    if (pendingSelectionRef.current) return;
    const selection = {};
    pendingSelectionRef.current = selection;
    const message = [
      "آیا از انتخاب این دستگاه اطمینان دارید؟",
      `کد: ${asset.AssetID} — ${asset.AssetName || "بدون نام"} — شماره: ${asset.AssetNumber ?? "-"}`,
      `ساختمان: ${asset.Building || "-"} | بلوک: ${asset.Block || "-"} | طبقه: ${asset.Floor ?? "-"}`,
      `ورودی: ${asset.Entrance || "-"} | محل: ${asset.Location || "-"} | سیستم: ${asset.MechSystem || "-"}`,
    ].join("\n");
    showConfirm(message, {
      type: "warn",
      confirmText: "انتخاب دستگاه",
      cancelText: "انصراف",
      onConfirm: () => {
        if (pendingSelectionRef.current !== selection) return;
        pendingSelectionRef.current = null;
        if (onSelectAsset) onSelectAsset(asset.AssetID);
        else setSelectedAsset(asset);
      },
      onCancel: () => {
        if (pendingSelectionRef.current === selection) pendingSelectionRef.current = null;
      },
    });
  };

  // ✅ Esc فقط وقتی FileBrowser باز نیست، خود AssetsModal را می‌بندد
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (showBrowser) return;
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", h);
    };
  }, [onClose, showBrowser]);

  const filtered = all.filter((a) => {
    const q = search.trim();
    if (q) {
      const hay = [
        a.AssetID,
        a.AssetName,
        a.AssetNumber,
        a.Building,
        a.Block,
        a.Floor,
        a.Entrance,
        a.Location,
        a.MechSystem,
        a.Specifications,
        a.PropertyCode,
        a.SerialNumber,
      ]
        .map((v) => String(v ?? ""))
        .join(" ");
      if (!hay.includes(q)) return false;
    }
    for (const [k, v] of Object.entries(flt))
      if (v && String(a[k] ?? "") !== v) return false;
    return true;
  });
  // «-» هم باید در فیلترها قابل نمایش باشد، چون مقدار معتبر بعضی دستگاه‌هاست.
  const opt = (key, src) => [...new Set(src.map((a) => String(a[key] ?? "")).filter((v) => v !== ""))]
    .sort((a, b) => a.localeCompare(b, "fa", { numeric: true }));
  const setF = (k) => (e) => setFlt({ ...flt, [k]: e.target.value });

  const cascadeOptions = (field) => {
    if (!form) return [];
    const idx = CASCADE_ORDER.indexOf(field);
    if (idx < 0) return [];
    let rows = all;
    for (let i = 0; i < idx; i++) {
      const k = CASCADE_ORDER[i];
      const v = String(form[k] ?? "").trim();
      if (!v) continue;
      rows = rows.filter((r) => sameVal(r[k], v));
    }
    return distinct(rows.map((r) => r[field]));
  };
  const allOptions = (field) => {
    if (field === "MechSystem") {
      return distinct([
        ...all.map((r) => r.MechSystem),
        ...(base.systems || []).map((s) => s.MechSystem),
      ]);
    }
    if (field === "AssetName") {
      const mechSystem = String(form?.MechSystem ?? "").trim();
      if (!mechSystem) return [];
      const system = (base.systems || []).find((s) =>
        sameVal(s.MechSystem, mechSystem),
      );
      const baseNames = system
        ? (base.names || [])
            .filter((n) => sameVal(n.MechSystemID, system.MechSystemsID))
            .map((n) => n.AssetName)
        : [];
      return distinct([
        ...all
          .filter((r) => sameVal(r.MechSystem, mechSystem))
          .map((r) => r.AssetName),
        ...baseNames,
      ]);
    }
    return distinct(all.map((r) => r[field]));
  };
  const locationOptions = () => {
    if (!form) return [];
    const byBuilding = form.Building
      ? all.filter((r) => sameVal(r.Building, form.Building))
      : all;
    let opts = distinct(byBuilding.map((r) => r.Location));
    if (opts.length === 0) opts = distinct(all.map((r) => r.Location));
    return opts;
  };
  // ✅ پیشنهاد «مشخصات» بر اساس نوع دستگاه (و در نبود آن، سیستم) — بدون وابستگی به شماره/طبقه/بلوک
const specificationOptions = () => {
  if (!form) return [];
  const name = String(form.AssetName ?? "").trim();
  const sys = String(form.MechSystem ?? "").trim();
  let rows = all;
  if (name) rows = all.filter((r) => sameVal(r.AssetName, name));
  else if (sys) rows = all.filter((r) => sameVal(r.MechSystem, sys));
  let opts = distinct(rows.map((r) => r.Specifications));
  if (opts.length === 0) opts = distinct(all.map((r) => r.Specifications));
  return opts;
};
const optionsFor = (field) => {
  if (field === "Location") return locationOptions();
  if (field === "Specifications") return specificationOptions();
  if (field === "Entrance" || field === "MechSystem" || field === "AssetName")
    return allOptions(field);
  return cascadeOptions(field);
};
  const setFormField = (k, v) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const startAdd = (pre = null) => {
    setEditingId(null);
    if (!pre) setFormHint("");
    setForm({
      AssetName: "",
      AssetNumber: "",
      Building: "",
      Block: "-",
      Floor: "",
      Entrance: "",
      Location: "",
      MechSystem: "",
      Specifications: "",
      PropertyCode: "0",
      SerialNumber: "0",
      FolderPath: DEFAULT_ASSET_FOLDER,
      ...(pre || {}),
      AssetNumber:
        pre && pre.AssetNumber != null && String(pre.AssetNumber).trim() !== ""
          ? String(pre.AssetNumber)
          : "",
      Floor:
        pre && pre.Floor != null && String(pre.Floor).trim() !== ""
          ? String(pre.Floor)
          : "",
      Block: pre && pre.Block ? String(pre.Block) : "-",
    });
  };
  useEffect(() => {
    if (preset) {
      setTab("devices");
      startAdd(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (a) => {
    setEditingId(a.AssetID);
    setFormHint("");
    setForm({ ...a, FolderPath: a.FolderPath || "" });
  };
  // ✅ کپی دستگاه: فرم افزودن با مقادیر همین ردیف (بدون AssetID)
  const copyAsset = (a) => {
    const { AssetID, ...rest } = a;
    setFormHint(
      `⧉ در حال کپی دستگاه «${a.AssetName || ""}» شماره ${a.AssetNumber ?? "-"} — پس از ویرایش/بررسی، ذخیره کنید.`
    );
    startAdd(rest);
  };
  const toEnDigits = (s) =>
    String(s ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٣٤٥٧٨٩".indexOf(d));
  const numOrNull = (s) => {
    const t = toEnDigits(s).trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };
  const save = async () => {
    if (!form.AssetName || !form.Building) {
      alert("نام دستگاه و ساختمان الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        AssetNumber: numOrNull(form.AssetNumber),
        PropertyCode: numOrNull(form.PropertyCode),
        SerialNumber: numOrNull(form.SerialNumber),
        Floor: numOrNull(form.Floor),
      };
      const res = editingId
        ? await fetch(`/api/assets/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.success) {
        alert("ذخیره شد.");
        const newId = d.AssetID || d.assetId || d.id || null;
        try {
          if (!editingId && preset && preset.MapTag && newId) {
            await fetch("/api/maps/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: [{ assetId: newId, text: preset.MapTag }],
              }),
            });
          }
        } catch { }
        if (onAssetSaved) onAssetSaved(newId, form);
        if (preset) {
          onClose();
          return;
        }
        setForm(null);
        setEditingId(null);
        setFormHint("");
        loadAll();
      } else alert("خطا: " + d.error);
    } catch {
      alert("خطا در ارتباط با سرور");
    }
    setSaving(false);
  };
  // ✅ بازکردن پوشهٔ دستگاه؛ اگر تنظیم نشده یا یافت نشد → پرسش برای تنظیم
  const openAssetFolder = async (a) => {
    const p = String(a?.FolderPath || "").trim();
    if (!p) {
      setFolderAskAsset(a);
      return;
    }
    try {
      const res = await fetch("/api/open-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const d = await res.json();
      if (d.success) {
        if (d.adjusted)
          alert(
            "پوشهٔ ذخیره‌شده یافت نشد؛ نزدیک‌ترین مسیر موجود باز شد:\n" +
              d.opened +
              "\n\nمی‌توانید با دکمهٔ «📂 پوشه» مسیر را اصلاح کنید.",
          );
        return;
      }
      if (confirm("پوشهٔ دستگاه یافت نشد:\n" + p + "\n\nمسیر جدید انتخاب کنید؟"))
        setFolderAskAsset(a);
    } catch {
      if (confirm("خطا در بازکردن پوشه. مسیر جدید انتخاب کنید؟"))
        setFolderAskAsset(a);
    }
  };

  // ✅ ذخیرهٔ مسیر جدید پوشه روی دستگاه + بازکردن آن
  const saveAssetFolder = async (asset, path) => {
    try {
      const res = await fetch(`/api/assets/${asset.AssetID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...asset, FolderPath: path }),
      });
      const d = await res.json();
      if (!d.success) {
        alert("خطا در ذخیرهٔ مسیر پوشه: " + (d.error || "نامشخص"));
        return;
      }
      loadAll();
      try {
        await fetch("/api/open-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
      } catch {}
    } catch {
      alert("خطا در ارتباط با سرور");
    }
  };

  const del = async (id) => {
    if (!confirm("آیا از حذف این دستگاه مطمئن هستید؟")) return;
    try {
      const r = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.success) loadAll();
      else alert(d.error);
    } catch { }
  };
  const addBase = async (kind, value, mechSystemId = null) => {
    try {
      const r = await fetch("/api/base-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value, mechSystemId }),
      });
      const d = await r.json();
      if (d.success) {
        await loadBase();
        return true;
      }
      alert(d.error);
    } catch {
      alert("خطا در ارتباط با سرور");
    }
    return false;
  };

  const inp = "search-input w-full";
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-3"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.button === 0 && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1150px] max-w-[98vw] max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-teal-700">
          <h3 className="font-bold">مدیریت دستگاه‌ها و اطلاعات پایه</h3>
          <button onClick={onClose} className="text-xl">
            ✕
          </button>
        </div>
        <div className="flex gap-2 px-6 py-2 border-b border-teal-700">
          <button
            className={tab === "devices" ? "btn-success" : "btn-primary"}
            onClick={() => {
              setTab("devices");
              setForm(null);
            }}
          >
            دستگاه‌ها
          </button>
          <button
            className={tab === "base" ? "btn-success" : "btn-primary"}
            onClick={() => setTab("base")}
          >
            اطلاعات پایه
          </button>
        </div>
        <div className="p-5 overflow-auto overscroll-contain">
          {tab === "devices" && form === null && (
            <>
              <div className="flex items-stretch gap-2 mb-3">
                <input
                  className={`${inp} flex-1 min-w-0`}
                  aria-label="جستجوی سراسری"
                  placeholder="جستجوی سراسری..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="button" className="btn-primary shrink-0 whitespace-nowrap" onClick={clearFilters}>
                  پاک‌کردن
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <input
                  className={inp}
                  aria-label="کد دستگاه"
                  title="کد دستگاه؛ برای نمایش سایر دستگاه‌ها فیلترها را پاک کنید"
                  placeholder="کد دستگاه"
                  value={flt.AssetID}
                  onChange={setF("AssetID")}
                />
                <select
                  className={inp}
                  value={flt.Building}
                  onChange={setF("Building")}
                >
                  <option value="">ساختمان</option>
                  {opt("Building", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  className={inp}
                  value={flt.Block}
                  onChange={setF("Block")}
                >
                  <option value="">بلوک</option>
                  {opt("Block", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  className={inp}
                  value={flt.Floor}
                  onChange={setF("Floor")}
                >
                  <option value="">طبقه</option>
                  {opt("Floor", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  className={inp}
                  value={flt.Entrance}
                  onChange={setF("Entrance")}
                >
                  <option value="">ورودی</option>
                  {opt("Entrance", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  className={inp}
                  value={flt.Location}
                  onChange={setF("Location")}
                >
                  <option value="">محل</option>
                  {opt("Location", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  className={inp}
                  value={flt.MechSystem}
                  onChange={setF("MechSystem")}
                >
                  <option value="">سیستم</option>
                  {opt("MechSystem", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  className={inp}
                  value={flt.AssetName}
                  onChange={setF("AssetName")}
                >
                  <option value="">دستگاه</option>
                  {opt("AssetName", all).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button className="btn-success" onClick={() => startAdd()}>
                  + دستگاه جدید
                </button>
                {!onSelectAsset && (
                  <button
                    className="btn-primary"
                    disabled={!selectedAsset}
                    title={
                      selectedAsset
                        ? "ایجاد کار جدید برای: " + selectedAsset.AssetName
                        : "ابتدا یک دستگاه را از جدول انتخاب کنید"
                    }
                    onClick={() =>
                      onNewTaskWithAsset && onNewTaskWithAsset(selectedAsset.AssetID)
                    }
                  >
                    + کار جدید با این دستگاه
                  </button>
                )}
                {onSelectAsset && (
                  <div className="text-sm font-bold text-teal-800 py-2">
                    برای نمایش دستگاه‌های دیگر فیلترها را پاک کنید؛ انتخاب ردیف فقط پس از تأیید به فرم کار منتقل می‌شود.
                  </div>
                )}
              </div>
              <div
                className="overflow-auto overscroll-contain rounded border border-gray-300"
                style={{ maxHeight: "52vh" }}
              >
                <table className="task-table w-full min-w-[1080px]">
                  <thead>
                    <tr>
                      <th>کد</th>
                      <th>دستگاه</th>
                      <th>شماره</th>
                      <th>ساختمان</th>
                      <th>بلوک</th>
                      <th>طبقه</th>
                      <th>ورودی</th>
                      <th>محل</th>
                      <th>سیستم</th>
                      <th>اموال</th>
                      <th>عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={11} className="text-center py-6">
                          موردی یافت نشد
                        </td>
                      </tr>
                    )}
                    {filtered.map((a) => (
                      <tr
                        key={a.AssetID}
                        onClick={() => selectAsset(a)}
                        className={
                          selectedAsset?.AssetID === a.AssetID
                            ? "task-row-selected"
                            : ""
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <td>{a.AssetID}</td>
                        <td>{a.AssetName}</td>
                        <td>{a.AssetNumber ?? ""}</td>
                        <td>{a.Building}</td>
                        <td>{a.Block}</td>
                        <td>{a.Floor}</td>
                        <td>{a.Entrance}</td>
                        <td>{a.Location}</td>
                        <td>{a.MechSystem}</td>
                        <td>{a.PropertyCode ?? ""}</td>
                        <td>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              title="ویرایش دستگاه"
                              className="px-2 py-1 text-xs rounded text-white bg-sky-600 hover:bg-sky-700 whitespace-nowrap"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(a);
                              }}
                            >
                              ✏️ ویرایش
                      </button>
                      <button
                        type="button"
                        title="بازکردن پوشهٔ دستگاه (اگر تنظیم نشده باشد، می‌پرسد)"
                        className="px-2 py-1 text-xs rounded text-white bg-teal-600 hover:bg-teal-700 whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAssetFolder(a);
                        }}
                      >
                        📂 پوشه
                      </button>
                            <button
                              type="button"
                              title="کپی دستگاه (نمونهٔ جدید با همین مشخصات)"
                              className="px-2 py-1 text-xs rounded text-white bg-amber-500 hover:bg-amber-600 whitespace-nowrap"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyAsset(a);
                              }}
                            >
                              ⧉ کپی
                            </button>
                            <button
                              type="button"
                              title="حذف دستگاه"
                              className="px-2 py-1 text-xs rounded text-white bg-rose-600 hover:bg-rose-700 whitespace-nowrap"
                              onClick={(e) => {
                                e.stopPropagation();
                                del(a.AssetID);
                              }}
                            >
                              🗑 حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "devices" && form !== null && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-[700px]">
              {preset && !editingId && (
                <div className="md:col-span-4 bg-yellow-100 rounded p-2 text-sm font-bold">
                  🗺 این دستگاه پیش‌پر شده است؛ پس از بررسی/ویرایش، ذخیره کنید
                  یا انصراف بزنید.
                </div>
              )}
              {formHint && !editingId && (
                <div className="md:col-span-4 bg-amber-100 border border-amber-400 rounded p-2 text-sm font-bold">
                  {formHint}
                </div>
              )}
              <div>
                <label className="text-sm font-bold">ساختمان *</label>
                <ComboInput
                  className={inp}
                  value={form.Building}
                  onChange={(v) => setFormField("Building", v)}
                  options={optionsFor("Building")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">بلوک</label>
                <ComboInput
                  className={inp}
                  value={form.Block}
                  onChange={(v) => setFormField("Block", v)}
                  options={optionsFor("Block")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">طبقه</label>
                <ComboInput
                  className={inp}
                  value={form.Floor}
                  onChange={(v) => setFormField("Floor", v)}
                  options={optionsFor("Floor")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">ورودی</label>
                <ComboInput
                  className={inp}
                  value={form.Entrance}
                  onChange={(v) => setFormField("Entrance", v)}
                  options={optionsFor("Entrance")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">محل</label>
                <ComboInput
                  className={inp}
                  value={form.Location}
                  onChange={(v) => setFormField("Location", v)}
                  options={optionsFor("Location")}
                  placeholder="تایپ کنید تا پیشنهاد داده شود..."
                />
              </div>
              <div>
                <label className="text-sm font-bold">سیستم</label>
                <ComboInput
                  className={inp}
                  value={form.MechSystem}
                  onChange={(v) =>
                    setForm((current) =>
                      current
                        ? { ...current, MechSystem: v, AssetName: "" }
                        : current,
                    )
                  }
                  options={optionsFor("MechSystem")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">نام دستگاه *</label>
                <ComboInput
                  className={inp}
                  value={form.AssetName}
                  onChange={(v) => setFormField("AssetName", v)}
                  options={optionsFor("AssetName")}
                  placeholder={
                    form.MechSystem
                      ? "دستگاه متناسب با سیستم را انتخاب کنید..."
                      : "ابتدا سیستم را انتخاب کنید"
                  }
                  disabled={!String(form.MechSystem ?? "").trim()}
                />
              </div>
              <div>
                <label className="text-sm font-bold">شماره</label>
                <ComboInput
                  className={inp}
                  value={form.AssetNumber}
                  onChange={(v) => setFormField("AssetNumber", v)}
                  options={optionsFor("AssetNumber")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">کد اموال</label>
                <ComboInput
                  className={inp}
                  value={form.PropertyCode}
                  onChange={(v) => setFormField("PropertyCode", v)}
                  options={optionsFor("PropertyCode")}
                />
              </div>
              <div>
                <label className="text-sm font-bold">شماره سریال</label>
                <ComboInput
                  className={inp}
                  value={form.SerialNumber}
                  onChange={(v) => setFormField("SerialNumber", v)}
                  options={optionsFor("SerialNumber")}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-bold">مشخصات</label>
                <ComboInput
                  className={inp}
                  value={form.Specifications}
                  onChange={(v) => setFormField("Specifications", v)}
                  options={optionsFor("Specifications")}
                />
              </div>
              <div className="md:col-span-4">
                <label className="text-sm font-bold">مسیر پوشه</label>
                <div className="flex gap-2">
                  <input
                    className={inp}
                    dir="ltr"
                    value={form.FolderPath || ""}
                    onChange={(e) =>
                      setForm({ ...form, FolderPath: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="btn-primary whitespace-nowrap"
                    onClick={() => setShowBrowser(true)}
                  >
                    مرور پوشه‌ها...
                  </button>
                </div>
              </div>
              <div className="md:col-span-4 flex gap-2 mt-2">
                <button
                  className="btn-success"
                  disabled={saving}
                  onClick={save}
                >
                  {saving ? "..." : "ذخیره"}
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (preset) {
                      onClose();
                    } else {
                      setForm(null);
                      setEditingId(null);
                      setFormHint("");
                    }
                  }}
                >
                  انصراف
                </button>
              </div>
            </div>
          )}
          {tab === "base" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold mb-2">
                  سیستم‌های مکانیکی (MechSystems)
                </h4>
                <div className="flex gap-2 mb-2">
                  <input
                    className={inp}
                    value={newSystem}
                    onChange={(e) => setNewSystem(e.target.value)}
                    placeholder="سیستم جدید..."
                  />
                  <button
                    className="btn-success whitespace-nowrap"
                    onClick={async () => {
                      if (await addBase("system", newSystem)) setNewSystem("");
                    }}
                  >
                    افزودن
                  </button>
                </div>
                <div className="h-64 overflow-auto bg-white rounded border p-2">
                  {base.systems.map((s) => {
                    const selected = sameVal(
                      s.MechSystemsID,
                      selectedBaseSystemId,
                    );
                    return (
                      <button
                        key={s.MechSystemsID}
                        type="button"
                        className={`w-full text-right py-1 px-2 border-b rounded ${
                          selected
                            ? "bg-green-100 font-bold"
                            : "hover:bg-gray-100"
                        }`}
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedBaseSystemId(String(s.MechSystemsID));
                          setSelectedBaseAssetNameId("");
                        }}
                      >
                        {s.MechSystem}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="font-bold mb-2">نام دستگاه‌ها (AssetNames)</h4>
                <div className="flex gap-2 mb-2">
                  <input
                    className={inp}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="نام دستگاه جدید..."
                    disabled={!selectedBaseSystemId}
                  />
                  <button
                    className="btn-success whitespace-nowrap"
                    disabled={!selectedBaseSystemId}
                    onClick={async () => {
                      if (
                        await addBase(
                          "name",
                          newName,
                          selectedBaseSystemId,
                        )
                      )
                        setNewName("");
                    }}
                  >
                    افزودن
                  </button>
                </div>
                <div className="h-64 overflow-auto bg-white rounded border p-2">
                  {base.names
                    .filter((n) =>
                      sameVal(n.MechSystemID, selectedBaseSystemId),
                    )
                    .map((n) => {
                      const selected = sameVal(
                        n.AssetNameID,
                        selectedBaseAssetNameId,
                      );
                      return (
                        <button
                          key={n.AssetNameID}
                          type="button"
                          className={`w-full text-right py-1 px-2 border-b rounded ${
                            selected
                              ? "bg-green-100 font-bold"
                              : "hover:bg-gray-100"
                          }`}
                          aria-pressed={selected}
                          onClick={() =>
                            setSelectedBaseAssetNameId(String(n.AssetNameID))
                          }
                        >
                          {n.AssetName}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showBrowser && (
        <FileBrowser
          mode="folder"
          initial={form?.FolderPath || DEFAULT_ASSET_FOLDER}
          title="انتخاب پوشه دستگاه"
          onSelect={(p) => {
            setForm({ ...form, FolderPath: p });
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
      {folderAskAsset && (
        <FileBrowser
          mode="folder"
          initial={folderAskAsset.FolderPath || DEFAULT_ASSET_FOLDER}
          title={"تنظیم پوشهٔ دستگاه کد " + folderAskAsset.AssetID}
          onSelect={(p) => {
            const a = folderAskAsset;
            setFolderAskAsset(null);
            saveAssetFolder(a, p);
          }}
          onClose={() => setFolderAskAsset(null)}
        />
      )}
    </div>
  );
}
