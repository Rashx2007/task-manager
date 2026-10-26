// Pure planning only: no database, fetch, timers or implicit timezone conversion.
// Do not accept this module's input directly from a browser. A server adapter must
// obtain and lock a complete membership/schedule snapshot before planning/writing.
export class GroupScheduleError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'GroupScheduleError'; this.code = code; this.details = details;
  }
}
const fail = (code, message, details) => { throw new GroupScheduleError(code, message, details); };
const digits = (value) => String(value ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const id = (value) => {
  const text = digits(value).trim(), result = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(result) || result < 1 || result > 2147483647) fail('INVALID_ID', 'شناسهٔ زمان‌بندی معتبر نیست.');
  return result;
};
const PRIORITIES = ['0.آنی', '1.خیلی بالا', '2.بالا', '3.متوسط', '4.کم', '5.خیلی کم'];
const FIXED = 'زمان انجام ثابت';
const MAX_MEMBERS = 250;
const overlap = (a, b) => a.startMs < b.endMs && b.startMs < a.endMs;

export function scheduleWallMillis(value) {
  if (value instanceof Date) {
    const result = value.getTime();
    if (!Number.isFinite(result) || value.getUTCFullYear() < 1753 || value.getUTCFullYear() > 9999 || value.getUTCSeconds() !== 0 || value.getUTCMilliseconds() !== 0) fail('INVALID_WALL_TIME', 'زمان باید معتبر و با دقت دقیقه باشد.');
    return result;
  }
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.000)?Z?$/);
  if (!match) fail('INVALID_WALL_TIME', 'قالب زمان دیواری معتبر نیست.');
  const [year, month, day, hour, minute, second] = match.slice(1).map((v) => Number(v || 0));
  if (year < 1753 || year > 9999 || second !== 0) fail('INVALID_WALL_TIME', 'زمان خارج از قرارداد DATETIME یا دقت دقیقه است.');
  const result = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(result);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) fail('INVALID_WALL_TIME', 'تاریخ یا ساعت نامعتبر است.');
  return result;
}
function wallString(value) {
  const date = new Date(value), p = (n) => String(n).padStart(2, '0');
  if (!Number.isFinite(value) || date.getUTCFullYear() < 1753 || date.getUTCFullYear() > 9999) fail('TIME_OVERFLOW', 'زمان محاسبه‌شده خارج از محدوده است.');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:00`;
}
export function scheduleDurationMillis(value) {
  const match = digits(value).match(/^(\d+):([0-5]?\d):0{1,2}$/);
  if (!match) fail('INVALID_DURATION', 'مدت باید به‌شکل ساعت:دقیقه:ثانیه و با ثانیهٔ صفر باشد.');
  const hours = Number(match[1]), minutes = Number(match[2]);
  const result = (hours * 60 + minutes) * 60000;
  if (!Number.isSafeInteger(result) || result <= 0) fail('INVALID_DURATION', 'مدت باید مثبت و معتبر باشد.');
  return result;
}

export function buildGroupScheduleUnits({ tasks, groups = [], members = [] }) {
  if (![tasks, groups, members].every(Array.isArray)) fail('INVALID_SNAPSHOT', 'تصویر اطلاعات زمان‌بندی معتبر نیست.');
  const taskMap = new Map(), groupMap = new Map(), memberMap = new Map();
  for (const group of groups) {
    const groupId = id(group.GroupID);
    if (groupMap.has(groupId) || group.IsActive == null || ![0, 1].includes(Number(group.IsActive))) fail('INVALID_GROUP', 'اطلاعات گروه تکراری یا نامعتبر است.');
    groupMap.set(groupId, group);
  }
  for (const task of tasks) {
    const taskId = id(task.TaskID);
    if (taskMap.has(taskId)) fail('DUPLICATE_TASK', 'برای یک کار بیش از یک ردیف زمان‌بندی دریافت شده است.', { taskId });
    taskMap.set(taskId, task);
  }
  for (const member of members) {
    if (member.LeftAt != null) continue; // historical membership never reactivates
    const taskId = id(member.TaskID), groupId = id(member.GroupID);
    if (memberMap.has(taskId)) fail('MULTIPLE_GROUPS', 'یک کار بیش از یک عضویت جاری دارد.', { taskId });
    if (!taskMap.has(taskId)) fail('INCOMPLETE_GROUP', 'اطلاعات یکی از اعضای گروه دریافت نشده است.', { taskId, groupId });
    if (Number(groupMap.get(groupId)?.IsActive) !== 1) fail('INACTIVE_GROUP', 'عضویت جاری به یک گروه فعال تعلق ندارد.', { taskId, groupId });
    if (member.SyncEnabled == null || ![0, 1].includes(Number(member.SyncEnabled))) fail('INVALID_SYNC_STATE', 'وضعیت همگام‌سازی عضو معتبر نیست.');
    memberMap.set(taskId, { ...member, TaskID: taskId, GroupID: groupId });
  }
  const buckets = new Map();
  for (const [taskId, task] of taskMap) {
    if (Number(task.Complited ?? 0) === 1) continue;
    if (Number(task.Complited ?? 0) !== 0) fail('INVALID_TASK_STATUS', 'وضعیت کار برای زمان‌بندی معتبر نیست.', { taskId });
    const member = memberMap.get(taskId);
    const groupId = member && Number(member.SyncEnabled) === 1 ? member.GroupID : null;
    const key = groupId ? `group:${groupId}` : `task:${taskId}`;
    const fixed = task.Priorities === FIXED;
    if (!fixed && !PRIORITIES.includes(task.Priorities)) fail('INVALID_PRIORITY', 'اولویت زمان‌بندی معتبر نیست.', { taskId });
    if (task.FixedDueTime != null && Number(task.FixedDueTime) !== Number(fixed)) fail('FIXED_FLAG_MISMATCH', 'نوع زمان‌بندی و اولویت کار سازگار نیست.', { taskId });
    const durationMs = scheduleDurationMillis(task.Durationtime);
    const startMs = task.DueDateTime == null || task.DueDateTime === '' ? null : scheduleWallMillis(task.DueDateTime);
    const endMs = task.EndDateTime == null || task.EndDateTime === '' ? null : scheduleWallMillis(task.EndDateTime);
    if (fixed && (startMs == null || endMs == null || endMs <= startMs || endMs - startMs !== durationMs)) fail('INVALID_FIXED_INTERVAL', 'بازه و مدت زمان ثابت سازگار نیستند.', { taskId });
    const previous = buckets.get(key);
    if (previous && (previous.priority !== task.Priorities || previous.fixed !== fixed || previous.durationMs !== durationMs || (fixed && (previous.startMs !== startMs || previous.endMs !== endMs)))) fail('GROUP_SCHEDULE_MISMATCH', 'اولویت، مدت یا زمان ثابت اعضای گروه متفاوت است؛ پیش از ادامه مرجع مشترک را مشخص کنید.', { groupId, taskIds: [...previous.taskIds, taskId] });
    if (previous) {
      previous.taskIds.push(taskId);
      if (previous.taskIds.length > MAX_MEMBERS) fail('GROUP_TOO_LARGE', 'تعداد اعضای گروه بیش از حد مجاز است.');
      if (!fixed && startMs != null) previous.orderAt = Math.min(previous.orderAt, startMs);
    } else buckets.set(key, { key, groupId, taskIds: [taskId], priority: task.Priorities, fixed, durationMs, startMs, endMs, orderAt: startMs ?? Infinity });
  }
  return [...buckets.values()].map((unit) => ({ ...unit, taskIds: unit.taskIds.sort((a, b) => a - b) }));
}

export function planTaskGroupSchedule({ tasks, groups = [], members = [], startAt, adjustStart = (date) => date }) {
  if (typeof adjustStart !== 'function') fail('INVALID_NORMALIZER', 'تابع تنظیم ساعات کاری معتبر نیست.');
  const units = buildGroupScheduleUnits({ tasks, groups, members });
  const fixed = units.filter((unit) => unit.fixed).sort((a, b) => a.startMs - b.startMs || a.taskIds[0] - b.taskIds[0]);
  const conflicts = [];
  conflictScan: for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length && fixed[j].startMs < fixed[i].endMs; j++) {
      if (overlap(fixed[i], fixed[j])) {
        conflicts.push({ taskIds: [...fixed[i].taskIds, ...fixed[j].taskIds], groupIds: [fixed[i].groupId, fixed[j].groupId].filter((v) => v != null) });
        if (conflicts.length >= 100) break conflictScan;
      }
    }
  }
  if (conflicts.length) fail('FIXED_CONFLICT', 'بین واحدهای مستقل زمان ثابت تداخل وجود دارد.', { conflicts, limited: conflicts.length >= 100 });
  const pending = units.filter((unit) => !unit.fixed).sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || (a.orderAt === b.orderAt ? 0 : a.orderAt < b.orderAt ? -1 : 1) || a.taskIds[0] - b.taskIds[0]);
  let cursor = scheduleWallMillis(startAt);
  const normalize = (value) => {
    // Each callback receives a clone; it cannot mutate a prior task's interval.
    const next = scheduleWallMillis(adjustStart(new Date(value)));
    if (next < value) fail('BACKWARD_NORMALIZER', 'تنظیم ساعات کاری نباید زمان را به عقب ببرد.');
    return next;
  };
  const intervals = fixed.map((unit) => ({ ...unit }));
  for (const unit of pending) {
    let startMs = normalize(cursor), endMs = startMs + unit.durationMs;
    // Sorted blockers + monotonic movement: no arbitrary 20-retry limit.
    for (const blocker of fixed) {
      if (overlap({ startMs, endMs }, blocker)) {
        startMs = normalize(blocker.endMs); endMs = startMs + unit.durationMs;
      }
    }
    wallString(endMs); // detect overflow before returning any plan
    intervals.push({ ...unit, startMs, endMs }); cursor = endMs;
  }
  const assignments = intervals.flatMap((unit) => unit.taskIds.map((taskId) => ({
    taskId, groupId: unit.groupId, priority: unit.priority,
    fixed: unit.fixed, durationMs: unit.durationMs,
    startLocal: wallString(unit.startMs), endLocal: wallString(unit.endMs),
  }))).sort((a, b) => a.taskId - b.taskId);
  const sumDurations = (rows) => rows.reduce((sum, row) => {
    const next = sum + row.durationMs;
    if (!Number.isSafeInteger(next)) fail('DURATION_OVERFLOW', 'مجموع مدت‌ها خارج از محدودهٔ محاسبه است.');
    return next;
  }, 0);
  return {
    assignments,
    workUnitCount: units.length,
    taskCount: assignments.length,
    totalUnitDurationMs: sumDurations(units),
    totalTaskDurationMs: sumDurations(assignments),
  };
}
