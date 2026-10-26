import 'server-only';
import { randomUUID } from 'node:crypto';
import { runTransaction } from './db';
import { normalizeDigits } from './assetRules';
import { assertTaskGroupSchema, lockTaskSchedule, taskGroupId, taskGroupVersion, TaskGroupError } from './task-groups';
import { buildGroupScheduleUnits, planTaskGroupSchedule, scheduleWallMillis, GroupScheduleError } from './task-group-schedule-core.mjs';
import { loadWorkHoursFromSettings, nowWall, wallToDate, dbToWall, formatSqlDateTime } from './schedule-logic';
import * as legacy from './scheduler-logic';

const FIXED = 'زمان انجام ثابت';
const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', FIXED];
const NORMAL_NAMES = { '(اضطراری)': '0.آنی', '(اضطراري)': '0.آنی', '1': '1.خیلی بالا', '2': '2.بالا', '3': '3.متوسط', '4': '4.کم', '5': '5.خیلی کم' };
const INCREASE = { '1.خیلی بالا': { days: 1, to: '0.آنی' }, '2.بالا': { days: 2, to: '1.خیلی بالا' }, '3.متوسط': { days: 4, to: '2.بالا' }, '4.کم': { days: 7, to: '3.متوسط' }, '5.خیلی کم': { days: 14, to: '4.کم' } };
const stop = (code, message, status = 409) => { throw new TaskGroupError(code, message, status); };
const asWall = (value) => value == null ? '' : value instanceof Date ? dbToWall(value) : String(value).slice(0, 19).replace('T', ' ');
const asDate = (value) => value instanceof Date ? new Date(value.getTime()) : wallToDate(value);
const ceilMinute = (date) => new Date(Math.ceil(date.getTime() / 60000) * 60000);

async function membershipState(tx) {
  await assertTaskGroupSchema(tx);
  const groups = await tx(`/* scheduler:groups */ SELECT GroupID, IsActive, CONVERT(varchar(16), Version, 2) AS Version
    FROM dbo.TaskGroup WITH (UPDLOCK, HOLDLOCK)
    WHERE EXISTS (SELECT 1 FROM dbo.TaskGroupMember member WHERE member.GroupID = TaskGroup.GroupID AND member.LeftAt IS NULL)
    ORDER BY GroupID`, []);
  const members = await tx(`/* scheduler:members */ SELECT GroupID, TaskID, SyncEnabled, LeftAt
    FROM dbo.TaskGroupMember WITH (UPDLOCK, HOLDLOCK) WHERE LeftAt IS NULL ORDER BY GroupID, TaskID`, []);
  const groupMap = new Map(groups.map((group) => [Number(group.GroupID), group]));
  const memberMap = new Map();
  for (const member of members) {
    const tid = taskGroupId(member.TaskID), gid = taskGroupId(member.GroupID);
    if (memberMap.has(tid) || Number(groupMap.get(gid)?.IsActive) !== 1) stop('GROUP_STATE_INVALID', 'عضویت جاری گروه‌ها ناسازگار است؛ ذخیره انجام نشد.');
    memberMap.set(tid, gid);
  }
  return { groups, members, groupMap, memberMap };
}

async function run(work) {
  return runTransaction(async (tx) => {
    await lockTaskSchedule(tx);
    const state = await membershipState(tx);
    return work(tx, state);
  });
}

