import 'server-only';
import { query } from './db';
import { assertTaskGroupSchema, taskGroupId, TaskGroupError, MAX_TASK_GROUP_MEMBERS } from './task-groups';

const conflict = (message) => { throw new TaskGroupError('GROUP_SNAPSHOT_CHANGED', message, 409); };

// SELECT-only optimistic snapshot: compare the group version before and after
// reading members. All future group writers must bump that version atomically.
// Display data is never authorization to save; writes must lock/revalidate again.
export async function readTaskGroupSnapshot(value) {
  const taskId = taskGroupId(value);
  await assertTaskGroupSchema(query);
  const tasks = await query(`SELECT TaskID FROM dbo.Tsk_tbl WHERE TaskID = ?`, [taskId]);
  if (!tasks.length) throw new TaskGroupError('TASK_NOT_FOUND', 'کار موردنظر پیدا نشد؛ فهرست را تازه‌سازی کنید.', 404);
  if (tasks.length !== 1 || Number(tasks[0].TaskID) !== taskId) conflict('پاسخ کار با شناسهٔ درخواست سازگار نیست.');

  // Initial membership is revalidated after reading the member list.
  const current = await query(`SELECT GroupID FROM dbo.TaskGroupMember
    WHERE TaskID = ? AND LeftAt IS NULL`, [taskId]);
  if (!current.length) return { taskId, group: null, members: [], warnings: [] };
  if (current.length !== 1) conflict('برای یک کار بیش از یک عضویت جاری پیدا شد.');
  const groupId = taskGroupId(current[0].GroupID);
  const groups = await query(`SELECT GroupID, Title, IsActive, CreatedAt, ModifiedAt,
    CONVERT(varchar(16), Version, 2) AS Version
    FROM dbo.TaskGroup WHERE GroupID = ?`, [groupId]);
  const group = groups[0];
  if (groups.length !== 1 || Number(group?.GroupID) !== groupId || Number(group?.IsActive) !== 1 || !/^[0-9A-F]{16}$/i.test(String(group?.Version || ''))) conflict('وضعیت یا نسخهٔ گروه تغییر کرده است؛ دوباره دریافت کنید.');

  const rows = await query(`SELECT CONVERT(varchar(20), member.MemberID) AS MemberID,
    member.GroupID, member.TaskID, member.SyncEnabled,
    CONVERT(varchar(16), member.Version, 2) AS MemberVersion,
    tsk.TaskTtl, tsk.Complited,
    asset.AssetID, asset.AssetName, asset.AssetNumber, asset.Building,
    asset.Block, asset.Floor, asset.Entrance, asset.Location, asset.MechSystem,
    mapping.MappingCount AS AssetMappingCount,
    schedule.ScheduleCount AS TimeDateRowCount,
    CASE WHEN schedule.ScheduleCount = 1 THEN schedule.Priorities
      WHEN schedule.ScheduleCount = 0 THEN tsk.Priorities ELSE NULL END AS Priorities,
    CASE WHEN schedule.ScheduleCount = 1 THEN schedule.FixedDueTime ELSE NULL END AS FixedDueTime,
    CASE WHEN schedule.ScheduleCount = 1 THEN schedule.Durationtime ELSE NULL END AS Durationtime,
    CASE WHEN schedule.ScheduleCount = 1 THEN schedule.DueDateTime ELSE NULL END AS DueDateTime,
    CASE WHEN schedule.ScheduleCount = 1 THEN schedule.EndDateTime ELSE NULL END AS EndDateTime
    FROM dbo.TaskGroupMember member
    INNER JOIN dbo.Tsk_tbl tsk ON tsk.TaskID = member.TaskID
    OUTER APPLY (
      SELECT COUNT(DISTINCT link.AssetID) AS MappingCount, MAX(link.AssetID) AS SingleAssetID
      FROM dbo.Asset_Task_tbl link WHERE link.TaskID = member.TaskID
    ) mapping
    LEFT JOIN dbo.Asset_2_tbl asset ON asset.AssetID = CASE
      WHEN mapping.MappingCount = 0 THEN tsk.AssetID
      WHEN mapping.MappingCount = 1 THEN mapping.SingleAssetID ELSE NULL END
    OUTER APPLY (
      SELECT COUNT(*) AS ScheduleCount, MAX(td.Priorities) AS Priorities,
        MAX(td.FixedDueTime) AS FixedDueTime, MAX(td.Durationtime) AS Durationtime,
        MAX(td.DueDateTime) AS DueDateTime, MAX(td.EndDateTime) AS EndDateTime
      FROM dbo.TimeDate_tbl td WHERE td.TaskID = member.TaskID
    ) schedule
    WHERE member.GroupID = ? AND member.LeftAt IS NULL
    ORDER BY member.TaskID DESC`, [groupId]);
  if (!rows.length || rows.length > MAX_TASK_GROUP_MEMBERS) conflict('تعداد اعضای گروه معتبر نیست؛ عضویت‌ها باید بررسی شوند.');
  const seen = new Set(), warnings = [];
  for (const row of rows) {
    const memberTaskId = taskGroupId(row.TaskID);
    if (seen.has(memberTaskId) || Number(row.GroupID) !== groupId || row.SyncEnabled == null || ![0, 1].includes(Number(row.SyncEnabled)) || !/^[0-9A-F]{16}$/i.test(String(row.MemberVersion || ''))) conflict('پاسخ اعضای گروه ناسازگار است؛ دوباره دریافت کنید.');
    if (!Number.isInteger(Number(row.AssetMappingCount)) || Number(row.AssetMappingCount) < 0 || !Number.isInteger(Number(row.TimeDateRowCount)) || Number(row.TimeDateRowCount) < 0) conflict('اطلاعات دستگاه یا زمان‌بندی عضو معتبر نیست.');
    seen.add(memberTaskId);
    if (Number(row.AssetMappingCount) > 1) warnings.push({ code: 'AMBIGUOUS_ASSET', taskId: memberTaskId });
    if (Number(row.TimeDateRowCount) > 1) warnings.push({ code: 'MULTIPLE_SCHEDULE_ROWS', taskId: memberTaskId });
  }
  if (!seen.has(taskId)) conflict('کار این پنجره دیگر عضو این گروه نیست؛ دوباره دریافت کنید.');
  const final = await query(`SELECT groupRow.GroupID, CONVERT(varchar(16), groupRow.Version, 2) AS Version
    FROM dbo.TaskGroup groupRow WHERE groupRow.GroupID = ? AND groupRow.IsActive = 1
    AND EXISTS (SELECT 1 FROM dbo.TaskGroupMember currentMember
      WHERE currentMember.GroupID = groupRow.GroupID AND currentMember.TaskID = ? AND currentMember.LeftAt IS NULL)`, [groupId, taskId]);
  if (final.length !== 1 || Number(final[0].GroupID) !== groupId || String(final[0].Version).toUpperCase() !== String(group.Version).toUpperCase()) conflict('گروه هنگام دریافت اطلاعات تغییر کرد؛ دوباره دریافت کنید.');
  return {
    taskId, group, members: rows.map((row) => ({ ...row, IsOriginTask: Number(row.TaskID) === taskId })), warnings,
  };
}
