'use client';
import { useEffect, useState } from 'react';
import { assetSummary, parseTaskId, readTaskSnapshot, TASK_INSPECTOR_EVENT } from '@/lib/task-inspection';

export default function TaskContextHeader({ taskId = null, draftMode = false, draftAsset = null, className = '' }) {
  const id = parseTaskId(taskId);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setError('');
    if (!id) { setSnapshot(null); return; }
    let active = true;
    const controller = new AbortController();
    setSnapshot(null);
    readTaskSnapshot(id, { signal: controller.signal }).then((data) => {
      if (active) setSnapshot({ id, task: data.task });
    }).catch((reason) => {
      if (active && reason.name !== 'AbortError') setError(reason.message);
    });
    return () => { active = false; controller.abort(); };
  }, [id, retry]);
  const task = snapshot?.id === id ? snapshot.task : null;
  return (
    <aside className={`sticky top-0 z-10 shrink-0 rounded-lg border border-teal-700/30 bg-teal-50 p-3 text-sm ${className}`} dir="rtl" aria-label="هویت کار این پنجره">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{id ? `کار این پنجره: ${id}` : draftMode ? 'کار جدید — هنوز ثبت نشده' : 'عمومی — مستقل از کار'}</strong>
        <button type="button" className="btn-primary text-xs" onClick={(event) => {
          event.preventDefault(); event.stopPropagation();
          window.dispatchEvent(new CustomEvent(TASK_INSPECTOR_EVENT, { detail: { originTaskId: id, originSummary: task ? assetSummary(task) : null } }));
        }}>بررسی کار دیگر</button>
      </div>
      {id && <div className="mt-1 break-words">
        {task ? <><span className="font-bold">مشخصات ثبت‌شده: </span>{assetSummary(task)}</>
          : error ? <span role="status" className="text-red-800">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>تلاش مجدد</button></span>
          : <span role="status">در حال دریافت مشخصات همین کار…</span>}
      </div>}
      {draftMode && draftAsset && <div className="mt-1 break-words">دستگاه انتخابی فرم، هنوز ثبت‌نشده: {assetSummary(draftAsset)}</div>}
    </aside>
  );
}
