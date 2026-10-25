import 'server-only';
import { runTransaction } from './db';
import { normalizeDigits } from './assetRules';

// Foundation only: no existing route imports this module yet.
export const TASK_GROUP_MIGRATION = '20261025_001_task_groups';
export const MAX_TASK_GROUP_MEMBERS = 250;

export class TaskGroupError extends Error {
  constructor(code, message, status = 400) {
    super(message); this.name = 'TaskGroupError'; this.code = code; this.status = status;
  }
}
const fail = (code, message, status) => { throw new TaskGroupError(code, message, status); };

export function taskGroupId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') fail('INVALID_ID', 'شناسه معتبر نیست.');
  const text = normalizeDigits(value).trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) fail('INVALID_ID', 'شناسه باید عدد صحیح مثبت معتبر باشد.');
  return number;
}

export function taskGroupIds(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > MAX_TASK_GROUP_MEMBERS) fail('INVALID_MEMBERS', 'فهرست کارها معتبر نیست یا بیش از حد مجاز عضو دارد.');
  const ids = [...new Set(value.map(taskGroupId))].sort((a, b) => a - b);
  if (!allowEmpty && !ids.length) fail('EMPTY_MEMBERS', 'حداقل یک کار باید انتخاب شود.');
  return ids;
}

export function taskGroupVersion(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{16}$/i.test(value)) fail('INVALID_VERSION', 'نسخهٔ گروه معتبر نیست؛ اطلاعات را دوباره دریافت کنید.');
  return value.toUpperCase();
}

export async function assertTaskGroupSchema(tx) {
  const objects = await tx(`SELECT CASE WHEN
    OBJECT_ID(N'dbo.TaskGroupMigration', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.TaskGroup', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.TaskGroupMember', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.TaskGroupFollowBatch', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.TaskGroupFollowLink', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.TaskGroupOperation', N'U') IS NOT NULL
    THEN 1 ELSE 0 END AS Ready`, []);
  if (Number(objects[0]?.Ready) !== 1) fail('TASK_GROUPS_NOT_READY', 'زیرساخت گروه‌ها نصب نشده است؛ عملیات گروهی انجام نشد.', 503);
  const versions = await tx(`SELECT MigrationKey FROM dbo.TaskGroupMigration WHERE MigrationKey = ?`, [TASK_GROUP_MIGRATION]);
  if (!versions.length) fail('TASK_GROUPS_NOT_READY', 'نسخهٔ زیرساخت گروه‌ها تأیید نشده است.', 503);
  const constraints = await tx(`SELECT
    (SELECT COUNT(*) FROM sys.indexes WHERE
      (object_id = OBJECT_ID(N'dbo.TaskGroupMember') AND name = N'UX_TaskGroupMember_CurrentTask' AND is_unique = 1 AND has_filter = 1 AND is_disabled = 0)
      OR (object_id = OBJECT_ID(N'dbo.Follow_tbl') AND name = N'UX_Follow_tbl_GroupOwner' AND is_unique = 1 AND is_disabled = 0)) AS IndexCount,
    (SELECT COUNT(*) FROM sys.foreign_keys WHERE name IN (
      N'FK_TaskGroupMember_Group', N'FK_TaskGroupMember_Task',
      N'FK_TaskGroupFollowBatch_Group', N'FK_TaskGroupFollowBatch_Origin',
      N'FK_TaskGroupFollowLink_Batch', N'FK_TaskGroupFollowLink_Owner', N'FK_TaskGroupOperation_Group'
    ) AND schema_id = SCHEMA_ID(N'dbo') AND is_disabled = 0 AND is_not_trusted = 0) AS ForeignKeyCount`, []);
  if (Number(constraints[0]?.IndexCount) !== 2 || Number(constraints[0]?.ForeignKeyCount) !== 7) fail('TASK_GROUPS_NOT_READY', 'قیدهای ایمنی گروه‌ها کامل یا فعال نیستند؛ عملیات متوقف شد.', 503);
}

async function lockGroup(tx, groupId, exclusive) {
  const rows = await tx(`DECLARE @lockResult int;
    EXEC @lockResult = sys.sp_getapplock @Resource = ?, @LockMode = ?,
      @LockOwner = N'Transaction', @LockTimeout = 10000;
    SELECT @lockResult AS LockResult;`, [`task-manager:task-group:${groupId}`, exclusive ? 'Exclusive' : 'Shared']);
  if (!Number.isInteger(rows[0]?.LockResult) || rows[0].LockResult < 0) fail('GROUP_BUSY', 'گروه در حال تغییر است؛ دوباره تلاش کنید.', 409);
}

