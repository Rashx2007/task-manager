"use client";
import { useLayoutEffect, useRef, useState } from "react";

export default function Tip({ tip, children, block = false }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const tipRef = useRef(null);

  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  // ✅ جای‌گیری پس از رندر: اندازه‌گیری حباب و clamp داخل viewport
  useLayoutEffect(() => {
    if (!open || !tipRef.current || !anchor) return;
    const t = tipRef.current.getBoundingClientRect();
    const pad = 8;
    const half = t.width / 2;
    let x = anchor.cx;
    if (x - half < pad) x = half + pad;
    if (x + half > window.innerWidth - pad) x = window.innerWidth - pad - half;
    let y = anchor.top - 6 - t.height;
    if (y < pad) y = anchor.bottom + 6; // جا نشد → زیر سلول
    tipRef.current.style.left = `${x - half}px`;
    tipRef.current.style.top = `${y}px`;
  }, [open, anchor]);

  return (
    <span
      style={block ? { display: "block" } : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {open && tip ? (
        <span
          ref={tipRef}
          role="tooltip"
          dir="rtl"
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: 10000,
            maxWidth: 320,
            padding: "6px 10px",
            borderRadius: 6,
            background: "#1f2937",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.9,
            whiteSpace: "pre-line",
            textAlign: "right",
            pointerEvents: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,.35)",
          }}
        >
          {tip}
        </span>
      ) : null}
    </span>
  );
}