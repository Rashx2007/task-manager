import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { runTransaction } from './db';
import {
  taskGroupId, taskGroupIds, taskGroupVersion, TaskGroupError, MAX_TASK_GROUP_MEMBERS,
  assertTaskGroupSchema, lockTaskSchedule, lockGroup, resolveGroupSyncTargets,
} from './task-groups';
import { parseFollowFields, followFailure } from './task-follow-service';

const stop = (code, message, status = 409) => { throw new TaskGroupError(code, message, status); };
export function groupFollowGuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) stop('INVALID_OPERATION_ID', 'شناسهٔ عملیات یا سابقهٔ گروهی معتبر نیست.', 400);
  return value.toLowerCase();
}
function prepare(body, editing) {
  const fields = parseFollowFields(body);
  const groupId = taskGroupId(body.groupId), taskId = taskGroupId(body.taskId);
  const version = taskGroupVersion(body.expectedGroupVersion);
  const requestId = groupFollowGuid(body.requestId);
  const recipientTaskIds = taskGroupIds(body.recipientTaskIds);
  if (!editing && (Object.hasOwn(body, 'batchId') || Object.hasOwn(body, 'followId'))) stop('INVALID_CREATE_SOURCE', 'ثبت تازه نباید شناسهٔ سابقهٔ قبلی داشته باشد.', 400);
  const batchId = editing ? groupFollowGuid(body.batchId) : null;
  const followId = editing ? taskGroupId(body.followId) : null;
  const operationKind = editing ? 'FOLLOW_UPDATE' : 'FOLLOW_CREATE';
  // Canonical keys/order, normalized wall strings, sorted/de-duplicated recipients.
  const normalized = { operationKind, groupId, taskId, version, batchId, followId, recipientTaskIds, ...fields };
  const payloadHash = createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
  return { ...normalized, requestId, payloadHash };
}
function writeResult(rows, taskId, expectedId = null) {
  if (rows.length !== 1 || Number(rows[0].TaskID) !== taskId) stop('GROUP_FOLLOW_WRITE_FAILED', 'نتیجهٔ ذخیرهٔ پیگیری با کار مقصد تطابق ندارد.');
  const followId = taskGroupId(rows[0].FollowID);
  if (expectedId != null && followId !== expectedId) stop('GROUP_FOLLOW_WRITE_FAILED', 'شناسهٔ پیگیری ذخیره‌شده تطابق ندارد.');
  return followId;
}
function sameIds(left, right) { return Array.isArray(left) && left.length === right.length && left.every((id, i) => id === right[i]); }
function replay(row, p) {
  if (String(row.RequestID).toLowerCase() !== p.requestId) stop('OPERATION_RESULT_INVALID', 'شناسهٔ نتیجهٔ ثبت‌شده با درخواست تطابق ندارد.');
  if (Number(row.GroupID) !== p.groupId || row.OperationKind !== p.operationKind || row.PayloadHash !== p.payloadHash) stop('REQUEST_ID_REUSED', 'شناسهٔ این درخواست قبلاً برای محتوای دیگری استفاده شده است.');
  let result;
  try {
    result = JSON.parse(row.ResultJSON);
    if (!result || result.requestId !== p.requestId || result.groupId !== p.groupId || result.taskId !== p.taskId
        || result.operationKind !== p.operationKind || !sameIds(result.recipientTaskIds, p.recipientTaskIds)
        || !Array.isArray(result.copies) || result.copies.length !== p.recipientTaskIds.length
        || groupFollowGuid(result.batchId) !== result.batchId || taskGroupVersion(result.groupVersion) !== result.groupVersion
        || (p.batchId && result.batchId !== p.batchId)) throw Error('bad result');
    const ids = new Set();
    for (let i = 0; i < result.copies.length; i++) {
      const copy = result.copies[i];
      if (copy.taskId !== p.recipientTaskIds[i] || taskGroupId(copy.followId) !== copy.followId || ids.has(copy.followId)) throw Error('bad owner');
      ids.add(copy.followId);
    }
  } catch { stop('OPERATION_RESULT_INVALID', 'نتیجهٔ ثبت‌شدهٔ عملیات معتبر نیست؛ پیش از تکرار بررسی شود.'); }
  // The stored version is the version AFTER that operation, not necessarily current now.
  return { ...result, replayed: true };
}
async function currentGroup(tx, p) {
  const rows = await tx(`/* group-follow:group */ SELECT GroupID, IsActive, CONVERT(varchar(16), Version, 2) AS Version
    FROM dbo.TaskGroup WITH (UPDLOCK, HOLDLOCK) WHERE GroupID = ?`, [p.groupId]);
  if (rows.length !== 1 || Number(rows[0].GroupID) !== p.groupId || Number(rows[0].IsActive) !== 1) stop('GROUP_INACTIVE', 'گروه فعال نیست یا وجود ندارد.');
  if (String(rows[0].Version).toUpperCase() !== p.version) stop('GROUP_CHANGED', 'گروه پس از بازشدن پنجره تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.');
  const members = await tx(`/* group-follow:members */ SELECT MemberID, GroupID, TaskID, SyncEnabled, LeftAt
    FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK) WHERE GroupID = ? AND LeftAt IS NULL ORDER BY TaskID`, [p.groupId]);
  if (!members.length || members.length > MAX_TASK_GROUP_MEMBERS) stop('GROUP_STATE_INVALID', 'تعداد اعضای جاری گروه معتبر نیست.');
  const seen = new Set();
  for (const member of members) {
    const id = taskGroupId(member.TaskID);
    if (Number(member.GroupID) !== p.groupId || member.LeftAt != null || ![0, 1].includes(Number(member.SyncEnabled)) || member.SyncEnabled == null || seen.has(id)) stop('GROUP_STATE_INVALID', 'عضویت‌های گروه ناسازگارند.');
    seen.add(id);
  }
  if (!seen.has(p.taskId)) stop('ORIGIN_NOT_MEMBER', 'کار این پنجره دیگر عضو این گروه نیست.');
  resolveGroupSyncTargets(members, p.recipientTaskIds);
  // The editor's task MAY be unchecked. No write to it is silently inferred.
  const lockIds = [...new Set([p.taskId, ...p.recipientTaskIds])].sort((a, b) => a - b);
  for (const id of lockIds) {
    const tasks = await tx(`/* group-follow:task */ SELECT TaskID FROM dbo.Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ?`, [id]);
    if (tasks.length !== 1 || Number(tasks[0].TaskID) !== id) stop('TASK_NOT_FOUND', 'یکی از کارهای عملیات دیگر وجود ندارد.', 404);
  }
  return members;
}
async function existingBatch(tx, p) {
  const batches = await tx(`/* group-follow:batch */ SELECT BatchID, GroupID, OriginTaskID
    FROM dbo.TaskGroupFollowBatch WITH (UPDLOCK, HOLDLOCK) WHERE BatchID = ?`, [p.batchId]);
  if (batches.length !== 1 || groupFollowGuid(String(batches[0].BatchID)) !== p.batchId || Number(batches[0].GroupID) !== p.groupId) stop('BATCH_GROUP_MISMATCH', 'سابقهٔ گروهی متعلق به این گروه نیست یا وجود ندارد.');
  const links = await tx(`/* group-follow:links */ SELECT link.BatchID, link.TaskID, link.FollowID,
    follow.TaskID AS OwnerTaskID, follow.FollowID AS OwnerFollowID
    FROM dbo.TaskGroupFollowLink link WITH (UPDLOCK, HOLDLOCK)
    LEFT JOIN dbo.Follow_tbl follow WITH (UPDLOCK, HOLDLOCK) ON follow.FollowID = link.FollowID
    WHERE link.BatchID = ? ORDER BY link.TaskID`, [p.batchId]);
  const byTask = new Map(), followIds = new Set();
  for (const link of links) {
    const id = taskGroupId(link.TaskID), fid = taskGroupId(link.FollowID);
    if (groupFollowGuid(String(link.BatchID)) !== p.batchId || Number(link.OwnerTaskID) !== id
        || Number(link.OwnerFollowID) !== fid || byTask.has(id) || followIds.has(fid)) stop('BATCH_LINK_INVALID', 'پیوندهای سابقهٔ گروهی ناسازگارند؛ عملیات انجام نشد.');
    byTask.set(id, fid); followIds.add(fid);
  }
  if (byTask.get(p.taskId) !== p.followId) stop('BATCH_FOLLOW_MISMATCH', 'پیگیری انتخاب‌شده نسخهٔ متناظر این کار در این سابقهٔ گروهی نیست.');
  return byTask;
}
async function insertCopy(tx, p, taskId, batchId) {
  const rows = await tx(`/* group-follow:insert */ INSERT INTO dbo.Follow_tbl (TaskID, Description, DueDateTime, EndDateTime, Duration)
    OUTPUT INSERTED.FollowID, INSERTED.TaskID VALUES (?, ?, ?, ?, ?)`, [taskId, p.description, p.due, p.end, p.duration]);
  const followId = writeResult(rows, taskId);
  const links = await tx(`/* group-follow:link */ INSERT INTO dbo.TaskGroupFollowLink (BatchID, TaskID, FollowID)
    OUTPUT INSERTED.BatchID, INSERTED.TaskID, INSERTED.FollowID VALUES (?, ?, ?)`, [batchId, taskId, followId]);
  writeResult(links, taskId, followId);
  if (groupFollowGuid(String(links[0].BatchID)) !== batchId) stop('BATCH_LINK_INVALID', 'پیوند ذخیره‌شده با سابقهٔ گروهی تطابق ندارد.');
  return followId;
}
async function perform(body, editing) {
  const p = prepare(body, editing);
  return runTransaction(async tx => {
    await lockTaskSchedule(tx);
    await assertTaskGroupSchema(tx);
    await lockGroup(tx, p.groupId, true);
    // Replays are checked BEFORE stale-version/membership checks, under the locks.
    // A committed old request must never become a second operation after a timeout.
    const previous = await tx(`/* group-follow:operation */ SELECT RequestID, GroupID, OperationKind, PayloadHash, ResultJSON
      FROM dbo.TaskGroupOperation WITH (UPDLOCK, HOLDLOCK) WHERE RequestID = ?`, [p.requestId]);
    if (previous.length > 1) stop('OPERATION_RESULT_INVALID', 'شناسهٔ عملیات تکراری است.');
    if (previous.length) return replay(previous[0], p);
    const members = await currentGroup(tx, p);
    let batchId = p.batchId, links = new Map();
    if (editing) {
      links = await existingBatch(tx, p);
    } else {
      batchId = randomUUID().toLowerCase();
      const batches = await tx(`/* group-follow:new-batch */ INSERT INTO dbo.TaskGroupFollowBatch (BatchID, GroupID, OriginTaskID)
        OUTPUT INSERTED.BatchID, INSERTED.GroupID, INSERTED.OriginTaskID VALUES (?, ?, ?)`, [batchId, p.groupId, p.taskId]);
      if (batches.length !== 1 || groupFollowGuid(String(batches[0].BatchID)) !== batchId
          || Number(batches[0].GroupID) !== p.groupId || Number(batches[0].OriginTaskID) !== p.taskId) stop('BATCH_WRITE_FAILED', 'ایجاد سابقهٔ گروهی قابل تأیید نیست.');
    }
    const copies = [];
    for (const taskId of p.recipientTaskIds) {
      let followId = links.get(taskId);
      if (followId != null) {
        const rows = await tx(`/* group-follow:update */ UPDATE dbo.Follow_tbl SET Description = ?, DueDateTime = ?, EndDateTime = ?, Duration = ?
          OUTPUT INSERTED.FollowID, INSERTED.TaskID WHERE FollowID = ? AND TaskID = ?`, [p.description, p.due, p.end, p.duration, followId, taskId]);
        writeResult(rows, taskId, followId);
      } else {
        followId = await insertCopy(tx, p, taskId, batchId);
      }
      if (p.copy) {
        const changed = await tx(`/* group-follow:description */ UPDATE dbo.Tsk_tbl SET Descriptions = ?
          OUTPUT INSERTED.TaskID WHERE TaskID = ?`, [p.description, taskId]);
        if (changed.length !== 1 || Number(changed[0].TaskID) !== taskId) stop('TASK_DESCRIPTION_FAILED', 'کپی شرح برای یکی از کارها انجام نشد.');
      }
      copies.push({ taskId, followId });
    }
    if (editing) {
      const touched = await tx(`/* group-follow:batch-touch */ UPDATE dbo.TaskGroupFollowBatch SET ModifiedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.BatchID, INSERTED.GroupID WHERE BatchID = ? AND GroupID = ?`, [batchId, p.groupId]);
      if (touched.length !== 1 || groupFollowGuid(String(touched[0].BatchID)) !== batchId || Number(touched[0].GroupID) !== p.groupId) stop('BATCH_CHANGED', 'سابقهٔ گروهی تغییر کرده است؛ عملیات ذخیره نشد.');
    }
    const changed = await tx(`/* group-follow:touch */ UPDATE dbo.TaskGroup SET ModifiedAt = SYSUTCDATETIME()
      OUTPUT CONVERT(varchar(16), INSERTED.Version, 2) AS Version
      WHERE GroupID = ? AND IsActive = 1 AND Version = CONVERT(binary(8), ?, 2)`, [p.groupId, p.version]);
    if (changed.length !== 1 || !/^[0-9A-F]{16}$/i.test(String(changed[0].Version))
        || String(changed[0].Version).toUpperCase() === p.version) stop('GROUP_CHANGED', 'نسخهٔ گروه تغییر کرد؛ عملیات ذخیره نشد.');
    const result = { requestId: p.requestId, operationKind: p.operationKind, groupId: p.groupId, taskId: p.taskId,
      batchId, groupVersion: String(changed[0].Version).toUpperCase(), recipientTaskIds: p.recipientTaskIds,
      excludedTaskIds: members.map(member => Number(member.TaskID)).filter(id => !p.recipientTaskIds.includes(id)).sort((a, b) => a - b), copies, replayed: false };
    const saved = await tx(`/* group-follow:remember */ INSERT INTO dbo.TaskGroupOperation (RequestID, GroupID, OperationKind, PayloadHash, ResultJSON)
      OUTPUT INSERTED.RequestID, INSERTED.GroupID VALUES (?, ?, ?, ?, ?)`, [p.requestId, p.groupId, p.operationKind, p.payloadHash, JSON.stringify(result)]);
    if (saved.length !== 1 || groupFollowGuid(String(saved[0].RequestID)) !== p.requestId || Number(saved[0].GroupID) !== p.groupId) stop('OPERATION_WRITE_FAILED', 'ثبت شناسهٔ عملیات انجام نشد؛ تغییرات ذخیره نشدند.');
    // Never update TimeDate_tbl, Finish_DateTime, Complited or task scheduling fields.
    return result;
  });
}
export const createGroupFollow = body => perform(body, false);
export const updateGroupFollow = body => perform(body, true);
export const groupFollowFailure = followFailure;
