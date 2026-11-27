//components/GroupCreateModal.jsx
'use client';
import { useState } from 'react';

const post = async (body) => {
  const res = await fetch('/api/task-groups/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!json || !json.success) throw new Error(json?.error || 'عملیات گروه‌بندی انجام نشد.');
  return json.data;
};

export default function GroupCreateModal({ taskIds, onCancel, onCreated }) {
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState(Math.min(...taskIds));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const base = { selectedTaskIds: taskIds, referenceTaskId: Number(reference) };
  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const doPreview = () => run(async () => setPreview(await post({ mode: 'preview', ...base })));
  const doCreate = () => run(async () => {
    const data = await post({ mode: 'create', ...base, title, requestId, expectedPreviewHash: preview.previewHash });
    onCreated(data);
  });
  const blockers = preview?.blockers || [];
  const canCreate = !!preview && preview.ready && !blockers.length && title.trim() && !busy;
  const change = (setter) => (e) => { setter(e.target.value); setPreview(null); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl p-5 w-[34rem] max-w-[95vw]">
        <h3 className="font-bold mb-1">گروه‌کردن کارها</h3>
        <p className="text-xs text-gray-600 mb-3">{taskIds.length} کار انتخاب شده است: {taskIds.join('، ')}</p>
        <label className="block text-sm font-bold mb-1">عنوان گروه</label>
        <input className="search-input w-full mb-3" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <label className="block text-sm font-bold mb-1">کار مرجع</label>
        <select className="search-input w-full mb-3" value={reference} onChange={change(setReference)}>
          {taskIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        {error && <p role="alert" className="text-red-800 text-sm mb-2">{error}</p>}
        {preview && (
          <div className="border rounded p-2 text-sm mb-2 bg-[#e6f3ef]">
            {blockers.length ? (
              <ul className="text-red-800 list-disc pr-5">
                {blockers.map((b, i) => <li key={i}>{b.message || b.code}{b.taskId ? ` (کار ${b.taskId})` : ''}</li>)}
              </ul>
            ) : preview.proposal?.requiresScheduleConfirmation ? (
              <div>
                <p className="font-bold mb-1">زمان این کارها به زمان کار مرجع ({reference}) تغییر می‌کند:</p>
                <table className="w-full text-xs"><thead><tr><th>کار</th><th>قبل</th><th>بعد</th></tr></thead><tbody>
                  {preview.proposal.members.filter((x) => x.changesSchedule).map((x) => (
                    <tr key={x.taskId}><td>{x.taskId}</td><td>{x.before.start} تا {x.before.end}</td><td>{x.after.start} تا {x.after.end}</td></tr>
                  ))}
                </tbody></table>
                <p className="mt-1">پس از ساخت، «زمان‌بندی مجدد» را بزنید تا بقیهٔ کارها بعد از گروه جابه‌جا شوند.</p>
              </div>
            ) : <p>پیش‌نمایش آماده است؛ می‌توانید گروه را بسازید.</p>}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-danger" onClick={onCancel} disabled={busy}>انصراف</button>
          <button className="btn-primary disabled:opacity-50" onClick={doPreview} disabled={busy}>پیش‌نمایش</button>
          <button className="btn-primary disabled:opacity-50" onClick={doCreate} disabled={!canCreate}>{preview?.proposal?.requiresScheduleConfirmation ? 'تأیید و ساخت گروه' : 'ساخت گروه'}</button>
        </div>
      </div>
    </div>
  );
}
