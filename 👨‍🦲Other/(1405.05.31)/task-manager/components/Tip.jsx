'use client';
import { useState, useRef } from 'react';

export default function Tip({ tip, children, block = false }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const show = () => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = r.top < 110;
    setPos({ left: r.left + r.width / 2, top: below ? r.bottom + 8 : r.top - 8, below });
  };
  return (
    <span ref={ref} style={block ? { display: 'block' } : undefined} onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && (
        <span className={`app-tooltip${pos.below ? ' app-tooltip-below' : ''}`} style={{ top: pos.top, left: pos.left }}>
          {tip}
        </span>
      )}
    </span>
  );
}