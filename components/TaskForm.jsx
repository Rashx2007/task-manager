'use client';
import { useState, useEffect, useRef } from 'react';
import TimeDateModal from './TimeDateModal';
import FollowModal from './FollowModal';
import ApplicantFunctorModal from './ApplicantFunctorModal';
import AssetsModal from './AssetsModal';
import MapModal from './MapModal';
import FolderModal from './FolderModal';
import SupplierModal from './SupplierModal';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت'];
const TASK_TYPES = ['اصلاحی', 'نگهداری', 'نصب', 'راه‌اندازی', 'بازسازی', 'سایر'];

const emptyForm = () => ({
  TaskTtl: '', Descriptions: '', tskType: '', IsConsiderableAction: 'اقدام', Temporary: 0,
  Priorities: '', Complited: 0, fixedDueTime: 0,
  DueDateTime: '', EndDateTime: '', Durationtime: '',
  AssetID: null, AssetDesc: '', ApplicantName: '', FunctorName: '',
});

const fmtFa = (v) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }); } catch { return String(v); }
};

const buildAssetDesc = (d) => {
  if (!d || !d.AssetID) return '';
  const parts = [];
  if (d.AssetName) parts.push(d.AssetName);
  const loc = [d.Building, d.Block ? `بلوک: ${d.Block}` : '', d.Floor != null ? `طبقه: ${d.Floor}` : '', d.Entrance ? `ورودی: ${d.Entrance}` : ''].filter(Boolean).join('، ');
  if (d.Location) parts.push(`قسمت: ${d.Location} (${loc})`);
  else if (loc) parts.push(`(${loc})`);
  if (d.AssetNumber != null) parts.push(`شماره دستگاه: ${d.AssetNumber}`);
  return parts.join(' ');
};

