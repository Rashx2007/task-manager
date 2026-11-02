// Pure preview only. Input MUST be supplied by a trusted server-side reader;
// a client snapshot is never authorization to create a group or write schedules.
import { scheduleDurationMillis, scheduleWallMillis } from './task-group-schedule-core.mjs';

export class GroupCreationPlanError extends Error {
  constructor(code, message) { super(message); this.name = 'GroupCreationPlanError'; this.code = code; }
}
const fail = (code, message) => { throw new GroupCreationPlanError(code, message); };
const normalizeDigits = value => String(value).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const id = value => {
  if (typeof value !== 'string' && typeof value !== 'number') fail('INVALID_ID', 'شناسهٔ کار معتبر نیست.');
  const text = normalizeDigits(value).trim(), n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > 2147483647) fail('INVALID_ID', 'شناسهٔ کار معتبر نیست.');
  return n;
};
const asBit = value => value === true || value === 1 || value === '1' ? 1 : value === false || value === 0 || value === '0' ? 0 : null;
const priorities = new Set(['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم', 'زمان انجام ثابت']);
const toWall = millis => new Date(millis).toISOString().slice(0, 19).replace('T', ' ');
function schedule(row) {
  if (!row || typeof row !== 'object' || !priorities.has(row.Priorities)) throw Error('priority');
  const fixed = asBit(row.FixedDueTime);
  if (fixed === null || fixed !== Number(row.Priorities === 'زمان انجام ثابت')) throw Error('fixed');
  const durationMs = scheduleDurationMillis(row.Durationtime);
  const startMs = scheduleWallMillis(row.DueDateTime), endMs = scheduleWallMillis(row.EndDateTime);
  if (endMs <= startMs || endMs - startMs !== durationMs) throw Error('interval');
  return { priority: row.Priorities, fixed: Boolean(fixed), durationMs, start: toWall(startMs), end: toWall(endMs) };
}
const equalSchedule = (a, b) => a.priority === b.priority && a.fixed === b.fixed && a.durationMs === b.durationMs && a.start === b.start && a.end === b.end;

// snapshot = [{ task: DB task, timeRows: DB rows, currentMemberships: DB rows }]
// Returns a proposal, NEVER executes it. Completed tasks, unknown state, existing
// membership, missing/ambiguous schedule, and inconsistent task/time rows block.
export function planGroupCreation({ selectedTaskIds, referenceTaskId, snapshot } = {}) {
  if (!Array.isArray(selectedTaskIds) || selectedTaskIds.length < 2 || selectedTaskIds.length > 250) fail('INVALID_SELECTION', 'بین ۲ تا ۲۵۰ کار متفاوت انتخاب کنید.');
  const ids = selectedTaskIds.map(id);
  if (new Set(ids).size !== ids.length) fail('DUPLICATE_SELECTION', 'یک کار بیش از یک بار انتخاب شده است.');
  ids.sort((a, b) => a - b);
  const reference = id(referenceTaskId);
  if (!ids.includes(reference)) fail('INVALID_REFERENCE', 'کار مرجع باید یکی از کارهای انتخاب‌شده باشد.');
  if (!Array.isArray(snapshot) || snapshot.length !== ids.length) fail('INVALID_SNAPSHOT', 'تصویر کارهای انتخاب‌شده کامل نیست.');
  const byId = new Map();
  for (const entry of snapshot) {
    if (!entry || !entry.task || !Array.isArray(entry.timeRows) || !Array.isArray(entry.currentMemberships)) fail('INVALID_SNAPSHOT', 'اطلاعات یکی از کارها کامل نیست.');
    const taskId = id(entry.task.TaskID);
    if (!ids.includes(taskId) || byId.has(taskId)) fail('INVALID_SNAPSHOT', 'تصویر کارها تکراری یا متعلق به انتخاب دیگری است.');
    byId.set(taskId, entry);
  }
  const blockers = [], states = [];
  for (const taskId of ids) {
    const { task, timeRows, currentMemberships } = byId.get(taskId);
    if (task.Complited == null || asBit(task.Complited) === null) blockers.push({ taskId, code: 'INVALID_STATUS' });
    else if (asBit(task.Complited) === 1) blockers.push({ taskId, code: 'COMPLETED_TASK' });
    if (currentMemberships.length !== 0) blockers.push({ taskId, code: 'ALREADY_GROUPED' });
    if (timeRows.length !== 1) {
      blockers.push({ taskId, code: timeRows.length ? 'MULTIPLE_SCHEDULE_ROWS' : 'MISSING_SCHEDULE' });
      continue;
    }
    const row = timeRows[0];
    if (!row || id(row.TaskID) !== taskId) fail('INVALID_SNAPSHOT', 'مالک ردیف زمان‌بندی با کار انتخاب‌شده تطابق ندارد.');
    try {
      const taskSchedule = schedule(task), timeSchedule = schedule(row);
      if (!equalSchedule(taskSchedule, timeSchedule)) blockers.push({ taskId, code: 'TASK_TIME_SCHEDULE_MISMATCH' });
      else states.push({ taskId, schedule: taskSchedule });
    } catch {
      blockers.push({ taskId, code: 'INVALID_SCHEDULE' });
    }
  }
  if (blockers.length) return { ready: false, referenceTaskId: reference, selectedTaskIds: ids, blockers, proposal: null };
  const target = states.find(state => state.taskId === reference).schedule;
  const members = states.map(({ taskId, schedule: before }) => ({
    taskId, before: { ...before }, after: { ...target }, changesSchedule: !equalSchedule(before, target),
  }));
  return { ready: true, referenceTaskId: reference, selectedTaskIds: ids, blockers: [], proposal: {
    schedule: { ...target }, members, requiresScheduleConfirmation: members.some(member => member.changesSchedule),
  } };
}
