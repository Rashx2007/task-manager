// ✅ قواعد مشترک مکان دستگاه (کلاینت و سرور)
export const normFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// ✅ «مرکزی» (تایپی) و «مرکزي» (ذخیره‌شده در DB) معادل‌اند
export const isCentral = (building) => normFa(building) === 'مرکزی';

// ✅ طبقه برای همهٔ ساختمان‌ها معنادار است؛ بلوک و ورودی فقط برای مرکزی
export const placeRules = (building, block, floor, entrance) => {
  const fl = (floor === '' || floor == null || String(floor).trim() === '' || isNaN(Number(floor))) ? null : Number(floor);
  if (isCentral(building)) {
    return { central: true, block: normFa(block) || '', floor: fl, entrance: normFa(entrance) || '' };
  }
  return { central: false, block: '-', floor: fl, entrance: '-' };
};