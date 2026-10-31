import 'server-only';
import { query, runTransaction } from './db';
import { normalizeDigits } from './assetRules';
import { wallToDate, formatSqlDateTime } from './schedule-logic';
import { durationToStr } from './scheduler-logic';
import { lockTaskSchedule, assertTaskGroupSchema, TaskGroupError } from './task-groups';

export class TaskFollowError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'TaskFollowError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new TaskFollowError(code, message, status); };
export function followTaskId(value) {
  const text = ['number', 'string'].includes(typeof value) ? normalizeDigits(value).trim() : '';
  const id = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) fail('INVALID_ID', 'شناسهٔ کار یا پیگیری معتبر نیست.');
  return id;
}
function wall(value) {
  if (typeof value !== 'string') fail('INVALID_TIME', 'تاریخ و ساعت پیگیری معتبر نیست.');
  const text = normalizeDigits(value).trim();
  // Legacy FollowModal sends a Z-tagged wall string, NOT a UTC instant.
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.000)?Z?$/);
  if (!match || +match[1] < 1753) fail('INVALID_TIME', 'تاریخ و ساعت پیگیری معتبر نیست.');
  const date = wallToDate(text), parts = match.slice(1).map(Number);
  const actual = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  if (!Number.isFinite(date.getTime()) || parts.some((v, i) => v !== actual[i])) fail('INVALID_TIME', 'تاریخ و ساعت پیگیری معتبر نیست.');
  return date;
}
function payload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_BODY', 'بدنهٔ درخواست معتبر نیست.');
  if (['groupId', 'expectedGroupVersion', 'recipientTaskIds', 'batchId'].some(key => Object.hasOwn(body, key))) fail('GROUP_FOLLOW_NOT_READY', 'ثبت گروهی پیگیری هنوز فعال نیست.', 409);
  const taskId = followTaskId(body.taskId);
  if (typeof body.description !== 'string' || !body.description.trim()) fail('EMPTY_DESCRIPTION', 'متن پیگیری خالی است.');
  if (body.updateDescription != null && typeof body.updateDescription !== 'boolean') fail('INVALID_COPY_FLAG', 'گزینهٔ کپی متن معتبر نیست.');
  const due = wall(body.dueDateTime), end = wall(body.endDateTime);
  if (end < due) fail('INVALID_RANGE', 'زمان پایان نباید قبل از شروع باشد.');
  return { taskId, description: body.description, due: formatSqlDateTime(due), end: formatSqlDateTime(end), duration: durationToStr(end - due), copy: body.updateDescription === true };
}
async function owner(tx, taskId) {
  const rows = await tx(`/* follow:task */ SELECT TaskID FROM dbo.Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ?`, [taskId]);
  if (rows.length !== 1 || Number(rows[0].TaskID) !== taskId) fail('TASK_NOT_FOUND', 'کار موردنظر پیدا نشد.', 404);
}
async function groupGuard(tx, taskId, followId = null) {
  const result = await tx(`/* follow:group-objects */ SELECT COUNT(*) AS ObjectCount,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS CanViewDefinition FROM sys.tables
    WHERE schema_id = SCHEMA_ID(N'dbo') AND name IN (N'TaskGroupMigration', N'TaskGroup', N'TaskGroupMember',
      N'TaskGroupFollowBatch', N'TaskGroupFollowLink', N'TaskGroupOperation')`, []);
  const count = Number(result[0]?.ObjectCount);
  if (Number(result[0]?.CanViewDefinition) !== 1) fail('GROUP_METADATA_UNAVAILABLE', 'امکان تأیید ساختار گروه‌ها با دسترسی فعلی وجود ندارد.', 503);
  if (count === 0) return; // A verified pre-group database may still use independent tasks.
  if (count !== 6) fail('TASK_GROUPS_NOT_READY', 'ساختار گروه‌ها ناقص است؛ پیگیری ذخیره نشد.', 503);
  await assertTaskGroupSchema(tx);
  const members = await tx(`/* follow:member */ SELECT GroupID FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK)
    WHERE TaskID = ? AND LeftAt IS NULL`, [taskId]);
  if (members.length) fail('GROUP_FOLLOW_NOT_READY', 'پیگیری عضو گروه باید از مسیر گروه‌آگاه انجام شود؛ این مسیر هنوز فعال نیست.', 409);
  if (followId != null) {
    const links = await tx(`/* follow:link */ SELECT BatchID FROM dbo.TaskGroupFollowLink WITH (UPDLOCK, HOLDLOCK)
      WHERE FollowID = ?`, [followId]);
    if (links.length) fail('GROUP_FOLLOW_LINKED', 'این پیگیری سابقهٔ گروهی دارد؛ ویرایش یا حذف مستقل آن مجاز نیست.', 409);
  }
}
async function followOwner(tx, followId, taskId) {
  const rows = await tx(`/* follow:owner */ SELECT FollowID, TaskID FROM dbo.Follow_tbl WITH (UPDLOCK, HOLDLOCK)
    WHERE FollowID = ? AND TaskID = ?`, [followId, taskId]);
  if (rows.length !== 1 || Number(rows[0].TaskID) !== taskId || Number(rows[0].FollowID) !== followId) fail('FOLLOW_OWNER_MISMATCH', 'پیگیری متعلق به این کار نیست یا دیگر وجود ندارد.', 409);
}
function returnedId(rows, taskId, expectedId = null) {
  if (rows.length !== 1 || Number(rows[0].TaskID) !== taskId) fail('FOLLOW_WRITE_FAILED', 'نتیجهٔ ذخیرهٔ پیگیری قابل تأیید نیست.', 409);
  const id = followTaskId(rows[0].FollowID);
  if (expectedId != null && id !== expectedId) fail('FOLLOW_WRITE_FAILED', 'شناسهٔ پیگیری ذخیره‌شده تطابق ندارد.', 409);
  return id;
}
export async function readTaskFollows(value) {
  const taskId = followTaskId(value);
  const rows = await query(`SELECT * FROM dbo.Follow_tbl WHERE TaskID = ? ORDER BY DueDateTime DESC, FollowID DESC`, [taskId]);
  if (rows.some(row => Number(row.TaskID) !== taskId)) fail('FOLLOW_OWNER_MISMATCH', 'پاسخ پیگیری با این کار تطابق ندارد.', 409);
  return rows;
}
export async function saveTaskFollow(body, editing = false) {
  const p = payload(body), followId = editing ? followTaskId(body.followId) : null;
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    await owner(tx, p.taskId);
    await groupGuard(tx, p.taskId, followId);
    if (editing) await followOwner(tx, followId, p.taskId);
    const rows = editing
      ? await tx(`/* follow:update */ UPDATE dbo.Follow_tbl SET Description = ?, DueDateTime = ?, EndDateTime = ?, Duration = ?
          OUTPUT INSERTED.FollowID, INSERTED.TaskID WHERE FollowID = ? AND TaskID = ?`, [p.description, p.due, p.end, p.duration, followId, p.taskId])
      : await tx(`/* follow:insert */ INSERT INTO dbo.Follow_tbl (TaskID, Description, DueDateTime, EndDateTime, Duration)
          OUTPUT INSERTED.FollowID, INSERTED.TaskID VALUES (?, ?, ?, ?, ?)`, [p.taskId, p.description, p.due, p.end, p.duration]);
    const id = returnedId(rows, p.taskId, followId);
    if (p.copy) await tx(`/* follow:description */ UPDATE dbo.Tsk_tbl SET Descriptions = ? WHERE TaskID = ?`, [p.description, p.taskId]);
    // A follow-up is NOT completion: never write schedule/status/Finish_DateTime.
    return { taskId: p.taskId, followId: id };
  });
}
export async function deleteTaskFollow(id, task) {
  const followId = followTaskId(id), taskId = followTaskId(task);
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    await owner(tx, taskId);
    await groupGuard(tx, taskId, followId);
    await followOwner(tx, followId, taskId);
    const rows = await tx(`/* follow:delete */ DELETE FROM dbo.Follow_tbl
      OUTPUT DELETED.FollowID, DELETED.TaskID WHERE FollowID = ? AND TaskID = ?`, [followId, taskId]);
    returnedId(rows, taskId, followId);
    return { taskId, followId };
  });
}
export function followFailure(error) {
  if (error instanceof TaskFollowError || error instanceof TaskGroupError) return { status: error.status, body: { success: false, error: error.message, code: error.code } };
  if (Number(error?.number) === 547 || /\b547\b|REFERENCE constraint|FOREIGN KEY constraint/i.test(String(error?.message || ''))) return { status: 409, body: { success: false, error: 'پیگیری وابستگی ثبت‌شده دارد؛ عملیات انجام نشد.', code: 'FOLLOW_DEPENDENCY' } };
  return { status: 500, body: { success: false, error: 'عملیات پیگیری ناموفق بود؛ فهرست را تازه‌سازی و بررسی کنید.' } };
}
