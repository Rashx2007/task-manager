import { normalizeDigits, normalizeFa } from './assetRules';

// این فهرست مستقل از جدول قابل‌ویرایش صفحهٔ اصلی است.
export const INSPECTION_COLUMNS = [
  ['TaskID', 'کد کار', true], ['AssetName', 'دستگاه/مجموعه', true],
  ['AssetNumber', 'شماره', true], ['Building', 'ساختمان', true],
  ['Block', 'بلوک', true], ['Floor', 'طبقه', true], ['Entrance', 'ورودی', true],
  ['Location', 'قسمت', true], ['TaskTtl', 'موضوع', true],
  ['Descriptions', 'توضیحات', false], ['Priorities', 'اولویت', true],
  ['status', 'وضعیت', true], ['DueDateTime', 'زمان شروع', false],
  ['EndDateTime', 'زمان پایان', false],
].map(([key, label, filterable]) => ({ key, label, filterable }));

export const inspectionSearchText = (value) => normalizeFa(normalizeDigits(value)).replace(/\s+/g, '');

export async function readInspectionSearch(body, signal) {
  const response = await fetch('/api/task-inspector/search', {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'دریافت نتایج جستجو ناموفق بود.');
  return result;
}
