// lib/toast.js
const COLORS = { info: "#1095ad", success: "#16a34a", warn: "#b45309", error: "#b91c1c" };

export function showToast(message, type = "info", timeout = 4500) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = [
    "position:fixed", "top:16px", "left:50%", "transform:translateX(-50%)",
    "z-index:100000", "max-width:min(90vw,520px)", "padding:10px 18px",
    "border-radius:10px", "color:#fff", `background:${COLORS[type] || COLORS.info}`,
    "font-size:13px", "font-weight:700", "line-height:1.9", "text-align:center",
    "direction:rtl", "white-space:pre-line", "box-shadow:0 6px 20px rgba(0,0,0,.3)",
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

// ✅ توست تأیید دودکمه‌ای (جایگزین confirm مرورگر)
export function showConfirm(message, options = {}) {
  const { type = "warn", confirmText = "تأیید", cancelText = "انصراف", onConfirm, onCancel } = options;
  if (typeof document === "undefined") return;
  const bg = COLORS[type] || COLORS.warn;
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed", "top:16px", "left:50%", "transform:translateX(-50%)",
    "z-index:100001", "max-width:min(90vw,520px)", "padding:12px 18px",
    "border-radius:12px", "color:#fff", `background:${bg}`,
    "font-size:13px", "font-weight:700", "line-height:1.9", "text-align:center",
    "direction:rtl", "white-space:pre-line", "box-shadow:0 6px 20px rgba(0,0,0,.35)",
  ].join(";");
  const msg = document.createElement("div");
  msg.textContent = message;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:center;margin-top:10px;";
  const mkBtn = (label, primary) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = [
      "border:none", "border-radius:8px", "padding:6px 18px", "font-size:12px",
      "font-weight:800", "cursor:pointer",
      primary ? `background:#fff;color:${bg}` : "background:rgba(255,255,255,.18);color:#fff",
    ].join(";");
    return b;
  };
  const close = () => {
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  };
  const ok = mkBtn(confirmText, true);
  const no = mkBtn(cancelText, false);
  ok.onclick = () => { close(); if (onConfirm) onConfirm(); };
  no.onclick = () => { close(); if (onCancel) onCancel(); };
  row.appendChild(ok);
  row.appendChild(no);
  el.appendChild(msg);
  el.appendChild(row);
  document.body.appendChild(el);
}