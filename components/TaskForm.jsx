'use client';
import { useState, useEffect, useRef } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import TimeDateModal from './TimeDateModal';
import ApplicantFunctorModal from './ApplicantFunctorModal';
import FollowModal from './FollowModal';
import SupplierModal from './SupplierModal';
import FolderModal from './FolderModal';
import AssetsModal from './AssetsModal';
import useDraftGuard from './useDraftGuard';

const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم'];
const TASK_TYPES = ['خرید', 'اداری', 'BM تعمیراتی', 'CM اصلاحی', 'موتورخانه', 'PM نگهداری پیشگیرانه', 'پیشگیرانه', 'EM اضطراری', 'HSE', 'چک‌کردن فاکتورها', 'بهسازی سیستم‌ها', 'اقدامات', 'پروژه', 'بازسازی', 'اصلاح نقشه', 'آموزشی', 'رفاهی', 'پرسنلی (ورود و خروج)', 'پرسنلی (تشویق و تنبیه)'];
const CONSIDERABLE = ['', 'اقدام', 'پروژه'];

// ✅ تبدیل رشته ساعت‌دیواری سرور به DateObject شمسی (بدون شیفت منطقه زمانی)
const toPicker = (wallStr) => {
  if (!wallStr) return null;
  const d = new Date(wallStr); // پارس به عنوان زمان محلی
  if (isNaN(d.getTime())) return null;
  return new DateObject({ date: d, calendar: persian, locale: persian_fa });
};

// ✅ تبدیل DateObject شمسی به رشته ساعت‌دیواری (برای ارسال به سرور بدون شیفت)
const fromPicker = (d) => {
  if (!d) return '';
  const dt = d.toDate();
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
};

const assetSpec = (a) => `${a.AssetName}، قسمت: ${a.Location || '-'} (ساختمان ${a.Building || '-'}، بلوک: ${a.Block || '-'}، طبقه: ${a.Floor ?? '-'}، ورودی: ${a.Entrance || '-'}) شماره: ${a.AssetNumber ?? '-'} [کد:${a.AssetID}]`;

