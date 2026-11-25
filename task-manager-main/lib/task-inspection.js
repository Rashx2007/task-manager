import { normalizeDigits } from './assetRules';

export const TASK_INSPECTOR_EVENT = 'task-manager:inspect-task';

export function parseTaskId(value) {
  const text = normalizeDigits(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

export function assetSummary(asset) {
  if (!asset?.AssetName) return 'دستگاه ثبت نشده';
  const present = (value) => value != null && String(value).trim() !== '';
  const parts = [
    ['ساختمان', asset.Building], ['بلوک', asset.Block], ['طبقه', asset.Floor],
    ['ورودی', asset.Entrance], ['محل', asset.Location],
  ].filter(([, value]) => present(value)).map(([label, value]) => `${label}: ${value}`);
  const number = present(asset.AssetNumber) ? ` — شماره: ${asset.AssetNumber}` : '';
  return `${asset.AssetName}${number}${parts.length ? ` | ${parts.join('، ')}` : ''}`;
}

export function formatWallTime(value) {
  if (!value) return 'ثبت نشده';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 'قالب زمان نامشخص';
  const date = new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
  return date.toLocaleString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// این مسیر فقط خواندن دارد و هر پاسخ باید متعلق به همان شناسهٔ درخواستی باشد.
export async function readTaskSnapshot(taskId, { signal, details = false } = {}) {
  const id = parseTaskId(taskId);
  if (!id) throw new Error('کد کار معتبر نیست.');
  const response = await fetch(`/api/task-inspector?taskId=${id}${details ? '&details=1' : ''}`, {
    method: 'GET', cache: 'no-store', signal,
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'دریافت اطلاعات کار ناموفق بود.');
  const data = result.data;
  if (parseTaskId(data?.task?.TaskID) !== id) throw new Error('شناسهٔ پاسخ با کار درخواستی تطابق ندارد؛ اطلاعات نمایش داده نشد.');
  if (details && (!Array.isArray(data.followups) || data.followups.some((row) => parseTaskId(row.TaskID) !== id)))
    throw new Error('سوابق دریافتی متعلق به کار درخواستی نیست؛ اطلاعات نمایش داده نشد.');
  return data;
}
