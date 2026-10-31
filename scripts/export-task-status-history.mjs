// Read-only export; does not change task status or restore database data.
import { writeFile } from 'node:fs/promises';
const normalize = value => String(value ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
try {
  const text = normalize(process.argv[2]), taskId = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(taskId) || taskId < 1 || taskId > 2147483647) throw Error('Usage: node scripts/export-task-status-history.mjs TASK_ID [BASE_URL]');
  const base = new URL(process.argv[3] || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw Error('Use an HTTP(S) server address without credentials.');
  const rows = []; let beforeId = null; const seen = new Set();
  do {
    const url = new URL('/api/task-status-history', base);
    url.searchParams.set('taskId', String(taskId)); url.searchParams.set('limit', '100');
    if (beforeId) url.searchParams.set('beforeId', beforeId);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok || !result.success) throw Error(result.error || 'History request failed.');
    const data = result.data;
    if (Number(data?.taskId) !== taskId || !Array.isArray(data.rows) || data.rows.some(row => Number(row.TaskID) !== taskId)) throw Error('History owner does not match the requested task.');
    rows.push(...data.rows.map(row => ({ ...row,
      BeforeState: typeof row.BeforeState === 'string' ? JSON.parse(row.BeforeState) : row.BeforeState,
      AfterState: typeof row.AfterState === 'string' ? JSON.parse(row.AfterState) : row.AfterState,
    })));
    const next = data.nextBeforeId;
    if (next != null && (!/^\d+$/.test(String(next)) || seen.has(String(next)))) throw Error('Invalid or repeated history cursor.');
    beforeId = next == null ? null : String(next);
    if (beforeId) seen.add(beforeId);
  } while (beforeId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `task-status-history-${taskId}-${stamp}.json`;
  await writeFile(filename, JSON.stringify({ taskId, exportedAtUTC: new Date().toISOString(), rows }, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.log(`Exported ${rows.length} history record(s) to ${filename}`);
} catch (error) {
  console.error(error.message || 'History export failed.'); process.exitCode = 1;
}
