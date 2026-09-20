'use client';
import { useState, useEffect } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const STATUSES = ['', 'در حال انجام', 'نهایی', 'لغو'];

const fromPicker = (d) => {
  if (!d) return '';
  try { const dt = d.toDate(); return isNaN(dt.getTime()) ? '' : dt.toISOString(); } catch { return ''; }
};
const toPicker = (iso) => (iso ? new DateObject({ date: new Date(iso), calendar: persian, locale: persian_fa }) : null);

export default function SupplierModal({ taskId, onClose, onSaved }) {
  const [form, setForm] = useState({ requestNumber: '', registerNumber: '', requestDate: '', buyer: '', status: '', fundingDate: '' });
  const [buyers, setBuyers] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadBuyers = () =>
    fetch('/api/buyers')
      .then((r) => r.json())
      .then((d) => { if (d.success) setBuyers(d.buyers || []); })
      .catch(() => {});

  useEffect(() => {
    fetch(`/api/supplier?taskId=${taskId}`).then((r) => r.json()).then((d) => {
      if (d.success && d.data) {
        setForm({
          requestNumber: d.data.RequestNumber ?? '',
          registerNumber: d.data.RegisterNumber ?? '',
          requestDate: d.data.RequestDate ? new Date(d.data.RequestDate).toISOString() : '',
          buyer: d.data.Buyer || '',
          status: d.data.Status || '',
          fundingDate: d.data.FundingDate ? new Date(d.data.FundingDate).toISOString() : '',
        });
      }
    }).catch(() => {});
    loadBuyers();
  }, [taskId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    // ✅ مانند دسکتاپ: اگر نام کارپرداز در لیست نیست، دربارهٔ ثبت آن در Buyer_tbl بپرس
    const buyerName = (form.buyer || '').trim();
    if (buyerName && !buyers.some((b) => b.trim() === buyerName)) {
      if (confirm(`«${buyerName}» در لیست کارپردازها نیست؛ به‌عنوان کارپرداز جدید ثبت شود؟`)) {
        try {
          const r = await fetch('/api/buyers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: buyerName }),
          });
          const d = await r.json();
          if (d.success) setBuyers((prev) => [...prev, buyerName].sort((a, b) => a.localeCompare(b, 'fa')));
          else alert('خطا در ثبت کارپرداز: ' + d.error);
        } catch { alert('خطا در ارتباط با سرور'); }
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/supplier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, ...form, buyer: buyerName }),
      });
      const d = await res.json();
      if (d.success) { alert('اطلاعات خرید/تأمین‌کننده ذخیره شد.'); if (onSaved) onSaved(); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  const inp = 'search-input w-full';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[640px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-4">تأمین‌کننده / خرید — کد کار: {taskId}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-bold mb-1">شماره درخواست</label>
            <input type="number" value={form.requestNumber} onChange={set('requestNumber')} className={inp} /></div>
          <div><label className="block text-sm font-bold mb-1">شماره ثبت</label>
            <input type="number" value={form.registerNumber} onChange={set('registerNumber')} className={inp} /></div>
          <div><label className="block text-sm font-bold mb-1">تاریخ درخواست</label>
            <DatePicker value={toPicker(form.requestDate)} onChange={(d) => setForm({ ...form, requestDate: fromPicker(d) })}
              calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} /></div>
          <div>
            <label className="block text-sm font-bold mb-1">کارپرداز</label>
            <input value={form.buyer} onChange={set('buyer')} list="buyers-list" className={inp}
              placeholder="انتخاب از لیست یا تایپ نام جدید..." />
            <datalist id="buyers-list">
              {buyers.map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div><label className="block text-sm font-bold mb-1">وضعیت</label>
            <select value={form.status} onChange={set('status')} className={inp}>
              {STATUSES.map((s) => <option key={s} value={s}>{s || '(انتخاب کنید)'}</option>)}
            </select></div>
          <div><label className="block text-sm font-bold mb-1">تاریخ تأمین اعتبار</label>
            <DatePicker value={toPicker(form.fundingDate)} onChange={(d) => setForm({ ...form, fundingDate: fromPicker(d) })}
              calendar={persian} locale={persian_fa} format="YYYY/MM/DD" inputClass={inp} /></div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={save} disabled={saving} className="btn-success">{saving ? 'در حال ذخیره...' : 'ذخیره'}</button>
          <button onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </div>
    </div>
  );
}