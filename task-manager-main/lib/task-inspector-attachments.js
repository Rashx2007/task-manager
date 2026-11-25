import { parseTaskId } from './task-inspection';

const absoluteWindowsPath = (value) => /^(?:[A-Za-z]:[\\/]|(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/.test(value);

export function attachmentFolderPath(record, taskId) {
  const id = parseTaskId(taskId);
  if (!id) throw new Error('کد کار معتبر نیست.');
  if (record == null) return '';
  if (parseTaskId(record.TaskID) !== id) throw new Error('مسیر دریافتی متعلق به کار انتخاب‌شده نیست؛ پوشه باز نشد.');
  const folder = String(record.FolderPath || '').trim();
  const file = String(record.FileName || '').trim();
  // FileName can be a full path. Open its parent, never execute the file.
  const target = folder || (absoluteWindowsPath(file) ? file.replace(/[^\\/]+$/, '') : '');
  if (!target) return '';
  if (!absoluteWindowsPath(target) || /[\x00-\x1f]/.test(target)) throw new Error('مسیر پوشهٔ ثبت‌شده معتبر و مطلق نیست؛ پوشه باز نشد.');
  return target;
}

export async function openTaskAttachmentFolder(taskId, { signal, isCurrent = () => true } = {}) {
  const id = parseTaskId(taskId);
  if (!id) throw new Error('کد کار معتبر نیست.');
  const current = () => !signal?.aborted && isCurrent();
  if (!current()) return null;
  const response = await fetch(`/api/folder?taskId=${id}`, { method: 'GET', cache: 'no-store', signal });
  const result = await response.json();
  if (!current()) return null;
  if (!response.ok || !result.success) throw new Error('دریافت مسیر پوشهٔ ضمائم ناموفق بود.');
  const path = attachmentFolderPath(result.data, id);
  if (!path) return { type: 'warn', message: `برای کار ${id} پوشهٔ ضمائم ثبت نشده است.` };
  // Do not use /api/task-folder here: that GET may create directories.
  // Recheck after the read so a different selection cannot open a stale folder.
  if (!current()) return null;
  // A misfiled file path is selected in Explorer, never launched.
  const openedResponse = await fetch('/api/open-path', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, select: true }), signal,
  });
  const opened = await openedResponse.json();
  if (!current()) return null;
  if (!openedResponse.ok || !opened.success) throw new Error(opened.error || 'بازکردن پوشهٔ ضمائم ناموفق بود.');
  return opened.adjusted
    ? { type: 'warn', message: `مسیر دقیق ضمائم کار ${id} یافت نشد؛ نزدیک‌ترین پوشهٔ موجود باز شد:\n${opened.opened || ''}` }
    : { type: 'success', message: `پوشهٔ ضمائم کار ${id} باز شد.` };
}