async function loadTasks(tx, state) {
  const rows = await tx(`/* scheduler:tasks */ SELECT tsk.TaskID, tsk.Complited,
    tsk.Priorities AS TaskPriority, tsk.FixedDueTime AS TaskFixed,
    tsk.Submit_Date, TD.TimeDateID, TD.Priorities, TD.FixedDueTime,
    TD.Durationtime, TD.DueDateTime, TD.EndDateTime,
    (SELECT MAX(f.EndDateTime) FROM dbo.Follow_tbl f WHERE f.TaskID = tsk.TaskID) AS LastFollow
    FROM dbo.Tsk_tbl tsk WITH (UPDLOCK, HOLDLOCK)
    LEFT JOIN dbo.TimeDate_tbl TD WITH (UPDLOCK, HOLDLOCK) ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 0 OR EXISTS (SELECT 1 FROM dbo.TaskGroupMember member WHERE member.TaskID = tsk.TaskID AND member.LeftAt IS NULL)
    ORDER BY tsk.TaskID`, []);
  const byId = new Map();
  for (const row of rows) {
    const tid = taskGroupId(row.TaskID);
    if (byId.has(tid)) stop('MULTIPLE_SCHEDULE_ROWS', 'برای یک کار چند ردیف زمان ثبت شده است؛ پیش از بازچینی بررسی شود.');
    byId.set(tid, { ...row, TaskID: tid });
  }
  for (const member of state.members) if (!byId.has(Number(member.TaskID))) stop('INCOMPLETE_GROUP', 'اطلاعات یکی از اعضای گروه دریافت نشد.');
  return byId;
}

function coreInput(byId, state) {
  const tasks = [];
  for (const row of byId.values()) {
    if (Number(row.Complited) !== 1 && row.TimeDateID == null) {
      if (state.memberMap.has(row.TaskID)) stop('GROUP_UNSCHEDULED', 'یکی از اعضای فعال گروه هنوز زمان معتبر ندارد.');
      continue; // preserve ungrouped tasks not yet assigned a schedule
    }
    const current = { ...row };
    if (current.Priorities !== FIXED && Number(current.Complited) !== 1) {
      // Legacy non-fixed timestamps are only ordering keys. Seconds are discarded
      // in the in-memory key, never silently in a fixed appointment.
      for (const key of ['DueDateTime', 'EndDateTime']) if (current[key] != null) current[key] = asWall(current[key]).slice(0, 16) + ':00';
    }
    tasks.push(current);
  }
  return { tasks, groups: state.groups, members: state.members };
}

async function calculate(tx, state, byId) {
  const wh = await loadWorkHoursFromSettings(tx);
  return planTaskGroupSchedule({ ...coreInput(byId, state),
    startAt: ceilMinute(legacy.calculateInitialDueDateTime(nowWall(), wh)),
    adjustStart: (date) => ceilMinute(legacy.correctDueDateTime(date, wh)),
  });
}

async function persist(tx, state, before, plan) {
  const affectedGroups = new Set();
  for (const row of plan.assignments) {
    const old = before.get(row.taskId);
    const dur = legacy.durationToStr(row.durationMs);
    if (old?.TimeDateID != null && old.Priorities === row.priority && old.TaskPriority === row.priority && Number(old.FixedDueTime) === Number(row.fixed) && Number(old.TaskFixed) === Number(row.fixed) && legacy.parseDuration(old.Durationtime) === row.durationMs && asWall(old.DueDateTime) === row.startLocal && asWall(old.EndDateTime) === row.endLocal) continue;
    const due = wallToDate(row.startLocal), end = wallToDate(row.endLocal);
    await legacy.upsertTimeDate(row.taskId, row.priority, row.fixed ? 1 : 0, dur, due, end, tx);
    await legacy.syncTskTable(row.taskId, row.priority, row.fixed ? 1 : 0, dur, due, end, tx);
    if (state.memberMap.has(row.taskId)) affectedGroups.add(state.memberMap.get(row.taskId));
  }
  return affectedGroups;
}

async function touch(tx, state, groups) {
  const versions = {};
  for (const gid of [...groups].sort((a, b) => a - b)) {
    const original = state.groupMap.get(gid);
    const rows = await tx(`/* scheduler:touch */ UPDATE dbo.TaskGroup SET ModifiedAt = SYSUTCDATETIME()
      OUTPUT CONVERT(varchar(16), INSERTED.Version, 2) AS Version
      WHERE GroupID = ? AND Version = CONVERT(binary(8), ?, 2)`, [gid, original.Version]);
    if (rows.length !== 1) stop('GROUP_CHANGED', 'گروه هنگام ذخیره تغییر کرد؛ عملیات ذخیره نشد.');
    versions[gid] = rows[0].Version;
  }
  return versions;
}

async function groupedReschedule(tx, state) {
  const before = await loadTasks(tx, state);
  const plan = await calculate(tx, state, before);
  const touched = await persist(tx, state, before, plan);
  await touch(tx, state, touched);
  return plan.assignments.filter((row) => !row.fixed).length;
}

