'use client';
import { useState, useEffect } from 'react';

export default function ApplicantFunctorModal({ taskId, onClose, onSaved }) {
  const [persons, setPersons] = useState([]);
  const [applicant, setApplicant] = useState('');
  const [functor, setFunctor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/persons').then((r) => r.json()).then((d) => { if (d.success) setPersons(d.data || []); }).catch(() => {});
    fetch(`/api/applicant-functor?taskId=${taskId}`).then((r) => r.json()).then((d) => {
      if (d.success && d.exists && d.data) {
        setApplicant(d.data.ApplicantName || '');
        setFunctor(d.data.FunctorName || '');
      }
    }).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', h); };
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/applicant-functor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, applicantName: applicant, functorName: functor }),
      });
      const d = await res.json();
      if (d.success) { alert('ذخیره شد.'); if (onSaved) onSaved(applicant, functor); onClose(); }
      else alert('خطا: ' + d.error);
    } catch { alert('خطا در ارتباط با سرور'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">درخواست‌کننده و انجام‌دهنده — کد کار: {taskId}</h3>
        <div className="mb-3">
          <label className="block text-sm font-bold mb-1">درخواست‌کننده</label>
          <input className="search-input w-full" list="af-persons" value={applicant} onChange={(e) => setApplicant(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-bold mb-1">انجام‌دهنده</label>
          <input className="search-input w-full" list="af-persons" value={functor} onChange={(e) => setFunctor(e.target.value)} />
        </div>
        <datalist id="af-persons">{persons.map((p) => <option key={p.PersonID} value={p.PersonName} />)}</datalist>
        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="btn-success">{saving ? '...' : 'ذخیره'}</button>
          <button onClick={onClose} className="btn-danger">بستن</button>
        </div>
      </div>
    </div>
  );
}