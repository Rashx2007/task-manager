import 'server-only';
import { query } from './db';
import { taskGroupId, TaskGroupError } from './task-groups';
import { groupFollowGuid } from './task-group-follow-service';
import { readTaskGroupSnapshot } from './task-group-reader';

const changed = message => { throw new TaskGroupError('GROUP_FOLLOW_CONTEXT_CHANGED', message, 409); };
async function membershipMark(taskId) {
  const rows = await query(`/* group-follow-context:mark */ SELECT CONVERT(varchar(20), member.MemberID) AS MemberID,
    CONVERT(varchar(16), member.Version, 2) AS MemberVersion
    FROM dbo.TaskGroupMember member WHERE member.TaskID = ? ORDER BY member.MemberID`, [taskId]);
  const seen = new Set();
  const values = rows.map(row => {
    const id = String(row.MemberID), version = String(row.MemberVersion).toUpperCase();
    if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n || !/^[0-9A-F]{16}$/.test(version) || seen.has(id)) changed('نسخهٔ عضویت قابل تأیید نیست.');
    seen.add(id);
    return [id, version];
  });
  return JSON.stringify(values);
}

// Read-only optimistic context. Display flags are NOT authorization to write.
// Every writer must revalidate under the service's locks and bump group.Version.
export async function readGroupFollowContext(value) {
  const taskId = taskGroupId(value);
  const snapshot = await readTaskGroupSnapshot(taskId);
  if (Number(snapshot.taskId) !== taskId) changed('پاسخ گروه با کار این پنجره تطابق ندارد.');
  const groupId = snapshot.group == null ? null : taskGroupId(snapshot.group.GroupID);
  if (snapshot.group != null && !/^[0-9A-F]{16}$/i.test(String(snapshot.group.Version))) changed('نسخهٔ گروه معتبر نیست.');
  const mark = await membershipMark(taskId);
  const rows = await query(`/* group-follow-context:rows */ SELECT follow.FollowID, follow.TaskID, follow.Description,
    follow.DueDateTime, follow.EndDateTime, follow.Duration, follow.Priorities, follow.LastPriority,
    link.BatchID, link.TaskID AS LinkedTaskID, batch.GroupID AS BatchGroupID, batch.OriginTaskID AS BatchOriginTaskID
    FROM dbo.Follow_tbl follow
    LEFT JOIN dbo.TaskGroupFollowLink link ON link.FollowID = follow.FollowID
    LEFT JOIN dbo.TaskGroupFollowBatch batch ON batch.BatchID = link.BatchID
    WHERE follow.TaskID = ? ORDER BY follow.DueDateTime DESC, follow.FollowID DESC`, [taskId]);
  const seen = new Set(), follows = [];
  for (const row of rows) {
    const followId = taskGroupId(row.FollowID);
    if (Number(row.TaskID) !== taskId || seen.has(followId)) changed('سوابق دریافتی تکراری‌اند یا متعلق به کار دیگری هستند.');
    seen.add(followId);
    const linked = row.BatchID != null;
    let batchId = null, batchGroupId = null, batchOriginTaskId = null;
    if (linked) {
      try {
        batchId = groupFollowGuid(String(row.BatchID));
        batchGroupId = taskGroupId(row.BatchGroupID);
        batchOriginTaskId = taskGroupId(row.BatchOriginTaskID);
      } catch { changed('اطلاعات پیوند گروهی ناقص یا نامعتبر است.'); }
      if (Number(row.LinkedTaskID) !== taskId) changed('مالک پیوند سابقه با این کار تطابق ندارد.');
    } else if (row.LinkedTaskID != null || row.BatchGroupID != null || row.BatchOriginTaskID != null) {
      changed('شناسهٔ سابقهٔ گروهی با اطلاعات پیوند سازگار نیست.');
    }
    follows.push({
      FollowID: followId, TaskID: taskId, Description: row.Description,
      DueDateTime: row.DueDateTime, EndDateTime: row.EndDateTime, Duration: row.Duration,
      Priorities: row.Priorities, LastPriority: row.LastPriority,
      BatchID: batchId, BatchGroupID: batchGroupId, BatchOriginTaskID: batchOriginTaskId,
      IsGroupLinked: linked,
      CanEditGroup: groupId != null && linked && batchGroupId === groupId,
      CanEditIndependent: groupId == null && !linked,
      RequiresExplicitGrouping: groupId != null && !linked,
    });
  }
  // Includes the no-group case: joining a group while this GET runs must not
  // produce an apparently independent editing context.
  const final = await query(`/* group-follow-context:final */ SELECT member.GroupID, groupRow.IsActive,
    CONVERT(varchar(16), groupRow.Version, 2) AS Version
    FROM dbo.TaskGroupMember member
    LEFT JOIN dbo.TaskGroup groupRow ON groupRow.GroupID = member.GroupID
    WHERE member.TaskID = ? AND member.LeftAt IS NULL`, [taskId]);
  if (groupId == null) {
    if (final.length) changed('عضویت کار هنگام دریافت پیگیری تغییر کرد؛ دوباره دریافت کنید.');
  } else if (final.length !== 1 || Number(final[0].GroupID) !== groupId || Number(final[0].IsActive) !== 1
      || String(final[0].Version).toUpperCase() !== String(snapshot.group.Version).toUpperCase()) {
    changed('گروه یا نسخهٔ آن هنگام دریافت پیگیری تغییر کرد؛ دوباره دریافت کنید.');
  }
  // History rows/rowversions also detect a join-then-leave cycle in the no-group case.
  if (await membershipMark(taskId) !== mark) changed('عضویت کار در میانهٔ دریافت تغییر کرد؛ دوباره دریافت کنید.');
  return { taskId, group: snapshot.group, members: snapshot.members, follows, warnings: snapshot.warnings };
}