export default function TaskForm({ initial = null, defaultAssetId = null, onClose, onSaved }) {
  const isEdit = Boolean(initial);
  const [assets, setAssets] = useState([]);
  const [persons, setPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showTimeDate, setShowTimeDate] = useState(false);
  const [showAFModal, setShowAFModal] = useState(false);
  const [showFollow, setShowFollow] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [functorName, setFunctorName] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  
  const [form, setForm] = useState({
    TaskTtl: '', Descriptions: '', Priorities: '3.متوسط', tskType: '', IsConsiderableAction: '', Complited: 0,
    AssetID: '', ApplicantName: '', DueDateTime: '', EndDateTime: '',
    FixedDueTime: false, RequestNumber: '', RegisterNumber: '', RequestDate: '',
  });
  
  const formRef = useRef(form); 
  formRef.current = form;
  const { touch, markSaved } = useDraftGuard(() => formRef.current.Descriptions || '');

  useEffect(() => { 
    const p = document.body.style.overflow; 
    document.body.style.overflow = 'hidden'; 
    return () => { document.body.style.overflow = p; }; 
  }, []);

  useEffect(() => {
    fetch('/api/assets').then((r) => r.json()).then((d) => { if (d.success) setAssets(d.data || []); }).catch(() => {});
    fetch('/api/persons').then((r) => r.json()).then((d) => { if (d.success) setPersons(d.data || []); }).catch(() => {});
  }, []);

  // ✅ بارگذاری رکورد کامل با اصلاح خواندن FixedDueTime (TDF) و تاریخ‌ها
  useEffect(() => {
    if (!initial) return;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${initial.TaskID}`);
        const d = await res.json();
        const src = d.success && d.data ? d.data : initial;
        setForm({
          TaskTtl: src.TaskTtl || '', 
          Descriptions: src.Descriptions || '', 
          Priorities: src.Priorities || '3.متوسط',
          tskType: src.tskType || '', 
          IsConsiderableAction: src.IsConsiderableAction || '', 
          Complited: Number(src.Complited) === 1 ? 1 : 0,
          AssetID: src.AssetID ? String(src.AssetID) : '', 
          ApplicantName: src.ApplicantName || '',
          // ✅ استفاده مستقیم از رشته ساعت‌دیواری بدون تبدیل به ISO
          DueDateTime: src.DueDateTime || '', 
          EndDateTime: src.EndDateTime || '',
          // ✅ خواندن از TDF (نام مستعار در کوئری API) یا FixedDueTime
          FixedDueTime: Boolean(Number(src.TDF ?? src.FixedDueTime) === 1),
          RequestNumber: src.RequestNumber != null ? String(src.RequestNumber) : '', 
          RegisterNumber: src.RegisterNumber != null ? String(src.RegisterNumber) : '',
          RequestDate: src.RequestDate || '',
        });
      } catch {}
      fetch(`/api/applicant-functor?taskId=${initial.TaskID}`).then((r) => r.json()).then((d) => {
        if (d.success && d.exists && d.data) {
          setFunctorName(d.data.FunctorName || '');
          setForm((f) => ({ ...f, ApplicantName: d.data.ApplicantName || '' }));
        }
      }).catch(() => {});
    })();
  }, [initial]);

  useEffect(() => { 
    if (!initial && defaultAssetId) setForm((f) => ({ ...f, AssetID: String(defaultAssetId) })); 
  }, [initial, defaultAssetId]);
  
  useEffect(() => {
    if (form.AssetID) { 
      const a = assets.find((x) => String(x.AssetID) === String(form.AssetID)); 
      if (a) setAssetQuery(assetSpec(a)); 
    } else {
      setAssetQuery('');
    }
  }, [form.AssetID, assets]);
  
  useEffect(() => { 
    const h = (e) => { if (e.key === 'Escape') onClose(); }; 
    window.addEventListener('keydown', h); 
    return () => window.removeEventListener('keydown', h); 
  }, [onClose]);

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
        RequestDate: form.RequestDate || null 
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
    }
    setSaving(false);
  };
  
  const inp = 'search-input w-full';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (!saving) handleSubmit(e); } }}
        className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[760px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-4">{isEdit ? `ویرایش کار — کد: ${initial.TaskID}` : 'ثبت کار جدید'}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-bold mb-1">موضوع *</label>
            <input name="TaskTtl" value={form.TaskTtl} onChange={handleChange} className={inp} />
          </div>
          
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold">شرح کار</label>
              <button type="button" disabled={!isEdit} onClick={() => setShowFollow(true)} className="btn-primary px-3 py-1 text-xs">جزئیات (پیگیری)</button>
            </div>
            <textarea name="Descriptions" value={form.Descriptions} onChange={handleChange} rows={4} className={inp} />
          </div>

          {/* دستگاه تک‌خطی */}
          <div className="md:col-span-2">
            <label className="block text-sm font-bold mb-1">دستگاه/مجموعه</label>
            <div className="flex gap-2">
              <input className={inp} list="assets-list" placeholder="تایپ کنید یا از لیست انتخاب کنید..." value={assetQuery}
                onChange={(e) => { 
                  const v = e.target.value; 
                  setAssetQuery(v); 
                  const f = assets.find((a) => assetSpec(a) === v); 
                  if (f) setForm((x) => ({ ...x, AssetID: String(f.AssetID) })); 
                  else if (!v) setForm((x) => ({ ...x, AssetID: '' })); 
                }} 
              />
              <button type="button" className="btn-primary px-3" onClick={() => setShowAssetPicker(true)}>...</button>
            </div>
            <datalist id="assets-list">{assets.map((a) => <option key={a.AssetID} value={assetSpec(a)} />)}</datalist>
            {form.AssetID && <div className="text-xs text-gray-700 mt-1">کد دستگاه: {form.AssetID}</div>}
          </div>

          {/* وضعیت و درخواست‌کننده */}
          <div>
            <label className="block text-sm font-bold mb-1">وضعیت</label>
            <select name="Complited" value={form.Complited} onChange={handleChange} className={inp}>
              <option value={0}>در حال انجام</option>
              <option value={1}>اتمام‌یافته</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">درخواست‌کننده</label>
            <div className="flex gap-2">
              <input name="ApplicantName" value={form.ApplicantName} onChange={handleChange} list="persons-list" className={inp} />
              <button type="button" disabled={!isEdit} onClick={() => setShowAFModal(true)} className="btn-primary px-3">...</button>
            </div>
            <datalist id="persons-list">{persons.map((p) => <option key={p.PersonID} value={p.PersonName} />)}</datalist>
            {functorName && <div className="text-xs text-gray-700 mt-1">انجام‌دهنده: {functorName}</div>}
          </div>

          {/* ✅ بخش زمان‌بندی با چیدمان واکنش‌گرا (Flex Wrap) */}
          <div className="md:col-span-2 flex flex-wrap items-center gap-4 border border-teal-600 rounded-lg p-3 bg-[#e6f3ef]">
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <input 
                type="checkbox" 
                name="FixedDueTime" 
                checked={form.FixedDueTime} 
                onChange={handleChange} 
                disabled 
                className="w-4 h-4 accent-teal-600" 
              />
              <span className="text-sm font-bold text-teal-800">زمان انجام ثابت</span>
            </label>
            
            <div className="flex flex-wrap items-end gap-3 flex-1">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-bold mb-1 text-gray-700">زمان شروع (سررسید)</label>
                <DatePicker 
                  value={toPicker(form.DueDateTime)} 
                  disabled 
                  calendar={persian} 
                  locale={persian_fa} 
                  format="YYYY/MM/DD HH:mm" 
                  enableTimePicker 
                  inputClass={inp} 
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-bold mb-1 text-gray-700">زمان اتمام</label>
                <DatePicker 
                  value={toPicker(form.EndDateTime)} 
                  disabled 
                  calendar={persian} 
                  locale={persian_fa} 
                  format="YYYY/MM/DD HH:mm" 
                  enableTimePicker 
                  inputClass={inp} 
                />
              </div>
            </div>
          </div>

          {/* اولویت و دکمه زمان */}
          <div>
            <label className="block text-sm font-bold mb-1">اولویت</label>
            <select name="Priorities" value={form.Priorities} onChange={handleChange} disabled className={inp}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" disabled={!isEdit} onClick={() => setShowTimeDate(true)} className="btn-primary w-full">الویت و زمان (...)</button>
          </div>

          {/* نوع کار و ضمائم */}
          <div>
            <label className="block text-sm font-bold mb-1">نوع کار</label>
            <select name="tskType" value={form.tskType} onChange={handleChange} className={inp}>
              <option value="">(انتخاب کنید)</option>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" disabled={!isEdit} onClick={() => setShowFolder(true)} className="btn-primary w-full">ضمائم (...)</button>
          </div>

          {/* پروژه/اقدام و تأمین‌کننده */}
          <div>
            <label className="block text-sm font-bold mb-1">پروژه/اقدام</label>
            <select name="IsConsiderableAction" value={form.IsConsiderableAction} onChange={handleChange} className={inp}>
              {CONSIDERABLE.map((c) => <option key={c} value={c}>{c || '(بدون)'}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" disabled={!isEdit} onClick={() => setShowSupplier(true)} className="btn-primary w-full">تأمین‌کننده / خرید (...)</button>
          </div>

          {/* بخش خرید */}
          {form.tskType === 'خرید' && (
            <div className="md:col-span-2 bg-[#F7C4A5] rounded p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold mb-1">شماره درخواست</label>
                <input type="number" name="RequestNumber" value={form.RequestNumber} onChange={handleChange} className={inp} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">شماره ثبت</label>
                <input type="number" name="RegisterNumber" value={form.RegisterNumber} onChange={handleChange} className={inp} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">تاریخ درخواست</label>
                <DatePicker 
                  value={toPicker(form.RequestDate)} 
                  onChange={(d) => setForm((f) => ({ ...f, RequestDate: fromPicker(d) }))} 
                  calendar={persian} 
                  locale={persian_fa} 
                  format="YYYY/MM/DD" 
                  inputClass={inp} 
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-3 mt-6">
          <button type="submit" disabled={saving} className="btn-success">{saving ? 'در حال ذخیره...' : isEdit ? 'ویرایش' : 'افزودن'}</button>
          <button type="button" onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </form>
      
      {/* مودال‌ها */}
      {showTimeDate && isEdit && <TimeDateModal taskId={initial.TaskID} onClose={() => setShowTimeDate(false)} onSaved={onSaved} />}
      {showFollow && isEdit && <FollowModal taskId={initial.TaskID} subject={form.TaskTtl} onClose={() => setShowFollow(false)} onSaved={onSaved} />}
      {showAFModal && isEdit && <ApplicantFunctorModal taskId={initial.TaskID} onClose={() => setShowAFModal(false)} onSaved={(a, f) => { setForm((x) => ({ ...x, ApplicantName: a })); setFunctorName(f || ''); }} />}
      {showSupplier && isEdit && <SupplierModal taskId={initial.TaskID} onClose={() => setShowSupplier(false)} onSaved={onSaved} />}
      {showFolder && isEdit && <FolderModal taskId={initial.TaskID} onClose={() => setShowFolder(false)} onSaved={onSaved} />}
      {showAssetPicker && <AssetsModal onClose={() => setShowAssetPicker(false)} onSelectAsset={(id) => { setForm((f) => ({ ...f, AssetID: String(id) })); setShowAssetPicker(false); }} />}
    </div>
  );
}