export function resolveGroupSyncTargets(members, values) {
  const ids = taskGroupIds(values);
  const current = new Map(members.map((member) => [Number(member.TaskID), member]));
  for (const id of ids) {
    const member = current.get(id);
    if (!member || member.LeftAt != null) fail('MEMBERSHIP_CHANGED', 'عضویت یکی از کارها تغییر کرده است؛ فهرست گروه را دوباره دریافت کنید.', 409);
    if (Number(member.SyncEnabled) !== 1) fail('MEMBER_EXCLUDED', 'یکی از کارهای انتخاب‌شده از همگام‌سازی مستثناست؛ ابتدا آن را صریحاً فعال کنید.', 409);
  }
  return ids;
}

// Must run on the SAME transaction connection as the eventual follow-up write.
export async function assertGroupFollowOwner(tx, followId, ownerTaskId) {
  const fid = taskGroupId(followId), tid = taskGroupId(ownerTaskId);
  const rows = await tx(`SELECT FollowID, TaskID FROM dbo.Follow_tbl WITH (UPDLOCK, HOLDLOCK)
    WHERE FollowID = ? AND TaskID = ?`, [fid, tid]);
  if (rows.length !== 1 || Number(rows[0].FollowID) !== fid || Number(rows[0].TaskID) !== tid) fail('FOLLOW_OWNER_MISMATCH', 'ردیف پیگیری متعلق به این کار نیست یا دیگر وجود ندارد.', 409);
  return rows[0];
}

// A later route must validate its payload and use this wrapper for group writes.
// Every membership/sync/batch change must touch the group version via this wrapper.
// If a transaction changes membership in multiple groups, acquire all group locks
// in ascending GroupID order in a dedicated multi-group wrapper; do NOT nest this one.
export async function runTaskGroupTransaction(options, work) {
  const groupId = taskGroupId(options?.groupId);
  const originTaskId = taskGroupId(options?.originTaskId);
  const expectedVersion = taskGroupVersion(options?.expectedVersion);
  if (typeof work !== 'function') fail('INVALID_OPERATION', 'عملیات گروهی معتبر نیست.');
  return runTransaction(async (tx) => {
    await assertTaskGroupSchema(tx);
    await lockGroup(tx, groupId, true);
    const groups = await tx(`SELECT GroupID, Title, IsActive, CONVERT(varchar(16), Version, 2) AS Version
      FROM dbo.TaskGroup WITH (UPDLOCK, HOLDLOCK) WHERE GroupID = ?`, [groupId]);
    const group = groups[0];
    if (!group || Number(group.IsActive) !== 1) fail('GROUP_INACTIVE', 'گروه فعال نیست یا وجود ندارد.', 409);
    if (group.Version !== expectedVersion) fail('GROUP_CHANGED', 'گروه پس از بازشدن پنجره تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.', 409);
    const members = await tx(`SELECT MemberID, GroupID, TaskID, SyncEnabled, LeftAt,
      CONVERT(varchar(16), Version, 2) AS Version
      FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK)
      WHERE GroupID = ? AND LeftAt IS NULL ORDER BY TaskID`, [groupId]);
    if (!members.some((member) => Number(member.TaskID) === originTaskId)) fail('ORIGIN_NOT_MEMBER', 'کار این پنجره دیگر عضو گروه نیست.', 409);
    // Never silently infer recipients from a task ID or accept another group's IDs.
    const value = await work({
      tx, group, members,
      resolveSyncTargets: (ids) => resolveGroupSyncTargets(members, ids),
      assertFollowOwner: (fid, tid) => {
        if (!members.some((member) => Number(member.TaskID) === taskGroupId(tid))) fail('MEMBERSHIP_CHANGED', 'کارِ پیگیری عضو این گروه نیست.', 409);
        return assertGroupFollowOwner(tx, fid, tid);
      },
    });
    const changed = await tx(`UPDATE dbo.TaskGroup SET ModifiedAt = SYSUTCDATETIME()
      OUTPUT CONVERT(varchar(16), INSERTED.Version, 2) AS Version
      WHERE GroupID = ? AND Version = CONVERT(binary(8), ?, 2)`, [groupId, expectedVersion]);
    if (changed.length !== 1) fail('GROUP_CHANGED', 'نسخهٔ گروه تغییر کرد؛ عملیات ذخیره نشد.', 409);
    return { value, groupVersion: changed[0].Version };
  });
}