export async function rescheduleTasks() {
  return run((tx, state) => state.members.length ? groupedReschedule(tx, state) : legacy.rescheduleAll(tx));
}

// The secondary legacy route has its own old work-hour/order rules. Keep those
// unchanged while no groups exist; switch to the common planner with groups.
export async function updateTaskSchedule(legacyOperation) {
  return run((tx, state) => state.members.length ? groupedReschedule(tx, state) : legacyOperation(tx));
}

export async function saveTaskSchedule(body) {
  const tid = taskGroupId(body?.taskId), priority = body?.priority;
  if (!PRIORITIES.includes(priority)) stop('INVALID_PRIORITY', 'اولویت معتبر را انتخاب کنید.', 400);
  const fixed = priority === FIXED;
  let due, end, durationMs;
  if (fixed) {
    try {
      due = new Date(scheduleWallMillis(body.startLocal)); end = new Date(scheduleWallMillis(body.endLocal));
    } catch (error) {
      if (error instanceof GroupScheduleError) stop('INVALID_TIME', error.message, 400);
      throw error;
    }
    durationMs = end - due;
  } else {
    const h = Number(normalizeDigits(body.hours ?? 0)), m = Number(normalizeDigits(body.minutes ?? 0));
    if (!Number.isSafeInteger(h) || !Number.isSafeInteger(m) || h < 0 || m < 0 || m > 59) stop('INVALID_DURATION', 'برآورد زمانی معتبر نیست.', 400);
    durationMs = (h * 60 + m) * 60000;
  }
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) stop('INVALID_DURATION', 'پایان باید بعد از شروع و مدت باید مثبت باشد.', 400);
  return run(async (tx, state) => {
    const owners = await tx(`/* scheduler:owner */ SELECT TaskID, Complited FROM dbo.Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ?`, [tid]);
    if (!owners.length) stop('TASK_NOT_FOUND', 'کار موردنظر پیدا نشد.', 404);
    if (!state.members.length) {
      if (fixed) {
        const conflicts = await legacy.findFixedOverlaps(tid, due, end, tx);
        if (conflicts.length) return { success: false, overlap: true, conflicts: conflicts.map((row) => row.TaskID) };
      } else ({ due, end } = await legacy.computeNonFixedSchedule(tid, priority, durationMs, tx));
      await legacy.upsertTimeDate(tid, priority, fixed ? 1 : 0, legacy.durationToStr(durationMs), due, end, tx);
      await legacy.syncTskTable(tid, priority, fixed ? 1 : 0, legacy.durationToStr(durationMs), due, end, tx);
      await legacy.sortNonFixedTasks(tid, due, end, tx);
      await tx(`UPDATE Tsk_tbl SET Temporary = 0 WHERE TaskID = ?`, [tid]);
      return { success: true, due: dbToWall(due), end: dbToWall(end) };
    }
    // Older forms do not supply a group version yet: fail safely instead of
    // writing one member from a stale window. New group UI must provide it.
    const gid = state.memberMap.get(tid);
    if (gid) {
      if (!body.expectedGroupVersion) stop('GROUP_VERSION_REQUIRED', 'اطلاعات گروه را تازه‌سازی و از فرم گروه‌آگاه استفاده کنید.', 428);
      if (taskGroupVersion(body.expectedGroupVersion) !== state.groupMap.get(gid).Version) stop('GROUP_CHANGED', 'گروه پس از بازشدن پنجره تغییر کرده است.');
    }
    const before = await loadTasks(tx, state), next = new Map([...before].map(([id, row]) => [id, { ...row }]));
    if (!next.has(tid) || Number(owners[0].Complited) === 1) stop('TASK_NOT_SCHEDULABLE', 'در حالت گروهی، زمان‌بندی کار تکمیل‌شده باید جداگانه بررسی شود.');
    const targets = gid ? state.members.filter((member) => Number(member.GroupID) === gid && Number(next.get(Number(member.TaskID))?.Complited) === 0).map((member) => Number(member.TaskID)) : [tid];
    if (!fixed) {
      const wh = await loadWorkHoursFromSettings(tx);
      due = ceilMinute(legacy.calculateInitialDueDateTime(nowWall(), wh)); end = new Date(due.getTime() + durationMs);
    }
    for (const id of targets) Object.assign(next.get(id), { Priorities: priority, TaskPriority: priority, FixedDueTime: fixed ? 1 : 0, TaskFixed: fixed ? 1 : 0, Durationtime: legacy.durationToStr(durationMs), DueDateTime: due, EndDateTime: end, TimeDateID: next.get(id).TimeDateID ?? -1 });
    const plan = await calculate(tx, state, next); // validate everything before the first write
    const touched = await persist(tx, state, before, plan);
    for (const id of targets) await tx(`UPDATE Tsk_tbl SET Temporary = 0 WHERE TaskID = ?`, [id]);
    const versions = await touch(tx, state, touched);
    const selected = plan.assignments.find((row) => row.taskId === tid);
    return { success: true, due: selected.startLocal, end: selected.endLocal, affectedTaskIds: targets, groupVersion: gid ? versions[gid] || state.groupMap.get(gid).Version : null };
  });
}

