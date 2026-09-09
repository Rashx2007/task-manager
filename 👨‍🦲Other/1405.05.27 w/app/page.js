'use client';

import { useState, useEffect, useCallback } from 'react';
import TaskTable from '@/components/TaskTable';
import SearchPanel from '@/components/SearchPanel';
import ComprehensiveSearch from '@/components/ComprehensiveSearch';
import Toolbar from '@/components/Toolbar';
import StatusBar from '@/components/StatusBar';
import TaskForm from '@/components/TaskForm';
import FolderModal from '@/components/FolderModal';
import PersonsModal from '@/components/PersonsModal';
import AssetsModal from '@/components/AssetsModal';
import SettingsModal from '@/components/SettingsModal';
import ReportsModal from '@/components/ReportsModal';
import BackupModal from '@/components/BackupModal';

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [showComprehensiveSearch, setShowComprehensiveSearch] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showPersons, setShowPersons] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [newTaskAssetId, setNewTaskAssetId] = useState(null);
  const [folderTask, setFolderTask] = useState(null);
  const [showAssets, setShowAssets] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [loadType, setLoadType] = useState('daily');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/load-data');
      const result = await res.json();
      if (result.success) {
        setTasks(result.data);
        setRowCount(result.data.length);
        setLoadType(result.type || 'daily');
        if (result.type === 'fixed') {
          alert('با توجه به گذشت زمان مقرر برای کارهای ذیل نسبت به تعیین وضعیت آنها اقدام کنید!');
        }
      } else {
        console.error('Load data failed:', result.error);
      }
    } catch (error) {
      console.error('خطا در بارگذاری:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // معادل منوی «مرتب‌سازی» + بارگذاری مجدد
  const handleRefresh = () => { loadTasks(); };

const handleCorrectPrio = async () => {
  if (!confirm('اصلاح عبارت الویت‌ها انجام شود؟')) return;
  try {
    const res = await fetch('/api/correct-priorities', { method: 'POST' });
    const d = await res.json();
    if (d.success) { alert(d.corrected + ' مورد اصلاح شد.'); loadTasks(); }
    else alert('خطا: ' + d.error);
  } catch { alert('خطا در ارتباط با سرور'); }
};


const handlePriorityIncrease = async () => {
  if (!confirm('ویرایش الویت (افزایش خودکار الویت کارهای متأخر) انجام شود؟')) return;
  try {
    const res = await fetch('/api/priority-increase', { method: 'POST' });
    const d = await res.json();
    if (d.success) { alert(d.changed + ' کار افزایش الویت یافت.'); loadTasks(); }
    else alert('خطا: ' + d.error);
  } catch { alert('خطا در ارتباط با سرور'); }
};


  const openNew = () => {
    setEditTask(null);
    setShowSearch(false);
    setShowComprehensiveSearch(false);
	setNewTaskAssetId(null);
    setShowTaskForm(true);
  };

// ✅ ایجاد کار جدید با دستگاه انتخاب‌شده از مودال دستگاه‌ها
const openNewWithAsset = (assetId) => {
  setEditTask(null);
  setNewTaskAssetId(assetId);
  setShowAssets(false);
  setShowTaskForm(true);
};

  const openEdit = async () => {
    if (!selectedTask) { alert('ابتدا یک سطر از جدول را انتخاب کنید.'); return; }
    setShowSearch(false);
    setShowComprehensiveSearch(false);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.TaskID}`);
      const data = await res.json();
      if (data.success) {
        setEditTask(data.data);
        setShowTaskForm(true);
      } else {
        alert('خطا در دریافت اطلاعات کار');
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    }
  };

  const handleSearch = async (searchParams) => {
    setLoading(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams),
      });
      const data = await res.json();
      if (data.success) {
        setTasks(data.data);
        setRowCount(data.data.length);
      } else {
        alert('خطا در جستجو: ' + (data.error || 'نامشخص'));
      }
    } catch (error) {
      console.error('خطا در جستجو:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (taskId) => {
    if (!confirm('آیا از اتمام این کار مطمئن هستید؟')) return;
    try {
      const res = await fetch('/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (data.success) {
        alert('کار اتمام یافت');
        loadTasks();
      }
    } catch (error) {
      console.error('خطا:', error);
    }
  };

  const handleMoveFixed = async () => {
    const m = prompt('چند دقیقه جلو برده شود؟', '60');
    if (m === null) return;
    try {
      const res = await fetch('/api/move-fixed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: Number(m) }) });
      const d = await res.json();
      if (d.success) { alert('انجام شد.'); loadTasks(); } else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
  };

  

  const handleDelete = async (taskId) => {
    if (!confirm('آیا از حذف این کار مطمئن هستید؟')) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('کار حذف شد');
        loadTasks();
      }
    } catch (error) {
      console.error('خطا:', error);
    }
  };

  const openEditTask = async (task) => {
    const row = task || selectedTask;
    if (!row) { alert('ابتدا یک سطر انتخاب کنید.'); return; }
    const res = await fetch(`/api/tasks/${row.TaskID}`);
    const data = await res.json();
    if (data.success) { setEditTask(data.data); setShowTaskForm(true); }
  };



  // معادل «گزارش لیست کارها» در نسخه دسکتاپ — خروجی اکسل (CSV)
  const handleReport = () => {
    if (!tasks.length) { alert('ردیفی برای گزارش وجود ندارد.'); return; }
    const headers = ['ردیف', 'کد کار', 'دستگاه/مجموعه', 'شماره', 'ساختمان', 'قسمت', 'موضوع', 'توضیحات', 'اولویت', 'وضعیت', 'زمان شروع', 'زمان اتمام'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = tasks.map((t, i) => [
      i + 1,
      t.TaskID,
      t.AssetName,
      t.AssetNumber,
      t.Building,
      t.Location,
      t.TaskTtl,
      t.Descriptions,
      t.Priorities,
      Number(t.Complited) === 1 ? 'اتمام' : 'جاری',
      t.DueDateTime ? new Date(t.DueDateTime).toLocaleString('fa-IR') : '',
      t.EndDateTime ? new Date(t.EndDateTime).toLocaleString('fa-IR') : '',
    ].map(esc).join(','));
    const csv = '\uFEFF' + headers.map(esc).join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش لیست کارها (${new Date().toLocaleDateString('fa-IR')}).csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Toolbar
        onNewTask={openNew}
        onEdit={() => openEditTask(null)}
        onDelete={() => selectedTask && handleDelete(selectedTask.TaskID)}
        onComplete={() => selectedTask && handleComplete(selectedTask.TaskID)}
        onSearch={() => setShowSearch(!showSearch)}
        onComprehensiveSearch={() => setShowComprehensiveSearch(!showComprehensiveSearch)}
        onBackup={() => setShowBackup(true)}
        onRefresh={handleRefresh}
onCorrectPrio={handleCorrectPrio}
onPriorityIncrease={handlePriorityIncrease}
        onPersons={() => setShowPersons(true)}
        onAssets={() => setShowAssets(true)}
        onSettings={() => setShowSettings(true)}
        onMoveFixed={handleMoveFixed}
        onCorrectPrio={handleCorrectPrio}
        onReport={() => setShowReports(true)}
        disableNew={loadType === 'fixed'}
      />

      {showSearch && (
        <SearchPanel onSearch={handleSearch} onClose={() => setShowSearch(false)} />
      )}

      {showComprehensiveSearch && (
        <ComprehensiveSearch
          onSearch={handleSearch}
          onClose={() => setShowComprehensiveSearch(false)}
        />
      )}

      <main className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            <span className="mr-4 text-lg">در حال بارگذاری...</span>
          </div>
        ) : (
          <TaskTable
            tasks={tasks}
            onRowClick={setSelectedTask}
            onComplete={handleComplete}
            onEdit={openEditTask}
            onFolder={setFolderTask}
            selectedTask={selectedTask}
          />
        )}
      </main>

      <StatusBar rowCount={rowCount} />

      {showBackup && (
        <BackupModal onClose={() => setShowBackup(false)} />
      )}

      {showReports && (
        <ReportsModal onClose={() => setShowReports(false)} />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => loadTasks()} />
      )}

      {showAssets && (
  <AssetsModal onClose={() => setShowAssets(false)} onNewTaskWithAsset={openNewWithAsset} />
)}
      {showPersons && <PersonsModal onClose={() => setShowPersons(false)} />}
      {showPersons && <PersonsModal onClose={() => setShowPersons(false)} />}
      {folderTask && (
        <FolderModal taskId={folderTask.TaskID} onClose={() => setFolderTask(null)} />
      )}
      {showReports && <ReportsModal onClose={() => setShowReports(false)} />}

{showTaskForm && (
<TaskForm
initial={editTask}
defaultAssetId={newTaskAssetId}
onClose={() => { setShowTaskForm(false); setNewTaskAssetId(null); }}
onSaved={loadTasks}
/>
)}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-2xl shadow-lg"
          title="بازگشت به بالا"
        >
          ↑
        </button>
      )}
    </div>
  );
}