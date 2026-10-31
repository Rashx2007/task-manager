import 'server-only';
import { randomUUID } from 'node:crypto';
import { query, runTransaction } from './db';
import { normalizeDigits } from './assetRules';
import { lockTaskSchedule } from './task-groups';
import { formatSqlDateTime, nowWall } from './schedule-logic';

export class TaskStatusError extends Error {
  constructor(code, message, status = 409) { super(message); this.name = 'TaskStatusError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new TaskStatusError(code, message, status); };
export function statusTaskId(value) {
  const text = typeof value === 'number' || typeof value === 'string' ? normalizeDigits(value).trim() : '';
  const id = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) fail('INVALID_ID', 'کد کار معتبر نیست.', 400);
  return id;
}
const statusValue = value => {
  if (![0, 1, '0', '1'].includes(value)) fail('INVALID_STATUS', 'وضعیت کار معتبر نیست.', 400);
  return Number(value);
};
// SQL Server BIT may be returned as a boolean by the driver; API values stay strict.
const existingStatus = value => value == null ? 0 : typeof value === 'boolean' ? Number(value) : statusValue(value);

export async function assertStatusHistory(execute) {
  const rows = await execute(`/* status:ready */ SELECT CASE WHEN
    OBJECT_ID(N'dbo.TaskStatusHistory', N'U') IS NOT NULL
    AND EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 1
      AND major_id = OBJECT_ID(N'dbo.TaskStatusHistory') AND minor_id = 0
      AND name = N'TaskStatusHistorySchemaVersion' AND CONVERT(nvarchar(100), value) = ?)
    AND (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TaskStatusHistory')) = 14
    AND (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.TaskStatusHistory')
      AND is_disabled = 0 AND is_not_trusted = 0 AND name IN (N'CK_TaskStatusHistory_TaskID', N'CK_TaskStatusHistory_Action',
      N'CK_TaskStatusHistory_BeforeJSON', N'CK_TaskStatusHistory_AfterJSON', N'CK_TaskStatusHistory_Transition')) = 5
    AND (SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TaskStatusHistory')
      AND is_unique = 1 AND is_disabled = 0 AND has_filter = 0 AND name IN
      (N'PK_TaskStatusHistory', N'UQ_TaskStatusHistory_Operation', N'UQ_TaskStatusHistory_HistoryTask')) = 3
    AND EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID(N'dbo.TaskStatusHistory')
      AND referenced_object_id = OBJECT_ID(N'dbo.TaskStatusHistory') AND name = N'FK_TaskStatusHistory_Restores'
      AND is_disabled = 0 AND is_not_trusted = 0)
    THEN 1 ELSE 0 END AS Ready`, ['20261030_001_status_history']);
  if (Number(rows[0]?.Ready) !== 1) fail('STATUS_HISTORY_NOT_READY', 'زیرساخت تاریخچه آماده نیست؛ تغییر وضعیت انجام نشد.', 503);
}

async function snapshot(tx, taskId) {
  const tasks = await tx(`/* status:task */ SELECT TaskID, Complited, Priorities, FixedDueTime, Durationtime,
    DueDateTime, EndDateTime, Due_Date, Due_Time, End_Date, End_Time
    FROM dbo.Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ?`, [taskId]);
  if (tasks.length !== 1) fail('TASK_NOT_FOUND', 'کار موردنظر پیدا نشد.', 404);
  const times = await tx(`/* status:times */ SELECT TimeDateID, TaskID, Priorities, FixedDueTime, Durationtime,
    DueDateTime, EndDateTime, Due_Date, Due_Time, End_Date, End_Time, Finish_DateTime
    FROM dbo.TimeDate_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ? ORDER BY TimeDateID`, [taskId]);
  if (statusTaskId(tasks[0].TaskID) !== taskId || times.some(row => statusTaskId(row.TaskID) !== taskId)) fail('SNAPSHOT_OWNER_MISMATCH', 'تصویر زمان‌بندی با این کار تطابق ندارد.');
  const taskKeys = ['TaskID', 'Complited', 'Priorities', 'FixedDueTime', 'Durationtime', 'DueDateTime', 'EndDateTime', 'Due_Date', 'Due_Time', 'End_Date', 'End_Time'];
  const timeKeys = ['TimeDateID', 'TaskID', 'Priorities', 'FixedDueTime', 'Durationtime', 'DueDateTime', 'EndDateTime', 'Due_Date', 'Due_Time', 'End_Date', 'End_Time', 'Finish_DateTime'];
  const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));
  return { schemaVersion: 1, dateConvention: 'SQL UTC-tagged wall components; not timezone conversion', task: pick(tasks[0], taskKeys), timeDates: times.map(row => pick(row, timeKeys)) };
}

