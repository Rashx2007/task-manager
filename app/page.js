"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Toolbar from "@/components/Toolbar";
import StatusBar from "@/components/StatusBar";
import TaskTable from "@/components/TaskTable";
import SearchPanel from "@/components/SearchPanel";
import TaskForm from "@/components/TaskForm";
import ComprehensiveSearch from "@/components/ComprehensiveSearch";
import ReportsModal from "@/components/ReportsModal";
import BackupModal from "@/components/BackupModal";
import AssetsModal from "@/components/AssetsModal";
import PersonsModal from "@/components/PersonsModal";
import SettingsModal from "@/components/SettingsModal";
import FolderModal from "@/components/FolderModal";
import { placeRules } from "@/lib/assetRules";

const PAGE_SIZE = 10;

function FullHeight({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const apply = () => {
      if (!el) return;
      const H = el.clientHeight || 0;
      const row = Math.max(40, H / 10.5);
      el.style.setProperty("--row-h", row + "px");
      el.style.setProperty("--head-h", row * 0.5 + "px");
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", apply);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);
  return (
    <div ref={ref} className="table-host">
      {children}
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [newTaskAssetId, setNewTaskAssetId] = useState(null);
  const [showComprehensive, setShowComprehensive] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showPersons, setShowPersons] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [folderTask, setFolderTask] = useState(null);

  // ✅ پیش‌نویس (ایجاد از فیلتر)
  const [draft, setDraft] = useState(null);
  const finishingDraftRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("task_draft");
      if (raw) setDraft(JSON.parse(raw));
    } catch { }
  }, []);

  const startDraft = () => setDraft((d) => d || {});
  const applyPlace = (d) => {
    if (!d || !d.Building) return d;
    const r = placeRules(d.Building, d.Block, d.Floor, d.Entrance);
    if (!r.central) return { ...d, Block: "-", Entrance: "-", Floor: d.Floor };
    return d;
  };
  const changeDraft = (k, v) => setDraft((d) => applyPlace({ ...d, [k]: v }));
  const assignDraft = (colKey, value) => setDraft((d) => (d ? applyPlace({ ...d, [colKey]: value }) : d));

  const [assetPreset, setAssetPreset] = useState(null);
  const handleDraftDeviceMissing = (draftData) => {
    const spec = `${draftData.AssetName || ''} (شماره: ${draftData.AssetNumber || '-'})\nساختمان: ${draftData.Building || ''}، طبقه: ${draftData.Floor ?? '-'}، قسمت: ${draftData.Location || '-'}`;
    if (!confirm(`دستگاه با این مشخصات در دیتابیس یافت نشد:\n\n${spec}\n\nآیا مایل به ثبت دستگاه جدید هستید؟`)) return;
    setAssetPreset({
      AssetName: draftData.AssetName || '',
      AssetNumber: draftData.AssetNumber || '',
      Building: draftData.Building || '',
      Block: draftData.Block || '-',
      Floor: draftData.Floor != null ? String(draftData.Floor) : '',
      Entrance: draftData.Entrance || '',
      Location: draftData.Location || '',
      MechSystem: draftData.MechSystem || '',
    });
    setShowAssets(true);
  };
  const handleAssetSavedFromDraft = (newId, form) => {
    setDraft((d) => (d ? { ...d, AssetName: form.AssetName, AssetID: newId || null } : d));
  };

  const saveDraft = async () => {
    if (!draft) return;
    const d = applyPlace(draft);
    setDraft(d);
    if (d.AssetName && d.Building) {
      try {
        const res = await fetch('/api/asset-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        const cd = await res.json();
        if (cd.needFloor) { alert('برای تعیین دقیق دستگاه، لطفاً «طبقه» را در ردیف «مشخصات مکانی دستگاه» مشخص کنید.'); return; }
        if (!cd.found) { handleDraftDeviceMissing(d); return; }
        if (cd.ambiguous && cd.matches && cd.matches.length > 1) {
          const list = cd.matches
            .map((m, i) => `${i + 1}) کد ${m.AssetID}: بلوک ${m.Block || '-'}، طبقه ${m.Floor}، ورودی ${m.Entrance || '-'}، قسمت ${m.Location || '-'}، سیستم ${m.MechSystem || '-'}`)
            .join('\n');
          const pick = prompt(`چند دستگاه با این مشخصات وجود دارد؛ شمارهٔ ردیف دستگاه مورد نظر را وارد کنید:\n${list}`, '1');
          if (pick === null) return;
          const m = cd.matches[Number(pick) - 1];
          if (!m) { alert('انتخاب نامعتبر بود.'); return; }
          localStorage.setItem('task_draft', JSON.stringify({ ...d, AssetID: m.AssetID }));
          alert(`پیش‌نویس ذخیره شد (دستگاه کد ${m.AssetID}).`);
          return;
        }
        localStorage.setItem('task_draft', JSON.stringify({ ...d, AssetID: cd.AssetID || null }));
        alert('پیش‌نویس به‌صورت موقت ذخیره شد.');
      } catch (e) { alert('خطا در بررسی دستگاه: ' + e.message); }
    } else {
      try {
        localStorage.setItem('task_draft', JSON.stringify(d));
        alert('پیش‌نویس به‌صورت موقت ذخیره شد.');
      } catch { }
    }
  };

  const finishDraft = () => {
    finishingDraftRef.current = true;
    setEditTask({ ...draft });
    setShowTaskForm(true);
  };
  const cancelDraft = () => {
    setDraft(null);
    try { localStorage.removeItem('task_draft'); } catch { }
  };

  // ✅ صفحه‌بندی + فیلتر سمت سرور
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const loadTypeRef = useRef("daily");
  const searchRowsRef = useRef([]);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const applyClientFilters = (rows, fObj) => rows.filter((t) => {
    for (const [k, vals] of Object.entries(fObj)) {
      if (!Array.isArray(vals)) continue;
      if (vals.length === 0) return false;
      const v = k === 'status' ? (Number(t.Complited) === 1 ? 'اتمام' : 'جاری') : String(t[k] ?? '');
      if (!vals.includes(v)) return false;
    }
    return true;
  });

  const loadTasks = useCallback(async (filtersObj, pageNum) => {
    const type = loadTypeRef.current;
    try {
      if (type === 'search') {
        const filteredRows = applyClientFilters(searchRowsRef.current || [], filtersObj);
        setTotalFiltered(filteredRows.length);
        setTasks(filteredRows.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE));
        return;
      }
      const offset = (pageNum - 1) * PAGE_SIZE;
      const filtersStr = Object.keys(filtersObj).length ? `&filters=${encodeURIComponent(JSON.stringify(filtersObj))}` : '';
      const res = await fetch(`/api/load-data?type=${type}&offset=${offset}&limit=${PAGE_SIZE}${filtersStr}`);
      const d = await res.json();
      if (d.success) {
        setTasks(d.data || []);
        setTotalFiltered(d.total || 0);
      }
    } catch { }
  }, []);

  useEffect(() => { loadTasks({}, 1); }, [loadTasks]);
  useEffect(() => { setPage(1); }, [activeFilters]);
  useEffect(() => { loadTasks(activeFilters, page); }, [activeFilters, page, reloadKey, loadTasks]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const handleFiltersChange = useCallback((filters) => {
    const serializable = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v == null) continue;
      serializable[k] = Array.from(v);
    }
    setActiveFilters(serializable);
  }, []);

  const handleComplete = async (taskId) => {
    if (!confirm("آیا این کار اتمام یافته است؟")) return;
    try {
      const res = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const d = await res.json();
      if (d.success) setReloadKey((k) => k + 1);
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleDelete = async () => {
    if (!selectedTask) { alert("ابتدا یک کار را انتخاب کنید."); return; }
    if (!confirm(`آیا از حذف کار ${selectedTask.TaskID} مطمئن هستید؟`)) return;
    try {
      const res = await fetch(`/api/tasks/${selectedTask.TaskID}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { setSelectedTask(null); setReloadKey((k) => k + 1); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleEdit = () => { if (selectedTask) openEdit(selectedTask); else alert("ابتدا یک کار را انتخاب کنید."); };
  const handleRefresh = () => setReloadKey((k) => k + 1);

  const handleReschedule = async () => {
    if (!confirm("مرتب‌سازی «بدون کارهای زمان ثابت» انجام شود؟")) return;
    try { await fetch("/api/reschedule", { method: "POST" }); setReloadKey((k) => k + 1); }
    catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleMoveFixed = async () => {
    const m = prompt("چند دقیقه جلو برده شود؟", "60");
    if (m === null) return;
    try {
      const res = await fetch("/api/move-fixed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: Number(m) }),
      });
      const d = await res.json();
      if (d.success) { alert("انجام شد."); setReloadKey((k) => k + 1); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleCorrectPrio = async () => {
    if (!confirm("اصلاح عبارت الویت‌ها انجام شود؟")) return;
    try {
      const res = await fetch("/api/correct-priorities", { method: "POST" });
      const d = await res.json();
      if (d.success) { alert(d.corrected + " مورد اصلاح شد."); setReloadKey((k) => k + 1); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handlePriorityIncrease = async () => {
    if (!confirm("ویرایش الویت (افزایش خودکار الویت کارهای متأخر) انجام شود؟")) return;
    try {
      const res = await fetch("/api/priority-increase", { method: "POST" });
      const d = await res.json();
      if (d.success) { alert(d.changed + " کار افزایش الویت یافت."); setReloadKey((k) => k + 1); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleUpdateFolders = async () => {
    if (!confirm("پوشهٔ پیش‌فرض دستگاه‌ها از «اطلاعات پایه» به‌روزرسانی شود؟")) return;
    try {
      const res = await fetch("/api/update-default-folders", { method: "POST" });
      const d = await res.json();
      if (d.success) alert(d.updated + " دستگاه به‌روزرسانی شد.");
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const openNew = () => { setEditTask(null); setNewTaskAssetId(null); setShowTaskForm(true); };
  const openNewWithAsset = (assetId) => { setEditTask(null); setNewTaskAssetId(assetId); setShowAssets(false); setShowTaskForm(true); };
  const openEdit = (t) => { setEditTask(t); setShowTaskForm(true); };

  return (
    <main className="h-screen bg-[#D8C9B4] flex flex-col overflow-hidden">
      <div className="shrink-0">
        <Toolbar
          onNewTask={openNew}
          onQuickCreate={startDraft}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onComplete={() => selectedTask ? handleComplete(selectedTask.TaskID) : alert("ابتدا یک کار را انتخاب کنید.")}
          onSearch={() => setShowSearch((s) => !s)}
          onComprehensiveSearch={() => setShowComprehensive((s) => !s)}
          onRefresh={handleRefresh}
          onReport={() => setShowReports(true)}
          onBackup={() => setShowBackup(true)}
          onAssets={() => setShowAssets(true)}
          onPersons={() => setShowPersons(true)}
          onSettings={() => setShowSettings(true)}
          onReschedule={handleReschedule}
          onMoveFixed={handleMoveFixed}
          onUpdateFolders={handleUpdateFolders}
          onCorrectPrio={handleCorrectPrio}
          onPriorityIncrease={handlePriorityIncrease}
        />
      </div>

      {(showSearch || showComprehensive) && (
        <div className="shrink-0 max-h-[45vh] overflow-y-auto overscroll-contain">
          {showSearch && (
            <SearchPanel
              onResult={(rows) => {
                loadTypeRef.current = "search";
                searchRowsRef.current = rows || [];
                setTasks((rows || []).slice(0, PAGE_SIZE));
                setTotalFiltered((rows || []).length);
                setPage(1);
              }}
              onClose={() => setShowSearch(false)}
            />
          )}
          {showComprehensive && (
            <ComprehensiveSearch
              onResult={(rows) => {
                loadTypeRef.current = "search";
                searchRowsRef.current = rows || [];
                setTasks((rows || []).slice(0, PAGE_SIZE));
                setTotalFiltered((rows || []).length);
                setPage(1);
              }}
              onClose={() => setShowComprehensive(false)}
            />
          )}
        </div>
      )}

      <div className="p-3 flex-1 min-h-0 flex flex-col">
        <FullHeight>
          <TaskTable
            tasks={tasks}
            startNumber={(page - 1) * PAGE_SIZE}
            onRowClick={setSelectedTask}
            onComplete={handleComplete}
            onEdit={openEdit}
            onFolder={setFolderTask}
            selectedTask={selectedTask}
            draft={draft}
            onDraftChange={changeDraft}
            onDraftAssign={assignDraft}
            onDraftSave={saveDraft}
            onDraftFinish={finishDraft}
            onDraftCancel={cancelDraft}
            onFiltersChange={handleFiltersChange}
          />
        </FullHeight>
        <div className="pager-bar shrink-0 flex items-center justify-center gap-2 pt-2 pb-1">
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>اولین</button>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>قبلی</button>
          <span className="text-sm font-bold bg-white/80 rounded px-3 py-1">صفحهٔ {page} از {totalPages} — {totalFiltered} کار</span>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</button>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>آخرین</button>
        </div>
      </div>

      <div className="shrink-0">
        <StatusBar count={totalFiltered} today={new Date().toLocaleDateString("fa-IR")} />
      </div>

      {showTaskForm && (
        <TaskForm
          initial={editTask}
          defaultAssetId={newTaskAssetId}
          onClose={() => {
            setShowTaskForm(false);
            setNewTaskAssetId(null);
            finishingDraftRef.current = false;
          }}
          onSaved={() => {
            setReloadKey((k) => k + 1);
            if (finishingDraftRef.current) { cancelDraft(); finishingDraftRef.current = false; }
          }}
        />
      )}
      {showReports && <ReportsModal onClose={() => setShowReports(false)} />}
      {showBackup && <BackupModal onClose={() => setShowBackup(false)} />}
      {showAssets && (
        <AssetsModal
          preset={assetPreset}
          onAssetSaved={assetPreset ? handleAssetSavedFromDraft : null}
          onClose={() => { setShowAssets(false); setAssetPreset(null); }}
          onNewTaskWithAsset={openNewWithAsset}
        />
      )}
      {showPersons && <PersonsModal onClose={() => setShowPersons(false)} />}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => setReloadKey((k) => k + 1)} />
      )}
      {folderTask && (
        <FolderModal taskId={folderTask.TaskID} onClose={() => setFolderTask(null)} onSaved={() => setReloadKey((k) => k + 1)} />
      )}
    </main>
  );
}