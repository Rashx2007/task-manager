// lib/toast.js
const COLORS = { info: "#1095ad", success: "#16a34a", warn: "#b45309", error: "#b91c1c" };

export function showToast(message, type = "info", timeout = 4500) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:100000",
    "max-width:min(90vw,520px)",
    "padding:10px 18px",
    "border-radius:10px",
    "color:#fff",
    `background:${COLORS[type] || COLORS.info}`,
    "font-size:13px",
    "font-weight:700",
    "line-height:1.9",
    "text-align:center",
    "direction:rtl",
    "white-space:pre-line",
    "box-shadow:0 6px 20px rgba(0,0,0,.3)",
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, timeout);
}