export async function moveFixedTaskSchedules(value) {
  const minutes = Number(normalizeDigits(value));
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(minutes * 60000)) stop('INVALID_SHIFT', 'مقدار جابه‌جایی باید دقیقهٔ صحیح باشد.', 400);
  return run(async (tx, state) => {
    if (!state.members.length) return legacy.moveFixedTasksForward(minutes, tx);
    const before = await loadTasks(tx, state), next = new Map([...before].map(([id, row]) => [id, { ...row }]));
    for (const row of next.values()) if (Number(row.Complited) === 0 && row.TimeDateID != null && Number(row.FixedDueTime) === 1) {
      row.DueDateTime = new Date(scheduleWallMillis(row.DueDateTime) + minutes * 60000);
      row.EndDateTime = new Date(scheduleWallMillis(row.EndDateTime) + minutes * 60000);
    }
    const plan = await calculate(tx, state, next);
    const touched = await persist(tx, state, before, plan); await touch(tx, state, touched);
    return plan.assignments.filter((row) => !row.fixed).length;
  });
}

export async function correctTaskPriorities() {
  return run(async (tx, state) => {
    if (!state.members.length) return legacy.correctPriorityNames(tx);
    const byId = await loadTasks(tx, state);
    const all = await tx(`/* scheduler:priority-names */ SELECT TaskID, Priorities FROM dbo.Tsk_tbl ORDER BY TaskID`, []);
    const changes = all.filter((row) => NORMAL_NAMES[row.Priorities]);
    for (const row of changes) if (byId.has(Number(row.TaskID))) Object.assign(byId.get(Number(row.TaskID)), { TaskPriority: NORMAL_NAMES[row.Priorities], Priorities: NORMAL_NAMES[row.Priorities] });
    buildGroupScheduleUnits(coreInput(byId, state));
    const touched = new Set();
    for (const row of changes) {
      await tx(`UPDATE Tsk_tbl SET Priorities = ? WHERE TaskID = ?`, [NORMAL_NAMES[row.Priorities], row.TaskID]);
      await tx(`UPDATE TimeDate_tbl SET Priorities = ? WHERE TaskID = ?`, [NORMAL_NAMES[row.Priorities], row.TaskID]);
      if (state.memberMap.has(Number(row.TaskID))) touched.add(state.memberMap.get(Number(row.TaskID)));
    }
    await touch(tx, state, touched); return changes.length;
  });
}

