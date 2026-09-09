import { query } from './db';
import { loadWorkHoursFromSettings, formatSqlDateTime, nowWall, timeStr } from './schedule-logic';

export function parseDuration(str) {
  const p = String(str || '0:0:0').split(':').map((x) => parseInt(x, 10) || 0);
  return ((p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0)) * 1000;
}
export function durationToStr(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const sod = (d) => d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();

export function roundUpToNext10Minutes(dt) {
  const d = new Date(dt);
  let m = Math.floor(d.getUTCMinutes() / 10) + 1; m *= 10;
  let h = d.getUTCHours();
  if (m === 60) { m = 0; h += 1; }
  d.setUTCHours(h, m, 0, 0);
  return d;
}

export function calculateInitialDueDateTime(now, wh) {
  const d = new Date(now);
  const day = d.getUTCDay();
  const t = sod(d);
  const at = (x, days) => { const y = new Date(x); y.setUTCDate(y.getUTCDate() + days); y.setUTCHours(wh.startWork.getUTCHours(), wh.startWork.getUTCMinutes(), 0, 0); return y; };
  if (t >= sod(wh.endWork) && day === 3) return at(d, 3);
  if (day === 4) return at(d, 2);
  if (day === 5) return at(d, 1);
  if (t >= sod(wh.endWork)) return at(d, 1);
  if (t >= sod(wh.restStart) && t < sod(wh.restEnd)) { const y = new Date(d); y.setUTCHours(wh.restEnd.getUTCHours(), wh.restEnd.getUTCMinutes(), 0, 0); return y; }
  if (t < sod(wh.startWork)) { const y = new Date(d); y.setUTCHours(wh.startWork.getUTCHours(), wh.startWork.getUTCMinutes(), 0, 0); return y; }
  return roundUpToNext10Minutes(d);
}

export function correctDueDateTime(date, wh) {
  const dt = new Date(date);
  if (sod(dt) < sod(wh.startWork)) dt.setUTCHours(wh.startWork.getUTCHours(), wh.startWork.getUTCMinutes(), 0, 0);
  else if (sod(dt) >= sod(wh.restStart) && sod(dt) < sod(wh.restEnd)) dt.setUTCHours(wh.restEnd.getUTCHours(), wh.restEnd.getUTCMinutes(), 0, 0);
  else if (sod(dt) >= sod(wh.endWork)) { dt.setUTCDate(dt.getUTCDate() + 1); dt.setUTCHours(wh.startWork.getUTCHours(), wh.startWork.getUTCMinutes(), 0, 0); }
  return dt;
}

export async function checkTimeDateExists(taskId) {
  const r = await query(`SELECT TimeDateID FROM TimeDate_tbl WHERE TaskID = ?`, [taskId]);
  return r.length > 0;
}

export async function upsertTimeDate(taskId, priority, fixed, durStr, due, end) {
  const now = nowWall();
  const exists = await checkTimeDateExists(taskId);
  if (exists) {
    await query(`UPDATE TimeDate_tbl SET Priorities=?, FixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=? WHERE TaskID=?`,
      [priority, fixed, durStr, formatSqlDateTime(due), formatSqlDateTime(end), taskId]);
  } else {
    await query(`INSERT INTO TimeDate_tbl (TaskID, Submit_Date, Submit_Time, Priorities, FixedDueTime, Durationtime, DueDateTime, EndDateTime) VALUES (?,?,?,?,?,?,?,?)`,
      [taskId, formatSqlDateTime(now), timeStr(now), priority, fixed, durStr, formatSqlDateTime(due), formatSqlDateTime(end)]);
  }
}

export async function syncTskTable(taskId, priority, fixed, durStr, due, end) {
  await query(`UPDATE Tsk_tbl SET Priorities=?, fixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=?, Due_Date=?, Due_Time=?, End_Date=?, End_Time=? WHERE TaskID=?`,
    [priority, fixed, durStr, formatSqlDateTime(due), formatSqlDateTime(end), formatSqlDateTime(due), timeStr(due), formatSqlDateTime(end), timeStr(end), taskId]);
}

export async function findFixedOverlaps(taskId, due, end) {
  return query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, TD.EndDateTime, tsk.Complited
    FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
    WHERE ((TD.DueDateTime >= ? AND TD.DueDateTime < ?) OR (TD.DueDateTime <= ? AND TD.EndDateTime > ?))
      AND TD.TaskID <> ? AND tsk.Complited = 0 AND TD.Priorities = N'زمان انجام ثابت' ORDER BY TD.DueDateTime`,
    [formatSqlDateTime(due), formatSqlDateTime(end), formatSqlDateTime(due), formatSqlDateTime(due), taskId]);
}

export async function findNonFixedAfter(taskId, due) {
  return query(`SELECT DISTINCT TD.TaskID, TD.Priorities, TD.FixedDueTime, TD.Durationtime, TD.DueDateTime, TD.EndDateTime
    FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
    WHERE ((TD.DueDateTime >= ?) OR (TD.DueDateTime <= ? AND TD.EndDateTime > ?)) AND TD.TaskID <> ? AND tsk.Complited = 0 AND TD.FixedDueTime = 0
    ORDER BY TD.Priorities, TD.DueDateTime`, [formatSqlDateTime(due), formatSqlDateTime(due), formatSqlDateTime(due), taskId]);
}

export async function initializeDueDateTime(taskId, priority) {
  const lower = await query(`SELECT TD.TaskID, TD.DueDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
    WHERE TD.Priorities > ? AND TD.TaskID <> ? AND TD.FixedDueTime <> 1 AND tsk.Complited = 0 ORDER BY TD.Priorities, TD.DueDateTime`, [priority, taskId]);
  if (lower.length) return new Date(lower[0].DueDateTime);
  const last = await query(`SELECT TOP 1 TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
    WHERE tsk.Complited = 0 AND TD.FixedDueTime <> 1 ORDER BY TD.Priorities DESC, TD.DueDateTime DESC`);
  if (last.length && last[0].EndDateTime) return new Date(last[0].EndDateTime);
  return nowWall();
}

export async function computeNonFixedSchedule(taskId, priority, durMs) {
  const wh = await loadWorkHoursFromSettings();
  let due = correctDueDateTime(await initializeDueDateTime(taskId, priority), wh);
  let end = new Date(due.getTime() + durMs);
  for (let g = 0; g < 50; g++) {
    const conf = await findFixedOverlaps(taskId, due, end);
    if (!conf.length) break;
    due = correctDueDateTime(new Date(conf[conf.length - 1].EndDateTime), wh);
    end = new Date(due.getTime() + durMs);
  }
  return { due, end };
}

export async function sortNonFixedTasks(taskId, startCursor) {
  const wh = await loadWorkHoursFromSettings();
  const rows = await findNonFixedAfter(taskId, startCursor);
  let cursor = new Date(startCursor);
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
    await query(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [formatSqlDateTime(due), formatSqlDateTime(end), row.TaskID]);
    await syncTskTable(row.TaskID, row.Priorities, 0, row.Durationtime, due, end);
    cursor = end;
  }
}

export async function rescheduleAll() {
  const wh = await loadWorkHoursFromSettings();
  const rows = await query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
    WHERE (TD.Priorities <> N'زمان انجام ثابت') AND (tsk.Complited = 0) ORDER BY TD.Priorities, TD.DueDateTime`);
  let cursor = calculateInitialDueDateTime(nowWall(), wh);
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
    await query(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [formatSqlDateTime(due), formatSqlDateTime(end), row.TaskID]);
    await syncTskTable(row.TaskID, row.Priorities, 0, row.Durationtime, due, end);
    cursor = end;
  }
  return rows.length;
}

