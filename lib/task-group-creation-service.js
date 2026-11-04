import 'server-only';
import { createHash } from 'node:crypto';
import { runTransaction } from './db';
import { taskGroupId, taskGroupIds, taskGroupVersion, TaskGroupError, assertTaskGroupSchema, lockTaskSchedule } from './task-groups';
import { planGroupCreation } from './task-group-creation-plan.mjs';

// Internal only. DO NOT expose a write route or call on real data until group-aware
// editing/follows, schedule collision checks, and management UI are completed.
const stop = (code, message, status = 409) => { throw new TaskGroupError(code, message, status); };
const hash = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((n, i) => n === b[i]);
function selection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) stop('INVALID_BODY', 'درخواست معتبر نیست.', 400);
  if (!Array.isArray(body.selectedTaskIds) || body.selectedTaskIds.length < 2 || body.selectedTaskIds.length > 250) stop('INVALID_SELECTION', 'بین ۲ تا ۲۵۰ کار متفاوت انتخاب کنید.', 400);
  const ids = taskGroupIds(body.selectedTaskIds);
  if (ids.length !== body.selectedTaskIds.length || ids.length < 2) stop('INVALID_SELECTION', 'کارهای انتخاب‌شده باید متفاوت باشند.', 400);
  const referenceTaskId = taskGroupId(body.referenceTaskId);
  if (!ids.includes(referenceTaskId)) stop('INVALID_REFERENCE', 'کار مرجع باید در انتخاب باشد.', 400);
  return { selectedTaskIds: ids, referenceTaskId };
}
function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) stop('INVALID_OPERATION_ID', 'شناسهٔ درخواست معتبر نیست.', 400);
  return value.toLowerCase();
}
function creation(body) {
  const selected = selection(body), requestId = uuid(body.requestId);
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) stop('INVALID_TITLE', 'عنوان گروه باید بین ۱ تا ۲۰۰ نویسه باشد.', 400);
  if (typeof body.expectedPreviewHash !== 'string' || !/^[0-9a-f]{64}$/i.test(body.expectedPreviewHash)) stop('INVALID_PREVIEW', 'پیش‌نمایش معتبر نیست؛ دوباره دریافت کنید.', 400);
  const normalized = { operationKind: 'GROUP_CREATE', ...selected, title: body.title.trim(), expectedPreviewHash: body.expectedPreviewHash.toLowerCase() };
  return { ...normalized, requestId, payloadHash: hash(normalized) };
}
const bigintText = value => {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n) stop('GROUP_SNAPSHOT_INVALID', 'شناسهٔ سابقه در تصویر داده معتبر نیست.');
  return text;
};
async function snapshot(tx, input) {
  const selected = { selectedTaskIds: input.selectedTaskIds, referenceTaskId: input.referenceTaskId };
  const rows = [], marker = [];
  // Consistent task order after global schedule lock; every query uses tx.
  for (const taskId of selected.selectedTaskIds) {
    const tasks = await tx(`/* group-create:task */ SELECT TaskID, Complited, Priorities, FixedDueTime, Durationtime, DueDateTime, EndDateTime
      FROM dbo.Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ?`, [taskId]);
    if (tasks.length !== 1 || Number(tasks[0].TaskID) !== taskId) stop('TASK_NOT_FOUND', 'یکی از کارهای انتخاب‌شده دیگر وجود ندارد.', 404);
    const timeRows = await tx(`/* group-create:time */ SELECT CONVERT(varchar(20), TimeDateID) AS RowKey, TaskID, Priorities, FixedDueTime, Durationtime, DueDateTime, EndDateTime
      FROM dbo.TimeDate_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ? ORDER BY TimeDateID`, [taskId]);
    const membership = await tx(`/* group-create:membership */ SELECT CONVERT(varchar(20), MemberID) AS MemberID, GroupID, TaskID, LeftAt,
      CONVERT(varchar(16), Version, 2) AS MemberVersion
      FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ? ORDER BY MemberID`, [taskId]);
    const timeKeys = timeRows.map(row => bigintText(row.RowKey));
    if (new Set(timeKeys).size !== timeKeys.length) stop('GROUP_SNAPSHOT_INVALID', 'ردیف‌های زمان‌بندی تکراری‌اند.');
    const membershipMarks = membership.map(row => {
      const memberId = bigintText(row.MemberID), groupId = taskGroupId(row.GroupID), version = taskGroupVersion(row.MemberVersion);
      if (Number(row.TaskID) !== taskId || !Object.hasOwn(row, 'LeftAt')) stop('GROUP_SNAPSHOT_INVALID', 'مالک عضویت معتبر نیست.');
      return [memberId, groupId, version, row.LeftAt == null];
    });
    if (new Set(membershipMarks.map(row => row[0])).size !== membershipMarks.length) stop('GROUP_SNAPSHOT_INVALID', 'عضویت‌ها تکراری‌اند.');
    rows.push({ task: tasks[0], timeRows, currentMemberships: membership.filter(row => row.LeftAt == null) });
    marker.push({ taskId, timeKeys, membership: membershipMarks });
  }
  let plan;
  try { plan = planGroupCreation({ ...selected, snapshot: rows }); }
  catch { stop('GROUP_SNAPSHOT_INVALID', 'تصویر کارهای انتخاب‌شده معتبر نیست؛ دوباره دریافت کنید.'); }
  // Fingerprint includes canonical semantic values, schedule-row identity and all
  // membership versions (including departed memberships), not only current state.
  const previewHash = plan.ready ? hash({ selected, marker, proposal: plan.proposal }) : null;
  return { ...plan, previewHash };
}
function validateReplay(row, p) {
  if (String(row.RequestID).toLowerCase() !== p.requestId || row.OperationKind !== p.operationKind || row.PayloadHash !== p.payloadHash) stop('REQUEST_ID_REUSED', 'شناسهٔ درخواست قبلاً برای محتوای دیگری استفاده شده است.');
  let result;
  try {
    result = JSON.parse(row.ResultJSON);
    if (!result || result.requestId !== p.requestId || result.operationKind !== p.operationKind || result.title !== p.title || result.referenceTaskId !== p.referenceTaskId || !same(result.selectedTaskIds, p.selectedTaskIds) || taskGroupId(result.groupId) !== result.groupId || result.groupId !== Number(row.GroupID) || taskGroupVersion(result.groupVersion) !== result.groupVersion || result.replayed !== false) throw Error('invalid receipt');
  } catch { stop('OPERATION_RESULT_INVALID', 'رسید عملیات معتبر نیست؛ پیش از تکرار بررسی شود.'); }
  return { ...result, replayed: true };
}
export async function previewGroupCreation(body) {
  const selected = selection(body);
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    await assertTaskGroupSchema(tx);
    return snapshot(tx, selected);
  });
}
export async function createTaskGroup(body) {
  const p = creation(body);
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    await assertTaskGroupSchema(tx);
    const previous = await tx(`/* group-create:operation */ SELECT RequestID, GroupID, OperationKind, PayloadHash, ResultJSON
      FROM dbo.TaskGroupOperation WITH (UPDLOCK, HOLDLOCK) WHERE RequestID = ?`, [p.requestId]);
    if (previous.length > 1) stop('OPERATION_RESULT_INVALID', 'رسیدهای عملیات تکراری‌اند.');
    if (previous.length) return validateReplay(previous[0], p);
    const plan = await snapshot(tx, p);
    if (!plan.ready) stop('GROUP_CREATION_BLOCKED', 'شرایط کارها تغییر کرده یا برای گروه‌بندی مناسب نیست؛ پیش‌نمایش را دوباره دریافت کنید.');
    if (plan.previewHash !== p.expectedPreviewHash) stop('GROUP_PREVIEW_CHANGED', 'اطلاعات کارها پس از پیش‌نمایش تغییر کرده است؛ دوباره بررسی کنید.');
    // A future writer must explicitly preview and confirm alignment and validate
    // global scheduling conflicts. This stage never changes task schedule fields.
    if (plan.proposal.requiresScheduleConfirmation) stop('SCHEDULE_ALIGNMENT_NOT_SUPPORTED', 'همسان‌سازی زمان‌بندی در این مرحله فعال نیست.');
    const groups = await tx(`/* group-create:new-group */ INSERT INTO dbo.TaskGroup (Title)
      OUTPUT INSERTED.GroupID, CONVERT(varchar(16), INSERTED.Version, 2) AS Version VALUES (?)`, [p.title]);
    if (groups.length !== 1) stop('GROUP_WRITE_FAILED', 'ایجاد گروه قابل تأیید نیست.');
    const groupId = taskGroupId(groups[0].GroupID), groupVersion = taskGroupVersion(groups[0].Version);
    for (const taskId of p.selectedTaskIds) {
      const members = await tx(`/* group-create:new-member */ INSERT INTO dbo.TaskGroupMember (GroupID, TaskID, SyncEnabled)
        OUTPUT INSERTED.GroupID, INSERTED.TaskID VALUES (?, ?, ?)`, [groupId, taskId, 1]);
      if (members.length !== 1 || Number(members[0].GroupID) !== groupId || Number(members[0].TaskID) !== taskId) stop('MEMBER_WRITE_FAILED', 'ثبت عضویت قابل تأیید نیست.');
    }
    const result = { requestId: p.requestId, operationKind: p.operationKind, groupId, groupVersion, title: p.title,
      referenceTaskId: p.referenceTaskId, selectedTaskIds: p.selectedTaskIds, replayed: false };
    const receipt = await tx(`/* group-create:remember */ INSERT INTO dbo.TaskGroupOperation (RequestID, GroupID, OperationKind, PayloadHash, ResultJSON)
      OUTPUT INSERTED.RequestID, INSERTED.GroupID VALUES (?, ?, ?, ?, ?)`, [p.requestId, groupId, p.operationKind, p.payloadHash, JSON.stringify(result)]);
    if (receipt.length !== 1 || uuid(String(receipt[0].RequestID)) !== p.requestId || Number(receipt[0].GroupID) !== groupId) stop('OPERATION_WRITE_FAILED', 'ثبت رسید عملیات انجام نشد؛ تغییرات ذخیره نشدند.');
    return result;
  });
}
