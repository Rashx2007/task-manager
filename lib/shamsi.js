// lib/shamsi.js
// تبدیل تاریخ میلادی به شمسی برای نام‌گذاری فایل‌ها (مطابق ToShamsiDateAndTime در C#)

export function toShamsiDateTime(date = new Date()) {
  const pc = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const p = (t) => pc.find(x => x.type === t)?.value || '00';
  return `${p('year')}.${p('month')}.${p('day')} ${p('hour')}.${p('minute')}.${p('second')}`;
}

export function toShamsiDate(date = new Date()) {
  return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function toShamsiTime(date = new Date()) {
  return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

// نام فایل برای گزارش Text (مطابق Define_FileName در C#)
export function makeTextFileName(prefix, ext = 'txt') {
  return `(${toShamsiDateTime()}) ${prefix}.${ext}`;
}

// نام فایل برای گزارش Excel (مطابق Define_xlsx_FileName)
export function makeExcelFileName(prefix) {
  return `(${toShamsiDateTime()}) ${prefix}.xlsx`;
}

// فرمت تاریخ فارسی برای داخل گزارش‌ها (HH:mm  yyyy/MM/dd)
export function fmtFaDT(d) {
  if (!d) return '';
  const dt = new Date(d);
  const date = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(dt);
  const time = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(dt);
  return `${time}  ${date}`;
}

// yyyy/MM/dd برای تاریخ‌های خالی
export function fmtFaDateOnly(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(d));
}