"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import DatePicker, { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

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

const toPicker = (wallStr) => {
  if (!wallStr) return null;
  const m = String(wallStr).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d+))?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (isNaN(d.getTime())) return null;
  return new DateObject({ date: d, calendar: persian, locale: persian_fa });
};
const fromPicker = (d) => {
  if (!d) return "";
  const dt = d.toDate();
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
};

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
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const digitsOnly = (s, max) => toEnDigits(s).replace(/\D/g, "").slice(0, max);

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
    const clean = digitsOnly(v, 5);
    setRegParts((p) => {
      const n = [...p];
      n[i] = clean;
      return n;
    });
  };
  const regNumberValue = () => regParts.filter((x) => x !== "").join("/");

  // ✅ کشِ گزینه‌ها تا هر ضربه کلید، صدها <option> را دوباره نسازد (رفع کندی تایپ)
  const personOptions = useMemo(
    () =>
      persons.map((p) => {
        const label = typeof p === "string" ? p : p.PersonName || p.FullName || p.Name || "";
        return label ? <option key={label} value={label} /> : null;
      }),
    [persons],
  );
  const orderedStatuses = useMemo(
    () => [
      ...STATUS_ORDER.filter((s) => statuses.includes(s)),
      ...statuses.filter((s) => !STATUS_ORDER.includes(s)).sort((a, b) => a.localeCompare(b, "fa")),
    ],
    [statuses],
  );
  const statusOptions = useMemo(
    () => orderedStatuses.map((s) => <option key={s} value={s}>{s}</option>),
    [orderedStatuses],
  );

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
      <div className="bg-[#CCE6DF] rounded-lg shadow-2xl w-[640px] max-w-[95vw] max-h-[92vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold mb-4">تأمین‌کننده / خرید — کد کار: {taskId}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">شماره درخواست</label>
            <input
              className={inp + " text-center"}
              dir="ltr"
              inputMode="numeric"
              maxLength={5}
              value={form.RequestNumber ?? ""}
              onChange={(e) => setForm({ ...form, RequestNumber: digitsOnly(e.target.value, 5) })}
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">شماره خرید</label>
            <div className="flex items-center gap-1 md:gap-2">
              <input
                className="search-input flex-1 min-w-0 md:max-w-[7rem] px-2 py-2 text-center"
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                value={regParts[0] || ""}
                onChange={(e) => changeRegPart(0, e.target.value)}
              />
              <span className="shrink-0 font-bold text-lg">-</span>
              <input
                className="search-input flex-1 min-w-0 md:max-w-[7rem] px-2 py-2 text-center"
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                value={regParts[1] || ""}
                onChange={(e) => changeRegPart(1, e.target.value)}
              />
              <span className="shrink-0 font-bold text-lg">-</span>
              <input
                className="search-input flex-1 min-w-0 md:max-w-[7rem] px-2 py-2 text-center"
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                value={regParts[2] || ""}
                onChange={(e) => changeRegPart(2, e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">تاریخ درخواست</label>
            <DatePicker
              value={toPicker(form.RequestDate)}
              onChange={(d) => setForm({ ...form, RequestDate: fromPicker(d) })}
              calendar={persian}
              locale={persian_fa}
              format="YYYY/MM/DD"
              inputClass={inp}
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
            <datalist id="supplier-persons">{personOptions}</datalist>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">وضعیت</label>
            <select
              className={inp}
              value={form.Status ?? ""}
              onChange={(e) => setForm({ ...form, Status: e.target.value })}
            >
              <option value="">(انتخاب کنید)</option>
              {statusOptions}
              {form.Status && !orderedStatuses.includes(form.Status) && (
                <option value={form.Status}>{form.Status}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">تاریخ تأمین اعتبار</label>
            <DatePicker
              value={toPicker(form.CreditDate)}
              onChange={(d) => setForm({ ...form, CreditDate: fromPicker(d) })}
              calendar={persian}
              locale={persian_fa}
              format="YYYY/MM/DD"
              inputClass={inp}
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