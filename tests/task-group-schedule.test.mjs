// Pure algorithm tests. No database calls and no live endpoint changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { planTaskGroupSchedule as plan, buildGroupScheduleUnits as units, scheduleWallMillis as wall, scheduleDurationMillis as duration } from '../lib/task-group-schedule-core.mjs';
const origin = '2026-10-26 08:00:00';
const task = (TaskID, extra = {}) => ({ TaskID, Complited: 0, Priorities: '3.متوسط', FixedDueTime: 0, Durationtime: '01:00:00', ...extra });
const fixed = (TaskID, start, end) => task(TaskID, { Priorities: 'زمان انجام ثابت', FixedDueTime: 1, DueDateTime: start, EndDateTime: end, Durationtime: '01:00:00' });
const groups = [{ GroupID: 1, IsActive: 1 }];
const member = (TaskID, extra = {}) => ({ TaskID, GroupID: 1, LeftAt: null, SyncEnabled: 1, ...extra });
const at = (result, id) => result.assignments.find((row) => row.taskId === id);
const code = (wanted) => (error) => error.code === wanted;

test('Three related tasks reserve one interval; independent work starts after it, not after three hours', () => {
  const result = plan({ tasks: [task(1), task(2), task(3), task(4)], groups, members: [member(1), member(2), member(3)], startAt: origin });
  assert.equal(result.workUnitCount, 2); assert.equal(result.taskCount, 4);
  for (const id of [1, 2, 3]) { assert.equal(at(result, id).startLocal, origin); assert.equal(at(result, id).endLocal, '2026-10-26 09:00:00'); }
  assert.equal(at(result, 4).startLocal, '2026-10-26 09:00:00');
  assert.equal(result.totalUnitDurationMs, 2 * 3600000); assert.equal(result.totalTaskDurationMs, 4 * 3600000);
});

test('Identical fixed times inside one group are not self-conflicts', () => {
  const tasks = [fixed(1, origin, '2026-10-26 09:00:00'), fixed(2, origin, '2026-10-26 09:00:00')];
  const result = plan({ tasks, groups, members: [member(1), member(2)], startAt: origin });
  assert.equal(result.workUnitCount, 1); assert.equal(result.totalUnitDurationMs, 3600000);
});

test('Fixed-time overlap outside a synchronized group is reported with task IDs', () => {
  assert.throws(() => plan({ tasks: [fixed(1, origin, '2026-10-26 09:00:00'), fixed(2, '2026-10-26 08:30:00', '2026-10-26 09:30:00')], startAt: origin }), (error) => {
    assert.equal(error.code, 'FIXED_CONFLICT'); assert.deepEqual(error.details.conflicts[0].taskIds, [1, 2]); return true;
  });
  assert.throws(() => plan({ tasks: Array.from({ length: 30 }, (_, i) => fixed(i + 1, origin, '2026-10-26 09:00:00')), startAt: origin }), (error) => {
    assert.equal(error.details.conflicts.length, 100); assert.equal(error.details.limited, true); return true;
  });
});

test('Adjacent intervals are allowed; a non-fixed task ending at a fixed start does not overlap', () => {
  const result = plan({ tasks: [task(1), fixed(2, '2026-10-26 09:00:00', '2026-10-26 10:00:00'), fixed(3, '2026-10-26 10:00:00', '2026-10-26 11:00:00')], startAt: origin });
  assert.equal(at(result, 1).endLocal, '2026-10-26 09:00:00');
});

test('More than 20 fixed blockers are handled without silently leaving a conflict', () => {
  const blockers = Array.from({ length: 25 }, (_, index) => {
    const start = new Date(wall(origin) + (15 + index * 30) * 60000), end = new Date(start.getTime() + 15 * 60000);
    return fixed(index + 10, start, end);
  }).map((row) => ({ ...row, Durationtime: '00:15:00' }));
  const result = plan({ tasks: [task(1), ...blockers], startAt: origin });
  assert.equal(at(result, 1).startLocal, '2026-10-26 20:30:00');
  assert.equal(at(result, 1).endLocal, '2026-10-26 21:30:00');
});

test('Persistently disabled sync is independent; completed and historical memberships never reactivate', () => {
  const result = plan({ tasks: [task(1), task(2), task(3, { Complited: 1 }), task(4)], groups,
    members: [member(1), member(2, { SyncEnabled: 0 }), member(3), member(4, { LeftAt: '2026-10-25 08:00:00' })], startAt: origin });
  assert.equal(result.workUnitCount, 3); assert.equal(result.taskCount, 3);
  assert.equal(at(result, 1).groupId, 1); assert.equal(at(result, 2).groupId, null); assert.equal(at(result, 4).groupId, null); assert.equal(at(result, 3), undefined);
});

test('Different priority, duration, or fixed interval within a synchronized group requires explicit resolution', () => {
  for (const tasks of [
    [task(1), task(2, { Priorities: '2.بالا' })],
    [task(1), task(2, { Durationtime: '00:30:00' })],
    [fixed(1, origin, '2026-10-26 09:00:00'), fixed(2, '2026-10-26 09:00:00', '2026-10-26 10:00:00')],
  ]) assert.throws(() => plan({ tasks, groups, members: [member(1), member(2)], startAt: origin }), code('GROUP_SCHEDULE_MISMATCH'));
});

