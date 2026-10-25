'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TaskInspectionTable from './TaskInspectionTable';
import { assetSummary, formatWallTime, parseTaskId, readTaskSnapshot, TASK_INSPECTOR_EVENT } from '@/lib/task-inspection';

export default function TaskInspector() {
  const [opened, setOpened] = useState(false);
  const [originTaskId, setOriginTaskId] = useState(null);
  const [originSummary, setOriginSummary] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const tableRef = useRef(null);
  const openedRef = useRef(false);
  const openerRef = useRef(null);

  const invalidate = () => { requestRef.current++; abortRef.current?.abort(); abortRef.current = null; };
  const close = () => { invalidate(); openedRef.current = false; setOpened(false); setSnapshot(null); };

  useEffect(() => {
    const open = (event) => {
      if (openedRef.current) return;
      invalidate();
      openerRef.current = document.activeElement;
      openedRef.current = true;
      setOriginTaskId(parseTaskId(event.detail?.originTaskId));
      setOriginSummary(typeof event.detail?.originSummary === 'string' ? event.detail.originSummary : '');
      setSnapshot(null); setError(''); setLoading(false); setOpened(true);
    };
    window.addEventListener(TASK_INSPECTOR_EVENT, open);
    return () => { window.removeEventListener(TASK_INSPECTOR_EVENT, open); invalidate(); };
  }, []);

  useEffect(() => {
    if (!opened) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // جلوگیری از رسیدن Esc و میان‌برها به فرم‌های ویرایش زیر پنل، بدون unmount کردن آن‌ها.
    const keyboard = (event) => {
      const inside = panelRef.current?.contains(event.target);
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!tableRef.current?.closeFilter()) close();
        return;
      }
      if (!inside) {
        event.preventDefault(); event.stopImmediatePropagation(); inputRef.current?.focus(); return;
      }
      if (event.key === 'Tab') {
        const filterDialog = panelRef.current.querySelector('[aria-label^="فیلتر "][role="dialog"]');
        const controls = [...(filterDialog || panelRef.current).querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter((node) => node.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if ((event.shiftKey && event.target === first) || (!event.shiftKey && event.target === last)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    const isolateBubble = (event) => { if (panelRef.current?.contains(event.target)) event.stopPropagation(); };
    window.addEventListener('keydown', keyboard, true);
    // React داخل portal اجرا می‌شود، اما listenerهای window مودال‌های زیرین نباید اجرا شوند.
    document.addEventListener('keydown', isolateBubble);
    inputRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('keydown', isolateBubble);
      document.body.style.overflow = previousOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [opened]);

  const resetDetails = () => { invalidate(); setSnapshot(null); setError(''); setLoading(false); };

  const inspect = async (value) => {
    const id = parseTaskId(value);
    invalidate(); setSnapshot(null); setError('');
    if (!id) { setLoading(false); setError('کد کار را به‌صورت عدد صحیح مثبت وارد کنید.'); return; }
    const requestId = requestRef.current;
    const controller = new AbortController(); abortRef.current = controller;
    setLoading(true);
    try {
      const data = await readTaskSnapshot(id, { signal: controller.signal, details: true });
      if (requestRef.current === requestId && openedRef.current) setSnapshot({ id, ...data });
    } catch (reason) {
      if (requestRef.current === requestId && openedRef.current && reason.name !== 'AbortError') setError(reason.message);
    } finally {
      if (requestRef.current === requestId && openedRef.current) setLoading(false);
    }
  };

  if (!opened) return null;
  const task = snapshot?.task;
  const rows = task ? [
    ['کد کار', task.TaskID], ['موضوع', task.TaskTtl], ['دستگاه و نشانی', assetSummary(task)],
    ['وضعیت', Number(task.Complited) === 1 ? 'اتمام' : 'جاری'], ['اولویت', task.Priorities],
    ['درخواست‌کننده', task.ApplicantName], ['انجام‌دهنده', task.FunctorName],
    ['زمان شروع', formatWallTime(task.DueDateTime)], ['زمان پایان', formatWallTime(task.EndDateTime)],
    ['شرح کار', task.Descriptions],
  ] : [];
  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-end p-2 sm:p-4" style={{ zIndex: 100050 }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => { event.stopPropagation(); if (event.button === 0 && event.target === event.currentTarget) close(); }}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="task-inspector-title" dir="rtl"
        className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[1180px] max-w-full h-full max-h-[94vh] flex flex-col">
        <div className="p-4 border-b border-teal-700/30 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h3 id="task-inspector-title" className="font-bold">بررسی مستقل کار — فقط نمایش</h3>
            <button ref={inputRef} type="button" className="btn-danger" onClick={close}>بازگشت به پنجرهٔ قبلی</button>
          </div>
          <p className="text-xs mt-2">{originTaskId ? `کار پنجرهٔ اصلی: ${originTaskId}` : 'پنجرهٔ اصلی: عمومی یا کار جدید'} — اطلاعات فرم اصلی تغییر نمی‌کند و این پنل هیچ ذخیره‌ای ندارد.</p>
          {originSummary && <p className="text-xs mt-1 break-words">دستگاه کار اصلی: {originSummary}</p>}

        </div>
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain p-4">
          <TaskInspectionTable ref={tableRef} onSelect={inspect} onResultsChange={resetDetails} selectedId={snapshot?.id} />
          {loading && <p role="status">در حال دریافت اطلاعات کار…</p>}
          {error && <p role="alert" className="rounded bg-red-100 text-red-900 p-3">{error}</p>}
          {!task && !loading && !error && <p className="text-sm">با انتخاب یک ردیف، اطلاعات همان کار و سوابق آن در پایین جدول نمایش داده می‌شود؛ فرم اصلی دست‌نخورده می‌ماند.</p>}
          {task && <>
            <h4 className="font-bold mb-2">در حال مشاهدهٔ کار {snapshot.id} — فقط‌خواندنی</h4>
            <table className="w-full border-collapse text-sm mb-5"><tbody>
              {rows.map(([label, value], index) => <tr key={label} className={index % 2 ? 'bg-teal-50' : 'bg-white/80'}>
                <th scope="row" className="border border-teal-700/20 p-2 text-right align-top w-1/3">{label}</th>
                <td className="border border-teal-700/20 p-2 align-top whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{value == null || value === '' ? 'ثبت نشده' : value}</td>
              </tr>)}
            </tbody></table>
            <h4 className="font-bold mb-2">سوابق پیگیری همین کار ({snapshot.followups.length})</h4>
            {!snapshot.followups.length ? <p>سابقه‌ای ثبت نشده است.</p> : <div className="overflow-auto">
              <table className="w-full border-collapse text-sm"><thead className="bg-teal-800 text-white"><tr>
                {['کد', 'شرح', 'شروع', 'پایان', 'مدت'].map((label) => <th scope="col" key={label} className="p-2 text-right">{label}</th>)}
              </tr></thead><tbody>{snapshot.followups.map((row) => <tr key={row.FollowID} className="bg-white/80">
                <td className="border border-teal-700/20 p-2">{row.FollowID}</td>
                <td className="border border-teal-700/20 p-2 whitespace-pre-wrap break-words">{row.Description}</td>
                <td className="border border-teal-700/20 p-2">{formatWallTime(row.DueDateTime)}</td>
                <td className="border border-teal-700/20 p-2">{formatWallTime(row.EndDateTime)}</td>
                <td className="border border-teal-700/20 p-2">{row.Duration}</td>
              </tr>)}</tbody></table>
            </div>}
          </>}
        </div>
      </section>
    </div>, document.body,
  );
}
