"use client";
import LoadingIndicator from './LoadingIndicator';

export default function ReadLoadingModal({ title = 'دریافت اطلاعات', taskId, error = '', onClose }) {
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]"
    onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-label={title} dir="rtl"
      className="bg-[#CCE6DF] rounded-xl shadow-2xl w-[420px] max-w-full p-5">
      <div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-bold">{title}{taskId ? ` — کد کار: ${taskId}` : ''}</h3>
        <button type="button" className="btn-danger self-start shrink-0" onClick={onClose}>بستن</button></div>
      {error ? <p role="alert" className="text-red-800 text-sm">{error}</p> : <LoadingIndicator label={title} />}
    </section>
  </div>;
}
