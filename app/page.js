'use client';
import { useState, useEffect, useCallback } from 'react';
import Toolbar from '@/components/Toolbar';
import StatusBar from '@/components/StatusBar';
import TaskTable from '@/components/TaskTable';
import SearchPanel from '@/components/SearchPanel';
import TaskForm from '@/components/TaskForm';
import ComprehensiveSearch from '@/components/ComprehensiveSearch';
import ReportsModal from '@/components/ReportsModal';
import BackupModal from '@/components/BackupModal';
import AssetsModal from '@/components/AssetsModal';
import PersonsModal from '@/components/PersonsModal';
import SettingsModal from '@/components/SettingsModal';
import FolderModal from '@/components/FolderModal';

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [loadType, setLoadType] = useState('daily');
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
  const [status, setStatus] = useState({ count: 0, today: '' });

  const loadTasks = useCallback(async (type = 'daily') => {
    try {
      const res = await fetch(`/api/load-data?type=${type}`);
      const d = await res.json();
      if (d.success) {
        setTasks(d.data || []);
        setStatus({ count: (d.data || []).length, today: new Date().toLocaleDateString('fa-IR') });
      }
    } catch {}
  }, []);

  useEffect(() => { loadTasks('daily'); }, [loadTasks]);

  const handleComplete = async (taskId) => {
    if (!confirm('آیا این کار اتمام یافته است؟')) return;
    try {
      const res = await fetch('/api/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId }) });
      const d = await res.json();
      if (d.success) loadTasks(loadType); else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const handleDelete = async () => {
    if (!selectedTask) { alert('ابتدا یک کار را انتخاب کنید.'); return; }
    if (!confirm(`آیا از حذف کار ${selectedTask.TaskID} مطمئن هستید؟`)) return;
    try {
      const res = await fetch(`/api/tasks/${selectedTask.TaskID}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) { setSelectedTask(null); loadTasks(loadType); } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const handleEdit = () => { if (selectedTask) openEdit(selectedTask); else alert('ابتدا یک کار را انتخاب کنید.'); };
  const handleRefresh = () => loadTasks(loadType);

  const handleReschedule = async () => {
    if (!confirm('مرتب‌سازی «بدون کارهای زمان ثابت» انجام شود؟')) return;
    try { await fetch('/api/reschedule', { method: 'POST' }); loadTasks(loadType); }
    catch { alert('خطا در ارتباط با سرور'); }
  };

  const handleMoveFixed = async () => {
    const m = prompt('چند دقیقه جلو برده شود؟', '60');
    if (m === null) return;
    try {
      const res = await fetch('/api/move-fixed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: Number(m) }) });
      const d = await res.json();
      if (d.success) { alert('انجام شد.'); loadTasks(loadType); } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const handleCorrectPrio = async () => {
    if (!confirm('اصلاح عبارت الویت‌ها انجام شود؟')) return;
    try {
      const res = await fetch('/api/correct-priorities', { method: 'POST' });
      const d = await res.json();
      if (d.success) { alert(d.corrected + ' مورد اصلاح شد.'); loadTasks(loadType); } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const handlePriorityIncrease = async () => {
    if (!confirm('ویرایش الویت (افزایش خودکار الویت کارهای متأخر) انجام شود؟')) return;
    try {
      const res = await fetch('/api/priority-increase', { method: 'POST' });
      const d = await res.json();
      if (d.success) { alert(d.changed + ' کار افزایش الویت یافت.'); loadTasks(loadType); } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const handleUpdateFolders = async () => {
    if (!confirm('پوشهٔ پیش‌فرض دستگاه‌ها از «اطلاعات پایه» به‌روزرسانی شود؟')) return;
    try {
      const res = await fetch('/api/update-default-folders', { method: 'POST' });
      const d = await res.json();
      if (d.success) alert(d.updated + ' دستگاه به‌روزرسانی شد.'); else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  const openNew = () => { setEditTask(null); setNewTaskAssetId(null); setShowTaskForm(true); };
  const openNewWithAsset = (assetId) => { setEditTask(null); setNewTaskAssetId(assetId); setShowAssets(false); setShowTaskForm(true); };
  const openEdit = (t) => { setEditTask(t); setShowTaskForm(true); };

  return (
    <main className="h-screen bg-[#D8C9B4] flex flex-col overflow-hidden">
      <div className="shrink-0">
        <Toolbar
          onNewTask={openNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onComplete={() => (selectedTask ? handleComplete(selectedTask.TaskID) : alert('ابتدا یک کار را انتخاب کنید.'))}
          onSearch={() => setShowSearch((s) => !s)}
          onComprehensiveSearch={() => setShowComprehensive(true)}
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

      {showSearch && (
        <SearchPanel
          onResult={(rows) => { setTasks(rows); setLoadType('search'); }}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div className="p-3 flex-1 min-h-0 flex flex-col">
        <TaskTable
          tasks={tasks}
          onRowClick={setSelectedTask}
          onComplete={handleComplete}
          onEdit={openEdit}
          onFolder={setFolderTask}
          selectedTask={selectedTask}
        />
      </div>

      <div className="shrink-0">
        <StatusBar count={status.count} today={status.today} />
      </div>

      {showTaskForm && (
        <TaskForm
          initial={editTask}
          defaultAssetId={newTaskAssetId}
          onClose={() => { setShowTaskForm(false); setNewTaskAssetId(null); }}
          onSaved={() => loadTasks(loadType)}
        />
      )}
      {showComprehensive && (
        <ComprehensiveSearch
          onResult={(rows) => { setTasks(rows); setLoadType('search'); }}
          onClose={() => setShowComprehensive(false)}
        />
      )}
      {showReports && <ReportsModal onClose={() => setShowReports(false)} />}
      {showBackup && <BackupModal onClose={() => setShowBackup(false)} />}
      {showAssets && <AssetsModal onClose={() => setShowAssets(false)} onNewTaskWithAsset={openNewWithAsset} />}
      {showPersons && <PersonsModal onClose={() => setShowPersons(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => loadTasks(loadType)} />}
      {folderTask && <FolderModal taskId={folderTask.TaskID} onClose={() => setFolderTask(null)} onSaved={() => loadTasks(loadType)} />}
    </main>
  );
}