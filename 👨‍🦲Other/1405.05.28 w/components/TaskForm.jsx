'use client';
import { useState, useEffect, useRef } from 'react';
import useDraftGuard from './useDraftGuard';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import TimeDateModal from './TimeDateModal';
import ApplicantFunctorModal from './ApplicantFunctorModal';
import FolderModal from './FolderModal';
import SupplierModal from './SupplierModal';
import FollowModal from './FollowModal';
import AssetsModal from './AssetsModal';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم'];
const TASK_TYPES = ['خرید', 'اداری', 'BM تعمیراتی', 'CM اصلاحی', 'موتورخانه', 'PM نگهداری پیشگیرانه', 'پیشگیرانه', 'EM اضطراری', 'HSE', 'چک‌کردن فاکتورها', 'بهسازی سیستم‌ها', 'اقدامات', 'پروژه', 'بازسازی', 'اصلاح نقشه', 'آموزشی', 'رفاهی', 'پرسنلی (ورود و خروج)', 'پرسنلی (تشویق و تنبیه)'];
const CONSIDERABLE = ['', 'اقدام', 'پروژه'];

const fromPicker = (d) => {
  if (!d) return '';
  try {
    const dt = d.toDate();
    return isNaN(dt.getTime()) ? '' : dt.toISOString();
  } catch {
    return '';
  }
};
const toPicker = (iso) =>
  iso ? new DateObject({ date: new Date(iso), calendar: persian, locale: persian_fa }) : null;

// مشخصات کامل و غیرمبهم دستگاه (معادل Specifing_Asset دسکتاپ)
const assetSpec = (a) =>
  `${a.AssetName}، قسمت: ${a.Location || '-'} (ساختمان ${a.Building || '-'}، بلوک: ${a.Block || '-'}، طبقه: ${a.Floor ?? '-'}، ورودی: ${a.Entrance || '-'}) شماره: ${a.AssetNumber ?? '-'} [کد:${a.AssetID}]`;

export default function TaskForm({ initial = null, defaultAssetId = null, onClose, onSaved }) {
  const isEdit = Boolean(initial);
  const [assets, setAssets] = useState([]);
  const [persons, setPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showTimeDate, setShowTimeDate] = useState(false);
  const [showAFModal, setShowAFModal] = useState(false);
   const [showFolder, setShowFolder] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);
  const [showFollow, setShowFollow] = useState(false);
  const [functorName, setFunctorName] = useState('');
  const [showAssetPicker, setShowAssetPicker] = useState(false);
