 
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
// شروع مرتب‌سازی: رُند به بالا تا ضریب step دقیقه، سپس تطبیق با ساعات و روزهای کاری
// (پنجشنبه و جمعه تعطیل؛ پیش از شروع کار، زمان استراحت و پس از پایان کار جابه‌جا می‌شود).
const DAY_MS = 86400000;
export function ceilToStepMinutes(date, step = 5) {
const ms = step * 60000;
return new Date(Math.ceil(new Date(date).getTime() / ms) * ms);
}
export function isWorkDay(d) { const w = new Date(d).getUTCDay(); return w !== 4 && w !== 5; }
export function normalizeScheduleStart(date, wh, step = 5) {
let d = ceilToStepMinutes(date, step);
const setAt = (x, t) => { const y = new Date(x); y.setUTCHours(t.getUTCHours(), t.getUTCMinutes(), 0, 0); return y; };
for (let i = 0; i < 40; i++) {
const t = sod(d);
let n = d;
if (!isWorkDay(d)) n = setAt(new Date(d.getTime() + DAY_MS), wh.startWork);
else if (t < sod(wh.startWork)) n = setAt(d, wh.startWork);
else if (t >= sod(wh.restStart) && t < sod(wh.restEnd)) n = setAt(d, wh.restEnd);
else if (t >= sod(wh.endWork)) n = setAt(new Date(d.getTime() + DAY_MS), wh.startWork);
n = ceilToStepMinutes(n, step);
if (n.getTime() === d.getTime()) return d;
d = n;
}
return d;
}
// فقط «YYYY-MM-DD HH:mm» (یا با T) و مقدار تقویمی واقعی؛ در غیر این صورت null.
export function parseStartLocal(v) {
if (typeof v !== 'string') return null;
const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::00)?$/);
if (!m) return null;
const [y, mo, da, h, mi] = m.slice(1).map(Number);
const d = new Date(Date.UTC(y, mo - 1, da, h, mi));
if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da || d.getUTCHours() !== h || d.getUTCMinutes() !== mi) return null;
return d;
}
export async function checkTimeDateExists(taskId, execute = query) {
const r = await execute(`SELECT TimeDateID FROM TimeDate_tbl WHERE TaskID = ?`, [taskId]);
return r.length > 0;
}
export async function upsertTimeDate(taskId, priority, fixed, durStr, due, end, execute = query) {
const now = nowWall();
const exists = await checkTimeDateExists(taskId, execute);
if (exists) {
await execute(`UPDATE TimeDate_tbl SET Priorities=?, FixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=? WHERE TaskID=?`,
[priority, fixed, durStr, formatSqlDateTime(due), formatSqlDateTime(end), taskId]);
} else {
await execute(`INSERT INTO TimeDate_tbl (TaskID, Submit_Date, Submit_Time, Priorities, FixedDueTime, Durationtime, DueDateTime, EndDateTime) VALUES (?,?,?,?,?,?,?,?)`,
[taskId, formatSqlDateTime(now), timeStr(now), priority, fixed, durStr, formatSqlDateTime(due), formatSqlDateTime(end)]);
}
}
export async function syncTskTable(taskId, priority, fixed, durStr, due, end, execute = query) {
await execute(`UPDATE Tsk_tbl SET Priorities=?, fixedDueTime=?, Durationtime=?, DueDateTime=?, EndDateTime=?, Due_Date=?, Due_Time=?, End_Date=?, End_Time=? WHERE TaskID=?`,
[priority, fixed, durStr, formatSqlDateTime(due), formatSqlDateTime(end), formatSqlDateTime(due), timeStr(due), formatSqlDateTime(end), timeStr(end), taskId]);
}
export async function findFixedOverlaps(taskId, due, end, execute = query) {
return execute(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, TD.EndDateTime, tsk.Complited FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID WHERE ((TD.DueDateTime >= ? AND TD.DueDateTime < ?) OR (TD.DueDateTime <= ? AND TD.EndDateTime > ?)) AND TD.TaskID <> ? AND tsk.Complited = 0 AND TD.Priorities = N'زمان انجام ثابت' ORDER BY TD.DueDateTime`,
[formatSqlDateTime(due), formatSqlDateTime(end), formatSqlDateTime(due), formatSqlDateTime(due), taskId]);
}
export async function findNonFixedAfter(taskId, due, execute = query) {
return execute(`SELECT DISTINCT TD.TaskID, TD.Priorities, TD.FixedDueTime, TD.Durationtime, TD.DueDateTime, TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID WHERE ((TD.DueDateTime >= ?) OR (TD.DueDateTime <= ? AND TD.EndDateTime > ?)) AND TD.TaskID <> ? AND tsk.Complited = 0 AND TD.FixedDueTime = 0 ORDER BY TD.Priorities, TD.DueDateTime`,
[formatSqlDateTime(due), formatSqlDateTime(due), formatSqlDateTime(due), taskId]);
}
export async function initializeDueDateTime(taskId, priority, execute = query) {
const lower = await execute(`SELECT TD.TaskID, TD.DueDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID WHERE TD.Priorities > ? AND TD.TaskID <> ? AND TD.FixedDueTime <> 1 AND tsk.Complited = 0 ORDER BY TD.Priorities, TD.DueDateTime`, [priority, taskId]);
if (lower.length) return new Date(lower[0].DueDateTime);
const last = await execute(`SELECT TOP 1 TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID WHERE tsk.Complited = 0 AND TD.FixedDueTime <> 1 ORDER BY TD.Priorities DESC, TD.DueDateTime DESC`);
if (last.length && last[0].EndDateTime) return new Date(last[0].EndDateTime);
return nowWall();
}
export async function computeNonFixedSchedule(taskId, priority, durMs, execute = query) {
const wh = await loadWorkHoursFromSettings(execute);
const due = correctDueDateTime(await initializeDueDateTime(taskId, priority, execute), wh);
const end = new Date(due.getTime() + durMs);
return { due, end };
}
export async function sortNonFixedTasks(taskId, insertDue, startCursor, execute = query) {
const wh = await loadWorkHoursFromSettings(execute);
const rows = await findNonFixedAfter(taskId, insertDue, execute);
let cursor = new Date(startCursor);
for (const row of rows) {
const dur = parseDuration(row.Durationtime);
let due = correctDueDateTime(cursor, wh);
let end = new Date(due.getTime() + dur);
for (let g = 0; g < 20; g++) {
const conf = await findFixedOverlaps(row.TaskID, due, end, execute);
if (!conf.length) break;
due = normalizeScheduleStart(new Date(conf[conf.length - 1].EndDateTime), wh, 1);
end = new Date(due.getTime() + dur);
}
await execute(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [formatSqlDateTime(due), formatSqlDateTime(end), row.TaskID]);
await syncTskTable(row.TaskID, row.Priorities, 0, row.Durationtime, due, end, execute);
cursor = end;
}
}
export async function rescheduleAll(execute = query, startAt = null, report = null) {
const wh = await loadWorkHoursFromSettings(execute);
const rows = await execute(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, tsk.TaskTtl FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID WHERE (TD.Priorities <> N'زمان انجام ثابت') AND (tsk.Complited = 0) ORDER BY TD.Priorities, TD.DueDateTime`);
const queue = rows.map(r => ({ row: r, dur: parseDuration(r.Durationtime) }));
const atTime = (x, t) => { const y = new Date(x); y.setUTCHours(t.getUTCHours(), t.getUTCMinutes(), 0, 0); return y; };
const windowEnd = d => (sod(d) < sod(wh.restStart) && sod(wh.restStart) < sod(wh.restEnd)) ? atTime(d, wh.restStart) : atTime(d, wh.endWork);
const place = async (row, due, end) => {
await execute(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [formatSqlDateTime(due), formatSqlDateTime(end), row.TaskID]);
await syncTskTable(row.TaskID, row.Priorities, 0, row.Durationtime, due, end, execute);
};
let cursor = normalizeScheduleStart(startAt || nowWall(), wh, 5);
let idle = 0;
// تقسیم کار بلند: فقط وقتی مدت از بزرگ‌ترین پنجرهٔ کاری روزانه بیشتر باشد و جدول TaskSegment_tbl وجود داشته باشد
const MIN_SEG = 15 * 60000;
const hasSeg = ((await execute(`SELECT OBJECT_ID(N'dbo.TaskSegment_tbl') AS id`).catch(() => [])) || [])[0]?.id != null;
const secs = (a, b2) => (sod(b2) - sod(a)) * 1000;
const hasRest = sod(wh.restStart) < sod(wh.restEnd) && sod(wh.startWork) < sod(wh.restStart) && sod(wh.restEnd) < sod(wh.endWork);
const maxWin = hasRest ? Math.max(secs(wh.startWork, wh.restStart), secs(wh.restEnd, wh.endWork)) : secs(wh.startWork, wh.endWork);
if (hasSeg && queue.length) await execute(`DELETE FROM TaskSegment_tbl WHERE TaskID IN (${queue.map(() => '?').join(',')})`, queue.map(q => q.row.TaskID));
const placeSplit = async (row, dur) => {
const segs = []; let remaining = dur, c = cursor;
for (let g = 0; g < 400 && remaining > 0; g++) {
const d = normalizeScheduleStart(c, wh, 1), lim = windowEnd(d);
const fx = await findFixedOverlaps(0, d, lim, execute);
let freeEnd = lim;
if (fx.length) { const f0 = new Date(fx[0].DueDateTime); if (f0 <= d) { c = new Date(fx[0].EndDateTime); continue; } freeEnd = f0; }
const avail = freeEnd - d;
if (avail < MIN_SEG) { c = new Date(freeEnd.getTime() + 60000); if (!fx.length) c = new Date(lim.getTime() + 60000); else c = new Date(fx[0].EndDateTime); continue; }
const take = Math.min(avail, remaining);
segs.push({ due: d, end: new Date(d.getTime() + take) }); remaining -= take; c = new Date(d.getTime() + take);
}
if (remaining > 0 || !segs.length) return false;
await place(row, segs[0].due, segs[0].end);
for (let k = 1; k < segs.length; k++) await execute(`INSERT INTO TaskSegment_tbl (TaskID, SegNo, DueDateTime, EndDateTime) VALUES (?, ?, ?, ?)`, [row.TaskID, k + 1, formatSqlDateTime(segs[k].due), formatSqlDateTime(segs[k].end)]);
if (report && Array.isArray(report.split)) report.split.push({ taskId: row.TaskID, title: row.TaskTtl || '', priority: row.Priorities, durationMinutes: Math.round(dur / 60000), segments: segs.map(x => ({ start: formatSqlDateTime(x.due), end: formatSqlDateTime(x.end) })) });
cursor = segs[segs.length - 1].end;
return true;
};
while (queue.length) {
const due = normalizeScheduleStart(cursor, wh, 1);
const limit = windowEnd(due);
let pick = -1, end = null;
for (let i = 0; i < queue.length; i++) {
if (hasSeg && queue[i].dur > maxWin) {
const q = queue[i];
if (await placeSplit(q.row, q.dur)) { queue.splice(i, 1); idle = 0; pick = -2; break; }
continue;
}
const e = new Date(due.getTime() + queue[i].dur);
if (e > limit) continue;
const conf = await findFixedOverlaps(queue[i].row.TaskID, due, e, execute);
if (conf.length) continue;
pick = i; end = e; break;
}
if (pick === -2) continue;
if (pick >= 0) {
const { row } = queue.splice(pick, 1)[0];
await place(row, due, end);
idle = 0; cursor = end; continue;
}
// اگر کار ثابتی در همین پنجره هست، ادامهٔ چینش بعد از پایان آن است (نه روز بعد)
const blockers = await findFixedOverlaps(0, due, limit, execute);
const fixedEnd = blockers.length ? new Date(blockers[0].EndDateTime) : null;
if (fixedEnd && fixedEnd > due) { cursor = fixedEnd; continue; }
idle++;
if (idle < 10) { cursor = new Date(Math.max(limit.getTime(), due.getTime()) + 60000); continue; }
// پس از ۱۰ بازهٔ بی‌نتیجه، اولین کار بدون تغییر رها می‌شود و در گزارش می‌آید
const { row, dur } = queue.shift();
if (report && Array.isArray(report.skipped)) report.skipped.push({ taskId: row.TaskID, title: row.TaskTtl || '', priority: row.Priorities, durationMinutes: Math.round(dur / 60000), currentDue: row.DueDateTime ? formatSqlDateTime(new Date(row.DueDateTime)) : null });
idle = 0;
}
return rows.length;
}
export async function moveFixedTasksForward(minutes, execute = query) {
const ms = (Number(minutes) || 0) * 60000;
const fixed = await execute(`SELECT TD.TaskID, TD.Durationtime, TD.DueDateTime, TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID WHERE (TD.FixedDueTime = 1) AND (tsk.Complited = 0) ORDER BY TD.DueDateTime`);
for (const row of fixed) {
const due = new Date(new Date(row.DueDateTime).getTime() + ms);
const end = new Date(new Date(row.EndDateTime).getTime() + ms);
await execute(`UPDATE TimeDate_tbl SET DueDateTime=?, EndDateTime=? WHERE TaskID=?`, [formatSqlDateTime(due), formatSqlDateTime(end), row.TaskID]);
await syncTskTable(row.TaskID, 'زمان انجام ثابت', 1, row.Durationtime, due, end, execute);
}
return rescheduleAll(execute);
}
export async function correctPriorityNames(execute = query) {
const rows = await execute(`SELECT TaskID, Priorities FROM Tsk_tbl ORDER BY DueDateTime`);
const map = { '(اضطراری)': '0.آنی', '(اضطراري)': '0.آنی', '1': '1.خیلی بالا', '2': '2.بالا', '3': '3.متوسط', '4': '4.کم', '5': '5.خیلی کم' };
let count = 0;
for (const r of rows) {
const np = map[r.Priorities];
if (np) {
await execute(`UPDATE Tsk_tbl SET Priorities=? WHERE TaskID=?`, [np, r.TaskID]);
await execute(`UPDATE TimeDate_tbl SET Priorities=? WHERE TaskID=?`, [np, r.TaskID]);
count++;
}
}
return count;
}