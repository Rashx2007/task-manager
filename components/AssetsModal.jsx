"use client";
import { useState, useEffect, useCallback } from "react";
import FileBrowser from "./FileBrowser";
import { placeRules, isCentral } from "@/lib/assetRules";

const DEFAULT_ASSET_FOLDER = "D:\\(فنّی)";

const distinct = (arr) =>
  [
    ...new Set(
      arr
        .map((x) => (x == null ? "" : String(x)))
        .filter((x) => x !== "" && x !== "-"),
    ),
  ].sort((a, b) => a.localeCompare(b, "fa"));

export default function AssetsModal({
  onClose,
  onNewTaskWithAsset,
  onSelectAsset = null,
  preset = null,
  onAssetSaved = null,
}) {
  const [tab, setTab] = useState("devices");
  const [all, setAll] = useState([]);
  const [search, setSearch] = useState("");
  const [flt, setFlt] = useState({
    Building: "",
    Block: "",
    Floor: "",
    Entrance: "",
    Location: "",
    MechSystem: "",
    AssetName: "",
  });
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [base, setBase] = useState({ names: [], systems: [] });
  const [newName, setNewName] = useState("");
  const [newSystem, setNewSystem] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const r = await fetch("/api/assets");
      const d = await r.json();
      if (d.success) setAll(d.data || []);
    } catch {}
  }, []);
  const loadBase = useCallback(async () => {
    try {
      const r = await fetch("/api/base-info");
      const d = await r.json();
      if (d.success)
        setBase({ names: d.names || [], systems: d.systems || [] });
    } catch {}
  }, []);
  useEffect(() => {
    loadAll();
    loadBase();
  }, [loadAll, loadBase]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", h);
    };
  }, [onClose]);

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

  const opt = (key, src) => distinct(src.map((a) => a[key]));
  const setF = (k) => (e) => setFlt({ ...flt, [k]: e.target.value });

  const startAdd = (pre = null) => {
    const base = {
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
    };
    const r = placeRules(base.Building, base.Block, base.Floor, base.Entrance);
    if (!r.central) {
      base.Block = r.block;
      base.Floor = String(r.floor);
      base.Entrance = r.entrance;
    }
    setEditingId(null);
    setForm(base);
  };

  // ✅ اگر preset از نقشه آمده: مستقیم فرم افزودن با فیلدهای پیش‌پر باز شود
  useEffect(() => {
    if (preset) {
      setTab("devices");
      startAdd(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (a) => {
    setEditingId(a.AssetID);
    setForm({ ...a, FolderPath: a.FolderPath || "" });
  };

  const save = async () => {
    if (!form.AssetName || !form.Building) {
      alert("نام دستگاه و ساختمان الزامی است.");
      return;
    }
    // ✅ معادل CheckRecordDuplication دسکتاپ: جلوگیری از ثبت/ویرایش رکورد تکراری
    try {
      const cr = await fetch("/api/asset-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, excludeAssetId: editingId || null }),
      });
      const cd = await cr.json();
      if (cd.found) {
        alert("مورد جدید ثبت نشد.\nمورد تکراری است.");
        return;
      }
    } catch {}
        // ✅ چک تکراری با کلید کامل (معادل CheckRecordDuplication دسکتاپ)
    try {
      const cr = await fetch('/api/asset-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, excludeAssetId: editingId || null }),
      });
      const cd = await cr.json();
      if (cd.needFloor) { alert('لطفاً «طبقه» را مشخص کنید؛ برای همهٔ ساختمان‌ها الزامی است.'); return; }
      if (cd.found) {
        const m = (cd.matches || [])[0];
        alert(`ثبت نشد.\nدستگاه تکراری با کد ${m ? m.AssetID : '-'} (بلوک ${m?.Block || '-'}، طبقه ${m?.Floor}، ورودی ${m?.Entrance || '-'}، قسمت ${m?.Location || '-'}) از قبل وجود دارد.`);
        return;
      }
    } catch {}
    setSaving(true);
    try {
      const res = editingId
        ? await fetch(`/api/assets/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
        : await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
      const d = await res.json();
      if (d.success) {
        alert("ذخیره شد.");
        const newId = d.AssetID || d.assetId || d.id || null;
        // ✅ لینک برچسب نقشه (MapTag) به دستگاه جدیدِ ساخته‌شده از نقشه
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
        } catch {}
        // ✅ اطلاع‌رسانی به page.js برای به‌روزرسانی سطر پیش‌نویس (جدا از MapTag)
        if (onAssetSaved) onAssetSaved(newId, form);
        setForm(null);
        setEditingId(null);
        loadAll();
      } else alert("خطا: " + d.error);
    } catch {
      alert("خطا در ارتباط با سرور");
    }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("آیا از حذف این دستگاه مطمئن هستید؟")) return;
    try {
      const r = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.success) loadAll();
      else alert(d.error);
    } catch {}
  };

  const addBase = async (kind, value) => {
    const r = await fetch("/api/base-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, value }),
    });
    const d = await r.json();
    if (d.success) loadBase();
    else alert(d.error);
  };

  const inp = "search-input w-full";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <input
                  className={inp}
                  placeholder="جستجوی سراسری..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
              <div className="flex flex-wrap gap-2 mb-3">
                {!onSelectAsset && (
                  <>
                    <button className="btn-success" onClick={() => startAdd()}>
                      + دستگاه جدید
                    </button>
                    <button
                      className="btn-primary"
                      disabled={!selectedAsset}
                      title={
                        selectedAsset
                          ? "ایجاد کار جدید برای: " + selectedAsset.AssetName
                          : "ابتدا یک دستگاه را از جدول انتخاب کنید"
                      }
                      onClick={() =>
                        onNewTaskWithAsset &&
                        onNewTaskWithAsset(selectedAsset.AssetID)
                      }
                    >
                      + کار جدید با این دستگاه
                    </button>
                  </>
                )}
                {onSelectAsset && (
                  <div className="text-sm font-bold text-teal-800 py-2">
                    یک دستگاه را انتخاب کنید تا به فرم کار برگردد.
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
                        onClick={() =>
                          onSelectAsset
                            ? onSelectAsset(a.AssetID)
                            : setSelectedAsset(a)
                        }
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
                        <td className="whitespace-nowrap">
                          <button
                            className="btn-primary px-2 py-1 text-xs ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(a);
                            }}
                          >
                            ویرایش
                          </button>
                          <button
                            className="btn-danger px-2 py-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              del(a.AssetID);
                            }}
                          >
                            حذف
                          </button>
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
                  📋 این دستگاه پیش‌پر شده است؛ پس از بررسی/ویرایش، ذخیره کنید
                  یا انصراف بزنید.{" "}
                </div>
              )}
              <div className="md:col-span-4 bg-teal-50 rounded p-2 text-sm font-bold">
                {isCentral(form.Building)
                  ? "🏢 ساختمان مرکزی: بلوک، طبقه و ورودی را وارد کنید."
                  : "🏢 ساختمان غیرمرکزی: بلوک «-»، طبقه «0» و ورودی «-» به‌صورت خودکار اعمال می‌شود."}
              </div>'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isCentral } from '@/lib/assetRules';
import Tip from './Tip';

const assetSpec = (t) =>
  t.AssetName
    ? `${t.AssetName}، قسمت: ${t.Location || '-'} (ساختمان ${t.Building || '-'}، بلوک: ${t.Block || '-'}، طبقه: ${t.Floor ?? '-'}، ورودی: ${t.Entrance || '-'}) شماره: ${t.AssetNumber ?? '-'} [کد:${t.AssetID}]`
    : '';

const COLUMNS = [
  { key: 'row',          label: 'ردیف',          sortable: false, filterable: false },
  { key: 'TaskID',       label: 'کد کار',        sortable: true,  filterable: true,  source: 'task' },
  { key: 'AssetName',    label: 'دستگاه/مجموعه', sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'AssetNumber',  label: 'شماره',         sortable: true,  filterable: true,  source: 'asset' },
  { key: 'Building',     label: 'ساختمان',       sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'Location',     label: 'قسمت',          sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'TaskTtl',      label: 'موضوع',         sortable: true,  filterable: true,  assignable: true, source: 'task' },
  { key: 'Descriptions', label: 'توضیحات',       sortable: false, filterable: false, source: 'task' },
  { key: 'Priorities',   label: 'اولویت',        sortable: true,  filterable: true,  source: 'task' },
  { key: 'status',       label: 'وضعیت',         sortable: true,  filterable: true,  source: 'task' },
  { key: 'DueDateTime',  label: 'زمان شروع',     sortable: true,  filterable: false },
  { key: 'EndDateTime',  label: 'زمان پایان',    sortable: true,  filterable: false },
  { key: 'attachments',  label: 'ضمائم',         sortable: false, filterable: false },
  { key: 'actions',      label: 'عملیات',        sortable: false, filterable: false },
];

const PLACE_COLS = [
  { key: 'Block', label: 'بلوک', source: 'asset' },
  { key: 'Floor', label: 'طبقه', source: 'asset' },
  { key: 'Entrance', label: 'ورودی', source: 'asset' },
  { key: 'MechSystem', label: 'سیستم', source: 'asset' },
];

export default function TaskTable({
  tasks, startNumber = 0, onRowClick, onComplete, onEdit, onFolder, selectedTask,
  draft, onDraftChange, onDraftAssign, onDraftSave, onDraftFinish, onDraftCancel, onDraftDeviceMissing,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({}); // { key: Set(انتخاب‌شده‌ها) | null = همه }
  const [menu, setMenu] = useState(null);
  const [menuValues, setMenuValues] = useState(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.col-menu') && !e.target.closest('.col-menu-btn')) setMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');
  const draftActive = draft != null;
  const centralDraft = isCentral(draft?.Building);

  const loadMenuValues = async (col) => {
    setMenuLoading(true);
    setMenuValues(null);
    if (col.key === 'status') { setMenuValues(['جاری', 'اتمام']); setMenuLoading(false); return; }
    let constraints = {};
    if (draftActive) {
      constraints = {
        AssetName: draft.AssetName, AssetNumber: draft.AssetNumber, Building: draft.Building,
        Block: draft.Block, Floor: draft.Floor, Entrance: draft.Entrance, Location: draft.Location,
        MechSystem: draft.MechSystem, TaskTtl: draft.TaskTtl, Priorities: draft.Priorities,
      };
      delete constraints[col.key];
      constraints = Object.fromEntries(Object.entries(constraints).filter(([, v]) => String(v ?? '').trim() !== ''));
    }
    try {
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: col.key, source: col.source || 'task', constraints }),
      });
      const d = await res.json();
      setMenuValues(d.success ? d.values : []);
    } catch { setMenuValues([]); }
    setMenuLoading(false);
  };

  const openMenu = (e, col) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const next = (menu && menu.key === col.key) ? null : { key: col.key, y: Math.min(r.bottom + 2, window.innerHeight - 340), right: window.innerWidth - r.right };
    setMenuQuery('');
    setMenu(next);
    if (next && (col.filterable || col.assignable)) loadMenuValues(col);
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  };

  // ✅ معنای اکسلی: Set = گزینه‌های تیک‌خورده؛ null = همه
  const isChecked = (key, v) => filters[key] == null || filters[key].has(v);
  const allChecked = (key) => filters[key] == null || (menuValues != null && filters[key].size === menuValues.length);
  const toggleFilterValue = (key, value) => {
    setFilters((prev) => {
      let cur = prev[key];
      if (cur == null) cur = new Set(menuValues || []);
      const next = new Set(cur);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...prev, [key]: next };
    });
  };
  const setAllChecked = (key, checked) => setFilters((prev) => ({ ...prev, [key]: checked ? null : new Set() }));
  const clearFilter = (key) => setFilters((prev) => ({ ...prev, [key]: null }));

  const filtered = draftActive
    ? (tasks || [])
    : (tasks || []).filter((t) => {
        for (const [key, set] of Object.entries(filters)) {
          if (set == null) continue;
          const v = key === 'status' ? (Number(t.Complited) === 1 ? 'اتمام' : 'جاری') : String(t[key] ?? '');
          if (!set.has(v)) return false;
        }
        return true;
      });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    let av, bv;
    if (sortKey === 'status') { av = Number(a.Complited); bv = Number(b.Complited); }
    else { av = a[sortKey]; bv = b[sortKey]; }
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    const cmp = String(av).localeCompare(String(bv), 'fa', { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const hasAnyFilter = !draftActive && Object.values(filters).some((s) => s != null);

  // ✅ خانهٔ سطر اول پیش‌نویس
  const draftCell = (key, ph) => (
    <td className="draft-cell">
      <div className="draft-cell-wrap">
        <input className="draft-input" value={draft[key] != null ? String(draft[key]) : ''} placeholder={ph}
          onChange={(e) => onDraftChange(key, e.target.value)}
          onClick={(e) => { const col = COLUMNS.find((c) => c.key === key); if (col) openMenu(e, col); }} />
        <button type="button" className="col-menu-btn" title="گزینه‌ها از کل دیتابیس"
          onClick={(e) => { const col = COLUMNS.find((c) => c.key === key); if (col) openMenu(e, col); }}>▾</button>
      </div>
    </td>
  );

  // ✅ خانهٔ سطر دوم: بلوک/ورودی فقط برای مرکزی فعال؛ طبقه و سیستم همیشه فعال + پیشنهاد
  const draftPlaceCell = (col) => {
    const disabled = (col.key === 'Block' || col.key === 'Entrance') ? !centralDraft : false;
    return (
      <td className="draft-cell">
        <div className="draft-cell-wrap">
          <input className="draft-input" value={draft[col.key] != null ? String(draft[col.key]) : ''} placeholder={col.label} disabled={disabled}
            onChange={(e) => onDraftChange(col.key, e.target.value)}
            onClick={(e) => { if (!disabled) openMenu(e, col); }} />
          {!disabled && (
            <button type="button" className="col-menu-btn" title="گزینه‌ها از کل دیتابیس" onClick={(e) => openMenu(e, col)}>▾</button>
          )}
        </div>
      </td>
    );
  };

  if (!tasks || tasks.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-600 bg-[#b4a9b0] rounded-lg shadow-lg">
        کاری یافت نشد
      </div>
    );

  const menuCol = menu ? COLUMNS.find((c) => c.key === menu.key) || PLACE_COLS.find((c) => c.key === menu.key) : null;
  const shownValues = (menuValues || []).filter((v) => !menuQuery || String(v).includes(menuQuery));

  return (
    <div className="h-full overflow-auto overscroll-contain rounded-lg shadow-lg bg-[#b4a9b0]">
      <table className="task-table w-full min-w-[1300px]">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const isFiltered = !draftActive && filters[col.key] != null;
              const isSorted = sortKey === col.key;
              const isOpen = menu && menu.key === col.key;
              return (
                <th key={col.key}>
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {(col.sortable || col.filterable) && (
                      <button type="button" onClick={(e) => openMenu(e, col)}
                        className={`col-menu-btn ${isFiltered || isSorted || isOpen ? 'active' : ''}`}
                        title={draftActive ? 'انتخاب برای کار جدید' : 'مرتب‌سازی / فیلتر'}>
                        {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : (isFiltered ? '🔽' : '⋮')}
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {draftActive && (
            <tr className="draft-row">
              <td>—</td>
              <td><span className="draft-badge">پیش‌نویس</span></td>
              {draftCell('AssetName', 'دستگاه/مجموعه')}
              {draftCell('AssetNumber', 'شماره')}
              {draftCell('Building', 'ساختمان')}
              {draftCell('Location', 'قسمت')}
              {draftCell('TaskTtl', 'موضوع')}
              {draftCell('Descriptions', 'توضیحات')}
              <td>-</td>
              <td>پیش‌نویس</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>
                <div className="draft-actions">
                  <button type="button" className="btn-success" onClick={(e) => { e.stopPropagation(); onDraftSave(); }}>ذخیره موقت</button>
                  <button type="button" className="btn-primary" onClick={(e) => { e.stopPropagation(); onDraftFinish(); }}>تکمیل</button>
                  <button type="button" className="btn-danger" onClick={(e) => { e.stopPropagation(); onDraftCancel(); }}>✕</button>
                </div>
              </td>
            </tr>
          )}
          {draftActive && (
            <tr className="draft-row draft-row-place">
              <td colSpan={2}><span className="draft-badge">مشخصات مکانی دستگاه</span></td>
              {draftPlaceCell(PLACE_COLS[0])}
              {draftPlaceCell(PLACE_COLS[1])}
              {draftPlaceCell(PLACE_COLS[2])}
              {draftPlaceCell(PLACE_COLS[3])}
              <td colSpan={8} className="draft-place-note">
                {centralDraft
                  ? '🏢 ساختمان مرکزی: بلوک، طبقه و ورودی را تایپ یا از ▾ انتخاب کنید.'
                  : '🏢 ساختمان غیرمرکزی: بلوک و ورودی «-» خودکار؛ «طبقه» را تایپ یا از ▾ انتخاب کنید.'}
              </td>
            </tr>
          )}
          {sorted.length === 0 && !draftActive && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '20px' }}>
                هیچ کاری با این فیلترها یافت نشد
                {hasAnyFilter && (
                  <button type="button" onClick={() => setFilters({})} className="btn-danger px-2 py-1 text-xs mr-2">حذف همه فیلترها</button>
                )}
              </td>
            </tr>
          )}
          {sorted.map((t, i) => (
            <tr key={t.TaskID} onClick={() => onRowClick(t)} onDoubleClick={() => onEdit && onEdit(t)}
              className={selectedTask?.TaskID === t.TaskID ? 'task-row-selected' : ''} style={{ cursor: 'pointer' }}>
              <td>{startNumber + i + 1}</td>
              <td><Tip tip={`ثبت: ${fmtFa(t.Submit_Date)}\nاولویت: ${t.Priorities || '-'}`}>{t.TaskID}</Tip></td>
              <td><Tip tip={assetSpec(t)}>{t.AssetName || '-'}</Tip></td>
              <td>{t.AssetNumber ?? '-'}</td>
              <td>{t.Building || '-'}</td>
              <td>{t.Location || '-'}</td>
              <td className="max-w-[220px]"><Tip tip={t.TaskTtl} block><div className="truncate">{t.TaskTtl}</div></Tip></td>
              <td className="max-w-[320px]"><Tip tip={t.Descriptions} block><div className="line-clamp-2">{t.Descriptions || '-'}</div></Tip></td>
              <td>{t.Priorities || '-'}</td>
              <td>{Number(t.Complited) === 1 ? 'اتمام' : 'جاری'}</td>
              <td>{fmtFa(t.DueDateTime)}</td>
              <td>{fmtFa(t.EndDateTime)}</td>
              <td><button className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onFolder && onFolder(t); }}>📁</button></td>
              <td>
                {Number(t.Complited) !== 1 && (
                  <button className="btn-success px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onComplete(t.TaskID); }}>اتمام</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasAnyFilter && (
        <div className="filter-summary">
          <span style={{ fontWeight: 'bold' }}>فیلترهای فعال:</span>
          {Object.entries(filters).filter(([, s]) => s != null).map(([k, s]) => {
            const col = COLUMNS.find((c) => c.key === k);
            return (
              <span key={k} className="filter-chip">
                {col ? col.label : k}: {s.size} انتخاب
                <button type="button" onClick={() => clearFilter(k)}>✕</button>
              </span>
            );
          })}
          <button type="button" onClick={() => setFilters({})} className="btn-danger px-2 py-1 text-xs">حذف همه</button>
        </div>
      )}

      {menu && menuCol && createPortal(
        <div className="col-menu" style={{ top: menu.y, right: menu.right }} onClick={(e) => e.stopPropagation()}>
          {draftActive ? (
            <div className="col-menu-section">
              <div className="col-menu-title">
                {menuCol.key === 'Priorities'
                  ? 'الویت در مرحلهٔ پیش‌نویس قابل انتخاب نیست'
                  : `انتخاب «${menuCol.label}» از کل دیتابیس`}
              </div>
              {menuCol.key === 'Priorities' ? (
                <div className="col-menu-empty">الویت پس از ثبت کار (تکمیل ثبت) تنظیم می‌شود.</div>
              ) : (
                <>
                  <input className="col-menu-search" placeholder="تایپ برای جستجو در گزینه‌ها…" value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} />
                  {menuLoading && <div className="col-menu-empty">در حال خواندن گزینه‌ها…</div>}
                  {!menuLoading && shownValues.length === 0 && <div className="col-menu-empty">گزینه‌ای یافت نشد</div>}
                  {!menuLoading && (
                    <div className="col-menu-list">
                      {shownValues.map((v) => (
                        <button key={v} type="button" onClick={() => { onDraftAssign(menuCol.key, v); setMenu(null); }}>{v}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {menuCol.sortable && (
                <div className="col-menu-section">
                  <div className="col-menu-title">مرتب‌سازی</div>
                  <button type="button" onClick={() => toggleSort(menuCol.key)}>
                    {sortKey === menuCol.key && sortDir === 'asc' ? '✓ ' : '   '}صعودی
                  </button>
                  <button type="button" onClick={() => { setSortKey(menuCol.key); setSortDir('desc'); }}>
                    {sortKey === menuCol.key && sortDir === 'desc' ? '✓ ' : '   '}نزولی
                  </button>
                  {sortKey === menuCol.key && (
                    <button type="button" onClick={() => { setSortKey(null); setSortDir('asc'); }}>حذف مرتب‌سازی</button>
                  )}
                </div>
              )}
              {menuCol.filterable && (
                <div className="col-menu-section">
                  <div className="col-menu-title">فیلتر از کل دیتابیس ({menuValues ? menuValues.length : 0} مقدار)</div>
                  <input className="col-menu-search" placeholder="تایپ برای جستجو در گزینه‌ها…" value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} />
                  <label className="col-menu-item col-menu-selectall">
                    <input type="checkbox" checked={allChecked(menuCol.key)} onChange={(e) => setAllChecked(menuCol.key, e.target.checked)} />
                    <span>(انتخاب همه)</span>
                  </label>
                  {menuLoading && <div className="col-menu-empty">در حال خواندن گزینه‌ها…</div>}
                  {!menuLoading && (
                    <div className="col-menu-list">
                      {shownValues.map((v) => (
                        <label key={v} className="col-menu-item">
                          <input type="checkbox" checked={isChecked(menuCol.key, v)} onChange={() => toggleFilterValue(menuCol.key, v)} />
                          <span className="truncate">{v}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="col-menu-section" style={{ borderBottom: 'none' }}>
            <button type="button" onClick={() => setMenu(null)} style={{ background: '#e5e7eb' }}>بستن</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
              <div>
                <label className="text-sm font-bold">نام دستگاه *</label>
                <input
                  className={inp}
                  list="asset-names"
                  value={form.AssetName || ""}
                  onChange={(e) =>
                    setForm({ ...form, AssetName: e.target.value })
                  }
                />
                <datalist id="asset-names">
                  {base.names.map((n) => (
                    <option key={n.AssetNameID} value={n.AssetName} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-bold">شماره</label>
                <input
                  className={inp}
                  value={form.AssetNumber ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, AssetNumber: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-bold">ساختمان *</label>
                <input
                  className={inp}
                  list="buildings-list"
                  value={form.Building || ""}
                  onChange={(e) => {
                    const nf = { ...form, Building: e.target.value };
                    const r = placeRules(
                      nf.Building,
                      nf.Block,
                      nf.Floor,
                      nf.Entrance,
                    );
                    if (!r.central) {
                      nf.Block = r.block;
                      nf.Floor = String(r.floor);
                      nf.Entrance = r.entrance;
                    }
                    setForm(nf);
                  }}
                />{" "}
                <datalist id="buildings-list">
                  {opt("Building", all).map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-bold">بلوک</label>
                <input
                  className={inp}
                  disabled={!isCentral(form.Building)}
                  value={form.Block ?? ""}
                  onChange={(e) => setForm({ ...form, Block: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-bold">طبقه</label>
                <input
                  className={inp}
                  disabled={!isCentral(form.Building)}
                  value={form.Floor ?? ""}
                  onChange={(e) => setForm({ ...form, Floor: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-bold">ورودی</label>
                <input
                  className={inp}
                  disabled={!isCentral(form.Building)}
                  value={form.Entrance ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, Entrance: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-bold">محل</label>
                <input
                  className={inp}
                  value={form.Location ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, Location: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-bold">سیستم</label>
                <input
                  className={inp}
                  list="mech-systems"
                  value={form.MechSystem ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, MechSystem: e.target.value })
                  }
                />
                <datalist id="mech-systems">
                  {base.systems.map((s) => (
                    <option key={s.MechSystemsID} value={s.MechSystem} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-bold">کد اموال</label>
                <input
                  className={inp}
                  value={form.PropertyCode ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, PropertyCode: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-bold">شماره سریال</label>
                <input
                  className={inp}
                  value={form.SerialNumber ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, SerialNumber: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-bold">مشخصات</label>
                <input
                  className={inp}
                  value={form.Specifications ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, Specifications: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-3">
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
                    setForm(null);
                    setEditingId(null);
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
                <h4 className="font-bold mb-2">نام دستگاه‌ها (AssetNames)</h4>
                <div className="flex gap-2 mb-2">
                  <input
                    className={inp}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="نام جدید..."
                  />
                  <button
                    className="btn-success whitespace-nowrap"
                    onClick={() => {
                      addBase("name", newName);
                      setNewName("");
                    }}
                  >
                    افزودن
                  </button>
                </div>
                <div className="max-h-64 overflow-auto bg-white rounded border p-2">
                  {base.names.map((n) => (
                    <div key={n.AssetNameID} className="py-1 border-b">
                      {n.AssetName}
                    </div>
                  ))}
                </div>
              </div>
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
                    onClick={() => {
                      addBase("system", newSystem);
                      setNewSystem("");
                    }}
                  >
                    افزودن
                  </button>
                </div>
                <div className="max-h-64 overflow-auto bg-white rounded border p-2">
                  {base.systems.map((s) => (
                    <div key={s.MechSystemsID} className="py-1 border-b">
                      {s.MechSystem}
                    </div>
                  ))}
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
    </div>
  );
}
