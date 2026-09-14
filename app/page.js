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
  const [loadType, setLoadType] = useState("daily");
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
  const [status, setStatus] = useState({ count: 0, today: "" });

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
  const changeDraft = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const assignDraft = (colKey, value) => setDraft((d) => (d ? { ...d, [colKey]: value } : d));
  
  // ✅ تابع saveDraft اصلاح‌شده: بررسی وجود دستگاه قبل از ذخیره موقت
  const saveDraft = async () => {
    if (!draft) return;
    
    // اگر نام دستگاه و ساختمان مشخص شده‌اند، بررسی وجود در دیتابیس
    if (draft.AssetName && draft.Building) {
      try {
        const checkRes = await fetch('/api/asset-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            AssetName: draft.AssetName,
            AssetNumber: draft.AssetNumber,
            Building: draft.Building,
            Block: draft.Block,
            Floor: draft.Floor,
            Entrance: draft.Entrance,
            Location: draft.Location,
          }),
        });
        const checkData = await checkRes.json();
        
        if (!checkData.found) {
          // دستگاه با این مشخصات کامل وجود ندارد → فراخوانی handleDraftDeviceMissing
          handleDraftDeviceMissing(draft);
          return;
        }
        
        // دستگاه وجود دارد → ذخیره موقت
        localStorage.setItem("task_draft", JSON.stringify(draft));
        alert("پیش‌نویس به‌صورت موقت ذخیره شد.");
      } catch (e) {
        alert("خطا در بررسی دستگاه: " + e.message);
      }
    } else {
      // اطلاعات ناقص → فقط ذخیره موقت
      try {
        localStorage.setItem("task_draft", JSON.stringify(draft));
        alert("پیش‌نویس به‌صورت موقت ذخیره شد.");
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
    try {
      localStorage.removeItem("task_draft");
    } catch { }
  };

  // ✅ جریان «دستگاه یافت نشد → مودال پیش‌پر → بازگشت به سطر»
  const [assetPreset, setAssetPreset] = useState(null);
  
  const handleDraftDeviceMissing = (draftData) => {
    const spec = `${draftData.AssetName || ''} (شماره: ${draftData.AssetNumber || '-'})\nساختمان: ${draftData.Building || ''}, بلوک: ${draftData.Block || '-'}, طبقه: ${draftData.Floor || '-'}, ورودی: ${draftData.Entrance || '-'}, محل: ${draftData.Location || '-'}`;
    
    if (!confirm(`دستگاه با این مشخصات در دیتابیس یافت نشد:\n\n${spec}\n\nآیا مایل به ثبت دستگاه جدید هستید؟`)) return;
    
    setAssetPreset({
      AssetName: draftData.AssetName || '',
      AssetNumber: draftData.AssetNumber || '',
      Building: draftData.Building || '',
      Block: draftData.Block || '-',
      Floor: draftData.Floor || '',
      Entrance: draftData.Entrance || '',
      Location: draftData.Location || '',
      MechSystem: draftData.MechSystem || '',
    });
    setShowAssets(true);
  };
  
  const handleAssetSavedFromDraft = (newId, form) => {
    // پس از ثبت دستگاه، به همان سطر پیش‌نویس برمی‌گردیم
    setDraft((d) => (d ? { ...d, AssetName: form.AssetName, AssetID: newId || null } : d));
  };

  // ✅ صفحه‌بندی
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const pageTasks = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [tasks]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const loadTasks = useCallback(async (type = "daily") => {
    try {
      const res = await fetch(`/api/load-data?type=${type}`);
      const d = await res.json();
      if (d.success) {
        setTasks(d.data || []);
        setStatus({ count: (d.data || []).length, today: new Date().toLocaleDateString("fa-IR") });
      }
    } catch { }
  }, []);
  useEffect(() => { loadTasks("daily"); }, [loadTasks]);

  const handleComplete = async (taskId) => {
    if (!confirm("آیا این کار اتمام یافته است؟")) return;
    try {
      const res = await fetch("/api/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const d = await res.json();
      if (d.success) loadTasks(loadType);
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleDelete = async () => {
    if (!selectedTask) { alert("ابتدا یک کار را انتخاب کنید."); return; }
    if (!confirm(`آیا از حذف کار ${selectedTask.TaskID} مطمئن هستید؟`)) return;
    try {
      const res = await fetch(`/api/tasks/${selectedTask.TaskID}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { setSelectedTask(null); loadTasks(loadType); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleEdit = () => {
    if (selectedTask) openEdit(selectedTask);
    else alert("ابتدا یک کار را انتخاب کنید.");
  };
  const handleRefresh = () => loadTasks(loadType);

  const handleReschedule = async () => {
    if (!confirm("مرتب‌سازی «بدون کارهای زمان ثابت» انجام شود؟")) return;
    try { await fetch("/api/reschedule", { method: "POST" }); loadTasks(loadType); }
    catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleMoveFixed = async () => {
    const m = prompt("چند دقیقه جلو برده شود؟", "60");
    if (m === null) return;
    try {
      const res = await fetch("/api/move-fixed", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: Number(m) }),
      });
      const d = await res.json();
      if (d.success) { alert("انجام شد."); loadTasks(loadType); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handleCorrectPrio = async () => {
    if (!confirm("اصلاح عبارت الویت‌ها انجام شود؟")) return;
    try {
      const res = await fetch("/api/correct-priorities", { method: "POST" });
      const d = await res.json();
      if (d.success) { alert(d.corrected + " مورد اصلاح شد."); loadTasks(loadType); }
      else alert("خطا: " + d.error);
    } catch { alert("خطا در ارتباط با سرور"); }
  };

  const handlePriorityIncrease = async () => {
    if (!confirm("ویرایش الویت (افزایش خودکار الویت کارهای متأخر) انجام شود؟")) return;
    try {
      const res = await fetch("/api/priority-increase", { method: "POST" });
      const d = await res.json();
      if (d.success) { alert(d.changed + " کار افزایش الویت یافت."); loadTasks(loadType); }
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
            <SearchPanel onResult={(rows) => { setTasks(rows); setLoadType("search"); }} onClose={() => setShowSearch(false)} />
          )}
          {showComprehensive && (
            <ComprehensiveSearch onResult={(rows) => { setTasks(rows); setLoadType("search"); }} onClose={() => setShowComprehensive(false)} />
          )}
        </div>
      )}

      <div className="p-3 flex-1 min-h-0 flex flex-col">
        <FullHeight>
          <TaskTable
            tasks={pageTasks}
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
          />
        </FullHeight>
        <div className="pager-bar shrink-0 flex items-center justify-center gap-2 pt-2 pb-1">
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>اولین</button>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>قبلی</button>
          <span className="text-sm font-bold bg-white/80 rounded px-3 py-1">صفحهٔ {page} از {totalPages} — {tasks.length} کار</span>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</button>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>آخرین</button>
        </div>
      </div>

      <div className="shrink-0">
        <StatusBar count={status.count} today={status.today} />
      </div>

      {showTaskForm && (
        <TaskForm
          initial={editTask}
          defaultAssetId={newTaskAssetId}
          onClose={() => { setShowTaskForm(false); setNewTaskAssetId(null); finishingDraftRef.current = false; }}
          onSaved={() => {
            loadTasks(loadType);
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => loadTasks(loadType)} />}
      {folderTask && <FolderModal taskId={folderTask.TaskID} onClose={() => setFolderTask(null)} onSaved={() => loadTasks(loadType)} />}
    </main>
  );
}