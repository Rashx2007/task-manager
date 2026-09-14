// ✅ قواعد مشترک مکان دستگاه (کلاینت و سرور)
export const normFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// ✅ «مرکزی» (تایپی) و «مرکزي» (ذخیره‌شده در DB) معادل‌اند
export const isCentral = (building) => normFa(building) === 'مرکزی';

// ✅ بلوک/ورودی فقط برای مرکزی معنا دارد؛ غیرمرکزی‌ها: بلوک '-'، طبقه 0، ورودی '-'
export const placeRules = (building, block, floor, entrance) => {
  if (isCentral(building)) {
    const fl = (floor === '' || floor == null || String(floor).trim() === '' || isNaN(Number(floor))) ? null : Number(floor);
    return { central: true, block: normFa(block) || '', floor: fl, entrance: normFa(entrance) || '' };
  }
  return { central: false, block: '-', floor: 0, entrance: '-' };
};