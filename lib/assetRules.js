// ✅ قواعد مشترک مکان دستگاه (کلاینت و سرور)
export const normalizeFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// نام قدیمی برای سازگاری importهای قبلی
export const normFa = normalizeFa;

// ✅ «مرکزی» با هر املا و هر پرانتز: مرکزی، مرکزي، (مرکزی)، «مرکزی» ...
export const isCentral = (building) =>
  normalizeFa(String(building || '').replace(/[()«»]/g, '')) === 'مرکزی';

// ✅ بلوک و ورودی فقط برای مرکزی معنا دارند؛ «طبقه» برای همهٔ ساختمان‌ها معنادار است
export const placeRules = (building, block, floor, entrance) => {
  const fl =
    floor === '' || floor == null || String(floor).trim() === '' || isNaN(Number(floor))
      ? null
      : Number(floor);
  if (isCentral(building)) {
    return { central: true, block: normalizeFa(block) || '', floor: fl, entrance: normalizeFa(entrance) || '' };
  }
  return { central: false, block: '-', floor: fl, entrance: '-' };
};