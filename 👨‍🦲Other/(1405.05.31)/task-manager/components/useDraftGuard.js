'use client';
import { useEffect, useRef } from 'react';

export default function useDraftGuard(getText) {
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const getTextRef = useRef(getText);
  getTextRef.current = getText;

  const touch = (text) => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); } catch {}
    }, 300);
  };
  const markSaved = () => { dirtyRef.current = false; };

  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        const t = getTextRef.current ? getTextRef.current() : '';
        try { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {}); } catch {}
        setTimeout(() => alert('مودال بسته شد؛ متنِ در حال تایپ در کلیپ‌بورد کپی شد.'), 0);
      }
    };
  }, []);

  return { touch, markSaved };
}