async function guardGroup(tx, taskId) {
  const objects = await tx(`/* status:group-object */ SELECT OBJECT_ID(N'dbo.TaskGroupMember', N'U') AS ObjectID`, []);
  if (objects[0]?.ObjectID == null) return; // A restored pre-group database is supported.
  const rows = await tx(`/* status:group-member */ SELECT GroupID FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK)
    WHERE TaskID = ? AND LeftAt IS NULL`, [taskId]);
  if (rows.length) fail('GROUP_STATUS_NOT_READY', 'ویرایش و تغییر وضعیت عضو گروه تا تکمیل مسیر گروهی مجاز نیست.');
}

async function changeStatus(tx, taskId, target, wall) {
  await tx(`/* status:set */ UPDATE dbo.Tsk_tbl SET Complited = ? WHERE TaskID = ?`, [target, taskId]);
  // Planned Due/End fields must NEVER be written by completion or reopening.
  await tx(`/* status:finish */ UPDATE dbo.TimeDate_tbl SET Finish_DateTime = ? WHERE TaskID = ?`, [target === 1 ? wall : null, taskId]);
}

async function appendHistory(tx, taskId, before, after, source, wall) {
  const operationId = randomUUID();
  const oldStatus = existingStatus(before.task.Complited), newStatus = existingStatus(after.task.Complited);
  const rows = await tx(`/* status:append */ INSERT INTO dbo.TaskStatusHistory
    (OperationID, TaskID, Action, BeforeStatus, AfterStatus, BeforeState, AfterState, OccurredAtWall, Source, AppActor)
    OUTPUT CONVERT(varchar(20), INSERTED.HistoryID) AS HistoryID
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [operationId, taskId, newStatus === 1 ? 'COMPLETE' : 'REOPEN',
    oldStatus, newStatus, JSON.stringify(before), JSON.stringify(after), wall, source, null]);
  if (rows.length !== 1 || !/^\d+$/.test(String(rows[0].HistoryID))) fail('HISTORY_INSERT_FAILED', 'شناسهٔ تاریخچه دریافت نشد؛ عملیات ذخیره نشد.');
  return { historyId: String(rows[0].HistoryID), operationId };
}

export async function completeTask(taskId) {
  const id = statusTaskId(taskId);
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    const before = await snapshot(tx, id);
    if (existingStatus(before.task.Complited) === 1) return { taskId: id, Complited: 1, alreadyCompleted: true, statusChanged: false };
    await guardGroup(tx, id);
    await assertStatusHistory(tx);
    const wall = formatSqlDateTime(nowWall());
    await changeStatus(tx, id, 1, wall);
    const after = await snapshot(tx, id);
    const audit = await appendHistory(tx, id, before, after, '/api/complete', wall);
    return { taskId: id, Complited: 1, alreadyCompleted: false, statusChanged: true, ...audit };
  });
}

export async function saveTaskEdit(taskId, body) {
  const id = statusTaskId(taskId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_BODY', 'بدنهٔ درخواست معتبر نیست.', 400);
  if (body.statusIntent != null && !['preserve', 'change'].includes(body.statusIntent)) fail('INVALID_INTENT', 'قصد تغییر وضعیت معتبر نیست.', 400);
  const supplied = Object.hasOwn(body, 'Complited');
  const desired = supplied ? statusValue(body.Complited) : null;
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    const before = await snapshot(tx, id), current = existingStatus(before.task.Complited);
    await guardGroup(tx, id);
    let target = current;
    if (body.statusIntent === 'change') {
      if (!supplied || body.expectedStatus == null) fail('STATUS_VERSION_REQUIRED', 'فرم را تازه‌سازی و تغییر وضعیت را صریحاً انتخاب کنید.', 428);
      if (statusValue(body.expectedStatus) !== current) fail('STATUS_CHANGED', 'وضعیت کار پس از بازشدن فرم تغییر کرده است؛ فرم را تازه‌سازی کنید.');
      target = desired;
    } else if (body.statusIntent !== 'preserve' && supplied && desired !== current) {
      fail('STATUS_INTENT_REQUIRED', 'تغییر وضعیت از فرم قدیمی مجاز نیست؛ فرم را تازه‌سازی کنید.', 428);
    }
    const changed = target !== current;
    if (changed) await assertStatusHistory(tx);
    // Normal editing preserves the CURRENT database status, not a stale form value.
    await tx(`/* status:edit */ UPDATE Tsk_tbl SET TaskTtl=?, Descriptions=?, Priorities=?, tskType=?, IsConsiderableAction=?, Complited=?, fixedDueTime=? WHERE TaskID=?`, [
      body.TaskTtl, body.Descriptions || null, body.Priorities || '3.متوسط', body.tskType || null,
      body.IsConsiderableAction || null, target, Number(body.FixedDueTime) || 0, id,
    ]);
    if (body.AssetID) {
      const assetId = statusTaskId(body.AssetID);
      const rows = await tx(`SELECT AssetTaskID FROM Asset_Task_tbl WHERE TaskID=?`, [id]);
      if (rows.length) await tx(`UPDATE Asset_Task_tbl SET AssetID=? WHERE TaskID=?`, [assetId, id]);
      else await tx(`INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?,?)`, [id, assetId]);
    }
    let audit = {};
    if (changed) {
      const wall = formatSqlDateTime(nowWall());
      await changeStatus(tx, id, target, wall);
      const after = await snapshot(tx, id);
      audit = await appendHistory(tx, id, before, after, '/api/tasks/[id]', wall);
    }
    return { taskId: id, Complited: target, statusChanged: changed, ...audit };
  });
}

export async function readTaskStatusHistory({ taskId, beforeId = null, limit = 20 }) {
  const id = statusTaskId(taskId), size = Number(limit);
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) fail('INVALID_LIMIT', 'حد صفحه معتبر نیست.', 400);
  const cursor = beforeId == null || beforeId === '' ? null : String(beforeId);
  if (cursor != null && (cursor.length > 19 || !/^\d+$/.test(cursor) || BigInt(cursor) < 1n || BigInt(cursor) > 9223372036854775807n)) fail('INVALID_CURSOR', 'شناسهٔ صفحه معتبر نیست.', 400);
  await assertStatusHistory(query);
  const rows = await query(`/* status:history */ DECLARE @BeforeID bigint = CONVERT(bigint, ?);
    SELECT TOP (?) CONVERT(varchar(20), HistoryID) AS HistoryID, OperationID, TaskID, Action, BeforeStatus, AfterStatus,
      BeforeState, AfterState, CreatedAtUTC, OccurredAtWall, Source, DatabaseLogin, AppActor,
      CONVERT(varchar(20), RestoresHistoryID) AS RestoresHistoryID
    FROM dbo.TaskStatusHistory WHERE TaskID = ? AND (@BeforeID IS NULL OR HistoryID < @BeforeID)
    ORDER BY HistoryID DESC`, [cursor, size, id]);
  if (rows.some(row => statusTaskId(row.TaskID) !== id)) fail('HISTORY_OWNER_MISMATCH', 'تاریخچه با این کار تطابق ندارد.');
  return { taskId: id, rows, nextBeforeId: rows.length === size ? String(rows[rows.length - 1].HistoryID) : null };
}

export function statusFailure(error) {
  if (error instanceof TaskStatusError) return { status: error.status, body: { success: false, error: error.message, code: error.code } };
  if (error?.code === 'GROUP_BUSY') return { status: 409, body: { success: false, error: 'زمان‌بندی در حال تغییر است؛ دوباره تلاش کنید.', code: 'GROUP_BUSY' } };
  return { status: 500, body: { success: false, error: 'عملیات ناموفق بود؛ وضعیت کار را تازه‌سازی و بررسی کنید.' } };
}
