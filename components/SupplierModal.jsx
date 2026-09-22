"use client";
import { useState, useEffect, useRef } from "react";

// ✅ گزینه‌ها از دیتابیس می‌آیند، ولی ترتیب نمایش همیشه ثابت و برابر این فهرست است:
const STATUS_ORDER = [
  "لغو",
  "درخواست کالا و خدمات",
  "انبار",
  "درخواست خرید کالا و خدمات",
  "مدیر تدارکات",
  "کارپرداز",
  "مقام تشخیص",
  "اداره مالی",
  "مجدد کارپرداز",
  "نهایی",
];

export default function SupplierModal({ taskId, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [persons, setPersons] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [saving, setSaving] = useState(false);

  // ✅ شماره خرید: سه قسمت، هر کدام حداکثر ۵ رقم
  const [regParts, setRegParts] = useState(["", "", ""]);
  const regEditedRef = useRef(false);

  const toEnDigits = (s) =>
    String(s ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٣٤٥٧٨٩".indexOf(d));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/supplier?taskId=${taskId}`);
        const d = await res.json();
        if (d.success) setForm(d.data || {});
      } catch {}
      try {
        const r = await fetch("/api/persons");
        const pd = await r.json();
        if (pd.success) setPersons(pd.data || []);
      } catch {}
      try {
        const s = await fetch("/api/purchase-statuses");
        const sd = await s.json();
        if (sd.success) setStatuses(sd.data || []);
      } catch {}
    })();
  }, [taskId]);

  // ✅ تجزیهٔ مقدار قبلی RegisterNumber به سه خانه (تا وقتی کاربر ویرایش نکرده باشد)
  useEffect(() => {
    if (regEditedRef.current) return;
    const cur = String(form?.RegisterNumber ?? "");
    const parts = cur.split(/[-/]/);
    setRegParts([parts[0] || "", parts[1] || "", parts[2] || ""]);
  }, [form?.RegisterNumber]);

  const changeRegPart = (i, v) => {
    regEditedRef.current = true;
    const clean = toEnDigits(v).replace(/\D/g, "").slice(0, 5);
    setRegParts((p) => {
      const n = [...p];
      n[i] = clean;
      return n;
    });
  };

  const regNumberValue = () => regParts.filter((x) => x !== "").join("/");

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, RegisterNumber: regNumberValue() };
      const res = await fetch("/api/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, ...payload }),
      });
      const d = await res.json();
      if (d.success) {
        alert("ذخیره شد.");
        if (onSaved) onSaved();
        onClose();
      } else alert("خطا: " + d.error);
    } catch {
      alert("خطا در ارتباط با سرور");
    }
    setSaving(false);
  };

  const orderedStatuses = [
    ...STATUS_ORDER.filter((s) => statuses.includes(s)),
    ...statuses
      .filter((s) => !STATUS_ORDER.includes(s))
      .sort((a, b) => a.localeCompare(b, "fa")),
  ];

  const inp = "search-input w-full";
  if (!form) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[640px] max-w-[95vw] p-6">
        <h3 className="text-lg font-bold mb-4">
          تأمین‌کننده / خرید — کد کار: {taskId}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">
              شماره درخواست
            </label>
            <input
              className={inp}
              value={form.RequestNumber ?? ""}
              onChange={(e) =>
                setForm({ ...form, RequestNumber: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">شماره خرید</label>
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-2">
              <input
                className="search-input w-full md:w-24 px-3 py-2 text-center font-mono"
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                value={regParts[0] || ""}
                onChange={(e) => changeRegPart(0, e.target.value)}
              />
              <span className="font-bold text-lg hidden md:inline">-</span>
              <input
                className="search-input w-full md:w-24 px-3 py-2 text-center font-mono"
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                value={regParts[1] || ""}
                onChange={(e) => changeRegPart(1, e.target.value)}
              />
              <span className="font-bold text-lg hidden md:inline">-</span>
              <input
                className="search-input w-full md:w-24 px-3 py-2 text-center font-mono"
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                value={regParts[2] || ""}
                onChange={(e) => changeRegPart(2, e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">
              تاریخ درخواست
            </label>
            <input
              className={inp}
              value={form.RequestDate ?? ""}
              onChange={(e) =>
                setForm({ ...form, RequestDate: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">کارپرداز</label>
            <input
              className={inp}
              list="supplier-persons"
              value={form.Agent ?? ""}
              onChange={(e) => setForm({ ...form, Agent: e.target.value })}
              placeholder="انتخاب از لیست یا تایپ نام جدید..."
            />
            <datalist id="supplier-persons">
              {persons.map((p) => {
                const label =
                  typeof p === "string" ? p : p.FullName || p.Name || String(p);
                return <option key={label} value={label} />;
              })}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">وضعیت</label>
            <select
              className={inp}
              value={form.Status ?? ""}
              onChange={(e) => setForm({ ...form, Status: e.target.value })}
            >
              <option value="">(انتخاب کنید)</option>
              {orderedStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {form.Status && !orderedStatuses.includes(form.Status) && (
                <option value={form.Status}>{form.Status}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">
              تاریخ تأمین اعتبار
            </label>
            <input
              className={inp}
              value={form.CreditDate ?? ""}
              onChange={(e) => setForm({ ...form, CreditDate: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button className="btn-success" disabled={saving} onClick={save}>
            ذخیره
          </button>
          <button className="btn-danger" onClick={onClose}>
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