export async function moveFixedTasksForward(minutes) {
  const ms = (Number(minutes) || 0) * 60000;
  const fixed = await query(`SELECT TD.TaskID, TD.Durationtime, TD.DueDateTime, TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
    WHERE (TD.FixedDueTime = 1) AND (tsk.Complited = 0) ORDER BY TD.DueDateTime`);
  for (const row of fixed) {
    const due = new Date(new Date(row.DueDateTime).getTime() + ms);
    const end = new Date(new Date(row.EndDateTime).getTime() + ms);
    await query(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [formatSqlDateTime(due), formatSqlDateTime(end), row.TaskID]);
    await syncTskTable(row.TaskID, 'زمان انجام ثابت', 1, row.Durationtime, due, end);
  }
  return rescheduleAll();
}

export async function correctPriorityNames() {
  const rows = await query(`SELECT TaskID, Priorities FROM Tsk_tbl ORDER BY DueDateTime`);
  const map = { '(اضطراری)': '0.آنی', '(اضطراري)': '0.آنی', '1': '1.خیلی بالا', '2': '2.بالا', '3': '3.متوسط', '4': '4.کم', '5': '5.خیلی کم' };
  let count = 0;
  for (const r of rows) {
    const np = map[r.Priorities];
    if (np) {
      await query(`UPDATE Tsk_tbl SET Priorities=? WHERE TaskID=?`, [np, r.TaskID]);
      await query(`UPDATE TimeDate_tbl SET Priorities=? WHERE TaskID=?`, [np, r.TaskID]);
      count++;
    }
  }
  return count;
}