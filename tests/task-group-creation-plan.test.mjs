import test from 'node:test';
import assert from 'node:assert/strict';
import { planGroupCreation } from '../lib/task-group-creation-plan.mjs';

const row = (taskId, extra = {}) => ({ TaskID: taskId, Priorities: '3.متوسط', FixedDueTime: 0, Durationtime: '00:05:00', DueDateTime: '2026-11-01 12:15:00', EndDateTime: '2026-11-01 12:20:00', ...extra });
const fixture = () => [101, 202].map(TaskID => ({ task: { ...row(TaskID), Complited: false, Descriptions: 'private text' }, timeRows: [row(TaskID)], currentMemberships: [] }));
const options = (extra = {}) => ({ selectedTaskIds: [202, 101], referenceTaskId: 101, snapshot: fixture(), ...extra });
const code = expected => error => error.code === expected;

test('matching schedules give a sorted proposal with no schedule change', () => {
  const result = planGroupCreation(options());
  assert.equal(result.ready, true); assert.deepEqual(result.selectedTaskIds, [101, 202]);
  assert.equal(result.proposal.requiresScheduleConfirmation, false);
  assert.deepEqual(result.proposal.members.map(m => m.changesSchedule), [false, false]);
});
test('different member schedule is explicitly previewed relative to chosen reference', () => {
  const s = fixture(); Object.assign(s[1].task, row(202, { DueDateTime: '2026-11-01 15:15:00', EndDateTime: '2026-11-01 15:20:00' }));
  s[1].timeRows[0] = row(202, { DueDateTime: '2026-11-01 15:15:00', EndDateTime: '2026-11-01 15:20:00' });
  const result = planGroupCreation(options({ snapshot: s }));
  assert.equal(result.proposal.requiresScheduleConfirmation, true);
  assert.equal(result.proposal.members[1].before.start, '2026-11-01 15:15:00');
  assert.equal(result.proposal.members[1].after.start, '2026-11-01 12:15:00');
  const reverse = planGroupCreation(options({ snapshot: s, referenceTaskId: 202 }));
  assert.equal(reverse.proposal.members[0].changesSchedule, true);
  assert.equal(reverse.proposal.schedule.start, '2026-11-01 15:15:00');
});
test('fixed-time schedules and driver Date values use wall components with no timezone shift', () => {
  const s = fixture(); for (const e of s) for (const r of [e.task, e.timeRows[0]]) Object.assign(r, { Priorities:'زمان انجام ثابت', FixedDueTime:true, DueDateTime:new Date('2026-11-01T12:15:00Z'), EndDateTime:new Date('2026-11-01T12:20:00Z') });
  const result = planGroupCreation(options({ snapshot:s }));
  assert.equal(result.proposal.schedule.start,'2026-11-01 12:15:00'); assert.equal(result.proposal.schedule.fixed,true);
});
test('different durations and priorities require explicit confirmation', () => {
  const s=fixture(); for(const r of [s[1].task,s[1].timeRows[0]]) Object.assign(r,{Priorities:'2.بالا',Durationtime:'00:10:00',EndDateTime:'2026-11-01 12:25:00'});
  const r=planGroupCreation(options({snapshot:s})); assert.equal(r.ready,true); assert.equal(r.proposal.requiresScheduleConfirmation,true);
});
test('IDs accept Persian digits, but duplicates, invalid bounds and absent reference are rejected', () => {
  assert.deepEqual(planGroupCreation(options({selectedTaskIds:['۲۰۲','۱۰۱'],referenceTaskId:'۱۰۱'})).selectedTaskIds,[101,202]);
  for(const selectedTaskIds of [[101],[101,101],[101,0],Array(251).fill(101)]) assert.throws(()=>planGroupCreation(options({selectedTaskIds})));
  assert.throws(()=>planGroupCreation(options({referenceTaskId:999})),code('INVALID_REFERENCE'));
});
test('snapshot must exactly match selected task IDs without duplicates', () => {
  for(const s of [[],[fixture()[0],fixture()[0]],[fixture()[0],{...fixture()[1],task:row(999)}]]) assert.throws(()=>planGroupCreation(options({snapshot:s})),code('INVALID_SNAPSHOT'));
});
test('unknown/completed status and existing membership block without a proposal', () => {
  for(const [value,expected] of [[null,'INVALID_STATUS'],[2,'INVALID_STATUS'],[true,'COMPLETED_TASK']]) { const s=fixture();s[0].task.Complited=value;const r=planGroupCreation(options({snapshot:s}));assert.equal(r.ready,false);assert.equal(r.proposal,null);assert.ok(r.blockers.some(b=>b.code===expected)); }
  const s=fixture();s[0].currentMemberships=[{GroupID:7}];assert.ok(planGroupCreation(options({snapshot:s})).blockers.some(b=>b.code==='ALREADY_GROUPED'));
});
test('missing/multiple time rows and wrong owner fail closed', () => {
  for(const [rows,expected] of [[[],'MISSING_SCHEDULE'],[[row(101),row(101)],'MULTIPLE_SCHEDULE_ROWS']]) { const s=fixture();s[0].timeRows=rows;assert.ok(planGroupCreation(options({snapshot:s})).blockers.some(b=>b.code===expected)); }
  const s=fixture();s[0].timeRows=[row(999)];assert.throws(()=>planGroupCreation(options({snapshot:s})),code('INVALID_SNAPSHOT'));
});
test('conflicting task/time schedule blocks rather than silently choosing one', () => {
  const s=fixture();s[0].task.DueDateTime='2026-11-01 14:15:00';s[0].task.EndDateTime='2026-11-01 14:20:00';
  assert.ok(planGroupCreation(options({snapshot:s})).blockers.some(b=>b.code==='TASK_TIME_SCHEDULE_MISMATCH'));
});
test('invalid or unsafe time, duration and priority block', () => {
  const variations=[{Durationtime:'00:00:00'}, {Priorities:'unknown'}, {FixedDueTime:1}, {DueDateTime:'2026-02-29 12:00:00'}, {DueDateTime:'2026-11-01 12:15:01'}, {EndDateTime:'2026-11-01 12:21:00'}, {DueDateTime:null}];
  for(const change of variations){const s=fixture();Object.assign(s[0].timeRows[0],change);const r=planGroupCreation(options({snapshot:s}));assert.equal(r.ready,false);assert.ok(r.blockers.some(b=>b.code==='INVALID_SCHEDULE'));}
});
test('function does not mutate input and cannot create membership or copy follow-ups', () => {
  const s=fixture(), before=structuredClone(s);const r=planGroupCreation(options({snapshot:s}));assert.deepEqual(s,before);assert.equal('follows' in r.proposal,false);assert.deepEqual(s.map(e=>e.currentMemberships),[[],[]]);
});
test('result is independent of snapshot order and schedule value representations', () => {
  const s=fixture();s[0].task.Durationtime='0:5:0';s[0].timeRows[0].Durationtime='00:05:00';s.reverse();
  const r=planGroupCreation(options({snapshot:s}));assert.equal(r.ready,true);assert.equal(r.proposal.requiresScheduleConfirmation,false);
});
