"use client";
import { useLayoutEffect, useRef } from 'react';
import { trackLoadingCenter } from '@/lib/loading-center.mjs';

const PETALS = [
  ['#0f766e', .92], ['#1095ad', .86], ['#22b8c7', .78],
  ['#59cec8', .70], ['#8bd9bd', .74], ['#e1c586', .82],
  ['#f3ac79', .90], ['#f7c4a5', .88], ['#c8d89a', .78],
  ['#7dcbb4', .76], ['#35b7a2', .82], ['#15958d', .88],
];

export default function LoadingIndicator({ label = "در حال بارگذاری اطلاعات", inline = false }) {
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    if (!inline) return trackLoadingCenter(rootRef.current, window);
  }, [inline]);
  return <span ref={rootRef} role="status" aria-live="polite" aria-atomic="true" aria-label={label}
    className={`app-loading${inline ? ' app-loading--inline' : ''}`}>
    <span className="app-loading__graphic" aria-hidden="true">
      <svg className="app-loading__spinner" viewBox="0 0 80 80" focusable="false" aria-hidden="true">
        {PETALS.map(([color, opacity], index) => <path key={index}
          d="M 37.71 28.22 L 33.51 6.63 A 34 34 0 0 1 46.49 6.63 L 42.29 28.22 A 12 12 0 0 0 37.71 28.22 Z"
          transform={`rotate(${index * 30} 40 40)`} fill={color} fillOpacity={opacity} />)}
      </svg>
    </span>
    <span className="sr-only">{label}</span>
  </span>;
}