test('Incomplete, duplicate, multiple-current or inactive group snapshots fail before planning', () => {
  assert.throws(() => units({ tasks: [task(1), task(1)] }), code('DUPLICATE_TASK'));
  assert.throws(() => units({ tasks: [task(1)], groups, members: [member(1), member(2)] }), code('INCOMPLETE_GROUP'));
  assert.throws(() => units({ tasks: [task(1)], groups, members: [member(1), member(1)] }), code('MULTIPLE_GROUPS'));
  assert.throws(() => units({ tasks: [task(1)], groups: [{ GroupID: 1, IsActive: 0 }], members: [member(1)] }), code('INACTIVE_GROUP'));
  assert.throws(() => units({ tasks: [task(1)], groups, members: [member(1, { SyncEnabled: null })] }), code('INVALID_SYNC_STATE'));
});

test('Wall parser rejects invalid dates, timezone offsets, invalid clock values and sub-minute values', () => {
  assert.equal(wall('2026-10-26T08:00:00.000Z'), wall(origin));
  for (const value of ['2026-02-30 08:00:00', '2026-10-26T08:00:00+03:30', '2026-10-26 25:00:00', '2026-10-26 08:00:01', '1752-01-01 00:00:00', 'bad', new Date(NaN), new Date('1752-01-01T00:00:00Z')]) assert.throws(() => wall(value), code('INVALID_WALL_TIME'));
});

test('Duration parser accepts legacy zero-second notation and Persian digits, but rejects unsafe/invalid durations', () => {
  assert.equal(duration('0:30:0'), 1800000); assert.equal(duration('۰۱:۳۰:۰۰'), 5400000);
  for (const value of ['00:00:00', '-1:00:00', '00:60:00', '00:30:01', '1e2:00:00', '999999999999999:00:00']) assert.throws(() => duration(value), code('INVALID_DURATION'));
});

test('Priority, old start and task ID provide deterministic order; no caller input is mutated', () => {
  const snapshot = { tasks: [task(3), task(2), task(1, { Priorities: '1.خیلی بالا' })], startAt: origin };
  const before = JSON.stringify(snapshot); const a = plan(snapshot), b = plan(snapshot);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(snapshot), before);
  assert.equal(at(a, 1).startLocal, origin); assert.equal(at(a, 2).startLocal, '2026-10-26 09:00:00'); assert.equal(at(a, 3).startLocal, '2026-10-26 10:00:00');
});

test('Working-hours adapter is explicit, receives a clone and must move time monotonically', () => {
  const start = new Date('2026-10-26T12:10:00Z');
  const result = plan({ tasks: [task(1)], startAt: start, adjustStart: (date) => { date.setUTCHours(13, 0, 0, 0); return date; } });
  assert.equal(at(result, 1).startLocal, '2026-10-26 13:00:00'); assert.equal(start.toISOString(), '2026-10-26T12:10:00.000Z');
  assert.throws(() => plan({ tasks: [task(1)], startAt: origin, adjustStart: (date) => new Date(date.getTime() - 60000) }), code('BACKWARD_NORMALIZER'));
  assert.throws(() => plan({ tasks: [task(1)], startAt: origin, adjustStart: () => new Date(NaN) }), code('INVALID_WALL_TIME'));
});

test('Fixed flag/duration mismatch, unknown priority, oversized group and overflow fail closed', () => {
  assert.throws(() => units({ tasks: [task(1, { FixedDueTime: 1 })] }), code('FIXED_FLAG_MISMATCH'));
  assert.throws(() => units({ tasks: [task(1, { Priorities: 'نامشخص' })] }), code('INVALID_PRIORITY'));
  assert.throws(() => units({ tasks: [fixed(1, origin, '2026-10-26 10:00:00')] }), code('INVALID_FIXED_INTERVAL'));
  const tasks = Array.from({ length: 251 }, (_, index) => task(index + 1));
  assert.throws(() => units({ tasks, groups, members: tasks.map((row) => member(row.TaskID)) }), code('GROUP_TOO_LARGE'));
  assert.throws(() => plan({ tasks: [task(1)], startAt: '9999-12-31 23:30:00' }), code('TIME_OVERFLOW'));
});

test('Same wall input produces identical plans under UTC, Tehran and New York host timezones', () => {
  const importURL = new URL('../lib/task-group-schedule-core.mjs', import.meta.url).href;
  const script = `import { planTaskGroupSchedule } from ${JSON.stringify(importURL)}; console.log(JSON.stringify(planTaskGroupSchedule(${JSON.stringify({ tasks: [task(1)], startAt: origin })})));`;
  const results = ['UTC', 'Asia/Tehran', 'America/New_York'].map((TZ) => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { ...process.env, TZ } });
    assert.equal(child.status, 0, child.stderr); return child.stdout;
  });
  assert.equal(new Set(results).size, 1);
});
