'use client';

import { useState, useEffect, useRef } from 'react';
export default function ApplicantFunctorModal({ taskId, onClose, onSaved }) {
  const [persons, setPersons] = useState([]);
  const [applicantName, setApplicantName] = useState('');
  const [functorName, setFunctorName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetch('/api/persons').then((r) => r.json());
        if (p.success) setPersons(p.data);

        const af = await fetch(`/api/applicant-functor?taskId=${taskId}`).then((r) => r.json());
        if (af.success && af.exists && af.data) {
          setApplicantName(af.data.ApplicantName || '');
          setFunctorName(af.data.FunctorName || '');
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [taskId]);
  
  // بستن با ESC
useEffect(() => {
  const h = (e) => { if (e.key === 'Escape') onClose(); };
  window.addEventListener('keydown', h);
  return () => window.removeEventListener('keydown', h);
}, [onClose]);  

  // معادل پر شدن ApplicantTellCombo/FunctorTellCombo در C#
  const tellsOf = (name) => {
    const p = persons.find((x) => x.PersonName === name);
    if (!p) return '';
    const parts = [];
    if (p.WorkTellNumber1) parts.push(`داخلی: ${p.WorkTellNumber1}`);
    if (p.MobileTellNumber1) parts.push(`موبایل: ${p.MobileTellNumber1}`);
    return parts.join(' | ');
  };

  const handleOk = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/applicant-functor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, applicantName, functorName }),
      });
      const d = await res.json();
      if (d.success) {
        alert('!!!هماهنگی تردد پیمانکار!!!\nاطلاعات با موفقیت ثبت شد.');
        if (onSaved) onSaved(applicantName, functorName);
        onClose();
      } else {
        alert('خطا: ' + (d.error || 'نامشخص'));
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    } finally {
      setSaving(false);
    }
  };

    const okRef = useRef(null);
  okRef.current = handleOk;

  // شورتکات: Esc = لغو ، Ctrl+Enter = تأیید
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); if (okRef.current) okRef.current(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
        <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[560px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">اطلاعات تماس افراد — کد کار: {taskId}</h3>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">درخواست‌کننده</label>
            <input
              list="af-applicants"
              value={applicantName}
              onChange={(e) => setApplicantName(e.target.value)}
              className="search-input w-full"
            />
            <datalist id="af-applicants">
              {persons.map((p) => <option key={p.PersonID} value={p.PersonName} />)}
            </datalist>
            <div className="text-xs text-gray-700 mt-1 h-4">{tellsOf(applicantName)}</div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">فرد انجام‌دهنده</label>
            <input
              list="af-functors"
              value={functorName}
              onChange={(e) => setFunctorName(e.target.value)}
              className="search-input w-full"
            />
            <datalist id="af-functors">
              {persons.map((p) => <option key={p.PersonID} value={p.PersonName} />)}
            </datalist>
            <div className="text-xs text-gray-700 mt-1 h-4">{tellsOf(functorName)}</div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleOk} disabled={saving} className="btn-success">
            {saving ? 'در حال ثبت...' : 'تأیید'}
          </button>
           <button onClick={onClose} className="btn-danger">لغو</button>
          <span className="text-xs text-gray-600 mr-auto self-center">
            Ctrl+Enter = تأیید · Esc = لغو · کلیک بیرون = بستن
          </span>
        </div>
      </div>
    </div>
  );
}