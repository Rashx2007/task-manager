import { useEffect, useRef } from 'react';

export default function useDraftGuard(getValue) {
  const savedRef = useRef(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    const handler = (e) => {
      const current = getValue();
      if (current !== savedRef.current && !warnedRef.current) {
        e.preventDefault();
        e.returnValue = '';
        warnedRef.current = true;
        setTimeout(() => { warnedRef.current = false; }, 1000);
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [getValue]);

  const touch = (val) => { savedRef.current = val; };
  const markSaved = () => { savedRef.current = getValue(); };

  return { touch, markSaved };
}