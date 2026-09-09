// lib/timedate-logic.js
import { query } from './db';

const pad = (n) => String(n).padStart(2, '0');

export function fmtDT(v) {
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function fmtT(v) {
  const d = new Date(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function toTime(v) {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  const p = String(v).split(':');
  const d = new Date(0);
  d.setHours(parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0, 0);
  return d;
}
export function parseDuration(str) {
  const p = String(str || '0:0:0').split(':').map((x) => parseInt(x, 10) || 0);
  return ((p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0)) * 1000;
}
export function durationToStr(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// معادل LoadSetting در C#
export async function loadWorkHours() {
  const wh = {
    startWork: toTime('08:00:00'), restStart: toTime('12:00:00'),
    restEnd: toTime('13:00:00'), endWork: toTime('16:00:00'),
  };
  try {
    const rows = await query(`SELECT TOP 1 StartWorkTime, restTimeStart, restTimeEnd, EndWorkTime FROM Set_tbl`);
    if (rows.length) {
      const r = rows[0];
      wh.startWork = toTime(r.StartWorkTime); wh.restStart = toTime(r.restTimeStart);
      wh.restEnd = toTime(r.restTimeEnd); wh.endWork = toTime(r.EndWorkTime);
    }
  } catch {}
  return wh;
}
const sod = (d) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

// معادل Correct_dueDateTime
export function correctDueDateTime(ddt, wh) {
  const d = new Date(ddt);
  if (sod(d) >= sod(wh.restStart) && sod(d) < sod(wh.restEnd)) {
    d.setHours(wh.restEnd.getHours(), wh.restEnd.getMinutes(), 0, 0);
  } else if (sod(d) >= sod(wh.endWork)) {
    d.setDate(d.getDate() + 1);
    d.setHours(wh.startWork.getHours(), wh.startWork.getMinutes(), 0, 0);
  }
  return d;
}

export async function checkTimeDateExists(taskId) {
  const r = await query(`SELECT TimeDateID FROM TimeDate_tbl WHERE TaskID = ?`, [taskId]);
  return r.length > 0;
}
export async function loadTimeDate(taskId) {
  return query(`SELECT * FROM TimeDate_tbl WHERE TaskID = ?`, [taskId]);
}

// معادل AddtoTimeDate / EditTimeDate (+ Finish_DateTime در حالت اتمام)
export async function upsertTimeDate(taskId, submitDate, submitTime, priority, fixed, durStr, due, end, finish) {
  const exists = await checkTimeDateExists(taskId);
  if (exists) {
    if (finish) {
      await query(`UPDATE TimeDate_tbl SET Priorities=?, FixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=?, Finish_DateTime=? WHERE TaskID=?`,
        [priority, fixed, durStr, fmtDT(due), fmtDT(end), fmtDT(finish), taskId]);
    } else {
      await query(`UPDATE TimeDate_tbl SET Priorities=?, FixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=? WHERE TaskID=?`,
        [priority, fixed, durStr, fmtDT(due), fmtDT(end), taskId]);
    }
  } else {
    let cols = 'TaskID, Submit_Date, Submit_Time, Priorities, FixedDueTime, Durationtime, DueDateTime, EndDateTime';
    let vals = '?,?,?,?,?,?,?,?';
    const params = [taskId, fmtDT(submitDate), fmtT(submitTime), priority, fixed, durStr, fmtDT(due), fmtDT(end)];
    if (finish) { cols += ', Finish_DateTime'; vals += ',?'; params.push(fmtDT(finish)); }
    await query(`INSERT INTO TimeDate_tbl (${cols}) VALUES (${vals})`, params);
  }
}

// معادل Setting_Values + UpdateDate_Prio (همگام‌سازی Tsk_tbl)
export async function syncTsk(taskId, priority, fixed, durStr, due, end) {
  await query(`UPDATE Tsk_tbl SET Priorities=?, fixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=?, Due_Date=?, Due_Time=?, End_Date=?, End_Time=? WHERE TaskID=?`,
    [priority, fixed, durStr, fmtDT(due), fmtDT(end), fmtDT(due), fmtT(due), fmtDT(end), fmtT(end), taskId]);
}

export async function completeTask(taskId) {
  await query(`UPDATE Tsk_tbl SET Complited = 1 WHERE TaskID = ?`, [taskId]);
}
export async function takeOutOfTemporary(taskId) {
  await query(`UPDATE Tsk_tbl SET Temporary = 0 WHERE TaskID = ?`, [taskId]);
}
// معادل Get_MAX_finish_time_from_follow_tbl_for_this_TaskID
export async function getMaxFinishFromFollow(taskId) {
  const r = await query(`SELECT MAX(EndDateTime) AS Finish FROM Follow_tbl WHERE TaskID = ?`, [taskId]);
  return r[0] && r[0].Finish ? new Date(r[0].Finish) : new Date();
}
// معادل DTLowerPriority
export async function dtLowerPriority(taskId, priority) {
  return query(`SELECT TD.TaskID, TD.Durationtime, TD.DueDateTime, TD.EndDateTime
    FROM TimeDate_tbl TD LEFT OUTER JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE (TD.Priorities > ?) AND (TD.TaskID <> ?) AND (TD.FixedDueTime <> 1) AND (tsk.Complited = 0)
    ORDER BY TD.Priorities, TD.DueDateTime`, [priority, taskId]);
}
// معادل Finding_Last_Task_EndDateTime
export async function lastTaskEndDateTime() {
  const r = await query(`SELECT TOP(1) TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE (tsk.Complited = 0) AND (TD.FixedDueTime <> 1)
    ORDER BY TD.Priorities DESC, TD.DueDateTime DESC`);
  return r.length ? new Date(r[0].EndDateTime) : null;
}
// معادل Initializing_DueDateTime
export async function initializeDueDateTime(taskId, priority) {
  const lower = await dtLowerPriority(taskId, priority);
  if (lower.length) return new Date(lower[0].DueDateTime);
  const last = await lastTaskEndDateTime();
  return last || new Date();
}
// معادل Finding_Fix_Tasks_Overlapping_with_this_Task
export async function findFixedOverlaps(taskId, due, end) {
  return query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, TD.EndDateTime, tsk.Complited
    FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE (((TD.DueDateTime >= ? AND TD.DueDateTime < ?) OR (TD.DueDateTime <= ? AND TD.EndDateTime > ?)))
      AND (TD.TaskID <> ?) AND (tsk.Complited = 0) AND (TD.Priorities = N'زمان انجام ثابت')
    ORDER BY TD.DueDateTime`, [fmtDT(due), fmtDT(end), fmtDT(due), fmtDT(due), taskId]);
}
// معادل Finding_All_Fixed_Tasks
export async function findAllFixedTasks() {
  return query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, TD.EndDateTime, tsk.Complited
    FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE (tsk.Complited = 0) AND (TD.Priorities = N'زمان انجام ثابت')
    ORDER BY TD.DueDateTime`);
}
// معادل Finding_nonFix_Tasks_Overlapping_and_After_this_Task
export async function findNonFixAfter(taskId, due) {
  return query(`SELECT DISTINCT TD.TaskID, TD.Priorities, TD.FixedDueTime, TD.Durationtime, TD.DueDateTime, TD.EndDateTime
    FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE ((TD.DueDateTime >= ?) OR (TD.DueDateTime <= ? AND TD.EndDateTime > ?))
      AND (TD.TaskID <> ?) AND (tsk.Complited = 0) AND (TD.FixedDueTime = 0)
    ORDER BY TD.Priorities, TD.DueDateTime`, [fmtDT(due), fmtDT(due), fmtDT(due), taskId]);
}
// معادل Sort_nonFixed_Time_Tasks + Do_While_Conflict_With_Fixed
export async function sortNonFixedTasks(taskId, startDue) {
  const wh = await loadWorkHours();
  const rows = await findNonFixAfter(taskId, startDue);
  let cursor = new Date(startDue);
  for (const row of rows) {
    const dur = parseDuration(row.Durationtime);
    let due = correctDueDateTime(cursor, wh);
    let end = new Date(due.getTime() + dur);
    for (let g = 0; g < 20; g++) {
      const conf = await findFixedOverlaps(row.TaskID, due, end);
      if (!conf.length) break;
      due = correctDueDateTime(new Date(conf[conf.length - 1].EndDateTime), wh);
      end = new Date(due.getTime() + dur);
    }
    await query(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [fmtDT(due), fmtDT(end), row.TaskID]);
    await syncTsk(row.TaskID, row.Priorities, 0, row.Durationtime, due, end);
    cursor = end;
  }
}