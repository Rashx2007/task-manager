'use client';
import { useState, useEffect, useRef } from 'react';
import { normalizeFa } from '@/lib/assetRules';
import { showToast } from '@/lib/toast';

const CONTACT_FIELDS = [
  ['WorkTellNumber1', 'داخلی/شرکت ۱'],
  ['WorkTellNumber2', 'داخلی/شرکت ۲'],
  ['WorkTellNumber3', 'داخلی/شرکت ۳'],
  ['MobileTellNumber1', 'موبایل ۱'],
  ['MobileTellNumber2', 'موبایل ۲'],
  ['MobileTellNumber3', 'موبایل ۳'],
];
const firstPhone = (person, prefix) => [1, 2, 3]
  .map((index) => String(person?.[`${prefix}${index}`] ?? '').trim())
  .find(Boolean) || '';

export default function ApplicantFunctorModal({ taskId, onClose, onSaved }) {
  const [persons, setPersons] = useState([]);
  const [applicant, setApplicant] = useState('');
  const [functor, setFunctor] = useState('');
  const [saving, setSaving] = useState(false);
  const [personIds, setPersonIds] = useState({ applicant: null, functor: null });
  const [detailsPerson, setDetailsPerson] = useState(null);
  const detailsCloseRef = useRef(null);

  useEffect(() => {
    fetch('/api/persons').then((r) => r.json()).then((d) => { if (d.success) setPersons(d.data || []); }).catch(() => {});
    fetch(`/api/applicant-functor?taskId=${taskId}`).then((r) => r.json()).then((d) => {
      if (d.success && d.exists && d.data) {
        setApplicant(d.data.ApplicantName || '');
        setFunctor(d.data.FunctorName || '');
        setPersonIds({ applicant: d.data.ApplicantID ?? null, functor: d.data.FunctorID ?? null });
      }
    }).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (detailsPerson) {
        e.preventDefault();
        e.stopPropagation();
        setDetailsPerson(null);
      } else onClose();
    };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose, detailsPerson]);

  useEffect(() => {
    if (!detailsPerson) return;
    const previousFocus = document.activeElement;
    detailsCloseRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [detailsPerson]);

  const findPerson = (name, role) => {
    const normalized = normalizeFa(name);
    if (!normalized) return null;
    const matches = persons.filter((person) => normalizeFa(person.PersonName) === normalized);
    const byId = matches.find((person) => personIds[role] != null && String(person.PersonID) === String(personIds[role]));
    return byId || (matches.length === 1 ? matches[0] : null);
  };

  const personField = (label, role, value, setValue) => {
    const person = findPerson(value, role);
    const mobile = firstPhone(person, 'MobileTellNumber');
    const work = firstPhone(person, 'WorkTellNumber');
    return (
      <div className="mb-4">
        <label htmlFor={`af-${role}`} className="block text-sm font-bold mb-1">{label}</label>
        <div className="flex items-stretch gap-2" dir="rtl">
          <div className="search-input flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
            <input id={`af-${role}`} className="min-w-0 flex-1 bg-transparent outline-none" style={{ minWidth: '9rem' }}
              list="af-persons" value={value} onChange={(e) => {
                setValue(e.target.value);
                setPersonIds((current) => ({ ...current, [role]: null }));
              }} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" dir="ltr">
              <span className="whitespace-nowrap" dir="rtl">موبایل: <bdi dir="ltr">{mobile || 'ثبت نشده'}</bdi></span>
              <span className="whitespace-nowrap" dir="rtl">داخلی/شرکت: <bdi dir="ltr">{work || 'ثبت نشده'}</bdi></span>
            </div>
          </div>
          <button type="button" className="btn-primary shrink-0 px-2 text-xs" disabled={!person}
            aria-label={`اطلاعات کامل ${label}`}
            title={person ? `اطلاعات کامل ${person.PersonName}` : 'ابتدا نام یک شخص مشخص از فهرست انتخاب شود؛ نام‌های تکراری بدون کد قابل تشخیص نیستند.'}
            onClick={() => setDetailsPerson(person)}>
            اطلاعات شخص
          </button>
        </div>
      </div>
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/applicant-functor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, applicantName: applicant, functorName: functor }),
      });
      const d = await res.json();
      if (d.success) { showToast('ذخیره شد.', 'success'); if (onSaved) onSaved(applicant, functor); onClose(); }
      else showToast('خطا: ' + d.error, 'error');
    } catch { showToast('خطا در ارتباط با سرور', 'error'); }
    setSaving(false);
  };

    return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0 && e.target === e.currentTarget) onClose(); }}>
      {/* ✅ Enter در هر دو ورودی = ذخیره (submit فرم) */}
      <form onSubmit={(e) => { e.preventDefault(); save(); }}
        className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[760px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">درخواست‌کننده و انجام‌دهنده — کد کار: {taskId}</h3>
        {personField('درخواست‌کننده', 'applicant', applicant, setApplicant)}
        {personField('انجام‌دهنده', 'functor', functor, setFunctor)}
        <datalist id="af-persons">{persons.map((p) => <option key={p.PersonID} value={p.PersonName} />)}</datalist>
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-success">{saving ? '...' : 'ذخیره'}</button>
          <button type="button" onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </form>
      {detailsPerson && (
        <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center p-3"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (e.button === 0 && e.target === e.currentTarget) setDetailsPerson(null);
          }}>
          <section role="dialog" aria-modal="true" aria-labelledby="af-person-details-title" dir="rtl"
            className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] overflow-y-auto p-5"
            onKeyDown={(e) => {
              if (e.key === 'Tab') { e.preventDefault(); detailsCloseRef.current?.focus(); }
            }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h4 id="af-person-details-title" className="font-bold">اطلاعات کامل شخص</h4>
              <button ref={detailsCloseRef} type="button" className="btn-danger" onClick={() => setDetailsPerson(null)}>بستن</button>
            </div>
            <div className="overflow-hidden rounded-lg border border-teal-700/40">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-teal-800 text-white">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-right font-bold">عنوان</th>
                    <th scope="col" className="px-3 py-2 text-right font-bold">مقدار</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['PersonName', 'نام'],
                    ['PersonID', 'کد شخص'],
                    ['OfficeName', 'دفتر/سمت'],
                    ...CONTACT_FIELDS.filter(([field]) => field.startsWith('Mobile')),
                    ...CONTACT_FIELDS.filter(([field]) => field.startsWith('Work')),
                    ['Address', 'آدرس'],
                  ].map(([field, label], index) => {
                    const value = String(detailsPerson[field] ?? '').trim();
                    const numeric = field === 'PersonID' || field.includes('TellNumber');
                    return (
                      <tr key={field} className={index % 2 === 0 ? 'bg-white/80' : 'bg-teal-50'}>
                        <th scope="row" className="w-[40%] sm:w-1/3 border-t border-l border-teal-700/20 px-3 py-2 text-right align-top font-bold">{label}</th>
                        <td className="border-t border-teal-700/20 px-3 py-2 text-right align-top whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
                          <bdi dir={value && numeric ? 'ltr' : 'auto'}>{value || 'ثبت نشده'}</bdi>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}