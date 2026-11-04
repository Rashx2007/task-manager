import 'server-only';
import { createHash } from 'node:crypto';
import { runTransaction } from './db';
import { TaskGroupError, taskGroupId, taskGroupIds, taskGroupVersion, assertTaskGroupSchema, lockTaskSchedule, lockGroup } from './task-groups';
import { planGroupMembershipChange, GroupMembershipPlanError } from './task-group-membership-plan.mjs';

// Internal stage only: do not expose a route or call against real data until the
// remaining grouped workflows and an isolated SQL Server concurrency test exist.
const stop = (code, message, status = 409) => { throw new TaskGroupError(code, message, status); };
const uuid = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) stop('INVALID_OPERATION_ID', 'شناسهٔ عملیات معتبر نیست.', 400);
  return value.toLowerCase();
};
const memberId = value => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) stop('INVALID_MEMBER_ID', 'شناسهٔ عضویت معتبر نیست.', 400);
  return value;
};
const memberBit = value => value === true || value === 1 || value === '1' ? true : value === false || value === 0 || value === '0' ? false : null;
const hash = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const same = (a,b) => Array.isArray(a) && a.length === b.length && a.every((v,i)=>v===b[i]);
function normalizeMembers(rows, groupId, fromDb = false) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 250) stop('INVALID_MEMBERS', 'فهرست اعضا معتبر نیست.', fromDb ? 409 : 400);
  const seenTasks = new Set(), seenMembers = new Set();
  const values = rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) stop('INVALID_MEMBERS', 'فهرست اعضا معتبر نیست.', fromDb ? 409 : 400);
    if (fromDb && (Number(row.GroupID) !== groupId || !Object.hasOwn(row, 'LeftAt') || row.LeftAt !== null)) stop('INVALID_MEMBERS', 'عضویت‌های گروه ناسازگارند.');
    const taskId = taskGroupId(fromDb ? row.TaskID : row.taskId);
    const mid = memberId(fromDb ? row.MemberID : row.memberId);
    const mv = taskGroupVersion(fromDb ? row.MemberVersion : row.memberVersion);
    const sync = memberBit(fromDb ? row.SyncEnabled : row.syncEnabled);
    if (sync === null || (!fromDb && typeof row.syncEnabled !== 'boolean') || seenTasks.has(taskId) || seenMembers.has(mid)) stop('INVALID_MEMBERS', 'عضویت‌های گروه تکراری یا نامعتبرند.', fromDb ? 409 : 400);
    seenTasks.add(taskId); seenMembers.add(mid);
    return { taskId, memberId: mid, memberVersion: mv, syncEnabled: sync };
  });
  return values.sort((a,b)=>a.taskId-b.taskId);
}
function prepare(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) stop('INVALID_BODY', 'درخواست معتبر نیست.', 400);
  const groupId=taskGroupId(body.groupId), originTaskId=taskGroupId(body.originTaskId), expectedVersion=taskGroupVersion(body.expectedGroupVersion), requestId=uuid(body.requestId);
  const action=body.action;
  if (action === 'leave' || action === 'dissolve') stop('EXIT_SCHEDULE_CHECK_REQUIRED', 'خروج یا انحلال تا بررسی تداخل زمان‌بندی فعال نیست.', 409);
  if (action !== 'set_sync') stop('INVALID_ACTION', 'نوع عملیات معتبر نیست.', 400);
  const expectedMembers=normalizeMembers(body.expectedMembers, groupId);
  if (!expectedMembers.some(row=>row.taskId===originTaskId)) stop('ORIGIN_NOT_MEMBER', 'کار این پنجره عضو گروه نیست.', 400);
  if (body.confirmDissolve !== undefined) stop('INVALID_ACTION', 'درخواست عضویت معتبر نیست.', 400);
  if (!Array.isArray(body.taskIds)) stop('INVALID_TARGETS', 'اعضا باید صریحاً انتخاب شوند.', 400);
  const taskIds=taskGroupIds(body.taskIds);
  if (taskIds.length !== body.taskIds.length) stop('DUPLICATE_TARGETS', 'یک عضو بیش از یک بار انتخاب شده است.', 400);
  if (typeof body.syncEnabled !== 'boolean') stop('INVALID_SYNC_STATE', 'وضعیت همگام‌سازی باید صریح باشد.', 400);
  const syncEnabled=body.syncEnabled, operationKind='MEMBER_SYNC';
  const canonical={operationKind,groupId,originTaskId,expectedVersion,expectedMembers,action,taskIds,syncEnabled};
  return {...canonical,requestId,payloadHash:hash(canonical)};
}
function replay(row,p) {
  if (String(row.RequestID).toLowerCase() !== p.requestId) stop('OPERATION_RESULT_INVALID', 'شناسهٔ رسید معتبر نیست.');
  if (Number(row.GroupID) !== p.groupId || row.OperationKind !== p.operationKind || row.PayloadHash !== p.payloadHash) stop('REQUEST_ID_REUSED', 'شناسهٔ درخواست برای عملیات دیگری استفاده شده است.');
  let result;
  try {
    result=JSON.parse(row.ResultJSON);
    const selected=p.taskIds;
    const changed=result.changedTaskIds;
    const expectedChanged=p.expectedMembers.filter(m=>selected.includes(m.taskId) && m.syncEnabled!==p.syncEnabled).map(m=>m.taskId);
    if (!result || result.requestId!==p.requestId || result.operationKind!==p.operationKind || result.groupId!==p.groupId || result.originTaskId!==p.originTaskId || result.action!==p.action || !same(result.selectedTaskIds,selected) || !Array.isArray(changed) || new Set(changed).size!==changed.length || changed.some((v,i)=>!selected.includes(v)||(i && changed[i-1]>=v)) || typeof result.noChanges!=='boolean' || result.noChanges!==(changed.length===0) || !same(changed,expectedChanged) || result.syncEnabled!==p.syncEnabled || result.dissolved!==false || taskGroupVersion(result.groupVersion)!==result.groupVersion || (changed.length===0 ? result.groupVersion!==p.expectedVersion : result.groupVersion===p.expectedVersion) || result.replayed!==false) throw Error('invalid');
  } catch { stop('OPERATION_RESULT_INVALID', 'رسید عملیات معتبر نیست؛ پیش از تکرار بررسی شود.'); }
  return {...result,replayed:true};
}
export async function changeGroupMembership(body) {
  const p=prepare(body);
  return runTransaction(async tx=>{
    await lockTaskSchedule(tx);
    await assertTaskGroupSchema(tx);
    await lockGroup(tx,p.groupId,true);
    const receipts=await tx(`/* group-membership:operation */ SELECT RequestID, GroupID, OperationKind, PayloadHash, ResultJSON
      FROM dbo.TaskGroupOperation WITH (UPDLOCK, HOLDLOCK) WHERE RequestID = ?`,[p.requestId]);
    if (receipts.length>1) stop('OPERATION_RESULT_INVALID', 'رسیدهای عملیات تکراری‌اند.');
    if (receipts.length) return replay(receipts[0],p);
    const groups=await tx(`/* group-membership:group */ SELECT GroupID, IsActive, CONVERT(varchar(16), Version, 2) AS Version
      FROM dbo.TaskGroup WITH (UPDLOCK, HOLDLOCK) WHERE GroupID = ?`,[p.groupId]);
    if (groups.length!==1 || Number(groups[0].GroupID)!==p.groupId || memberBit(groups[0].IsActive)!==true) stop('GROUP_INACTIVE','گروه فعال نیست یا وجود ندارد.');
    if (taskGroupVersion(groups[0].Version)!==p.expectedVersion) stop('GROUP_CHANGED','گروه تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.');
    const rows=await tx(`/* group-membership:members */ SELECT CONVERT(varchar(20), MemberID) AS MemberID, GroupID, TaskID, SyncEnabled, LeftAt,
      CONVERT(varchar(16), Version, 2) AS MemberVersion FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK)
      WHERE GroupID = ? AND LeftAt IS NULL ORDER BY TaskID`,[p.groupId]);
    const members=normalizeMembers(rows,p.groupId,true);
    if (JSON.stringify(members)!==JSON.stringify(p.expectedMembers)) stop('MEMBERSHIP_CHANGED','عضویت یا نسخهٔ یکی از اعضا تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.');
    let plan;
    try {
      plan=planGroupMembershipChange({group:groups[0],members:rows,originTaskId:p.originTaskId,expectedVersion:p.expectedVersion,
        action:'set_sync',taskIds:p.taskIds,syncEnabled:p.syncEnabled});
    } catch(e) { if (e instanceof GroupMembershipPlanError) stop(e.code,e.message); throw e; }
    if (!plan.ready) stop(plan.blockers[0]?.code || 'GROUP_ACTION_BLOCKED','عملیات نیازمند تصمیم صریح دربارهٔ گروه است.');
    for (const member of plan.changes) {
      const params=[p.syncEnabled?1:0,p.groupId,member.taskId,member.memberId,member.memberVersion,member.syncEnabled?1:0];
      const sql=`/* group-membership:sync */ UPDATE dbo.TaskGroupMember SET SyncEnabled = ? OUTPUT CONVERT(varchar(20), INSERTED.MemberID) AS MemberID, INSERTED.GroupID, INSERTED.TaskID, INSERTED.SyncEnabled WHERE GroupID = ? AND TaskID = ? AND MemberID = CONVERT(bigint, ?) AND Version = CONVERT(binary(8), ?, 2) AND SyncEnabled = ? AND LeftAt IS NULL`;
      const out=await tx(sql,params);
      if (out.length!==1 || String(out[0].MemberID)!==member.memberId || Number(out[0].GroupID)!==p.groupId || Number(out[0].TaskID)!==member.taskId || memberBit(out[0].SyncEnabled)!==p.syncEnabled) stop('MEMBERSHIP_CHANGED','عضویت تغییر کرد؛ عملیات ذخیره نشد.');
    }
    let groupVersion=p.expectedVersion;
    if (plan.changes.length) {
      const sql=`/* group-membership:touch */ UPDATE dbo.TaskGroup SET ModifiedAt = SYSUTCDATETIME() OUTPUT CONVERT(varchar(16), INSERTED.Version, 2) AS Version WHERE GroupID = ? AND IsActive = 1 AND Version = CONVERT(binary(8), ?, 2)`;
      const touched=await tx(sql,[p.groupId,p.expectedVersion]);
      if (touched.length!==1) stop('GROUP_CHANGED','نسخهٔ گروه تغییر کرد؛ عملیات ذخیره نشد.');
      groupVersion=taskGroupVersion(touched[0].Version);
      if (groupVersion===p.expectedVersion) stop('GROUP_CHANGED','نسخهٔ گروه به‌روزرسانی نشد؛ عملیات ذخیره نشد.');
    }
    const result={requestId:p.requestId,operationKind:p.operationKind,groupId:p.groupId,originTaskId:p.originTaskId,action:p.action,
      selectedTaskIds:plan.selectedTaskIds,changedTaskIds:plan.changes.map(m=>m.taskId),syncEnabled:p.syncEnabled,noChanges:plan.noChanges,
      dissolved:false,groupVersion,replayed:false};
    const saved=await tx(`/* group-membership:remember */ INSERT INTO dbo.TaskGroupOperation (RequestID, GroupID, OperationKind, PayloadHash, ResultJSON)
      OUTPUT INSERTED.RequestID, INSERTED.GroupID VALUES (?, ?, ?, ?, ?)`,[p.requestId,p.groupId,p.operationKind,p.payloadHash,JSON.stringify(result)]);
    if (saved.length!==1 || uuid(String(saved[0].RequestID))!==p.requestId || Number(saved[0].GroupID)!==p.groupId) stop('OPERATION_WRITE_FAILED','ثبت رسید عملیات انجام نشد؛ تغییرات ذخیره نشدند.');
    return result;
  });
}