const [assetQuery, setAssetQuery] = useState('');

  const [form, setForm] = useState({
    TaskTtl: '', Descriptions: '', Priorities: '3.متوسط', tskType: '',
    IsConsiderableAction: '', Complited: 0, AssetID: '', ApplicantName: '',
    DueDateTime: new Date().toISOString(),
    EndDateTime: new Date(Date.now() + 30 * 60000).toISOString(),
      FixedDueTime: false, RequestNumber: '', RegisterNumber: '', RequestDate: '',
});
const formRef = useRef(form); formRef.current = form;
const { touch, markSaved } = useDraftGuard(() => formRef.current.Descriptions || '');

  // قفل اسکرول صفحهٔ زمینه
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    fetch('/api/assets').then((r) => r.json()).then((d) => { if (d.success) setAssets(d.data); }).catch(() => {});
    fetch('/api/persons').then((r) => r.json()).then((d) => { if (d.success) setPersons(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (initial) {
      setForm({
        TaskTtl: initial.TaskTtl || '',
        Descriptions: initial.Descriptions || '',
        Priorities: initial.Priorities || '3.متوسط',
        tskType: initial.tskType || '',
        IsConsiderableAction: initial.IsConsiderableAction || '',
        Complited: Number(initial.Complited) === 1 ? 1 : 0,
        AssetID: initial.AssetID ? String(initial.AssetID) : '',
        ApplicantName: initial.ApplicantName || '',
        DueDateTime: initial.DueDateTime ? new Date(initial.DueDateTime).toISOString() : '',
        EndDateTime: initial.EndDateTime ? new Date(initial.EndDateTime).toISOString() : '',
        FixedDueTime: Number(initial.FixedDueTime) === 1,
        RequestNumber: initial.RequestNumber != null ? String(initial.RequestNumber) : '',
        RegisterNumber: initial.RegisterNumber != null ? String(initial.RegisterNumber) : '',
        RequestDate: initial.RequestDate ? new Date(initial.RequestDate).toISOString() : '',
      });
      fetch(`/api/applicant-functor?taskId=${initial.TaskID}`)
        .then((r) => r.json())
        .then((d) => { if (d.success && d.exists && d.data) setFunctorName(d.data.FunctorName || ''); })
        .catch(() => {});
    }
  }, [initial]);

  // بستن با ESC
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  
  // همگام‌سازی متن جستجوی دستگاه با دستگاه انتخاب‌شده
useEffect(() => {
  if (form.AssetID) {
    const a = assets.find((x) => String(x.AssetID) === String(form.AssetID));
    if (a) setAssetQuery(assetSpec(a));
  } else setAssetQuery('');
}, [form.AssetID, assets]);
  
  
  // ✅ پیش‌تنظیم دستگاه وقتی از مودال دستگاه‌ها «کار جدید» زده می‌شود
useEffect(() => {
  if (!initial && defaultAssetId) {
    setForm((f) => ({ ...f, AssetID: String(defaultAssetId) }));
  }
}, [initial, defaultAssetId]);

  const handleChange = (e) => {
const { name, value, type, checked } = e.target;
setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
if (name === 'Descriptions') touch(value);
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.TaskTtl.trim()) { alert('موضوع را وارد کنید!'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        Complited: Number(form.Complited),
        AssetID: form.AssetID ? Number(form.AssetID) : null,
        FixedDueTime: form.FixedDueTime ? 1 : 0,
        RequestNumber: form.RequestNumber.trim() ? Number(form.RequestNumber) : null,
        RegisterNumber: form.RegisterNumber.trim() ? Number(form.RegisterNumber) : null,
        RequestDate: form.RequestDate || null,
      };
      const res = isEdit
        ? await fetch(`/api/tasks/${initial.TaskID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
		  markSaved();
        alert(isEdit ? 'تغییرات ذخیره شد.' : 'کار جدید ثبت شد.');
        if (onSaved) onSaved();
        if (onClose) onClose();
      } else {
        alert('خطا: ' + (data.error || 'نامشخص'));
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!saving) handleSubmit(e);
          }
        }}
        className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[760px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6"
      >
        <h3 className="text-lg font-bold mb-4">
          {isEdit ? `ویرایش کار — کد: ${initial.TaskID}` : 'ثبت کار جدید'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-bold mb-1">موضوع *</label>
            <input name="TaskTtl" value={form.TaskTtl} onChange={handleChange} className="search-input w-full" />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold">شرح کار</label>
              <button
                type="button"
                disabled={!isEdit}
                onClick={() => setShowFollow(true)}
                className="btn-primary px-3 py-1 text-xs"
                title="سوابق پیگیری (معادل دکمه جزئیات)"
              >
                جزئیات (پیگیری)
              </button>
            </div>
            <textarea name="Descriptions" value={form.Descriptions} onChange={handleChange} rows={4} className="search-input w-full" />
          </div>

       <div>
         <label className="block text-sm font-bold mb-1">دستگاه/مجموعه</label>
         <div className="flex gap-2">
           <input
             className="search-input w-full"
             list="assets-list"
             placeholder="تایپ کنید یا از لیست انتخاب کنید..."
             value={assetQuery}
             onChange={(e) => {
               const v = e.target.value;
               setAssetQuery(v);
               const found = assets.find((a) => assetSpec(a) === v);
               if (found) setForm((f) => ({ ...f, AssetID: String(found.AssetID) }));
               else if (!v) setForm((f) => ({ ...f, AssetID: '' }));
             }}
           />
           <button type="button" className="btn-primary px-3" onClick={() => setShowAssetPicker(true)} title="انتخاب از مودال دستگاه‌ها">...</button>
         </div>
         <datalist id="assets-list">
           {assets.map((a) => <option key={a.AssetID} value={assetSpec(a)} />)}
         </datalist>
         {form.AssetID && <div className="text-xs text-gray-700 mt-1">کد دستگاه انتخابی: {form.AssetID}</div>}
       </div>

          <div>
            <label className="block text-sm font-bold mb-1">درخواست‌کننده</label>
            <div className="flex gap-2">
              <input name="ApplicantName" value={form.ApplicantName} onChange={handleChange} list="persons-list" className="search-input w-full" />
              <button
                type="button"
                disabled={!isEdit}
                onClick={() => setShowAFModal(true)}
                className="btn-primary px-3"
                title={isEdit ? 'درخواست‌کننده و انجام‌دهنده (فرم اطلاعات تماس)' : 'ابتدا کار را ذخیره کنید'}
              >
                ...
              </button>
            </div>
            <datalist id="persons-list">
              {persons.map((p) => <option key={p.PersonID} value={p.PersonName} />)}
            </datalist>
            {functorName && (
              <div className="text-xs text-gray-700 mt-1">انجام‌دهنده: {functorName}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">اولویت</label>
            <select name="Priorities" value={form.Priorities} onChange={handleChange} className="search-input w-full">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              disabled={!isEdit}
              onClick={() => setShowTimeDate(true)}
              className="btn-primary w-full"
              title={isEdit ? 'تنظیم الویت و زمان (مانند فرم زمان نسخه ویندوزی)' : 'ابتدا کار را ذخیره کنید'}
            >
              الویت و زمان (...)
            </button>
          </div>

       <div className="flex items-end">
         <button
           type="button"
           disabled={!isEdit}
           onClick={() => setShowFolder(true)}
           className="btn-primary w-full"
           title={isEdit ? 'پوشهٔ ضمائم این کار (معادل Frm_Folder)' : 'ابتدا کار را ذخیره کنید'}
         >
           ضمائم (...)
         </button>
       </div>


          <div>
            <label className="block text-sm font-bold mb-1">نوع کار</label>
            <select name="tskType" value={form.tskType} onChange={handleChange} className="search-input w-full">
              <option value="">(انتخاب کنید)</option>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">پروژه/اقدام</label>
            <select name="IsConsiderableAction" value={form.IsConsiderableAction} onChange={handleChange} className="search-input w-full">
              {CONSIDERABLE.map((c) => <option key={c} value={c}>{c || '(بدون)'}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">وضعیت</label>
            <select name="Complited" value={form.Complited} onChange={handleChange} className="search-input w-full">
              <option value={0}>در حال انجام</option>
              <option value={1}>اتمام‌یافته</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">زمان شروع (سررسید)</label>
            <DatePicker
              value={toPicker(form.DueDateTime)}
              onChange={(d) => setForm((f) => ({ ...f, DueDateTime: fromPicker(d) }))}
              calendar={persian} locale={persian_fa}
              format="YYYY/MM/DD HH:mm" enableTimePicker
              inputClass="search-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">زمان اتمام</label>
            <DatePicker
              value={toPicker(form.EndDateTime)}
              onChange={(d) => setForm((f) => ({ ...f, EndDateTime: fromPicker(d) }))}
              calendar={persian} locale={persian_fa}
              format="YYYY/MM/DD HH:mm" enableTimePicker
              inputClass="search-input w-full"
            />
          </div>

       {isEdit && (
         <div className="flex items-end">
           <button type="button" onClick={() => setShowSupplier(true)} className="btn-primary w-full"
             title="اطلاعات خرید / تأمین‌کننده (معادل Frm_Supplier)">
             تأمین‌کننده / خرید (...)
           </button>
         </div>
       )}

          <label className="flex items-center gap-2 md:col-span-2 cursor-pointer">
            <input type="checkbox" name="FixedDueTime" checked={form.FixedDueTime} onChange={handleChange} className="w-4 h-4" />
            <span className="text-sm font-bold">زمان انجام ثابت</span>
          </label>

          {form.tskType === 'خرید' && (
            <div className="md:col-span-2 bg-[#F7C4A5] rounded p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold mb-1">شماره درخواست</label>
                <input type="number" name="RequestNumber" value={form.RequestNumber} onChange={handleChange} className="search-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">شماره ثبت</label>
                <input type="number" name="RegisterNumber" value={form.RegisterNumber} onChange={handleChange} className="search-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">تاریخ درخواست</label>
                <DatePicker
                  value={toPicker(form.RequestDate)}
                  onChange={(d) => setForm((f) => ({ ...f, RequestDate: fromPicker(d) }))}
                  calendar={persian} locale={persian_fa}
                  format="YYYY/MM/DD"
                  inputClass="search-input w-full"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button type="submit" disabled={saving} className="btn-success" title="Ctrl+Enter">
            {saving ? 'در حال ذخیره...' : isEdit ? 'ویرایش' : 'افزودن'}
          </button>
          <button type="button" onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </form>

      {/* مودال زمان — معادل Frm_TimeDate */}
      {showTimeDate && isEdit && (
        <TimeDateModal
          taskId={initial.TaskID}
          finished={Number(form.Complited) === 1}
          onClose={() => setShowTimeDate(false)}
          onSaved={onSaved}
        />
      )}

   {showAssetPicker && (
     <AssetsModal
       onClose={() => setShowAssetPicker(false)}
       onSelectAsset={(assetId) => {
         setForm((f) => ({ ...f, AssetID: String(assetId) }));
         setShowAssetPicker(false);
       }}
     />
   )}

      {/* مودال پیگیری — معادل Frm_Follow */}
      {showFollow && isEdit && (
        <FollowModal
          taskId={initial.TaskID}
          subject={form.TaskTtl}
          onClose={() => setShowFollow(false)}
          onSaved={onSaved}
        />
      )}

   {showSupplier && isEdit && (
     <SupplierModal taskId={initial.TaskID} onClose={() => setShowSupplier(false)} onSaved={onSaved} />
   )}

   {showFolder && isEdit && (
     <FolderModal taskId={initial.TaskID} onClose={() => setShowFolder(false)} onSaved={onSaved} />
   )}

      {/* مودال درخواست‌کننده/انجام‌دهنده — معادل Frm_ApplicantFunctor */}
      {showAFModal && isEdit && (
        <ApplicantFunctorModal
          taskId={initial.TaskID}
          onClose={() => setShowAFModal(false)}
          onSaved={(aName, fName) => {
            setForm((f) => ({ ...f, ApplicantName: aName }));
            setFunctorName(fName || '');
          }}
        />
      )}
    </div>
  );
}