// Pure internal preview: never write to DB or trust a snapshot from the browser.
// Future transaction must acquire the schedule lock, then group lock, re-read all
// members and revalidate every version before any write.
export class GroupMembershipPlanError extends Error {
  constructor(code, message) { super(message); this.name = 'GroupMembershipPlanError'; this.code = code; }
}
const fail = (code, message) => { throw new GroupMembershipPlanError(code, message); };
const digit = (value) => String(value).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
const id = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') fail('INVALID_ID', 'شناسه معتبر نیست.');
  const text = digit(value).trim(), n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > 2147483647) fail('INVALID_ID', 'شناسه معتبر نیست.');
  return n;
};
const membershipId = (value) => {
  // SQL bigint values are sent as decimal text to prevent JavaScript rounding.
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) fail('INVALID_SNAPSHOT', 'شناسهٔ عضویت معتبر نیست.');
  return value;
};
const version = (value) => {
  if (typeof value !== 'string' || !/^[\da-f]{16}$/i.test(value)) fail('INVALID_VERSION', 'نسخه معتبر نیست.');
  return value.toUpperCase();
};
const bit = value => value === true || value === 1 || value === '1' ? true : value === false || value === 0 || value === '0' ? false : null;
const list = (values) => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 250) fail('INVALID_TARGETS', 'حداقل یک عضو و حداکثر ۲۵۰ عضو انتخاب کنید.');
  const ids = values.map(id);
  if (new Set(ids).size !== ids.length) fail('DUPLICATE_TARGETS', 'یک عضو بیش از یک بار انتخاب شده است.');
  return ids.sort((a,b)=>a-b);
};

// Input is a complete locked snapshot from the future server adapter, not an API payload.
// For set_sync and leave, task IDs are explicitly selected; the origin is not
// silently included. dissolve requires a separate explicit confirmation.
export function planGroupMembershipChange({ group, members, originTaskId, expectedVersion, action, taskIds, syncEnabled, confirmDissolve } = {}) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) fail('INVALID_SNAPSHOT', 'اطلاعات گروه کامل نیست.');
  const groupId = id(group.GroupID), groupVersion = version(group.Version), expected = version(expectedVersion);
  if (bit(group.IsActive) !== true) fail('GROUP_INACTIVE', 'گروه فعال نیست.');
  if (groupVersion !== expected) fail('GROUP_CHANGED', 'گروه تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.');
  if (!Array.isArray(members) || members.length < 1 || members.length > 250) fail('INVALID_SNAPSHOT', 'فهرست اعضای جاری معتبر نیست.');
  const byTask = new Map(), seenMembers = new Set();
  for (const member of members) {
    if (!member || typeof member !== 'object' || !Object.hasOwn(member, 'LeftAt') || member.LeftAt !== null) fail('INVALID_SNAPSHOT', 'عضویت جاری معتبر نیست.');
    const taskId = id(member.TaskID), ownerGroup = id(member.GroupID), memberId = membershipId(member.MemberID);
    const memberVersion = version(member.MemberVersion), sync = bit(member.SyncEnabled);
    if (ownerGroup !== groupId || sync === null || byTask.has(taskId) || seenMembers.has(memberId)) fail('INVALID_SNAPSHOT', 'اطلاعات عضویت تکراری یا ناسازگار است.');
    byTask.set(taskId, { taskId, memberId, memberVersion, syncEnabled: sync });
    seenMembers.add(memberId);
  }
  const origin = id(originTaskId);
  if (!byTask.has(origin)) fail('ORIGIN_NOT_MEMBER', 'کار این پنجره دیگر عضو گروه نیست.');
  if (!['set_sync', 'leave', 'dissolve'].includes(action)) fail('INVALID_ACTION', 'نوع عملیات معتبر نیست.');
  if (action === 'dissolve') {
    if (taskIds !== undefined || syncEnabled !== undefined || (confirmDissolve !== undefined && typeof confirmDissolve !== 'boolean')) fail('INVALID_ACTION', 'درخواست انحلال معتبر نیست.');
  } else {
    if (confirmDissolve !== undefined || (action === 'leave' && syncEnabled !== undefined)) fail('INVALID_ACTION', 'درخواست عضویت معتبر نیست.');
    if (action === 'set_sync' && typeof syncEnabled !== 'boolean') fail('INVALID_SYNC_STATE', 'وضعیت همگام‌سازی باید صریح باشد.');
  }
  const targets = action === 'dissolve' ? [...byTask.keys()].sort((a,b)=>a-b) : list(taskIds);
  for (const target of targets) if (!byTask.has(target)) fail('MEMBERSHIP_CHANGED', 'یکی از کارهای انتخاب‌شده عضو جاری این گروه نیست.');
  const selected = targets.map(target => byTask.get(target));
  const base = { groupId, expectedGroupVersion: expected, originTaskId: origin, action,
    selectedTaskIds: targets, copyHistoricalFollows: false, deleteFollowHistory: false, writesScheduleFields: false };
  if (action === 'set_sync') {
    const changes = selected.filter(m => m.syncEnabled !== syncEnabled).map(m => ({...m, nextSyncEnabled:syncEnabled}));
    return { ...base, ready: true, noChanges: changes.length === 0, changes, remainingMemberCount: members.length, blockers: [] };
  }
  if (action === 'leave') {
    const remaining = members.length - selected.length;
    // Do not silently decide the fate of a group with zero/one remaining members.
    const blockers = remaining < 2 ? [{code:'GROUP_FATE_DECISION_REQUIRED', remainingMemberCount:remaining}] : [];
    return { ...base, ready: blockers.length === 0, noChanges: false, changes: selected, remainingMemberCount: remaining, blockers };
  }
  const blockers = confirmDissolve === true ? [] : [{code:'DISSOLVE_CONFIRMATION_REQUIRED'}];
  return { ...base, ready: blockers.length === 0, noChanges: false, changes: selected, remainingMemberCount: 0, blockers };
}