export async function increaseTaskPriorities() {
  return run(async (tx, state) => {
    const rows = await tx(`/* scheduler:activity */ SELECT tsk.TaskID, tsk.Complited, tsk.Priorities,
      tsk.FixedDueTime, tsk.Submit_Date,
      (SELECT MAX(f.EndDateTime) FROM dbo.Follow_tbl f WHERE f.TaskID = tsk.TaskID) AS LastFollow
      FROM dbo.Tsk_tbl tsk WITH (UPDLOCK, HOLDLOCK) WHERE tsk.Complited = 0 ORDER BY tsk.TaskID`, []);
    const units = new Map();
    for (const row of rows) {
      if (Number(row.FixedDueTime) === 1) continue;
      const gid = state.memberMap.get(Number(row.TaskID)), key = gid ? `g:${gid}` : `t:${row.TaskID}`;
      if (!units.has(key)) units.set(key, { gid, rows: [] }); units.get(key).rows.push(row);
    }
    const now = nowWall(), changes = [];
    for (const unit of units.values()) {
      const priority = unit.rows[0].Priorities;
      if (unit.rows.some((row) => row.Priorities !== priority)) stop('GROUP_PRIORITY_MISMATCH', 'اولویت اعضای فعال گروه متفاوت است.');
      const rule = INCREASE[priority]; if (!rule) continue;
      const activity = unit.rows.map((row) => asDate(row.LastFollow || row.Submit_Date).getTime());
      if (activity.some((value) => !Number.isFinite(value))) stop('INVALID_ACTIVITY_TIME', 'تاریخ مبنای افزایش اولویت معتبر نیست.');
      if (Math.floor((now.getTime() - Math.max(...activity)) / 86400000) > rule.days) changes.push({ ...unit, old: priority, priority: rule.to });
    }
    if (!changes.length) return 0;
    let before, plan;
    if (state.members.length) {
      before = await loadTasks(tx, state);
      const next = new Map([...before].map(([id, row]) => [id, { ...row }]));
      for (const change of changes) for (const row of change.rows) if (next.has(Number(row.TaskID))) Object.assign(next.get(Number(row.TaskID)), { Priorities: change.priority, TaskPriority: change.priority });
      plan = await calculate(tx, state, next);
    }
    const touched = new Set(); let count = 0;
    for (const change of changes) {
      const batchId = change.gid ? randomUUID() : null;
      if (batchId) await tx(`INSERT INTO dbo.TaskGroupFollowBatch (BatchID, GroupID, OriginTaskID) VALUES (?, ?, ?)`, [batchId, change.gid, change.rows[0].TaskID]);
      for (const row of change.rows) {
        await tx(`UPDATE Tsk_tbl SET Priorities = ? WHERE TaskID = ?`, [change.priority, row.TaskID]);
        await tx(`UPDATE TimeDate_tbl SET Priorities = ? WHERE TaskID = ?`, [change.priority, row.TaskID]);
        const inserted = await tx(`INSERT INTO Follow_tbl (TaskID, DueDateTime, EndDateTime, Description, Duration, Priorities, LastPriority)
          OUTPUT INSERTED.FollowID VALUES (?, ?, ?, ?, ?, ?, ?)`, [row.TaskID, formatSqlDateTime(now), formatSqlDateTime(new Date(now.getTime() + 60000)), 'افزایش الویت', '00:01:00', change.priority, change.old]);
        if (batchId) {
          if (inserted.length !== 1) stop('FOLLOW_INSERT_FAILED', 'شناسهٔ سابقهٔ افزایش اولویت دریافت نشد.');
          await tx(`INSERT INTO dbo.TaskGroupFollowLink (BatchID, TaskID, FollowID) VALUES (?, ?, ?)`, [batchId, row.TaskID, inserted[0].FollowID]);
          touched.add(change.gid);
        }
        count++;
      }
    }
    if (state.members.length) {
      for (const gid of await persist(tx, state, before, plan)) touched.add(gid);
      await touch(tx, state, touched);
    } else await legacy.rescheduleAll(tx);
    return count;
  });
}

export function schedulerFailure(error) {
  if (error instanceof GroupScheduleError && error.code === 'FIXED_CONFLICT') {
    const ids = [...new Set(error.details.conflicts.flatMap((row) => row.taskIds))];
    return { status: 200, body: { success: false, overlap: true, conflicts: ids, error: error.message } };
  }
  if (error instanceof TaskGroupError || error instanceof GroupScheduleError) return { status: error.status || 409, body: { success: false, error: error.message, code: error.code } };
  return { status: 500, body: { success: false, error: 'عملیات زمان‌بندی انجام نشد؛ وضعیت را تازه‌سازی و دوباره بررسی کنید.' } };
}
