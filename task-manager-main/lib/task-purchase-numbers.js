import { parseTaskId } from './task-inspection';

const numberText = value => value == null ? '' : String(value).trim();
const uniqueValues = (rows, key) => [...new Set(rows.map(row => numberText(row[key])).filter(Boolean))];

export function summarizeTaskPurchaseNumbers(taskId, rows) {
  const id = parseTaskId(taskId);
  if (!id || !Array.isArray(rows) || rows.some(row => !row || parseTaskId(row.TaskID) !== id)) {
    throw new Error('شماره‌های دریافتی متعلق به این کار نیستند.');
  }
  return { taskId: id, requestNumbers: uniqueValues(rows, 'RequestNumber'), purchaseNumbers: uniqueValues(rows, 'RegisterNumber') };
}

export async function readTaskPurchaseNumbers(taskId, { signal } = {}) {
  const id = parseTaskId(taskId);
  if (!id) throw new Error('کد کار معتبر نیست.');
  const response = await fetch(`/api/task-purchase-numbers?taskId=${id}`, { method: 'GET', cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error('دریافت شماره‌های درخواست و خرید ناموفق بود.');
  const data = result.data;
  if (parseTaskId(data?.taskId) !== id || ![data?.requestNumbers, data?.purchaseNumbers].every(values => Array.isArray(values) && values.every(value => typeof value === 'string'))) {
    throw new Error('شماره‌های دریافتی متعلق به این کار نیستند.');
  }
  return data;
}