export default function TaskForm({ taskId, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(!taskId);
  const [saving, setSaving] = useState(false);
  const [showTimeDate, setShowTimeDate] = useState(false);
  const [showFollow, setShowFollow] = useState(false);
  const [showAFModal, setShowAFModal] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [assetPreset, setAssetPreset] = useState(null);
  const [completeAsk, setCompleteAsk] = useState(null);
  const formRef = useRef(null);

  const askComplete = () => new Promise((resolve) => setCompleteAsk({ resolve }));

  const load = async () => {
    if (!taskId) { setForm(emptyForm()); setEditing(true); return; }
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const d = await res.json();
      if (d.success && d.data) {
        const s = d.data;
        setForm({
          ...emptyForm(),
          TaskTtl: s.TaskTtl || '', Descriptions: s.Descriptions || '', tskType: s.tskType || '',
          IsConsiderableAction: s.IsConsiderableAction || 'اقدام', Temporary: s.Temporary || 0,
          Priorities: s.TDP || s.Priorities || '', Complited: Number(s.Complited || 0),
          fixedDueTime: Number(s.fixedDueTime || s.FixedDueTime || 0),
          DueDateTime: s.DueDateTime || '', EndDateTime: s.EndDateTime || '', Durationtime: s.Durationtime || '',
          AssetID: s.AssetID || null, AssetDesc: s.AssetDesc || buildAssetDesc(s),
          ApplicantName: s.ApplicantName || '', FunctorName: s.FunctorName || '',
        });
      }
    } catch {}
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [taskId]);

  // ✅ Esc فقط وقتی هیچ مودال فرزندی باز نیست فرم را می‌بندد
  useEffect(() => {
    const anyChildOpen = showTimeDate || showAFModal || showFollow || showSupplier || showFolder || showAssetPicker || showMap || !!completeAsk;
    if (anyChildOpen) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, showTimeDate, showAFModal, showFollow, showSupplier, showFolder, showAssetPicker, showMap, completeAsk]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.TaskTtl || !form.TaskTtl.trim()) { alert('موضوع کار را وارد کنید.'); return; }
    setSaving(true);
    try {
      const body = {
        TaskTtl: form.TaskTtl, Descriptions: form.Descriptions, tskType: form.tskType,
        IsConsiderableAction: form.IsConsiderableAction, Temporary: Number(form.Temporary || 0),
        AssetID: form.AssetID || null,
      };
      if (taskId) {
        const res = await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        if (!d.success) { alert('خطا: ' + d.error); setSaving(false); return; }
        alert(`تغییرات کار کد ${taskId} ذخیره شد.`);
        if (onSaved) onSaved();
        const done = await askComplete();
        if (done) {
          const r2 = await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Complited: 1 }) });
          const d2 = await r2.json();
          if (d2.success) { alert('کار اتمام یافت.'); if (onSaved) onSaved(); onClose(); }
          else alert('خطا در اتمام کار: ' + d2.error);
        } else {
          setEditing(false);
          load();
        }
      } else {
        const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        if (d.success) { alert('کار جدید ثبت شد.'); if (onSaved) onSaved(); onClose(); }
        else alert('خطا: ' + d.error);
      }
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const inp = 'search-input w-full';
  const ro = !editing;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div ref={formRef} className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[980px] max-w-[96vw] max-h-[94vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{taskId ? `ویرایش کار — کد: ${taskId}` : 'ثبت کار جدید'}</h3>
          <button type="button" onClick={onClose} className="text-xl">✕</button>
        </div>

        {!form ? <div className="p-8 text-center">در حال بارگذاری…</div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-sm font-bold">موضوع *</label>
                <input className={inp} value={form.TaskTtl} onChange={set('TaskTtl')} readOnly={ro} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-bold">شرح / توضیحات</label>
                <textarea className={inp} rows={3} value={form.Descriptions} onChange={set('Descriptions')} readOnly={ro} />
              </div>

              <div>
                <label className="text-sm font-bold">دستگاه/مجموعه</label>
                <textarea className={inp} rows={2} value={form.AssetDesc} readOnly />
                {form.AssetID ? <div className="text-xs mt-1">کد دستگاه: {form.AssetID}</div> : null}
                <div className="flex gap-2 mt-1">
                  <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={() => setShowAssetPicker(true)}>… انتخاب دستگاه</button>
                  <button type="button" className="btn-primary px-2 py-1 text-xs" title="انتخاب از روی نقشه" onClick={() => setShowMap(true)}>🗺</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-bold">وضعیت</label>
                <select className={inp} value={form.Complited} onChange={set('Complited')} disabled>
                  <option value={0}>در حال انجام</option>
                  <option value={1}>اتمام</option>
                </select>
                <div className="mt-2">
                  <label className="text-sm font-bold">درخواست‌کننده</label>
                  <input className={inp} value={form.ApplicantName} readOnly />
                  <div className="text-xs mt-1">انجام‌دهنده: {form.FunctorName || '—'}</div>
                  <button type="button" className="btn-primary px-2 py-1 text-xs mt-1" onClick={() => setShowAFModal(true)}>ویرایش درخواست‌کننده/انجام‌دهنده</button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={Number(form.fixedDueTime) === 1} readOnly />
                  زمان انجام ثابت
                </label>
                {Number(form.fixedDueTime) === 1 && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div><label className="text-xs">زمان شروع (سررسید)</label><input className={inp} value={fmtFa(form.DueDateTime)} readOnly /></div>
                    <div><label className="text-xs">زمان اتمام</label><input className={inp} value={fmtFa(form.EndDateTime)} readOnly /></div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-bold">الویت</label>
                <select className={inp} value={form.Priorities} disabled>
                  {!PRIORITIES.includes(form.Priorities) && form.Priorities !== '' && <option value={form.Priorities}>{form.Priorities}</option>}
                  <option value="">(نامشخص)</option>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="button" className="btn-primary px-2 py-1 text-xs mt-1" onClick={() => setShowTimeDate(true)}>الویت و زمان (…)</button>
              </div>

              <div>
                <label className="text-sm font-bold">نوع کار</label>
                <select className={inp} value={form.tskType} onChange={set('tskType')} readOnly={ro} disabled={ro}>
                  {!TASK_TYPES.includes(form.tskType) && form.tskType !== '' && <option value={form.tskType}>{form.tskType}</option>}
                  <option value="">(انتخاب کنید)</option>
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold">پروژه/اقدام</label>
                <select className={inp} value={form.IsConsiderableAction} onChange={set('IsConsiderableAction')} disabled={ro}>
                  <option value="اقدام">اقدام</option>
                  <option value="پروژه">پروژه</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" className="btn-primary" onClick={() => setShowFollow(true)}>پیگیری (…)</button>
              <button type="button" className="btn-primary" onClick={() => setShowFolder(true)}>ضمائم (…)</button>
              <button type="button" className="btn-primary" onClick={() => setShowSupplier(true)}>تأمین‌کننده / خرید (…)</button>
              {!editing && taskId && <button type="button" className="btn-primary" onClick={() => setEditing(true)}>ویرایش</button>}
            </div>

            <div className="flex gap-2 mt-4">
              <button type="button" className="btn-success flex-1" disabled={saving || !editing} onClick={save}>{saving ? 'در حال ذخیره...' : 'ذخیره'}</button>
              <button type="button" className="btn-danger" onClick={onClose}>بستن</button>
            </div>
          </>
        )}
      </div>

      {showTimeDate && taskId && (
        <TimeDateModal taskId={taskId} onClose={() => setShowTimeDate(false)} onSaved={() => { load(); if (onSaved) onSaved(); }} />
      )}
      {showFollow && taskId && (
        <FollowModal taskId={taskId} onClose={() => setShowFollow(false)} />
      )}
      {showAFModal && taskId && (
        <ApplicantFunctorModal taskId={taskId} onClose={() => setShowAFModal(false)} onSaved={(a, f) => setForm((s) => ({ ...s, ApplicantName: a, FunctorName: f }))} />
      )}
      {showSupplier && taskId && (
        <SupplierModal taskId={taskId} onClose={() => setShowSupplier(false)} />
      )}
      {showFolder && taskId && (
        <FolderModal taskId={taskId} onClose={() => setShowFolder(false)} />
      )}

      {showMap && (
        <MapModal
          onClose={() => setShowMap(false)}
          onPickAsset={(id) => {
            setForm((s) => ({ ...s, AssetID: String(id) }));
            setShowMap(false);
            load();
          }}
          onOpenDefineDevice={(preset) => {
            setAssetPreset(preset);
            setShowMap(false);
            setShowAssetPicker(true);
          }}
        />
      )}

      {showAssetPicker && (
        <AssetsModal
          preset={assetPreset}
          onClose={() => {
            setShowAssetPicker(false);
            setAssetPreset(null);
          }}
          onSelectAsset={(id) => {
            setForm((s) => ({ ...s, AssetID: String(id) }));
            setShowAssetPicker(false);
            setAssetPreset(null);
            load();
          }}
        />
      )}

      {completeAsk && (
        <div className="fixed inset-0 bg-black/60 z-[10002] flex items-center justify-center p-4"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); const r = completeAsk.resolve; setCompleteAsk(null); r(false); } }}>
          <div className="bg-[#CCE6DF] rounded-lg shadow-2xl p-6 w-[380px] text-center">
            <div className="font-bold mb-5">آیا این کار اتمام یافته است؟</div>
            <div className="flex gap-3 justify-center">
              <button type="button" className="btn-success px-6" onClick={() => { const r = completeAsk.resolve; setCompleteAsk(null); r(true); }}>OK</button>
              <button type="button" autoFocus className="btn-danger px-6" onClick={() => { const r = completeAsk.resolve; setCompleteAsk(null); r(false); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}