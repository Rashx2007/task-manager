'use client';
import { useEffect, useRef, useState } from 'react';

// ✅ محافظ پیش‌نویس: پس از شروع تایپ، هر ۲ ثانیه یک‌بار از متن کپی می‌گیرد
// تا اگر مودال ناگهانی بسته شد، متن قابل بازیابی باشد.
export default function useDraftGuard(getText, key = 'draft_text') {
  const [draft, setDraft] = useState(() => {
    try { return (typeof window !== 'undefined' && localStorage.getItem(key)) || ''; } catch { return ''; }
  });
  const dirtyRef = useRef(false);
  const getRef = useRef(getText);
  getRef.current = getText;

  useEffect(() => {
    const id = setInterval(() => {
      if (!dirtyRef.current) return;
      try { localStorage.setItem(key, getRef.current() || ''); } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [key]);

  const touch = () => { dirtyRef.current = true; };
  const markSaved = () => {
    dirtyRef.current = false;
    try { localStorage.removeItem(key); } catch {}
    setDraft('');
  };
  return { touch, markSaved, draft };
}